import { createSession, SessionError } from "./session.js";
import { layoutTree, statusKey } from "./layout.js";
import { cardSections, legendText, statusSummary } from "./view-model.js";

const $ = (id) => document.getElementById(id);
const session = createSession((...args) => fetch(...args));

let patients = [];
let order = []; // patient ids in list order, for keyboard movement on the tree
let selectedId = null;
let hoverId = null;
let scene = null; // set after the 3D module loads
let trigger = null; // the element that opened the card; focus returns here

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const byId = (id) => patients.find((p) => p.patient_id === id);

function showGate(message = "") {
  if ($("card").open) $("card").close();
  $("app").hidden = true;
  $("lock").hidden = true;
  $("gate").hidden = false;
  $("gate-msg").textContent = message;
  $("key").value = "";
  $("key").focus();
}

// One DOM label, for the hovered patient or else the selected one. Positioned through CSSOM
// (element.style), which the Content Security Policy allows; no inline style attributes.
function placeLabel() {
  const label = $("node-label");
  const id = hoverId || selectedId;
  const pos = id && scene ? scene.screenOf(id) : null;
  const p = id ? byId(id) : null;
  if (!pos || !p) {
    label.hidden = true;
    return;
  }
  label.textContent = `${p.patient_id} ${p.name}`;
  label.hidden = false;
  const host = $("canvas-host");
  const w = label.offsetWidth || 0;
  const h = label.offsetHeight || 0;
  const maxLeft = Math.max(4, (host.clientWidth || 0) - w - 4);
  let top = pos.y + pos.r + 6;
  if (top + h > (host.clientHeight || 0) - 4) top = pos.y - pos.r - h - 6;
  label.style.left = `${Math.min(Math.max(pos.x - w / 2, 4), maxLeft)}px`;
  label.style.top = `${Math.max(top, 4)}px`;
}

function select(id) {
  selectedId = id;
  for (const b of document.querySelectorAll(".pbtn")) {
    b.setAttribute("aria-pressed", String(b.dataset.id === selectedId));
  }
  if (scene) scene.setSelected(selectedId);
  placeLabel();
}

function renderCard(p) {
  $("card-title").textContent = `${p.patient_id} ${p.name}`;
  const body = $("card-body");
  body.replaceChildren();
  for (const section of cardSections(p)) {
    const block = el("section", "card-section");
    block.append(el("h3", "", section.title));
    const dl = el("dl", "facts");
    for (const [term, value] of section.rows) {
      dl.append(el("dt", "", term), el("dd", value === "not recorded" ? "not-recorded" : "", value));
    }
    block.append(dl);
    body.append(block);
  }
}

function openCard(id, from) {
  const p = byId(id);
  if (!p) return;
  trigger = from || null;
  select(id);
  renderCard(p);
  $("card").showModal();
  $("card-close").focus();
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
    b.append(el("span", `dot dot-${statusKey(p)}`), el("span", "pid", p.patient_id), el("span", "pname", p.name));
    b.addEventListener("click", () => openCard(p.patient_id, b));
    b.addEventListener("focus", () => select(p.patient_id));
    li.append(b);
    list.append(li);
  }
  $("count").textContent = String(patients.length);
}

function renderSummary() {
  const summary = statusSummary(patients);
  for (const key of ["stable", "watch", "review", "unknown"]) {
    $(`n-${key}`).textContent = String(summary.counts[key]);
  }
  $("legend").textContent = legendText();
  $("status-note").textContent = summary.note;
  $("status-note").hidden = !summary.placeholder;
}

function moveSelection(step) {
  if (order.length === 0) return;
  const at = order.indexOf(selectedId);
  const next = at < 0 ? 0 : (at + step + order.length) % order.length;
  select(order[next]);
}

async function showTree(data) {
  patients = data;
  order = patients.map((p) => p.patient_id);
  selectedId = null;
  hoverId = null;
  $("gate").hidden = true;
  $("app").hidden = false;
  $("lock").hidden = false;
  renderList();
  renderSummary();
  try {
    const { createScene } = await import("./scene.js");
    scene = createScene($("canvas-host"), {
      onActivate: (id) => openCard(id, $("canvas-host")),
      onHover: (id) => {
        hoverId = id;
        placeLabel();
      },
      onDraw: placeLabel,
    });
  } catch {
    scene = null;
  }
  $("no-webgl").hidden = Boolean(scene);
  if (scene) scene.setData(layoutTree(patients));
  $("patient-list").querySelector("button")?.focus();
}

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const candidate = $("key").value;
  $("key").value = ""; // the field never keeps the key
  $("gate-msg").textContent = "Checking the key...";
  try {
    await showTree(await session.login(candidate));
  } catch (err) {
    showGate(err instanceof SessionError ? err.message : "Something went wrong.");
  }
});

// Keyboard on the tree: arrows move between patients, Enter or Space opens the card.
$("canvas-host").addEventListener("keydown", (e) => {
  if (["ArrowRight", "ArrowDown"].includes(e.key)) moveSelection(1);
  else if (["ArrowLeft", "ArrowUp"].includes(e.key)) moveSelection(-1);
  else if (e.key === "Home") select(order[0]);
  else if (e.key === "End") select(order[order.length - 1]);
  else if ((e.key === "Enter" || e.key === " ") && selectedId) openCard(selectedId, $("canvas-host"));
  else return;
  e.preventDefault();
});
$("canvas-host").addEventListener("focus", () => {
  if (!selectedId && order.length) select(order[0]);
  else placeLabel();
});

// The card: Close button, backdrop click and Escape (native) all close it; focus goes back.
$("card-close").addEventListener("click", () => $("card").close());
$("card").addEventListener("click", (e) => {
  if (e.target === $("card")) $("card").close(); // a click on the backdrop targets the dialog itself
});
$("card").addEventListener("close", () => {
  const back = trigger;
  trigger = null;
  if (back) back.focus();
});

$("lock").addEventListener("click", () => {
  session.logout();
  patients = [];
  order = [];
  selectedId = null;
  hoverId = null;
  if (scene) scene.dispose();
  scene = null;
  $("node-label").hidden = true;
  showGate("Locked. Enter the key to continue.");
});

showGate();
