// three.js rendering for the network: a glowing orb hub, one glowing dot per patient and thin curved
// branches that brighten toward the centre. The glow is additive sprites from a gradient drawn on a 2D
// canvas, so no image, font or network access is needed (the vendored build has no bloom pass).
// No text is drawn on the canvas; the page shows DOM labels instead, so labels never overlap.
// No network access, no storage, no inline styles. Under reduced motion nothing rotates or pulses.
import * as THREE from "./vendor/three/three.module.js";
import { STATUS_COLORS } from "./layout.js";

const BASE_SPAN = 26; // world units across the shorter side at zoom 1 (grows below if a sector pushes patients out)
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const HUB_COLOR = "#19c3b4";
const SELECTION_COLOR = 0xe9f2f4;
const RADIUS = { root: 1.15, patient: 0.34 };
const CURVE_POINTS = 28;

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

  // Light for the orb only (every other material is unlit).
  scene.add(new THREE.AmbientLight(0x5f8f90, 0.9));
  const key = new THREE.DirectionalLight(0xbdfaf2, 2.2);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const fill = new THREE.PointLight(0x19c3b4, 30, 12);
  fill.position.set(2, -2, 4);
  scene.add(fill);

  const glowMap = glowTexture();
  const glowSprite = (color, scale, opacity) => {
    const m = new THREE.SpriteMaterial({ map: glowMap, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.scale.set(scale, scale, 1);
    return s;
  };

  // The hub: a dark ring, a soft rim, a sphere with an emissive core, a slow wireframe shell, a halo.
  const hub = new THREE.Group();
  hub.position.z = 0.2;
  const darkRing = new THREE.Mesh(new THREE.RingGeometry(1.55, 2.1, 64), new THREE.MeshBasicMaterial({ color: 0x050b10, transparent: true, opacity: 0.92 }));
  darkRing.position.z = -0.3;
  const ringEdge = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.15, 64), new THREE.MeshBasicMaterial({ color: 0x19c3b4, transparent: true, opacity: 0.35 }));
  ringEdge.position.z = -0.29;
  const rim = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.27, 64), new THREE.MeshBasicMaterial({ color: 0x7ff3e6, transparent: true, opacity: 0.55 }));
  rim.position.z = 0.3;
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS.root, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0x0b3a3a, emissive: new THREE.Color(HUB_COLOR), emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.25 }),
  );
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: 0xb8fff6 }));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.32, 2), new THREE.MeshBasicMaterial({ color: 0x7ff3e6, wireframe: true, transparent: true, opacity: 0.22 }));
  const halo = glowSprite(0x19c3b4, 9, 0.75);
  halo.position.z = -0.2;
  hub.add(darkRing, ringEdge, halo, orb, core, shell, rim);
  scene.add(hub);

  const selectRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 40), new THREE.MeshBasicMaterial({ color: SELECTION_COLOR }));
  selectRing.visible = false;
  selectRing.position.z = 0.6;
  scene.add(selectRing);

  const view = { cx: 0, cy: 0, zoom: 1 };
  let span = BASE_SPAN; // grows when a crowded sector pushes patients further out, so none are clipped
  let nodes = [];
  let disposables = [];
  let edgeMaterial = null;
  let pending = false;
  let frame = 0;

  function frustum() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    const half = span / 2 / view.zoom;
    return aspect >= 1 ? { w, h, halfW: half * aspect, halfH: half } : { w, h, halfW: half, halfH: half / aspect };
  }

  function draw(time = 0) {
    pending = false;
    if (!reducedMotion) {
      const t = time / 1000;
      shell.rotation.y = t * 0.25;
      shell.rotation.x = t * 0.12;
      orb.rotation.y = t * 0.2;
      if (edgeMaterial) edgeMaterial.opacity = 0.62 + 0.18 * Math.sin(t * 1.4); // the line pulse
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
    draw(time);
    frame = requestAnimationFrame(tick);
  }

  function requestDraw() {
    if (reducedMotion && !pending) {
      pending = true;
      requestAnimationFrame(draw); // on demand only; with motion the loop already draws every frame
    }
  }

  function resize() {
    const { w, h } = frustum();
    renderer.setSize(w, h, false);
    requestDraw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  function clearWorld() {
    for (const d of disposables) d.dispose();
    disposables = [];
    world.clear();
  }

  function curve(a, b) {
    // A gentle bend: the control point sits off the straight line by a share of the length.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const bend = 0.12 * len;
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
    edgeMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    disposables.push(edgeMaterial);
    for (const e of layout.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      const pts = curve(a, b);
      const tint = new THREE.Color(STATUS_COLORS[b.status] || STATUS_COLORS.unknown);
      const colors = [];
      pts.forEach((_, i) => {
        const t = i / (pts.length - 1); // 0 at the hub, 1 at the patient
        const c = hubColor.clone().lerp(tint.clone().multiplyScalar(0.45), t).multiplyScalar(1 - 0.55 * t);
        colors.push(c.r, c.g, c.b);
      });
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      world.add(new THREE.Line(g, edgeMaterial));
      disposables.push(g);
    }
    const dotGeo = new THREE.CircleGeometry(RADIUS.patient, 24);
    disposables.push(dotGeo);
    for (const node of nodes) {
      if (node.type !== "patient") continue;
      const color = STATUS_COLORS[node.status] || STATUS_COLORS.unknown;
      const mat = new THREE.MeshBasicMaterial({ color });
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.position.set(node.x, node.y, 0.1);
      world.add(dot);
      const glow = glowSprite(color, 2.3, 0.6);
      glow.position.set(node.x, node.y, 0.05);
      world.add(glow);
      disposables.push(mat, glow.material);
    }
    requestDraw();
  }

  function setSelected(id) {
    const node = nodes.find((n) => n.id === id && n.type === "patient");
    selectRing.visible = Boolean(node);
    if (node) {
      selectRing.position.set(node.x, node.y, 0.6);
      const s = RADIUS.patient * 1.9;
      selectRing.scale.set(s, s, 1);
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
    observer.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("wheel", onWheel);
    clearWorld();
    for (const m of [darkRing, ringEdge, rim, orb, core, shell, selectRing]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    halo.material.dispose();
    glowMap.dispose();
    renderer.dispose();
    canvas.remove();
  }

  resize();
  if (!reducedMotion) frame = requestAnimationFrame(tick);
  return { setData, setSelected, screenOf, dispose };
}
