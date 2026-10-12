import assert from "node:assert/strict";
import test from "node:test";

import { createSession, SessionError } from "../../static/session.js";
import { apiFor, installDom } from "./dom_shim.mjs";

const KEY = "unit-test-key-4711";

function setup() {
  const dom = installDom(apiFor(KEY));
  return { dom, session: createSession((...a) => fetch(...a)) };
}

test("a good key logs in; the key is only sent to /patients and never stored or put in a URL", async () => {
  const { dom, session } = setup();
  const patients = await session.login(KEY);
  assert.equal(patients.length, 30);
  assert.equal(session.active, true);
  await session.listPatients();
  await session.getPatient("P001");

  for (const { path, options } of dom.spy.fetches) {
    assert.match(path, /^\/patients(\/P\d{3,4})?$/);
    assert.equal(options.headers["x-api-key"], KEY);
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    assert.ok(!path.includes(KEY), "key must not appear in a URL");
  }
  assert.deepEqual(dom.spy.storage, []);
  assert.deepEqual(dom.spy.cookie, []);
});

test("a wrong key is rejected and nothing is kept", async () => {
  const { dom, session } = setup();
  await assert.rejects(session.login("nope"), (e) => e instanceof SessionError && e.kind === "invalid-key");
  assert.equal(session.active, false);
  await assert.rejects(session.listPatients(), SessionError);
  assert.deepEqual(dom.spy.storage, []);
  assert.deepEqual(dom.spy.cookie, []);
});

test("an empty key never reaches the network", async () => {
  const { dom, session } = setup();
  await assert.rejects(session.login(""), SessionError);
  assert.equal(dom.spy.fetches.length, 0);
});

test("only well-formed patient ids are requested", async () => {
  const { dom, session } = setup();
  await session.login(KEY);
  const before = dom.spy.fetches.length;
  for (const bad of ["../health", "P001/../x", "p001", "", "P1", "P001?x=1"]) {
    await assert.rejects(session.getPatient(bad), SessionError);
  }
  assert.equal(dom.spy.fetches.length, before);
});

test("logout forgets the key", async () => {
  const { session } = setup();
  await session.login(KEY);
  session.logout();
  assert.equal(session.active, false);
  await assert.rejects(session.listPatients(), SessionError);
});

test("a network failure is reported as unavailable, not as a bad key", async () => {
  installDom(apiFor(KEY));
  const session = createSession(async () => {
    throw new TypeError("network down");
  });
  await assert.rejects(session.login(KEY), (e) => e.kind === "unavailable");
  assert.equal(session.active, false);
});
