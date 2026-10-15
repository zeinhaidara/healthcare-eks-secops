// three.js rendering for the skill tree: the registry hub, one node per patient and the branches.
// No text is drawn on the canvas; the page shows one DOM label instead, so labels never overlap.
// No network access, no storage, no inline styles.
import * as THREE from "./vendor/three/three.module.js";
import { STATUS_COLORS } from "./layout.js";

const BASE_SPAN = 34; // world units across the shorter side at zoom 1 (the tree is about 28 wide)
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const ROOT_COLOR = "#0f8f8a";
const EDGE_COLOR = 0x9aa9b8;
const BACKGROUND = 0xf7f9fb;
const SELECTION_COLOR = 0x1d2a38;
const RADIUS = { root: 1.5, patient: 0.62 };

export function createScene(container, { onActivate, onHover, onDraw }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  } catch {
    return null; // no WebGL: the list and the card still work
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BACKGROUND, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const world = new THREE.Group();
  scene.add(world);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 40), new THREE.MeshBasicMaterial({ color: SELECTION_COLOR }));
  ring.visible = false;
  ring.position.z = 0.5;
  scene.add(ring);

  const view = { cx: 0, cy: 0, zoom: 1 };
  let span = BASE_SPAN; // grows when a crowded sector pushes patients further out, so none are clipped
  let nodes = [];
  let pending = false;
  let disposables = [];

  function frustum() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    const half = span / 2 / view.zoom;
    return aspect >= 1 ? { w, h, halfW: half * aspect, halfH: half } : { w, h, halfW: half, halfH: half / aspect };
  }

  function draw() {
    pending = false;
    const { halfW, halfH } = frustum();
    camera.left = view.cx - halfW;
    camera.right = view.cx + halfW;
    camera.top = view.cy + halfH;
    camera.bottom = view.cy - halfH;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    if (onDraw) onDraw();
  }

  function requestDraw() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(draw);
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

  function setData(layout) {
    clearWorld();
    nodes = layout.nodes;
    const reach = Math.max(0, ...nodes.map((n) => Math.hypot(n.x, n.y)));
    span = Math.max(BASE_SPAN, 2 * (reach + 1.6));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const points = [];
    for (const e of layout.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      points.push(a.x, a.y, 0, b.x, b.y, 0);
    }
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE_COLOR });
    world.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
    disposables.push(edgeGeometry, edgeMaterial);

    const geometries = {};
    for (const node of nodes) {
      const r = RADIUS[node.type];
      geometries[r] ||= new THREE.CircleGeometry(r, 28);
      const color = node.type === "root" ? ROOT_COLOR : STATUS_COLORS[node.status] || STATUS_COLORS.unknown;
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geometries[r], material);
      mesh.position.set(node.x, node.y, 0.1);
      world.add(mesh);
      disposables.push(material);
    }
    disposables.push(...Object.values(geometries));
    requestDraw();
  }

  function setSelected(id) {
    const node = nodes.find((n) => n.id === id && n.type === "patient");
    ring.visible = Boolean(node);
    if (node) {
      ring.position.set(node.x, node.y, 0.5);
      const s = RADIUS.patient * 1.55;
      ring.scale.set(s, s, 1);
    }
    requestDraw();
  }

  // Screen position (CSS pixels, relative to the container) of a node, for the DOM label.
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
    observer.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("wheel", onWheel);
    clearWorld();
    ring.geometry.dispose();
    ring.material.dispose();
    renderer.dispose();
    canvas.remove();
  }

  resize();
  return { setData, setSelected, screenOf, dispose };
}
