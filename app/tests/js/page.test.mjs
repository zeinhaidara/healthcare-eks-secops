// Runs the page's real app.js against a tiny DOM and checks what it leaves behind after login.
import assert from "node:assert/strict";
import test from "node:test";

import { apiFor, installDom } from "./dom_shim.mjs";

const KEY = "page-test-key-9001";

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out waiting for the page");
}

test("page: wrong key, right key, lock. localStorage, sessionStorage and cookies stay untouched", async () => {
  const dom = installDom(apiFor(KEY));
  await import("../../static/app.js"); // starts at the key gate
  const $ = (id) => dom.document.getElementById(id);
  const submit = $("gate-form").handlers.submit[0];

  assert.equal($("gate").hidden, false, "gate shown first");
  assert.equal($("app").hidden, true, "tree hidden until a key is accepted");

  // Wrong key: stays on the gate.
  $("key").value = "not-the-key";
  await submit({ preventDefault() {} });
  assert.equal($("gate").hidden, false);
  assert.equal($("app").hidden, true);
  assert.equal($("gate-msg").textContent, "That key was not accepted.");
  assert.equal($("key").value, "", "field is cleared after a failed attempt");

  // Right key: tree and list appear.
  $("key").value = KEY;
  await submit({ preventDefault() {} });
  await until(() => $("no-webgl").hidden === false || dom.created.some((e) => e.className === "pbtn"));
  assert.equal($("gate").hidden, true);
  assert.equal($("app").hidden, false);
  assert.equal($("key").value, "", "the field never keeps the key");
  await until(() => $("patient-list").children.length === 30);
  assert.equal($("count").textContent, "30");

  // Select a patient through the list: details render as text, not HTML.
  const first = $("patient-list").querySelector("button");
  first.handlers.click[0]();
  assert.equal($("detail-body").hidden, false);
  assert.match($("detail-body").textContent, /P001/);
  assert.match($("detail-body").textContent, /synthetic/);

  // Lock: back to the gate.
  $("lock").handlers.click[0]();
  assert.equal($("gate").hidden, false);
  assert.equal($("app").hidden, true);
  assert.match($("gate-msg").textContent, /Locked/);

  // The whole run: no storage, no cookie, and only /patients routes with the key in a header.
  assert.deepEqual(dom.spy.storage, [], "localStorage and sessionStorage were not touched");
  assert.deepEqual(dom.spy.cookie, [], "document.cookie was not read or written");
  assert.ok(dom.spy.fetches.length >= 2);
  for (const { path, options } of dom.spy.fetches) {
    assert.match(path, /^\/patients(\/P\d{3,4})?$/);
    assert.ok(!path.includes(KEY));
    assert.equal(options.credentials, "omit");
  }
});
