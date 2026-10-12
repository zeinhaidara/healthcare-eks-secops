// three.js rendering for the skill tree. Everything is drawn on one canvas; the patient list
// next to it is the accessible equivalent. No network access, no storage, no inline styles.
import * as THREE from "./vendor/three/three.module.js";
import { STATUS_COLORS } from "./layout.js";

const BASE_SPAN = 38; // world units across the shorter side at zoom 1 (the tree is about 32 wide)
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const HUB_COLOR = "#5f86b8";
const ROOT_COLOR = "#c7d6ea";
const EDGE_COLOR = 0x35516f;
const BACKGROUND = 0x0d1828;
const RADIUS = { root: 1.5, band: 1.1, patient: 0.62, branch: 0.4 };

function makeLabel(text, color, height) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = "600 34px system-ui, sans-serif";
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 16;
  canvas.width = width;
  canvas.height = 52;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 8, 27);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((height * width) / 52, height, 1);
  return sprite;
}

export function createScene(container, { onSelect }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  } catch {
    return null; // no WebGL: the list and the detail panel still work
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BACKGROUND, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const world = new THREE.Group();
  scene.add(world);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1.0, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  ring.visible = false;
  ring.position.z = 0.5;
  scene.add(ring);

  const view = { cx: 0, cy: 0, zoom: 1 };
  let nodes = [];
  let selectedId = null;
  let pending = false;
  let disposables = [];

  function frustum() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const aspect = w / h;
    let halfW;
    let halfH;
    if (aspect >= 1) {
      halfH = BASE_SPAN / 2 / view.zoom;
      halfW = halfH * aspect;
    } else {
      halfW = BASE_SPAN / 2 / view.zoom;
      halfH = halfW / aspect;
    }
    return { w, h, halfW, halfH };
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

  function colorFor(node) {
    if (node.type === "root") return ROOT_COLOR;
    if (node.type === "band") return HUB_COLOR;
    return STATUS_COLORS[node.status] || STATUS_COLORS.watch;
  }

  function setData(layout) {
    clearWorld();
    nodes = layout.nodes;
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
      const material = new THREE.MeshBasicMaterial({ color: colorFor(node) });
      const mesh = new THREE.Mesh(geometries[r], material);
      mesh.position.set(node.x, node.y, 0.1);
      world.add(mesh);
      disposables.push(material);

      const big = node.type === "root" || node.type === "band";
      if (node.dim) continue; // a nearby patient is open: keep its branches readable
      const label = makeLabel(node.label, node.type === "branch" ? "#e6eef8" : "#cfdcee", big ? 1.0 : 0.8);
      if (node.type === "branch") {
        // Branch labels sit beside their node, away from the open patient.
        const half = label.scale.x / 2;
        label.position.set(node.x + node.side * (half + RADIUS.branch + 0.15), node.y, 0.3);
      } else {
        label.position.set(node.x, node.y - RADIUS[node.type] - 0.7, 0.3);
      }
      world.add(label);
      disposables.push(label.material.map, label.material);
    }
    disposables.push(...Object.values(geometries));
    setSelected(selectedId);
  }

  function setSelected(id) {
    selectedId = id;
    const node = nodes.find((n) => n.id === id && n.type === "patient");
    ring.visible = Boolean(node);
    if (node) {
      ring.position.set(node.x, node.y, 0.5);
      const s = RADIUS.patient * 1.55;
      ring.scale.set(s, s, 1);
    }
    requestDraw();
  }

  function focus(id) {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    view.cx = node.x;
    view.cy = node.y;
    view.zoom = Math.max(view.zoom, 1.6);
    requestDraw();
  }

  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const { halfW, halfH } = frustum();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    return { x: view.cx - halfW + nx * 2 * halfW, y: view.cy + halfH - ny * 2 * halfH };
  }

  function nearestPatient(clientX, clientY) {
    const p = toWorld(clientX, clientY);
    let best = null;
    let bestD = Infinity;
    for (const n of nodes) {
      if (n.type !== "patient") continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    // Generous hit radius so a fingertip works: about 1.4 world units at zoom 1.
    return best && bestD <= 1.4 / Math.sqrt(view.zoom) ? best : null;
  }

  // Pointer handling: drag to pan, pinch or wheel to zoom, tap to select.
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
    if (!prev) return;
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
    if (was && pointers.size === 0 && moved < 6) {
      const hit = nearestPatient(e.clientX, e.clientY);
      if (hit) onSelect(hit.id);
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    requestDraw();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function dispose() {
    observer.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("wheel", onWheel);
    clearWorld();
    ring.geometry.dispose();
    ring.material.dispose();
    renderer.dispose();
    canvas.remove();
  }

  resize();
  return { setData, setSelected, focus, dispose };
}
