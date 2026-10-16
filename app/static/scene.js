// three.js rendering for the patient network.
//   - Centre: four ward arcs around a small glowing core. Arc length is the ward's share of patients, arc
//     colour the share of its patients in review (green to red). Hover, focus or click is reported to the page.
//   - Branches: curved lines from the centre to every patient, bright at the centre and dim at the patient.
//   - Light pulses: small bright points that travel slowly along some branches.
//   - Nodes: a small dot with a soft status-coloured halo (a radial gradient drawn on a 2D canvas, so
//     there are no image files). Halo size and brightness vary a little with a per-patient depth.
//   - Atmosphere: sparse dust far behind, plus a pointer parallax shift of the dust and the core glow.
// A faint ring per status and the ward wedge borders sit behind the dots (angle = ward, distance = status).
// A status filter or a ward filter dims the other nodes, branches and pulses instead of removing them.
// The camera is orthographic, so pan, zoom, pinch, hit-testing and the DOM label positions are exact.
// Depth is faked with scale, alpha and parallax. The bloom is additive blending: the vendored
// build has no post-processing pass.
// Rendering is capped at device pixel ratio 2, throttled to about 30 fps on narrow screens, paused while
// the tab is hidden or the canvas is off-screen, and every geometry, material and texture is disposed.
// Under reduced motion nothing pulses, drifts or shifts, and frames are drawn on demand only.
// No network access, no storage, no inline styles.
import * as THREE from "./vendor/three/three.module.js";
import { NO_WARD, STATUS_COLORS, unit } from "./layout.js";

const BASE_SPAN = 26; // world units across the shorter side at zoom 1 (grows if a sector pushes patients out)
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const HUB_COLOR = "#19c3b4";
const SELECTION_COLOR = 0xe9f2f4;
const RADIUS = { root: 1.15, patient: 0.34 };
const ARC_IN = 4.2; // the ward arcs sit between these radii, inside the nearest (review) ring
const ARC_OUT = 6.6;
const ARC_PICK = 0.6; // extra reach for the pointer
const ARC_BAND = 0.3; // fill of the arc band; the rim and the glow carry the colour
const CURVE_POINTS = 28;
const NARROW_PX = 600;
const NARROW_FRAME_MS = 33; // about 30 fps
const PULSES = { wide: 24, narrow: 8 };
const DUST_COUNT = 140;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.22, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createScene(container, { onActivate, onHover, onArcHover, onArcActivate, onDraw, reducedMotion = false }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null; // no WebGL: the list and the detail panel still work
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0); // transparent: the page glow shows through
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const world = new THREE.Group();
  scene.add(world);

  // Everything the scene owns, so dispose() can release it all.
  const owned = [];
  const own = (x) => (owned.push(x), x);

  // Every material is unlit (basic), so the scene needs no lights.
  const glowMap = own(glowTexture());
  const glowSprite = (color, scale, opacity) => {
    const m = own(new THREE.SpriteMaterial({ map: glowMap, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    const s = new THREE.Sprite(m);
    s.scale.set(scale, scale, 1);
    return s;
  };

  // ---- Dust: sparse points far behind the network ----
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = (unit(i, "dx") - 0.5) * 64;
    dustPositions[i * 3 + 1] = (unit(i, "dy") - 0.5) * 64;
    dustPositions[i * 3 + 2] = -4 - unit(i, "dz") * 4;
  }
  const dustGeo = own(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = own(new THREE.PointsMaterial({ color: 0x8fe9df, size: 2.2, sizeAttenuation: false, map: glowMap, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // ---- The centre: a dark disc, a soft glow and a small bright core. The ward arcs are added by setData ----
  const hub = new THREE.Group();
  hub.position.z = 0.2;
  const disc = new THREE.Mesh(own(new THREE.CircleGeometry(ARC_IN - 0.2, 64)), own(new THREE.MeshBasicMaterial({ color: 0x050b10, transparent: true, opacity: 0.8 })));
  disc.position.z = -0.3;
  const halo = glowSprite(0x19c3b4, 14, 0.5);
  halo.position.z = -0.2;
  const core = glowSprite(0xb8fff6, 2.2, 0.9);
  hub.add(disc, halo, core);
  scene.add(hub);

  const selectRing = new THREE.Mesh(own(new THREE.RingGeometry(0.9, 1.0, 48)), own(new THREE.MeshBasicMaterial({ color: SELECTION_COLOR, transparent: true, opacity: 1 })));
  selectRing.visible = false;
  selectRing.position.z = 0.6;
  scene.add(selectRing);

  const view = { cx: 0, cy: 0, zoom: 1 };
  let span = BASE_SPAN; // grows when a crowded sector pushes patients further out, so none are clipped
  let nodes = [];
  let disposables = []; // per-dataset objects, rebuilt by setData
  let edgeMats = {}; // one line material per ward and status, so a filter can dim a group on its own
  let edgePaths = []; // one array of points per branch, for the light pulses
  let pulses = []; // { path, speed, phase, status, color }
  let nodeRefs = []; // { status, ward, dotMat, glowMat, glowBase }
  let arcs = []; // { arc, mat, rimMat, glowMat }
  const shown = new Set(["stable", "watch", "review", "unknown"]); // statuses currently highlighted
  const arcState = { ward: null, hover: null }; // the ward filter and the arc under the pointer or focus
  const DIM = 0.12;
  const onGroup = (status, ward) => shown.has(status) && (!arcState.ward || ward === arcState.ward);
  let pulsePoints = null;
  let selectedScale = 1;
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };

  // ---- Frame pacing ----
  let frame = 0;
  let pending = false;
  let lastDrawn = 0;
  let visible = true; // intersecting the viewport
  let tabShown = !document.hidden;
  const animating = () => !reducedMotion && visible && tabShown;

  function frustum() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    const half = span / 2 / view.zoom;
    return aspect >= 1 ? { w, h, halfW: half * aspect, halfH: half } : { w, h, halfW: half, halfH: half / aspect };
  }

  function updatePulses(t) {
    if (!pulsePoints) return;
    const attr = pulsePoints.geometry.getAttribute("position");
    pulses.forEach((p, i) => {
      const u = (p.phase + t * p.speed) % 1;
      const f = u * (p.path.length - 1);
      const a = p.path[Math.floor(f)];
      const b = p.path[Math.min(p.path.length - 1, Math.floor(f) + 1)];
      const k = f - Math.floor(f);
      attr.setXYZ(i, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 0.3);
    });
    attr.needsUpdate = true;
  }

  const groupOn = (key) => {
    const [ward, status] = key.split("|");
    return onGroup(status, ward);
  };

  function draw(time = 0) {
    pending = false;
    const t = time / 1000;
    if (!reducedMotion) {
      const pulse = 0.62 + 0.18 * Math.sin(t * 1.4); // the line pulse
      for (const [key, m] of Object.entries(edgeMats)) m.opacity = pulse * (groupOn(key) ? 1 : DIM);
      core.material.opacity = 0.8 + 0.12 * Math.sin(t * 1.2);
      updatePulses(t);
      // Pointer parallax: ease toward the target, shift the dust and the core glow the other way.
      parallax.x += (parallax.tx - parallax.x) * 0.08;
      parallax.y += (parallax.ty - parallax.y) * 0.08;
      halo.position.set(-parallax.x * 0.25, -parallax.y * 0.25, -0.2);
      dust.position.set(-parallax.x * 1.6, -parallax.y * 1.6, 0);
      dust.rotation.z = t * 0.006;
      if (selectRing.visible) {
        const beat = 1 + 0.12 * Math.sin(t * 3);
        selectRing.scale.set(selectedScale * beat, selectedScale * beat, 1);
        selectRing.material.opacity = 0.65 + 0.35 * Math.sin(t * 3 + 1);
      }
    }
    const { halfW, halfH } = frustum();
    camera.left = view.cx - halfW;
    camera.right = view.cx + halfW;
    camera.top = view.cy + halfH;
    camera.bottom = view.cy - halfH;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    if (onDraw) onDraw();
  }

  function tick(time) {
    frame = 0;
    if (!animating()) return; // paused: resumed by the visibility handlers
    frame = requestAnimationFrame(tick);
    if ((container.clientWidth || 0) < NARROW_PX && time - lastDrawn < NARROW_FRAME_MS) return; // about 30 fps
    lastDrawn = time;
    draw(time);
  }

  function resume() {
    if (animating() && !frame) frame = requestAnimationFrame(tick);
  }

  function requestDraw() {
    if (animating()) return resume(); // the loop draws every frame
    if (!pending) {
      pending = true;
      requestAnimationFrame(draw); // on demand: reduced motion, or paused but asked to draw
    }
  }

  function resize() {
    const { w, h } = frustum();
    renderer.setSize(w, h, false);
    requestDraw();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const visibilityObserver =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          visible = entries[entries.length - 1].isIntersecting;
          if (visible) resume();
        })
      : null;
  if (visibilityObserver) visibilityObserver.observe(container);
  const onVisibility = () => {
    tabShown = !document.hidden;
    if (tabShown) resume();
  };
  document.addEventListener("visibilitychange", onVisibility);

  function clearWorld() {
    for (const d of disposables) d.dispose();
    disposables = [];
    world.clear();
    edgePaths = [];
    pulses = [];
    pulsePoints = null;
    nodeRefs = [];
    arcs = [];
    edgeMats = {};
  }
  const track = (x) => (disposables.push(x), x);

  function curve(a, b) {
    // A gentle sideways bend, a different share and side for each patient.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const bend = (0.09 + 0.1 * unit(b.id, "bend")) * len * (unit(b.id, "side") < 0.5 ? -1 : 1);
    return new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(a.x, a.y, 0),
      new THREE.Vector3(mx - ((b.y - a.y) / len) * bend, my + ((b.x - a.x) / len) * bend, 0),
      new THREE.Vector3(b.x, b.y, 0),
    ).getPoints(CURVE_POINTS);
  }

  function setData(layout) {
    clearWorld();
    nodes = layout.nodes;
    const guides = layout.guides || { rings: [], borders: [], labels: [], outer: 0 };
    const reach = Math.max(0, guides.outer + 3.5, ...nodes.map((n) => Math.hypot(n.x, n.y)));
    span = Math.max(BASE_SPAN, 2 * (reach + 1.5));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const hubColor = new THREE.Color(HUB_COLOR);
    const matFor = (ward, status) => {
      const key = `${ward}|${status}`;
      edgeMats[key] ||= track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      return edgeMats[key];
    };
    const statusOf = [];
    const statusName = [];
    const wardName = [];

    // The ward arcs: a soft wide band behind a solid one. Colour and length come from the layout.
    for (const arc of layout.arcs || []) {
      const rad = (d) => (d * Math.PI) / 180;
      const segs = Math.max(3, Math.ceil(arc.length / 3));
      const color = new THREE.Color(arc.color);
      const band = (inner, outer, material, z) => {
        const m = new THREE.Mesh(track(new THREE.RingGeometry(inner, outer, segs, 1, rad(arc.start), rad(arc.length))), material);
        m.position.z = z;
        world.add(m);
      };
      const glowMat = track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
      // A tinted glass band with a bright rim on both edges: the page's light counts sit on a dark surface.
      const mat = track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: ARC_BAND, depthWrite: false }));
      const rimMat = track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: arc.total ? 0.95 : 0.35, depthWrite: false }));
      band(ARC_IN - 0.35, ARC_OUT + 0.35, glowMat, 0.15);
      band(ARC_IN, ARC_OUT, mat, 0.2);
      band(ARC_IN, ARC_IN + 0.09, rimMat, 0.25);
      band(ARC_OUT - 0.09, ARC_OUT, rimMat, 0.25);
      arcs.push({ arc, mat, rimMat, glowMat });
    }

    // Guides: a faint ring per status and a faint line on each ward border. Drawn first, so they sit behind.
    const guideMat = track(new THREE.LineBasicMaterial({ color: 0x19c3b4, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const ring of guides.rings) {
      const pts = [];
      for (let i = 0; i <= 120; i++) pts.push(new THREE.Vector3(Math.cos((i / 120) * Math.PI * 2) * ring.radius, Math.sin((i / 120) * Math.PI * 2) * ring.radius, -0.5));
      const gg = track(new THREE.BufferGeometry().setFromPoints(pts));
      world.add(new THREE.Line(gg, guideMat));
    }
    for (const angle of guides.borders) {
      const a = (angle * Math.PI) / 180;
      const gg = track(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(a) * (ARC_OUT + 0.6), Math.sin(a) * (ARC_OUT + 0.6), -0.5),
        new THREE.Vector3(Math.cos(a) * (guides.outer + 2), Math.sin(a) * (guides.outer + 2), -0.5),
      ]));
      world.add(new THREE.Line(gg, guideMat));
    }

    for (const e of layout.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      const pts = curve(a, b);
      const ward = b.ward || NO_WARD;
      const tint = new THREE.Color(STATUS_COLORS[b.status] || STATUS_COLORS.unknown);
      const colors = [];
      pts.forEach((_, i) => {
        const u = i / (pts.length - 1); // 0 at the hub, 1 at the patient
        const c = hubColor.clone().lerp(tint.clone().multiplyScalar(0.45), u).multiplyScalar(1 - 0.55 * u);
        colors.push(c.r, c.g, c.b);
      });
      const g = track(new THREE.BufferGeometry().setFromPoints(pts));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      world.add(new THREE.Line(g, matFor(ward, b.status)));
      edgePaths.push(pts);
      statusOf.push(tint);
      statusName.push(b.status);
      wardName.push(ward);
    }

    // Light pulses on some branches, capped by screen width. None under reduced motion.
    if (!reducedMotion && edgePaths.length) {
      const cap = (container.clientWidth || 0) < NARROW_PX ? PULSES.narrow : PULSES.wide;
      const count = Math.min(cap, edgePaths.length);
      const stride = edgePaths.length / count;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(i * stride);
        const c = statusOf[idx].clone().lerp(new THREE.Color(0xffffff), 0.55);
        pulses.push({ path: edgePaths[idx], speed: 0.05 + 0.07 * unit(idx, "speed"), phase: unit(idx, "phase"), status: statusName[idx], ward: wardName[idx], color: [c.r, c.g, c.b] });
        colors.set([c.r, c.g, c.b], i * 3);
      }
      const pg = track(new THREE.BufferGeometry());
      pg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      pg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const pm = track(new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: glowMap, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
      pulsePoints = new THREE.Points(pg, pm);
      pulsePoints.frustumCulled = false;
      world.add(pulsePoints);
      updatePulses(0);
    }

    const dotGeo = track(new THREE.CircleGeometry(RADIUS.patient, 24));
    for (const node of nodes) {
      if (node.type !== "patient") continue;
      const color = STATUS_COLORS[node.status] || STATUS_COLORS.unknown;
      const near = node.depth ?? 0.5; // 0 far, 1 near
      const mat = track(new THREE.MeshBasicMaterial({ color, transparent: true }));
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.position.set(node.x, node.y, 0.1);
      dot.scale.setScalar((node.size || 1) * (0.94 + 0.12 * near)); // size = age band, depth only nudges it
      world.add(dot);
      const glowBase = 0.4 + 0.3 * near;
      const glow = glowSprite(color, (1.9 + 1.0 * near) * (node.size || 1), glowBase);
      glow.position.set(node.x, node.y, 0.05);
      world.add(glow);
      track(glow.material);
      nodeRefs.push({ status: node.status, ward: node.ward || NO_WARD, dotMat: mat, glowMat: glow.material, glowBase });
    }
    applyFilter();
  }

  // Dim the nodes, branches and pulses outside the shown statuses and, if set, outside the filtered ward.
  function applyFilter() {
    for (const r of nodeRefs) {
      const on = onGroup(r.status, r.ward);
      r.dotMat.opacity = on ? 1 : DIM + 0.04;
      r.glowMat.opacity = on ? r.glowBase : r.glowBase * 0.1;
    }
    if (reducedMotion) for (const [key, m] of Object.entries(edgeMats)) m.opacity = 0.7 * (groupOn(key) ? 1 : DIM);
    if (pulsePoints) {
      const attr = pulsePoints.geometry.getAttribute("color");
      pulses.forEach((p, i) => (onGroup(p.status, p.ward) ? attr.setXYZ(i, ...p.color) : attr.setXYZ(i, 0, 0, 0)));
      attr.needsUpdate = true;
    }
    applyArcs();
    requestDraw();
  }

  // The filtered ward and the hovered or focused arc are bright; the other arcs recede while a ward filter is on.
  function applyArcs() {
    for (const { arc, mat, rimMat, glowMat } of arcs) {
      const lit = arc.ward === arcState.hover || arc.ward === arcState.ward;
      const away = arcState.ward && arc.ward !== arcState.ward ? 0.3 : 1;
      mat.opacity = (arc.total ? ARC_BAND : 0.1) * away + (lit ? 0.06 : 0);
      rimMat.opacity = (arc.total ? 0.95 : 0.35) * away;
      glowMat.opacity = lit ? 0.4 : arcState.ward ? 0.04 : 0.2;
    }
  }

  function setFilter(statuses, ward = null) {
    shown.clear();
    for (const s of statuses) shown.add(s);
    arcState.ward = ward;
    applyFilter();
  }

  function setArcFocus(ward) {
    arcState.hover = ward;
    applyArcs();
    requestDraw();
  }

  function setSelected(id) {
    const node = nodes.find((n) => n.id === id && n.type === "patient");
    selectRing.visible = Boolean(node);
    if (node) {
      selectRing.position.set(node.x, node.y, 0.6);
      selectedScale = RADIUS.patient * 1.9;
      selectRing.scale.set(selectedScale, selectedScale, 1);
      selectRing.material.opacity = 1;
    }
    requestDraw();
  }

  // Screen position (CSS pixels, relative to the container) of a node, for the DOM labels.
  function screenOf(id) {
    const node = nodes.find((n) => n.id === id);
    if (!node) return null;
    const { w, h, halfW, halfH } = frustum();
    return {
      x: ((node.x - (view.cx - halfW)) / (2 * halfW)) * w,
      y: ((view.cy + halfH - node.y) / (2 * halfH)) * h,
      r: (RADIUS[node.type] / (2 * halfW)) * w,
    };
  }

  // Screen position of a world point, for the ward labels.
  function screenOfPoint(x, y) {
    const { w, h, halfW, halfH } = frustum();
    return { x: ((x - (view.cx - halfW)) / (2 * halfW)) * w, y: ((view.cy + halfH - y) / (2 * halfH)) * h };
  }

  function worldPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const { halfW, halfH } = frustum();
    return {
      px: view.cx - halfW + ((clientX - rect.left) / rect.width) * 2 * halfW,
      py: view.cy + halfH - ((clientY - rect.top) / rect.height) * 2 * halfH,
    };
  }

  // The ward arc under a point, or null. Angles are degrees counterclockwise from the east.
  function arcAt(clientX, clientY) {
    const { px, py } = worldPoint(clientX, clientY);
    const r = Math.hypot(px, py);
    if (r < ARC_IN - ARC_PICK || r > ARC_OUT + ARC_PICK) return null;
    const deg = ((Math.atan2(py, px) * 180) / Math.PI + 360) % 360;
    const hit = arcs.find(({ arc }) => (deg - arc.start + 360) % 360 <= arc.length);
    return hit ? hit.arc : null;
  }

  function nearestPatient(clientX, clientY) {
    const { px, py } = worldPoint(clientX, clientY);
    let best = null;
    let bestD = Infinity;
    for (const n of nodes) {
      if (n.type !== "patient") continue;
      const d = Math.hypot(n.x - px, n.y - py);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    // Generous hit radius so a fingertip works.
    return best && bestD <= 1.3 / Math.sqrt(view.zoom) ? best : null;
  }

  // Pointer handling: drag to pan, pinch or wheel to zoom, tap or click to open a patient.
  const pointers = new Map();
  let moved = 0;
  let pinchStart = null;
  const onDown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  };
  const onMove = (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === "mouse") {
        const rect = canvas.getBoundingClientRect();
        parallax.tx = ((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1;
        parallax.ty = -(((e.clientY - rect.top) / (rect.height || 1)) * 2 - 1);
      }
      if (e.pointerType === "mouse") {
        const arc = arcAt(e.clientX, e.clientY);
        const hit = arc ? null : nearestPatient(e.clientX, e.clientY);
        canvas.classList.toggle("over-node", Boolean(hit || arc));
        if ((arc ? arc.ward : null) !== arcState.hover && onArcHover) onArcHover(arc ? arc.ward : null);
        if (onHover) onHover(hit ? hit.id : null);
      }
      return;
    }
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (pinchStart.zoom * dist) / pinchStart.dist));
      moved = 99;
    } else if (pointers.size === 1) {
      const { halfW, w } = frustum();
      const perPx = (2 * halfW) / w;
      view.cx -= (cur.x - prev.x) * perPx;
      view.cy += (cur.y - prev.y) * perPx;
      moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    }
    requestDraw();
  };
  const onUp = (e) => {
    const was = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    pinchStart = null;
    if (was && pointers.size === 0 && moved < 6 && e.type === "pointerup") {
      const arc = arcAt(e.clientX, e.clientY);
      if (arc && onArcActivate) return onArcActivate(arc.ward);
      const hit = nearestPatient(e.clientX, e.clientY);
      if (hit) onActivate(hit.id);
    }
  };
  const onLeave = () => {
    canvas.classList.remove("over-node");
    parallax.tx = 0;
    parallax.ty = 0;
    if (onHover) onHover(null);
    if (arcState.hover && onArcHover) onArcHover(null);
  };
  const onWheel = (e) => {
    e.preventDefault();
    view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * Math.exp(-e.deltaY * 0.0015)));
    requestDraw();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function dispose() {
    cancelAnimationFrame(frame);
    frame = 0;
    resizeObserver.disconnect();
    if (visibilityObserver) visibilityObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("wheel", onWheel);
    clearWorld();
    for (const x of owned) x.dispose();
    owned.length = 0;
    renderer.dispose();
    canvas.remove();
  }

  resize();
  resume();
  return { setData, setSelected, setFilter, setArcFocus, screenOf, screenOfPoint, dispose };
}
