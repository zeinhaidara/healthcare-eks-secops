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
const STATUS_KEYS = ["stable", "watch", "review", "unknown"];

let patients = [];
let order = []; // patient ids in list order, for keyboard movement on the tree
let selectedId = null;
let hoverId = null;
let scene = null; // the skill tree, created the first time the Tree tab opens
let heart = null; // the hero heart, created after unlock
let trigger = null; // the element that opened the card; focus returns here
const rowButton = new Map(); // patient id -> its list button

// Reduced motion and frame timing, guarded so the page also runs where they do not exist.
const reducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const raf = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : null);

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
  $("search-wrap").hidden = true;
  $("gate").hidden = false;
  $("gate-msg").textContent = message;
  $("key").value = "";
  $("key").focus();
}

// ---------- Selection, hero and the tree label ----------

// One DOM label on the tree, for the hovered patient or else the selected one. Positioned through
// CSSOM (element.style), which the Content Security Policy allows; no inline style attributes.
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

function renderHero(p) {
  if (!p) {
    $("hero-name").textContent = "No patient selected";
    $("hero-status").className = "chip chip-unknown";
    $("hero-status").textContent = NOT_RECORDED;
    $("hero-ward").textContent = "";
    $("hero-next").textContent = NOT_RECORDED;
    $("hero-open").hidden = true;
    return;
  }
  const key = statusKey(p);
  $("hero-name").textContent = `${p.patient_id} ${p.name}`;
  $("hero-status").className = `chip chip-${key}`;
  $("hero-status").textContent = STATUS_LABELS[key];
  $("hero-ward").textContent = p.ward || "";
  $("hero-next").textContent = p.next_visit || NOT_RECORDED;
  $("hero-open").hidden = false;
}

function select(id) {
  selectedId = id;
  for (const b of document.querySelectorAll(".pbtn")) {
    b.setAttribute("aria-pressed", String(b.dataset.id === selectedId));
  }
  if (scene) scene.setSelected(selectedId);
  if (heart) heart.setSelected(selectedId);
  renderHero(byId(selectedId));
  placeLabel();
}

// ---------- The patient card (a side sheet on wide screens, a bottom sheet on phones) ----------

function factList(rows) {
  const dl = el("dl", "facts");
  for (const [term, value] of rows) {
    dl.append(el("dt", "", term), el("dd", value === NOT_RECORDED ? "not-recorded" : "", value));
  }
  return dl;
}

function ringFill(node, fraction, colorVar) {
  const deg = Math.round(Math.max(0, Math.min(1, fraction)) * 360);
  node.style.background = `conic-gradient(var(${colorVar}) 0deg ${deg}deg, var(--ring-track) ${deg}deg 360deg)`;
}

function gauges(p) {
  const wrap = el("div", "gauges");
  for (const g of vitalGauges(p)) {
    const item = el("div", "gauge-item");
    const ring = el("div", g.fraction === null ? "gauge gauge-empty" : "gauge");
    ring.append(el("span", "gauge-value", g.fraction === null ? "-" : g.text.split(" ")[0]));
    ringFill(ring, g.fraction || 0, "--accent");
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
      const key = statusKey(p);
      const line = el("p", "status-line");
      line.append(el("span", `chip chip-${key}`, rows.Status));
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
  trigger = from || rowButton.get(id) || null;
  select(id);
  renderCard(p);
  $("card").showModal();
  $("card-close").focus();
}

// ---------- List, search and cohort ----------

function renderList() {
  const list = $("patient-list");
  list.replaceChildren();
  rowButton.clear();
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
    rowButton.set(p.patient_id, b);
  }
  applySearch();
}

function applySearch() {
  const q = String($("search").value || "").trim().toLowerCase();
  let shown = 0;
  for (const li of $("patient-list").children) {
    const p = byId(li.children[0].dataset.id);
    const match = !q || [p.patient_id, p.name, p.ward || ""].some((v) => String(v).toLowerCase().includes(q));
    li.hidden = !match;
    if (match) shown += 1;
  }
  $("count").textContent = q ? `${shown} of ${patients.length}` : String(patients.length);
}

let ringFrame = null;
function renderSummary() {
  const summary = statusSummary(patients);
  const total = patients.length || 1;
  for (const key of STATUS_KEYS) $(`n-${key}`).textContent = String(summary.counts[key]);
  $("cohort-total").textContent = String(patients.length);
  $("legend").textContent = legendText();
  $("status-note").textContent = summary.note;
  $("status-note").hidden = !summary.placeholder;
  // Ring gauges grow in once, unless the user asks for reduced motion.
  const target = Object.fromEntries(STATUS_KEYS.map((k) => [k, summary.counts[k] / total]));
  const paint = (t) => {
    for (const k of STATUS_KEYS) ringFill($(`ring-${k}`), target[k] * t, `--${k}`);
  };
  if (reducedMotion() || typeof requestAnimationFrame !== "function") {
    paint(1);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    paint(1 - (1 - t) ** 3);
    ringFrame = t < 1 ? raf(step) : null;
  };
  paint(0);
  ringFrame = raf(step);
}

// ---------- Tabs ----------

function showTab(name) {
  const tree = name === "tree";
  $("tab-overview").setAttribute("aria-selected", String(!tree));
  $("tab-tree").setAttribute("aria-selected", String(tree));
  $("tab-overview").tabIndex = tree ? -1 : 0;
  $("tab-tree").tabIndex = tree ? 0 : -1;
  $("view-overview").hidden = tree;
  $("view-tree").hidden = !tree;
  if (tree) ensureTree();
}

async function ensureTree() {
  if (scene) return;
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
  if (scene) {
    scene.setData(layoutTree(patients));
    scene.setSelected(selectedId);
  }
}

async function ensureHeart() {
  try {
    const { createHeart } = await import("./heart.js");
    heart = createHeart($("hero-canvas"), {
      onActivate: (id) => openCard(id),
      onHover: (id) => {
        const p = id ? byId(id) : null;
        $("hero-hint").textContent = p ? `${p.patient_id} ${p.name}: ${STATUS_LABELS[statusKey(p)]}` : "Tap a ring around the heart to open that patient.";
      },
      reducedMotion: reducedMotion(),
    });
  } catch {
    heart = null;
  }
  $("hero-fallback").hidden = Boolean(heart);
  $("hero-hint").hidden = !heart;
  if (heart) {
    heart.setData(patients);
    heart.setSelected(selectedId);
  }
}

// ---------- Unlock and lock ----------

async function showTree(data) {
  patients = data;
  order = patients.map((p) => p.patient_id);
  selectedId = null;
  hoverId = null;
  $("search").value = "";
  $("gate").hidden = true;
  $("app").hidden = false;
  $("lock").hidden = false;
  $("search-wrap").hidden = false;
  showTab("overview");
  renderList();
  renderSummary();
  renderHero(null);
  await ensureHeart();
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

$("search").addEventListener("input", applySearch);

for (const [id, name] of [["tab-overview", "overview"], ["tab-tree", "tree"]]) {
  $(id).addEventListener("click", () => showTab(name));
  $(id).addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const next = name === "overview" ? "tree" : "overview";
    const to = e.key === "Home" ? "overview" : e.key === "End" ? "tree" : next;
    showTab(to);
    $(to === "tree" ? "tab-tree" : "tab-overview").focus();
    e.preventDefault();
  });
}

$("hero-open").addEventListener("click", () => {
  if (selectedId) openCard(selectedId, $("hero-open"));
});

function moveSelection(step) {
  if (order.length === 0) return;
  const at = order.indexOf(selectedId);
  const next = at < 0 ? 0 : (at + step + order.length) % order.length;
  select(order[next]);
}

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
  if (ringFrame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(ringFrame);
  if (scene) scene.dispose();
  scene = null;
  if (heart) heart.dispose();
  heart = null;
  $("node-label").hidden = true;
  $("patient-list").replaceChildren();
  showGate("Locked. Enter the key to continue.");
});

showGate();
