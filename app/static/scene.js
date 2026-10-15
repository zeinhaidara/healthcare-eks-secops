// three.js rendering for the patient network.
//   - Branches: curved lines from the hub to every patient, bright at the hub and dim at the patient.
//   - Light pulses: small bright points that travel slowly along some branches.
//   - Nodes: a small dot with a soft status-coloured halo (a radial gradient drawn on a 2D canvas, so
//     there are no image files). Halo size and brightness vary a little with a per-patient depth.
//   - Hub: a layered core (emissive sphere, a fresnel rim-light shell, two tilted orbit rings, a halo,
//     inside a dark ring).
//   - Atmosphere: sparse dust far behind, plus a pointer parallax tilt of the hub and the dust.
// The camera is orthographic, so pan, zoom, pinch, hit-testing and the DOM label positions are exact.
// Depth is faked with scale, alpha, tilt and parallax. The bloom is additive blending: the vendored
// build has no post-processing pass.
// Rendering is capped at device pixel ratio 2, throttled to about 30 fps on narrow screens, paused while
// the tab is hidden or the canvas is off-screen, and every geometry, material and texture is disposed.
// Under reduced motion nothing rotates, pulses, drifts or tilts, and frames are drawn on demand only.
// No network access, no storage, no inline styles.
import * as THREE from "./vendor/three/three.module.js";
import { STATUS_COLORS, unit } from "./layout.js";

const BASE_SPAN = 26; // world units across the shorter side at zoom 1 (grows if a sector pushes patients out)
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const HUB_COLOR = "#19c3b4";
const SELECTION_COLOR = 0xe9f2f4;
const RADIUS = { root: 1.15, patient: 0.34 };
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

// A fresnel-style rim: bright where the surface turns away from the viewer, clear in the middle.
function rimMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: 2.4 }, uStrength: { value: 1.25 } },
    vertexShader: "varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader:
      "varying vec3 vNormal; uniform vec3 uColor; uniform float uPower; uniform float uStrength; void main() { float f = pow(1.0 - abs(vNormal.z), uPower); gl_FragColor = vec4(uColor * f * uStrength, f); }",
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function createScene(container, { onActivate, onHover, onDraw, reducedMotion = false }) {
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

  // Light for the hub core only; every other material is unlit.
  scene.add(new THREE.AmbientLight(0x5f8f90, 0.9));
  const key = new THREE.DirectionalLight(0xbdfaf2, 2.2);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const fill = new THREE.PointLight(0x19c3b4, 30, 12);
  fill.position.set(2, -2, 4);
  scene.add(fill);

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

  // ---- The hub: dark ring, halo, emissive core, rim shell, two tilted orbit rings ----
  const hub = new THREE.Group();
  hub.position.z = 0.2;
  const darkRing = new THREE.Mesh(own(new THREE.RingGeometry(1.55, 2.1, 64)), own(new THREE.MeshBasicMaterial({ color: 0x050b10, transparent: true, opacity: 0.92 })));
  darkRing.position.z = -0.3;
  const ringEdge = new THREE.Mesh(own(new THREE.RingGeometry(2.1, 2.14, 64)), own(new THREE.MeshBasicMaterial({ color: 0x19c3b4, transparent: true, opacity: 0.3 })));
  ringEdge.position.z = -0.29;
  const halo = glowSprite(0x19c3b4, 9, 0.7);
  halo.position.z = -0.2;
  const orb = new THREE.Mesh(
    own(new THREE.SphereGeometry(RADIUS.root, 48, 32)),
    own(new THREE.MeshStandardMaterial({ color: 0x0b3a3a, emissive: new THREE.Color(HUB_COLOR), emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.25 })),
  );
  const core = new THREE.Mesh(own(new THREE.SphereGeometry(0.5, 24, 16)), own(new THREE.MeshBasicMaterial({ color: 0xb8fff6 })));
  const rimShell = new THREE.Mesh(own(new THREE.SphereGeometry(1.42, 48, 32)), own(rimMaterial(0x7ff3e6)));
  const orbitA = new THREE.Mesh(own(new THREE.TorusGeometry(1.85, 0.014, 8, 128)), own(new THREE.MeshBasicMaterial({ color: 0x7ff3e6, transparent: true, opacity: 0.55 })));
  orbitA.rotation.set(1.15, 0.3, 0);
  const orbitB = new THREE.Mesh(own(new THREE.TorusGeometry(1.6, 0.012, 8, 128)), own(new THREE.MeshBasicMaterial({ color: 0xa99bff, transparent: true, opacity: 0.45 })));
  orbitB.rotation.set(0.45, 1.0, 0.6);
  hub.add(darkRing, ringEdge, halo, orb, core, rimShell, orbitA, orbitB);
  scene.add(hub);

  const selectRing = new THREE.Mesh(own(new THREE.RingGeometry(0.9, 1.0, 48)), own(new THREE.MeshBasicMaterial({ color: SELECTION_COLOR, transparent: true, opacity: 1 })));
  selectRing.visible = false;
  selectRing.position.z = 0.6;
  scene.add(selectRing);

  const view = { cx: 0, cy: 0, zoom: 1 };
  let span = BASE_SPAN; // grows when a crowded sector pushes patients further out, so none are clipped
  let nodes = [];
  let disposables = []; // per-dataset objects, rebuilt by setData
  let edgeMaterial = null;
  let edgePaths = []; // one array of points per branch, for the light pulses
  let pulses = []; // { path, speed, phase }
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

  function draw(time = 0) {
    pending = false;
    const t = time / 1000;
    if (!reducedMotion) {
      orb.rotation.y = t * 0.2;
      orbitA.rotation.z = t * 0.35;
      orbitB.rotation.z = -t * 0.28;
      rimShell.material.uniforms.uStrength.value = 1.15 + 0.15 * Math.sin(t * 1.2);
      if (edgeMaterial) edgeMaterial.opacity = 0.62 + 0.18 * Math.sin(t * 1.4); // the line pulse
      updatePulses(t);
      // Pointer parallax: ease toward the target, tilt the hub and shift the dust the other way.
      parallax.x += (parallax.tx - parallax.x) * 0.08;
      parallax.y += (parallax.ty - parallax.y) * 0.08;
      hub.rotation.y = parallax.x * 0.45;
      hub.rotation.x = -parallax.y * 0.35;
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
    const reach = Math.max(0, ...nodes.map((n) => Math.hypot(n.x, n.y)));
    span = Math.max(BASE_SPAN, 2 * (reach + 2.2));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const hubColor = new THREE.Color(HUB_COLOR);
    edgeMaterial = track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    const statusOf = [];
    for (const e of layout.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      const pts = curve(a, b);
      const tint = new THREE.Color(STATUS_COLORS[b.status] || STATUS_COLORS.unknown);
      const colors = [];
      pts.forEach((_, i) => {
        const u = i / (pts.length - 1); // 0 at the hub, 1 at the patient
        const c = hubColor.clone().lerp(tint.clone().multiplyScalar(0.45), u).multiplyScalar(1 - 0.55 * u);
        colors.push(c.r, c.g, c.b);
      });
      const g = track(new THREE.BufferGeometry().setFromPoints(pts));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      world.add(new THREE.Line(g, edgeMaterial));
      edgePaths.push(pts);
      statusOf.push(tint);
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
        pulses.push({ path: edgePaths[idx], speed: 0.05 + 0.07 * unit(idx, "speed"), phase: unit(idx, "phase") });
        const c = statusOf[idx].clone().lerp(new THREE.Color(0xffffff), 0.55);
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
      const mat = track(new THREE.MeshBasicMaterial({ color }));
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.position.set(node.x, node.y, 0.1);
      dot.scale.setScalar(0.88 + 0.24 * near);
      world.add(dot);
      const glow = glowSprite(color, 1.9 + 1.0 * near, 0.4 + 0.3 * near);
      glow.position.set(node.x, node.y, 0.05);
      world.add(glow);
      track(glow.material);
    }
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

  function nearestPatient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const { halfW, halfH } = frustum();
    const px = view.cx - halfW + ((clientX - rect.left) / rect.width) * 2 * halfW;
    const py = view.cy + halfH - ((clientY - rect.top) / rect.height) * 2 * halfH;
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
      if (e.pointerType === "mouse" && onHover) {
        const hit = nearestPatient(e.clientX, e.clientY);
        canvas.classList.toggle("over-node", Boolean(hit));
        onHover(hit ? hit.id : null);
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
      const hit = nearestPatient(e.clientX, e.clientY);
      if (hit) onActivate(hit.id);
    }
  };
  const onLeave = () => {
    canvas.classList.remove("over-node");
    parallax.tx = 0;
    parallax.ty = 0;
    if (onHover) onHover(null);
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
  return { setData, setSelected, screenOf, dispose };
}
