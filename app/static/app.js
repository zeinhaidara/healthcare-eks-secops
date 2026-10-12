import { createSession, SessionError } from "./session.js";
import { layoutTree } from "./layout.js";

const $ = (id) => document.getElementById(id);
const session = createSession((...args) => fetch(...args));

let patients = [];
let selectedId = null;
let scene = null; // set after the 3D module loads

const STATUSES = ["stable", "watch", "review"];
const statusOf = (p) => (STATUSES.includes(p.status) ? p.status : "watch");

function showGate(message = "") {
  $("app").hidden = true;
  $("lock").hidden = true;
  $("gate").hidden = false;
  $("gate-msg").textContent = message;
  $("key").value = "";
  $("key").focus();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderList() {
  const list = $("patient-list");
  list.replaceChildren();
  for (const p of patients) {
    const li = el("li");
    const b = el("button", "pbtn");
    b.type = "button";
    b.dataset.id = p.patient_id;
    b.setAttribute("aria-pressed", String(p.patient_id === selectedId));
    b.append(el("span", `dot dot-${statusOf(p)}`), el("span", "pid", p.patient_id), el("span", "pname", p.name));
    b.addEventListener("click", () => select(p.patient_id, true));
    li.append(b);
    list.append(li);
  }
  $("count").textContent = String(patients.length);
  for (const s of STATUSES) {
    $(`n-${s}`).textContent = String(patients.filter((p) => statusOf(p) === s).length);
  }
}

function fact(dl, term, value) {
  if (value === undefined || value === null || value === "") return;
  dl.append(el("dt", "", term), el("dd", "", String(value)));
}

function renderDetail() {
  const p = patients.find((x) => x.patient_id === selectedId);
  $("detail-empty").hidden = Boolean(p);
  const dl = $("detail-body");
  dl.hidden = !p;
  dl.replaceChildren();
  if (!p) return;
  const status = el("span", `chip chip-${statusOf(p)}`, statusOf(p));
  const statusDd = el("dd");
  statusDd.append(status);
  dl.append(el("dt", "", "Patient"), el("dd", "", `${p.patient_id}  ${p.name}`));
  dl.append(el("dt", "", "Status"), statusDd);
  fact(dl, "Risk band (illustrative)", p.risk_band);
  fact(dl, "Age", p.age);
  fact(dl, "Height", p.height_cm != null ? `${p.height_cm} cm` : "");
  fact(dl, "Weight", p.weight_kg != null ? `${p.weight_kg} kg` : "");
  fact(dl, "Blood type", p.blood_type);
  fact(dl, "Ward", p.ward);
  fact(dl, "Born", p.date_of_birth);
  fact(dl, "Admitted", p.admission_date);
  fact(dl, "Conditions", (p.conditions && p.conditions.length ? p.conditions : [p.condition]).join(", "));
  fact(dl, "Data", p.data_classification);
}

function refresh() {
  for (const b of document.querySelectorAll(".pbtn")) {
    b.setAttribute("aria-pressed", String(b.dataset.id === selectedId));
  }
  renderDetail();
  if (scene) {
    scene.setData(layoutTree(patients, selectedId));
    scene.setSelected(selectedId);
  }
}

function select(id, focusNode) {
  selectedId = id;
  refresh();
  if (scene && focusNode) scene.focus(id);
}

async function showTree(data) {
  patients = data;
  selectedId = null;
  $("gate").hidden = true;
  $("app").hidden = false;
  $("lock").hidden = false;
  renderList();
  renderDetail();
  try {
    const { createScene } = await import("./scene.js");
    scene = createScene($("canvas-host"), { onSelect: (id) => select(id, false) });
  } catch {
    scene = null;
  }
  $("no-webgl").hidden = Boolean(scene);
  if (scene) scene.setData(layoutTree(patients, null));
  $("patient-list").querySelector("button")?.focus();
}

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const candidate = $("key").value;
  $("key").value = ""; // the field never keeps the key
  $("gate-msg").textContent = "Checking the key...";
  try {
    showTree(await session.login(candidate));
  } catch (err) {
    showGate(err instanceof SessionError ? err.message : "Something went wrong.");
  }
});

$("lock").addEventListener("click", () => {
  session.logout();
  patients = [];
  selectedId = null;
  if (scene) scene.dispose();
  scene = null;
  showGate("Locked. Enter the key to continue.");
});

showGate();
