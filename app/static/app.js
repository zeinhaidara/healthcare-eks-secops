import { createSession, SessionError } from "./session.js";
import { layoutTree, statusKey } from "./layout.js";
import {
  NOT_RECORDED,
  STATUS_LABELS,
  cardSections,
  initials,
  labBars,
  legendText,
  statusSummary,
  vitalGauges,
} from "./view-model.js";

const $ = (id) => document.getElementById(id);
const session = createSession((...args) => fetch(...args));

let patients = [];
let order = []; // patient ids in list order, for keyboard movement on the network
let selectedId = null;
let hoverId = null;
let scene = null; // set after the 3D module loads
let trigger = null; // the element that opened the detail panel; focus returns here

// Reduced motion, guarded so the page also runs where matchMedia does not exist.
const reducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

// Two DOM labels over the network, positioned through CSSOM (element.style), which the Content
// Security Policy allows; no inline style attributes. The hub label sits under the orb. The node label
// is for the hovered patient or else the selected one.
function placeLabel() {
  const host = $("canvas-host");
  const hubPos = scene ? scene.screenOf("root") : null;
  const hub = $("hub-label");
  if (hubPos) {
    $("hub-count").textContent = `${patients.length} patients`;
    hub.hidden = false;
    const hw = hub.offsetWidth || 0;
    hub.style.left = `${Math.max(4, hubPos.x - hw / 2)}px`;
    hub.style.top = `${hubPos.y + hubPos.r + 34}px`;
  } else {
    hub.hidden = true;
  }
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
  const w = label.offsetWidth || 0;
  const h = label.offsetHeight || 0;
  const maxLeft = Math.max(4, (host.clientWidth || 0) - w - 4);
  let top = pos.y + pos.r + 8;
  if (top + h > (host.clientHeight || 0) - 4) top = pos.y - pos.r - h - 8;
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

// ---------- The detail panel (a tall glass side panel on wide screens, a bottom sheet on phones) ----------

function factList(rows) {
  const dl = el("dl", "facts");
  for (const [term, value] of rows) {
    dl.append(el("dt", "", term), el("dd", value === NOT_RECORDED ? "not-recorded" : "", value));
  }
  return dl;
}

// A ring gauge drawn as inline SVG with a gradient stroke. The fraction is where the value sits on the
// model's range. Only SVG attributes are used (no style attribute), so the Content Security Policy holds.
const RING_R = 30;
let gaugeSeq = 0;

function svgEl(tag, attrs) {
  // The namespace is read from an inline SVG that is already in the page (the rail icon), so the script
  // carries no URL.
  const node = document.createElementNS($("svg-ns").namespaceURI, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function gaugeRing(fraction) {
  const id = `gauge-grad-${(gaugeSeq += 1)}`;
  const circumference = 2 * Math.PI * RING_R;
  const svg = svgEl("svg", { viewBox: "0 0 72 72", class: "gauge-svg", "aria-hidden": "true", focusable: "false" });
  const grad = svgEl("linearGradient", { id, x1: 0, y1: 0, x2: 1, y2: 1 });
  grad.append(svgEl("stop", { offset: "0%", "stop-color": "#2dd4bf" }), svgEl("stop", { offset: "100%", "stop-color": "#8f7bff" }));
  const defs = svgEl("defs", {});
  defs.append(grad);
  svg.append(defs, svgEl("circle", { cx: 36, cy: 36, r: RING_R, fill: "none", stroke: "rgba(233,242,244,0.1)", "stroke-width": 4 }));
  if (fraction > 0) {
    svg.append(
      svgEl("circle", {
        cx: 36,
        cy: 36,
        r: RING_R,
        fill: "none",
        stroke: `url(#${id})`,
        "stroke-width": 4,
        "stroke-linecap": "round",
        "stroke-dasharray": `${(circumference * Math.min(1, fraction)).toFixed(1)} ${circumference.toFixed(1)}`,
        transform: "rotate(-90 36 36)",
      }),
    );
  }
  return svg;
}

function gauges(p) {
  const wrap = el("div", "gauges");
  for (const g of vitalGauges(p)) {
    const item = el("div", "gauge-item");
    const ring = el("div", g.fraction === null ? "gauge gauge-empty" : "gauge");
    ring.append(gaugeRing(g.fraction || 0), el("span", "gauge-value", g.fraction === null ? "-" : g.text.split(" ")[0]));
    item.append(ring, el("span", "gauge-label", g.label), el("span", g.fraction === null ? "gauge-text not-recorded" : "gauge-text", g.text));
    wrap.append(item);
  }
  return wrap;
}

function rangeBars(p) {
  const wrap = el("div", "ranges");
  for (const bar of labBars(p)) {
    const item = el("div", "range-item");
    const head = el("div", "range-head");
    head.append(el("span", "range-label", bar.label), el("span", bar.position === null ? "range-text not-recorded" : "range-text", bar.text));
    const track = el("div", "range");
    const band = el("div", "range-band");
    band.style.left = `${(bar.band[0] * 100).toFixed(1)}%`;
    band.style.width = `${((bar.band[1] - bar.band[0]) * 100).toFixed(1)}%`;
    track.append(band);
    if (bar.position !== null) {
      const marker = el("div", "range-marker");
      marker.style.left = `${(bar.position * 100).toFixed(1)}%`;
      track.append(marker);
    }
    item.append(head, track, el("span", "range-caption", "Shaded: reference band (illustrative)"));
    wrap.append(item);
  }
  return wrap;
}

function chips(label, value, kind) {
  const item = el("div", "chip-group");
  item.append(el("h4", "", label));
  if (value === NOT_RECORDED) {
    item.append(el("p", "not-recorded", NOT_RECORDED));
    return item;
  }
  const list = el("ul", "glass-chips");
  for (const name of value.split(", ")) list.append(el("li", `gchip gchip-${kind}`, name));
  item.append(list);
  return item;
}

function careTeam(p, value) {
  const item = el("div", "chip-group");
  item.append(el("h4", "", "Care team"));
  if (value === NOT_RECORDED) {
    item.append(el("p", "not-recorded", NOT_RECORDED));
    return item;
  }
  const list = el("ul", "team");
  for (const role of p.care_team) {
    const li = el("li", "member");
    const avatar = el("span", "avatar", initials(role));
    avatar.setAttribute("aria-hidden", "true");
    li.append(avatar, el("span", "member-role", role));
    list.append(li);
  }
  item.append(list);
  return item;
}

function renderCard(p) {
  $("card-title").textContent = `${p.patient_id} ${p.name}`;
  const body = $("card-body");
  body.replaceChildren();
  for (const section of cardSections(p)) {
    const block = el("section", "card-section");
    block.append(el("h3", "", section.title));
    const rows = Object.fromEntries(section.rows);
    if (section.title === "Status") {
      const line = el("p", "status-line");
      line.append(el("span", `chip chip-${statusKey(p)}`, rows.Status));
      block.append(line, factList([["Risk band (illustrative)", rows["Risk band (illustrative)"]]]));
    } else if (section.title === "Body and vitals") {
      block.append(factList(section.rows.filter(([t]) => ["Height", "Weight", "Blood type"].includes(t))), gauges(p));
    } else if (section.title === "Labs") {
      block.append(rangeBars(p));
    } else if (section.title === "Conditions and medicines") {
      block.append(chips("Conditions", rows.Conditions, "condition"), chips("Medications", rows.Medications, "med"), chips("Allergies", rows.Allergies, "allergy"));
    } else if (section.title === "Care") {
      block.append(careTeam(p, rows["Care team"]), factList(section.rows.filter(([t]) => t !== "Care team")));
    } else {
      block.append(factList(section.rows));
    }
    body.append(block);
  }
}

function openCard(id, from) {
  const p = byId(id);
  if (!p) return;
  trigger = from || [...document.querySelectorAll(".pbtn")].find((b) => b.dataset.id === id) || null;
  select(id);
  renderCard(p);
  $("card").style.transform = "";
  $("card").showModal();
  $("card-close").focus();
}

// ---------- List and cohort ----------

function renderList() {
  const list = $("patient-list");
  list.replaceChildren();
  for (const p of patients) {
    const li = el("li");
    const b = el("button", "pbtn");
    b.type = "button";
    b.dataset.id = p.patient_id;
    b.setAttribute("aria-pressed", String(p.patient_id === selectedId));
    b.setAttribute("data-tip", `${STATUS_LABELS[statusKey(p)]} · next visit ${p.next_visit || NOT_RECORDED}`);
    b.append(
      el("span", `dot dot-${statusKey(p)}`),
      el("span", "pid", p.patient_id),
      el("span", "pname", p.name),
      el("span", "pward", p.ward || ""),
    );
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
      reducedMotion: reducedMotion(),
    });
  } catch {
    scene = null;
  }
  $("no-webgl").hidden = Boolean(scene);
  if (scene) scene.setData(layoutTree(patients));
  placeLabel();
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

// Keyboard on the network: arrows move between patients, Enter or Space opens the detail panel.
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

// The panel: Close button, backdrop click and Escape (native) all close it; focus goes back.
$("card-close").addEventListener("click", () => $("card").close());
$("card").addEventListener("click", (e) => {
  if (e.target === $("card")) $("card").close(); // a click on the backdrop targets the dialog itself
});
$("card").addEventListener("close", () => {
  const back = trigger;
  trigger = null;
  $("card").style.transform = "";
  if (back) back.focus();
});

// The bottom sheet's drag handle: drag down past a threshold to close it, else it springs back.
{
  const handle = $("sheet-handle");
  let startY = null;
  const DISMISS_PX = 90;
  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY;
    if (handle.setPointerCapture && e.pointerId !== undefined) handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (startY === null) return;
    $("card").style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`;
  });
  const end = (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    if (dy > DISMISS_PX) $("card").close();
    else $("card").style.transform = "";
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

$("lock").addEventListener("click", () => {
  session.logout();
  patients = [];
  order = [];
  selectedId = null;
  hoverId = null;
  if (scene) scene.dispose();
  scene = null;
  $("node-label").hidden = true;
  $("hub-label").hidden = true;
  $("patient-list").replaceChildren();
  showGate("Locked. Enter the key to continue.");
});

showGate();
