// Runs the page's real app.js against a tiny DOM: key gate, patient card (open, close, Escape,
// backdrop, focus return), keyboard on the tree, status placeholder, and what it leaves behind.
import assert from "node:assert/strict";
import test from "node:test";

import { SEED, apiFor, installDom } from "./dom_shim.mjs";

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
  assert.equal($("gate-msg").textContent, "That key was not accepted.");
  assert.equal($("app").hidden, true);

  // Right key: the tree, the list, the legend. Seed statuses vary, so no placeholder note.
  await submit(KEY);
  await until(() => $("patient-list").children.length === 30);
  assert.equal($("gate").hidden, true);
  assert.equal($("key").value, "", "the field never keeps the key");
  assert.match($("legend").textContent, /registry/i);
  assert.match($("legend").textContent, /illustrative/);
  assert.equal($("status-note").hidden, true, "real status mix: no placeholder note");
  assert.equal($("n-unknown").textContent, "0");

  // Dark redesign: status counts are glass chips over the network, the hub label needs the 3D scene
  // (absent under Node, so it stays hidden and the text fallback shows), and the list is all 30.
  const counts = ["stable", "watch", "review", "unknown"].map((k) => Number($(`n-${k}`).textContent));
  assert.equal(counts.reduce((a, b) => a + b, 0), 30, "the four chips add up to every patient");
  assert.equal($("hub-label").hidden, true, "no WebGL here: no hub label");
  assert.equal($("no-webgl").hidden, false, "no WebGL here: the text fallback shows");
  assert.equal($("count").textContent, "30");
  assert.ok(buttons()[0].getAttribute("data-tip").startsWith(SEED[0].status), "the hover tip names the status");

  // 1. Open by mouse from a list row; focus moves into the card.
  const first = buttons()[0];
  first.handlers.click[0]();
  assert.equal($("card").open, true);
  assert.match($("card-title").textContent, /^P001 /);
  assert.equal(active(), $("card-close"), "focus moves to the card's Close button");
  assert.match($("card-body").textContent, /Blood pressure/);
  assert.match($("card-body").textContent, /synthetic/);
  assert.match($("card-body").textContent, /reference band \(illustrative\)/, "labs are drawn as range bars");
  assert.match($("card-body").textContent, /Heart rate/, "vitals are drawn as ring gauges");

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

  // 5. Keyboard on the tree: focus keeps the current selection (P003), arrows move, Home and End
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
  assert.match($("card-title").textContent, /^P030 /);
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
