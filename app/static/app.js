import { createSession, SessionError } from "./session.js";
import { layoutTree, statusKey } from "./layout.js";
import {
  NOT_RECORDED,
  STATUS_LABELS,
  arcCard,
  cardSections,
  initials,
  labBars,
  legendText,
  nodeCard,
  statusSummary,
  visiblePatients,
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
let wardLabels = []; // { node, x, y }: faint ward names placed over the network
const STATUS_KEYS = ["stable", "watch", "review", "unknown"];
const shown = new Set(STATUS_KEYS); // statuses currently highlighted; the others are dimmed and filtered out
let query = ""; // the patient search
let wardFilter = null; // a ward letter (or "none") while the list is filtered to one ward
let arcs = []; // the ward arcs from the layout: { arc, button }
let arcFocus = null; // the ward whose arc is hovered or focused, for the tooltip
const ARC_LABEL_RADIUS = 5.4; // where the counts sit, inside the arc (world units, matches scene.js)
const ARC_TIP_RADIUS = 11;

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

function setGateState(message, kind) {
  // kind: "loading" (a busy status), "error" (announced at once) or "" (plain).
  $("gate-msg").textContent = message;
  $("gate-msg").className = kind === "error" ? "msg msg-error" : "msg";
  $("gate-msg").setAttribute("role", kind === "error" ? "alert" : "status");
  const busy = kind === "loading";
  $("unlock").disabled = busy;
  $("gate-form").setAttribute("aria-busy", String(busy));
}

function showGate(message = "", kind = "") {
  if ($("card").open) $("card").close();
  $("app").hidden = true;
  $("lock").hidden = true;
  $("rail").hidden = true;
  $("gate").hidden = false;
  setGateState(message, kind);
  $("key").value = "";
  $("key").focus();
}

// Labels over the network (ward names, the hub count, the arc counts, the arc card and the node card) are
// positioned through CSSOM (element.style), which the Content Security Policy allows; no inline style
// attributes. This runs on every drawn frame, and reading a size forces layout, so a size is measured once
// (and again when a card's text changes or the window resizes) and a style is written only when it changes.
let sizes = new WeakMap();
const sizeOf = (node, fresh = false) => {
  if (fresh || !sizes.has(node)) sizes.set(node, { w: node.offsetWidth || 0, h: node.offsetHeight || 0 });
  return sizes.get(node);
};
const put = (node, left, top) => {
  const l = `${Math.round(left)}px`;
  const t = `${Math.round(top)}px`;
  if (node.style.left !== l) node.style.left = l;
  if (node.style.top !== t) node.style.top = t;
};
const reveal = (node, on) => {
  if (node.hidden === on) node.hidden = !on;
};
const setText = (node, text) => {
  if (node.textContent === text) return false;
  node.textContent = text;
  return true;
};
if (typeof window.addEventListener === "function") {
  window.addEventListener("resize", () => {
    sizes = new WeakMap();
    placeLabel();
  });
}

const polar = (deg, r) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];

// A card (the arc card, the node card): fill the text, then place it by its anchor, kept inside the host.
function placeCard(card, title, detail, anchor, below) {
  const host = $("canvas-host");
  const changed = setText(title.node, title.text) | setText(detail.node, detail.text);
  const wasHidden = card.hidden;
  reveal(card, true);
  const { w, h } = sizeOf(card, Boolean(changed) || wasHidden);
  const maxLeft = Math.max(4, (host.clientWidth || 0) - w - 4);
  let top = below ? anchor.y + anchor.r + 8 : anchor.y - h / 2;
  if (below && top + h > (host.clientHeight || 0) - 4) top = anchor.y - anchor.r - h - 8;
  top = Math.max(4, Math.min(top, (host.clientHeight || 0) - h - 4));
  put(card, Math.min(Math.max(anchor.x - w / 2, 4), maxLeft), top);
}

function placeLabel() {
  for (const w of wardLabels) {
    const at = scene ? scene.screenOfPoint(w.x, w.y) : null;
    reveal(w.node, Boolean(at));
    if (at) put(w.node, at.x - sizeOf(w.node).w / 2, at.y - 8);
  }
  const hubPos = scene ? scene.screenOf("root") : null;
  const hub = $("hub-label");
  reveal(hub, Boolean(hubPos));
  if (hubPos) {
    const changed = setText($("hub-count"), String(patients.length));
    const { w, h } = sizeOf(hub, changed);
    put(hub, hubPos.x - w / 2, hubPos.y - h / 2);
  }
  for (const { arc, button } of arcs) {
    const at = scene ? scene.screenOfPoint(...polar(arc.mid, ARC_LABEL_RADIUS)) : null;
    if (at) {
      const { w, h } = sizeOf(button);
      put(button, at.x - w / 2, at.y - h / 2);
    }
  }
  const tip = $("arc-tip");
  const focused = arcs.find((a) => a.arc.ward === arcFocus);
  const tipAt = focused && scene ? scene.screenOfPoint(...polar(focused.arc.mid, ARC_TIP_RADIUS)) : null;
  if (tipAt) {
    const card = arcCard(focused.arc);
    placeCard(tip, { node: $("arc-tip-title"), text: card.title }, { node: $("arc-tip-detail"), text: card.detail }, { ...tipAt, r: 0 }, false);
  } else {
    reveal(tip, false);
  }
  const label = $("node-label");
  const id = hoverId || selectedId;
  const pos = id && scene ? scene.screenOf(id) : null;
  const p = id ? byId(id) : null;
  if (!pos || !p) {
    reveal(label, false);
    return;
  }
  const card = nodeCard(p);
  placeCard(label, { node: $("node-label-title"), text: card.title }, { node: $("node-label-detail"), text: card.detail }, pos, true);
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
  const rows = visiblePatients(patients, shown, query, wardFilter);
  order = rows.map((p) => p.patient_id);
  for (const p of rows) {
    const li = el("li");
    const b = el("button", "pbtn");
    b.type = "button";
    b.dataset.id = p.patient_id;
    b.setAttribute("aria-pressed", String(p.patient_id === selectedId));
    b.setAttribute("data-tip", `${STATUS_LABELS[statusKey(p)]} Â· next visit ${p.next_visit || NOT_RECORDED}`);
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
  $("ward-clear").hidden = !wardFilter;
  const filteredArc = arcs.find((a) => a.arc.ward === wardFilter);
  if (filteredArc) $("ward-clear").textContent = `${filteredArc.arc.text} only. Clear`;
  $("count").textContent = rows.length === patients.length ? String(patients.length) : `${rows.length} of ${patients.length}`;
  $("list-empty").textContent = patients.length === 0 ? "No patients returned." : "No patients match.";
  $("list-empty").hidden = rows.length > 0;
}

// A status chip is a toggle: pressed means shown. Turning one off dims its nodes and hides its rows.
function toggleStatus(key) {
  if (shown.has(key)) shown.delete(key);
  else shown.add(key);
  $(`chip-${key}`).setAttribute("aria-pressed", String(shown.has(key)));
  if (scene) scene.setFilter(shown, wardFilter);
  renderList();
  placeLabel();
}

// An arc is a toggle: click filters the list to its ward, click again clears it.
function toggleWard(ward) {
  wardFilter = wardFilter === ward ? null : ward;
  for (const { arc, button } of arcs) button.setAttribute("aria-pressed", String(arc.ward === wardFilter));
  if (scene) scene.setFilter(shown, wardFilter);
  renderList();
  placeLabel();
}

function hoverArc(ward) {
  arcFocus = ward;
  if (scene) scene.setArcFocus(ward);
  placeLabel();
}

// One real button per arc, holding the counts. It is the keyboard and screen-reader way to the arc: focus
// shows the same card as hover, Enter or Space filters. With the 3D view it sits over the arc; without it,
// the buttons form a plain row (the ward filter still works).
function buildArcs(list) {
  $("ward-arcs").replaceChildren();
  arcs = list.map((arc) => {
    const button = el("button", "arc-btn");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${arc.text}: ${arc.total} patients, ${arc.review} in review. Filter the list to this ward.`);
    const review = el("span", "arc-review");
    review.append(el("span", "arc-n", String(arc.review)), el("span", "arc-word", " review"));
    button.append(el("span", "arc-total", String(arc.total)), review);
    button.addEventListener("click", () => toggleWard(arc.ward));
    button.addEventListener("focus", () => hoverArc(arc.ward));
    button.addEventListener("blur", () => hoverArc(null));
    $("ward-arcs").append(button);
    return { arc, button };
  });
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

function buildWardLabels(guides) {
  $("ward-labels").replaceChildren();
  wardLabels = guides.labels.map((l) => {
    const node = el("span", "ward-label", l.text);
    $("ward-labels").append(node);
    return { node, x: l.x, y: l.y };
  });
}

async function showTree(data) {
  patients = data;
  selectedId = null;
  hoverId = null;
  shown.clear();
  for (const k of STATUS_KEYS) {
    shown.add(k);
    $(`chip-${k}`).setAttribute("aria-pressed", "true");
  }
  query = "";
  wardFilter = null;
  arcFocus = null;
  $("search").value = "";
  setGateState("", "");
  $("gate").hidden = true;
  $("app").hidden = false;
  $("lock").hidden = false;
  $("rail").hidden = false;
  const layout = layoutTree(patients);
  buildArcs(layout.arcs);
  renderList();
  renderSummary();
  $("net-state").hidden = false; // "Loading the network..." until the 3D view is ready
  try {
    const { createScene } = await import("./scene.js");
    scene = createScene($("canvas-host"), {
      onActivate: (id) => openCard(id, $("canvas-host")),
      onHover: (id) => {
        hoverId = id;
        placeLabel();
      },
      onArcHover: hoverArc,
      onArcActivate: toggleWard,
      onDraw: placeLabel,
      reducedMotion: reducedMotion(),
    });
  } catch {
    scene = null;
  }
  $("net-state").hidden = true;
  $("no-webgl").hidden = Boolean(scene);
  $("ward-arcs").className = scene ? "ward-arcs" : "ward-arcs flat";
  if (scene) {
    buildWardLabels(layout.guides);
    scene.setData(layout);
    scene.setFilter(shown, wardFilter);
  }
  placeLabel();
  $("patient-list").querySelector("button")?.focus();
}

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const candidate = $("key").value;
  $("key").value = ""; // the field never keeps the key
  setGateState("Checking the key and loading patients...", "loading");
  try {
    await showTree(await session.login(candidate));
  } catch (err) {
    // A bad key and an unreachable service are different problems, so they read differently.
    const message =
      err instanceof SessionError
        ? err.kind === "unavailable"
          ? `${err.message} The patient service may be down. Try again in a moment.`
          : `${err.message} Check it and try again.`
        : "Something went wrong. Try again.";
    showGate(message, "error");
  }
});

$("search").addEventListener("input", () => {
  query = $("search").value;
  renderList();
});
$("ward-clear").addEventListener("click", () => wardFilter && toggleWard(wardFilter));
for (const key of STATUS_KEYS) $(`chip-${key}`).addEventListener("click", () => toggleStatus(key));

// The rail: real shortcuts, no dead icons. Each one moves keyboard focus to a section.
$("rail-network").addEventListener("click", () => $("canvas-host").focus());
$("rail-cohort").addEventListener("click", () => $("chip-stable").focus());
$("rail-patients").addEventListener("click", () => $("search").focus());

// Keyboard on the network: arrows move between patients, Enter or Space opens the detail panel.
$("canvas-host").addEventListener("keydown", (e) => {
  if (e.target !== $("canvas-host")) return; // an arc button inside it handles its own Enter and Space
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
  $("arc-tip").hidden = true;
  $("ward-arcs").replaceChildren();
  arcs = [];
  wardFilter = null;
  arcFocus = null;
  $("ward-labels").replaceChildren();
  wardLabels = [];
  $("patient-list").replaceChildren();
  showGate("Locked. Enter the key to continue.");
});

showGate();
