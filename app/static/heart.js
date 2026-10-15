// The hero: a 3D glass heart with one status ring per patient orbiting it.
// The heart is a THREE.Shape outline extruded with THREE.ExtrudeGeometry, in a MeshPhysicalMaterial
// with transmission, tinted from cyan at the top to rose at the tip. A tap or click on a ring opens
// that patient. Rotation is slow and stops when the user asks for reduced motion.
// No network access, no storage, no inline styles. The canvas is decorative (aria-hidden): every
// patient is also reachable from the list.
import * as THREE from "./vendor/three/three.module.js";
import { STATUS_COLORS } from "./layout.js";

const CYAN = new THREE.Color("#5fd0dc");
const ROSE = new THREE.Color("#f08aaa");
const RING_RADIUS = { x: 2.35, z: 1.25 }; // the orbit, an ellipse around the heart
const SPIN = 0.18; // radians per second for the heart
const ORBIT = 0.06; // radians per second for the rings

function heartGeometry() {
  // The classic heart outline (two lobes and a tip), drawn upside down, then flipped.
  const s = new THREE.Shape();
  s.moveTo(5, 5);
  s.bezierCurveTo(5, 5, 4, 0, 0, 0);
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  s.bezierCurveTo(16, 7, 16, 0, 10, 0);
  s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 4,
    bevelEnabled: true,
    bevelThickness: 1.6,
    bevelSize: 1.3,
    bevelSegments: 10,
    curveSegments: 40,
  });
  g.center();
  g.rotateZ(Math.PI);
  g.scale(0.085, 0.085, 0.085);
  // Vertex colours: cyan at the top of the lobes, rose at the tip.
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / (max.y - min.y || 1);
    c.copy(ROSE).lerp(CYAN, t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function createHeart(container, { onActivate, onHover, reducedMotion = false }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null; // no WebGL: the hero still shows the selected patient as text
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.7, 7.2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2f5, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 6);
  scene.add(key);
  const cyanLight = new THREE.PointLight(0x7fe6f0, 18, 20);
  cyanLight.position.set(-3.5, 2, 3);
  scene.add(cyanLight);
  const roseLight = new THREE.PointLight(0xf6a3c0, 18, 20);
  roseLight.position.set(3.5, -1.5, 3);
  scene.add(roseLight);

  const heartGeo = heartGeometry();
  const heartMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transmission: 0.6,
    roughness: 0.15,
    metalness: 0,
    thickness: 1.2,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    attenuationColor: new THREE.Color("#c8eef2"),
    attenuationDistance: 3,
  });
  const heart = new THREE.Mesh(heartGeo, heartMat);
  scene.add(heart);

  const orbit = new THREE.Group();
  orbit.rotation.x = 0.28;
  scene.add(orbit);
  const ringGeo = new THREE.TorusGeometry(0.12, 0.04, 14, 36);
  let rings = [];
  let selectedId = null;

  function size() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function clearRings() {
    for (const r of rings) {
      orbit.remove(r);
      r.material.dispose();
    }
    rings = [];
  }

  function setData(patients) {
    clearRings();
    patients.forEach((p, i) => {
      const angle = (i / patients.length) * Math.PI * 2;
      const color = STATUS_COLORS[p.status] || STATUS_COLORS.unknown;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1, emissive: color, emissiveIntensity: 0.15 });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.set(Math.cos(angle) * RING_RADIUS.x, 0, Math.sin(angle) * RING_RADIUS.z);
      ring.userData.id = p.patient_id;
      orbit.add(ring);
      rings.push(ring);
    });
    setSelected(selectedId);
  }

  function setSelected(id) {
    selectedId = id;
    for (const r of rings) {
      const on = r.userData.id === id;
      r.scale.setScalar(on ? 1.9 : 1);
      r.material.emissiveIntensity = on ? 0.55 : 0.15;
    }
    if (reducedMotion) draw();
  }

  function draw() {
    for (const r of rings) r.lookAt(camera.position); // rings face the viewer, so they read as rings
    renderer.render(scene, camera);
  }

  // Animation: one frame loop, stopped under reduced motion and when disposed.
  let frame = 0;
  let last = 0;
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    heart.rotation.y += SPIN * dt;
    orbit.rotation.y += ORBIT * dt;
    draw();
    frame = requestAnimationFrame(tick);
  }

  // Picking: the nearest ring under the pointer.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function ringAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(rings, false)[0];
    return hit ? hit.object.userData.id : null;
  }
  let downAt = null;
  const onDown = (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    if (!downAt) return;
    const moved = Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
    downAt = null;
    if (moved > 8) return;
    const id = ringAt(e.clientX, e.clientY);
    if (id) onActivate(id);
  };
  const onMove = (e) => {
    const id = ringAt(e.clientX, e.clientY);
    canvas.classList.toggle("over-node", Boolean(id));
    if (onHover) onHover(id);
  };
  const onLeave = () => {
    canvas.classList.remove("over-node");
    if (onHover) onHover(null);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  const observer = new ResizeObserver(() => {
    size();
    if (reducedMotion) draw();
  });
  observer.observe(container);
  size();
  if (reducedMotion) draw();
  else frame = requestAnimationFrame(tick);

  function dispose() {
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerleave", onLeave);
    clearRings();
    ringGeo.dispose();
    heartGeo.dispose();
    heartMat.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return { setData, setSelected, dispose };
}
