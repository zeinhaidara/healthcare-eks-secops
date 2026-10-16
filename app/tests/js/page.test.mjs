// Runs the page's real app.js against a tiny DOM: key gate, patient card (open, close, Escape,
// backdrop, focus return), keyboard on the tree, status placeholder, and what it leaves behind.
import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { RISK_ORDER, WARDS, statusKey, wardOf } from "../../static/layout.js";
import { INDEX_HTML, SEED, apiFor, installDom } from "./dom_shim.mjs";

const KEY = "page-test-key-9001";
const V1_KEY = "page-test-key-v1-records";
// Records shaped like the v1 table: no status, no v2 or v2.1 fields.
const V1_RECORDS = SEED.map(({ patient_id, name, age, condition, date_of_birth, admission_date }) => ({
  patient_id,
  name,
  age,
  condition,
  date_of_birth,
  admission_date,
}));

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out waiting for the page");
}

test("page: gate, card by mouse, Close, Escape, backdrop, keyboard, placeholder, lock; nothing stored", async () => {
  const dom = installDom(apiFor(KEY, { [KEY]: SEED, [V1_KEY]: V1_RECORDS }));
  await import("../../static/app.js");
  const $ = (id) => dom.document.getElementById(id);
  const active = () => dom.document.activeElement;
  const submit = (key) => {
    $("key").value = key;
    return $("gate-form").handlers.submit[0]({ preventDefault() {} });
  };
  const buttons = () => $("patient-list").children.map((li) => li.children[0]);

  // Gate first; a wrong key stays on the gate.
  assert.equal($("app").hidden, true);
  await submit("not-the-key");
  assert.equal($("gate-msg").textContent, "That key was not accepted. Check it and try again.");
  assert.equal($("gate-msg").getAttribute("role"), "alert", "a bad key is announced at once");
  assert.match($("gate-msg").className, /msg-error/);
  assert.equal($("app").hidden, true);

  // Right key: the tree, the list, the legend. Seed statuses vary, so no placeholder note.
  await submit(KEY);
  await until(() => $("patient-list").children.length === 30);
  assert.equal($("gate").hidden, true);
  assert.equal($("key").value, "", "the field never keeps the key");
  assert.match($("legend").textContent, /registry/i);
  assert.match($("legend").textContent, /illustrative/i);
  assert.equal($("status-note").hidden, true, "real status mix: no placeholder note");
  assert.equal($("n-unknown").textContent, "0");

  // Dark redesign: status counts are glass chips over the network, the hub label needs the 3D scene
  // (absent under Node, so it stays hidden and the text fallback shows), and the list is all 30.
  const counts = ["stable", "watch", "review", "unknown"].map((k) => Number($(`n-${k}`).textContent));
  assert.equal(counts.reduce((a, b) => a + b, 0), 30, "the four chips add up to every patient");
  assert.equal($("hub-label").hidden, true, "no WebGL here: no hub label");
  assert.equal($("no-webgl").hidden, false, "no WebGL here: the text fallback shows");
  assert.equal($("count").textContent, "30");
  const statusOfRow = (b) => SEED.find((p) => p.patient_id === b.dataset.id).status;
  assert.ok(buttons()[0].getAttribute("data-tip").startsWith(statusOfRow(buttons()[0])), "the hover tip names the status");
  assert.equal(statusOfRow(buttons()[0]), "review", "sorted by risk: review is first");

  // 1. Open by mouse from a list row; focus moves into the card.
  const first = buttons()[0];
  first.handlers.click[0]();
  assert.equal($("card").open, true);
  assert.ok($("card-title").textContent.startsWith(`${first.dataset.id} `), "the card is the row's patient");
  assert.equal(active(), $("card-close"), "focus moves to the card's Close button");
  assert.match($("card-body").textContent, /Blood pressure/);
  assert.match($("card-body").textContent, /synthetic/);
  assert.match($("card-body").textContent, /reference band \(illustrative\)/, "labs are drawn as range bars");
  assert.match($("card-body").textContent, /Heart rate/, "vitals are drawn as ring gauges");
  const gradients = dom.created.filter((e) => e.tagName === "LINEARGRADIENT");
  assert.ok(gradients.length >= 3, "each ring gauge has its own SVG gradient");
  assert.ok(new Set(gradients.map((g) => g.getAttribute("id"))).size === gradients.length, "gradient ids are unique");
  assert.ok(gradients.every((g) => Object.keys(g.style).length === 0), "SVG parts set attributes only, never a style");

  // 2. Close button: card closes, focus returns to the row that opened it.
  $("card-close").handlers.click[0]();
  assert.equal($("card").open, false);
  assert.equal(active(), first);

  // 2b. The bottom sheet's drag handle: a short drag springs back, a long drag down closes it.
  const handle = $("sheet-handle");
  first.handlers.click[0]();
  handle.fire("pointerdown", { clientY: 100 });
  handle.fire("pointermove", { clientY: 130 });
  assert.equal($("card").style.transform, "translateY(30px)", "the sheet follows the drag");
  handle.fire("pointerup", { clientY: 130 });
  assert.equal($("card").open, true, "a short drag does not close it");
  assert.equal($("card").style.transform, "", "and it springs back");
  handle.fire("pointerdown", { clientY: 100 });
  handle.fire("pointermove", { clientY: 260 });
  handle.fire("pointerup", { clientY: 260 });
  assert.equal($("card").open, false, "a long drag down closes it");
  assert.equal(active(), first, "focus returns to the row");

  // 3. Escape: the browser closes the dialog (close event); focus returns.
  const second = buttons()[1];
  second.handlers.click[0]();
  assert.equal($("card").open, true);
  $("card").close(); // what a native <dialog> does on Escape
  assert.equal(active(), second);

  // 4. Backdrop click closes; a click inside the card does not.
  const third = buttons()[2];
  third.handlers.click[0]();
  $("card").fire("click", { target: $("card-body") });
  assert.equal($("card").open, true, "a click inside the card keeps it open");
  $("card").fire("click", { target: $("card") });
  assert.equal($("card").open, false, "a click on the backdrop closes it");
  assert.equal(active(), third);

  // 5. Keyboard on the tree: focus keeps the current selection (the third row), arrows move, Home and End
  //    jump, Enter opens.
  const host = $("canvas-host");
  host.focus();
  assert.equal(buttons()[2].getAttribute("aria-pressed"), "true");
  assert.equal(host.fire("keydown", { key: "ArrowRight" }).defaultPrevented, true);
  assert.equal(buttons()[3].getAttribute("aria-pressed"), "true");
  host.fire("keydown", { key: "Home" });
  assert.equal(buttons()[0].getAttribute("aria-pressed"), "true");
  host.fire("keydown", { key: "ArrowLeft" });
  assert.equal(buttons()[29].getAttribute("aria-pressed"), "true", "wraps around");
  assert.equal(buttons().filter((b) => b.getAttribute("aria-pressed") === "true").length, 1);
  host.fire("keydown", { key: "Enter" });
  assert.equal($("card").open, true);
  assert.ok($("card-title").textContent.startsWith(`${buttons()[29].dataset.id} `), "Enter opens the selected patient");
  $("card").close();
  assert.equal(active(), host, "focus returns to the tree");
  assert.equal(host.fire("keydown", { key: "a" }).defaultPrevented, false, "other keys pass through");

  // 6. Lock, then a v1-shaped dataset: missing status shows "not recorded" and the placeholder note.
  $("card-close").handlers.click[0]();
  $("lock").handlers.click[0]();
  assert.equal($("gate").hidden, false);
  await submit(V1_KEY);
  await until(() => $("patient-list").children.length === 30);
  assert.equal($("status-note").hidden, false);
  assert.match($("status-note").textContent, /status is a placeholder in this dataset/);
  assert.equal($("n-unknown").textContent, "30");
  assert.equal($("n-watch").textContent, "0", "a missing status is never counted as watch");
  assert.ok(buttons().every((b) => b.children[0].className === "dot dot-unknown"));
  buttons()[0].handlers.click[0]();
  assert.match($("card-body").textContent, /not recorded/);
  assert.doesNotMatch($("card-body").textContent, /watch/);
  $("card").close();

  // The whole run: no storage, no cookie, only /patients with the key in a header.
  assert.deepEqual(dom.spy.storage, [], "localStorage and sessionStorage were not touched");
  assert.deepEqual(dom.spy.cookie, [], "document.cookie was not read or written");
  for (const { path, options } of dom.spy.fetches) {
    assert.match(path, /^\/patients(\/P\d{3,4})?$/);
    assert.ok(!path.includes(KEY) && !path.includes(V1_KEY));
    assert.equal(options.credentials, "omit");
  }
});

// ---------- The ward arcs, filters, search, rail, banner and error states ----------
// Each test gets a fresh copy of app.js (the query string defeats the module cache) bound to its own DOM.
let copies = 0;
async function boot(datasets = { [KEY]: SEED }, serve = apiFor(KEY, datasets)) {
  const dom = installDom(serve);
  await import(`../../static/app.js?copy=${(copies += 1)}`);
  const $ = (id) => dom.document.getElementById(id);
  const submit = (key) => {
    $("key").value = key;
    return $("gate-form").handlers.submit[0]({ preventDefault() {} });
  };
  const rows = () => $("patient-list").children.map((li) => li.children[0]);
  const ids = () => rows().map((b) => b.dataset.id);
  const arcButtons = () => $("ward-arcs").children;
  return { dom, $, submit, rows, ids, arcButtons };
}
const unlocked = async () => {
  const page = await boot();
  await page.submit(KEY);
  await until(() => page.rows().length === SEED.length);
  return page;
};
const seedWhere = (fn) => SEED.filter(fn).map((p) => p.patient_id).sort();

test("page: four ward arcs hold the counts, and they match the data", async () => {
  const { $, arcButtons } = await unlocked();
  assert.equal(arcButtons().length, 4, "four arcs, A to D");
  WARDS.forEach((ward, i) => {
    const mine = SEED.filter((p) => wardOf(p) === ward);
    const button = arcButtons()[i];
    assert.equal(button.children[0].textContent, String(mine.length), `ward ${ward} patient count`);
    assert.equal(button.children[1].children[0].textContent, String(mine.filter((p) => p.status === "review").length), `ward ${ward} review count`);
    assert.match(button.getAttribute("aria-label"), new RegExp(`^Ward ${ward}: ${mine.length} patients, `));
    assert.equal(button.getAttribute("aria-pressed"), "false");
  });
  assert.equal($("ward-arcs").className, "ward-arcs flat", "no 3D view here: the arcs fall back to a plain row of buttons");
  assert.match($("legend").textContent, /arc/i);
  assert.match($("legend").textContent, /branch/i);
});

test("page: clicking an arc filters the list to that ward, clicking it again clears it", async () => {
  const { $, ids, arcButtons } = await unlocked();
  const wardB = seedWhere((p) => wardOf(p) === "B");
  arcButtons()[1].handlers.click[0]();
  assert.deepEqual([...ids()].sort(), wardB, "only ward B is listed");
  assert.equal($("count").textContent, `${wardB.length} of ${SEED.length}`);
  assert.equal(arcButtons()[1].getAttribute("aria-pressed"), "true");
  assert.equal(arcButtons()[0].getAttribute("aria-pressed"), "false");
  assert.equal($("ward-clear").hidden, false);
  assert.match($("ward-clear").textContent, /Ward B/);

  arcButtons()[2].handlers.click[0](); // another arc replaces the filter
  assert.deepEqual([...ids()].sort(), seedWhere((p) => wardOf(p) === "C"));

  arcButtons()[2].handlers.click[0](); // the same arc again clears it
  assert.equal(ids().length, SEED.length);
  assert.equal($("ward-clear").hidden, true);
  assert.equal(arcButtons()[2].getAttribute("aria-pressed"), "false");

  arcButtons()[0].handlers.click[0]();
  $("ward-clear").handlers.click[0](); // the clear button does the same
  assert.equal(ids().length, SEED.length);

  // Enter on an arc button is the button's own: the network's key handler must not swallow it or open a patient.
  const keyEvent = $("canvas-host").fire("keydown", { key: "Enter", target: arcButtons()[0] });
  assert.equal(keyEvent.defaultPrevented, false);
  assert.equal($("card").open, false);

  arcButtons()[3].handlers.focus[0](); // focus asks for the arc card; without the 3D view there is nothing to place
  arcButtons()[3].handlers.blur[0]();
  assert.equal($("arc-tip").hidden, true);
});

test("page: status chips are toggles that filter the list, and they combine with the ward filter", async () => {
  const { $, ids, rows, arcButtons } = await unlocked();
  for (const key of ["stable", "watch", "review", "unknown"]) assert.equal($(`chip-${key}`).getAttribute("aria-pressed"), "true");
  $("chip-review").handlers.click[0]();
  assert.equal($("chip-review").getAttribute("aria-pressed"), "false");
  assert.deepEqual([...ids()].sort(), seedWhere((p) => p.status !== "review"), "review rows are hidden");
  assert.equal($("chip-watch").getAttribute("aria-pressed"), "true", "the other chips stay on");

  arcButtons()[0].handlers.click[0](); // and ward A on top
  assert.deepEqual([...ids()].sort(), seedWhere((p) => p.status !== "review" && wardOf(p) === "A"));

  $("chip-review").handlers.click[0]();
  assert.equal($("chip-review").getAttribute("aria-pressed"), "true");
  assert.deepEqual([...ids()].sort(), seedWhere((p) => wardOf(p) === "A"), "review is back, still ward A");
  $("ward-clear").handlers.click[0]();

  for (const key of ["stable", "watch", "review", "unknown"]) $(`chip-${key}`).handlers.click[0]();
  assert.equal(rows().length, 0);
  assert.equal($("list-empty").hidden, false, "everything off: an empty state, not a blank list");
  assert.equal($("list-empty").textContent, "No patients match.");
});

test("page: search by ID or name, and the list is sorted by risk", async () => {
  const { $, ids, rows } = await unlocked();
  const risk = ids().map((id) => RISK_ORDER[statusKey(SEED.find((p) => p.patient_id === id))]);
  assert.deepEqual(risk, [...risk].sort((a, b) => a - b), "review first, then watch, then stable");
  assert.equal(SEED.find((p) => p.patient_id === ids()[0]).status, "review");
  const search = (q) => {
    $("search").value = q;
    $("search").fire("input");
  };
  search("P01");
  assert.deepEqual([...ids()].sort(), seedWhere((p) => p.patient_id.toLowerCase().includes("p01")), "by ID");
  const name = SEED[4].name.toUpperCase().slice(0, 4);
  search(`  ${name}  `);
  assert.deepEqual([...ids()].sort(), seedWhere((p) => p.name.toLowerCase().includes(name.toLowerCase())), "by name, ignoring case and spaces");
  assert.ok(ids().includes(SEED[4].patient_id));
  search("zzz-nobody");
  assert.equal(rows().length, 0);
  assert.equal($("list-empty").hidden, false);
  assert.equal($("count").textContent, `0 of ${SEED.length}`);
  search("");
  assert.equal(ids().length, SEED.length);
  assert.equal($("list-empty").hidden, true);
});

test("page: each rail icon goes somewhere real, and there are no others", async () => {
  const { $ } = await unlocked();
  const rail = [...INDEX_HTML.matchAll(/id="(rail-[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rail, ["rail-network", "rail-cohort", "rail-patients"]);
  assert.equal([...INDEX_HTML.matchAll(/class="pill-icon"/g)].length, rail.length, "no icon without a handler");
  const goes = { "rail-network": "canvas-host", "rail-cohort": "chip-stable", "rail-patients": "search" };
  for (const [button, target] of Object.entries(goes)) {
    assert.ok($(button).handlers.click?.length, `${button} has a handler`);
    $(button).handlers.click[0]();
    assert.equal(globalThis.document.activeElement, $(target), `${button} moves focus to ${target}`);
  }
});

test("page: small scenes get compact labels, big ones keep the words", async () => {
  const small = await unlocked();
  assert.equal(small.$("canvas-host").className, "canvas-host compact", "the shim's 600 x 400 scene is under 440 on its short side");
  const big = await boot();
  big.$("canvas-host").clientHeight = 700;
  await big.submit(KEY);
  await until(() => big.rows().length === SEED.length);
  assert.equal(big.$("canvas-host").className, "canvas-host");
});

test("page: the banner text is unchanged and it is a quiet periwinkle pill, not amber or red", () => {
  const text = "SYNTHETIC DATA &middot; illustrative only &middot; not clinical advice";
  assert.match(INDEX_HTML, new RegExp(`<div class="banner" role="note">${text}</div>`));
  assert.equal(INDEX_HTML.split("SYNTHETIC DATA").length - 1, 2, "the banner and the card line, nowhere else");
  const css = readFileSync(new URL("../../static/app.css", import.meta.url), "utf-8").replace(/\r\n/g, "\n");
  const rule = css.match(/\n\.banner \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /#f2b84b|#f2627f|amber|--watch|--review/i, "no amber or red in the banner");
  assert.match(rule, /rgba\(143, 123, 255/, "periwinkle");
  // WCAG contrast of the banner text on the lightest thing under the pill: the page glow plus the periwinkle tint.
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const over = (bg, fg, a) => hex(bg).map((v, i) => v * (1 - a) + hex(fg)[i] * a);
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const page = toHex(over("#0b1820", "#19c3b4", 0.2));
  const pill = over(page, "#8f7bff", 0.16);
  const ink = css.match(/--periwinkle-text: (#[0-9a-f]{6})/)[1];
  const ratio = (lum(hex(ink)) + 0.05) / (lum(pill) + 0.05);
  assert.ok(ratio >= 4.5, `banner contrast ${ratio.toFixed(2)}:1 is at least AA`);
});

test("page: loading and error states for the patient fetch", async () => {
  // Loading: the gate says so, announces it politely, and cannot be submitted twice.
  let page = await boot();
  const pending = page.submit(KEY);
  assert.match(page.$("gate-msg").textContent, /Checking the key and loading patients/);
  assert.equal(page.$("gate-msg").getAttribute("role"), "status");
  assert.equal(page.$("unlock").disabled, true);
  assert.equal(page.$("gate-form").getAttribute("aria-busy"), "true");
  await pending;
  await until(() => page.rows().length === SEED.length);
  assert.equal(page.$("gate-form").getAttribute("aria-busy"), "false");
  assert.equal(page.$("gate-msg").textContent, "");
  assert.equal(page.$("net-state").hidden, true, "the network loading note clears");

  // Bad key: says so, asks for a check, announces at once, and keeps the gate.
  page = await boot();
  await page.submit("nope");
  assert.equal(page.$("gate").hidden, false);
  assert.equal(page.$("app").hidden, true);
  assert.match(page.$("gate-msg").textContent, /not accepted\. Check it and try again/);
  assert.equal(page.$("gate-msg").getAttribute("role"), "alert");
  assert.equal(page.$("unlock").disabled, false, "the form is usable again");

  // API down, two ways: it answers with a server error, or it cannot be reached at all.
  for (const [serve, wording] of [
    [() => ({ status: 503, body: {} }), /The API answered 503\. The patient service may be down/],
    [() => { throw new TypeError("network"); }, /Could not reach the API\. The patient service may be down/],
  ]) {
    page = await boot({}, serve);
    await page.submit(KEY);
    assert.match(page.$("gate-msg").textContent, wording);
    assert.equal(page.$("gate-msg").getAttribute("role"), "alert");
    assert.equal(page.$("app").hidden, true);
    assert.equal(page.$("key").value, "", "the key is never kept");
  }

  // An empty answer is its own state, not a blank list.
  page = await boot({ [KEY]: [] });
  await page.submit(KEY);
  await until(() => !page.$("app").hidden);
  assert.equal(page.$("list-empty").hidden, false);
  assert.equal(page.$("list-empty").textContent, "No patients returned.");
  assert.equal(page.arcButtons().length, 4, "the arcs still draw, all zero");
});

test("page: the lock card is centred at any width, and the hub label has a readable backing", () => {
  const css = readFileSync(new URL("../../static/app.css", import.meta.url), "utf-8").replace(/\r\n/g, "\n");
  const rule = (selector, from = css) => from.match(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`))[1];
  // Narrow and wide: the card has a width cap and centres itself.
  const gate = rule(".gate");
  assert.match(gate, /width: min\(440px, 100%\)/);
  assert.match(gate, /max-width: 440px/);
  assert.match(gate, /margin-inline: auto/);
  // The 1100px grid has a rail column. The rail is hidden on the lock screen, so the frame must name column 2,
  // or it falls into the 76px rail column and the card is squeezed.
  const wide = css.slice(css.indexOf("@media (min-width: 1100px)"));
  assert.match(wide, /\.shell \{ grid-template-columns: 76px minmax\(0, 1fr\); \}/);
  assert.match(wide, /\.rail:not\(\[hidden\]\) ~ \.frame \{ grid-column: 2; \}/, "with the rail showing, the frame is column 2");
  assert.match(wide, /\.rail\[hidden\] ~ \.frame \{ grid-column: 1 \/ -1; \}/, "with the rail hidden, the frame spans the page");
  assert.match(INDEX_HTML, /<nav id="rail"[^>]* hidden>/, "the rail is hidden until unlock, which is why the frame needs the explicit column");

  // The hub label: an opaque-enough backing, and the "30" and the name clear AA even over the brightest glow.
  const hub = rule(".hub-label");
  const [r, g, b, a] = hub.match(/background: rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/).slice(1).map(Number);
  assert.ok(a >= 0.85, "mostly opaque");
  const glow = [184, 255, 246]; // the core sprite colour, the brightest thing behind the label
  const back = [r, g, b].map((v, i) => v * a + glow[i] * (1 - a));
  const lum = (rgb) => {
    const [x, y, z] = rgb.map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * x + 0.7152 * y + 0.0722 * z;
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (const [name, colour] of [["--ink", css.match(/--ink: (#[0-9a-f]{6})/)[1]], ["--accent-text", css.match(/--accent-text: (#[0-9a-f]{6})/)[1]]]) {
    const ratio = (lum(hex(colour)) + 0.05) / (lum(back) + 0.05);
    assert.ok(ratio >= 4.5, `${name} on the hub backing is ${ratio.toFixed(2)}:1`);
  }
  assert.match(rule(".hub-count"), /color: var\(--ink\)/);
  assert.match(css, /\.compact \.arc-word, \.compact \.hub-name, \.compact \.hub-word \{ display: none; \}/, "compact labels are keyed to the scene size");
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 520px\) \{\s+\.canvas-host \{ height: calc\(100vh - 24px\)/, "a phone on its side gets a taller network");
});
