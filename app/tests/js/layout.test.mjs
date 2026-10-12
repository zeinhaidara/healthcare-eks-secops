import assert from "node:assert/strict";
import test from "node:test";

import { BANDS, layoutTree, sectorOf, statusKey } from "../../static/layout.js";
import { SEED } from "./dom_shim.mjs";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleOf = (n) => ((Math.atan2(n.y, n.x) * 180) / Math.PI + 360) % 360;
const SECTOR = { low: [6, 84], moderate: [96, 174], elevated: [186, 264], high: [276, 354] };

function minPatientGap(nodes) {
  const ps = nodes.filter((n) => n.type === "patient");
  let min = Infinity;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) min = Math.min(min, dist(ps[i], ps[j]));
  return min;
}

test("only the registry hub and one node per patient, each joined to the hub", () => {
  const { nodes, edges } = layoutTree(SEED);
  assert.deepEqual([...new Set(nodes.map((n) => n.type))].sort(), ["patient", "root"]);
  assert.equal(nodes.filter((n) => n.type === "patient").length, SEED.length);
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
  assert.equal(edges.length, SEED.length);
  assert.ok(edges.every((e) => e.from === "root"));
});

test("patients are grouped in one sector per risk band", () => {
  for (const n of layoutTree(SEED).nodes.filter((x) => x.type === "patient")) {
    const [lo, hi] = SECTOR[n.sector];
    assert.ok(angleOf(n) >= lo && angleOf(n) <= hi, `${n.id} outside the ${n.sector} sector`);
    assert.ok(BANDS.includes(n.sector));
  }
});

test("patient nodes do not overlap, for the real data and for the worst case", () => {
  assert.ok(minPatientGap(layoutTree(SEED).nodes) > 1.3);
  const crowded = Array.from({ length: 30 }, (_, i) => ({ ...SEED[0], patient_id: `P${String(i + 1).padStart(3, "0")}`, risk_band: "low" }));
  assert.ok(minPatientGap(layoutTree(crowded).nodes) > 1.3);
});

test("a missing status is 'unknown', never one of the real statuses", () => {
  assert.equal(statusKey({}), "unknown");
  assert.equal(statusKey({ status: "watch" }), "watch");
  assert.equal(statusKey({ status: "bogus" }), "unknown");
  const old = [{ patient_id: "P001", name: "A", age: 30, condition: "Asthma", date_of_birth: "1996-01-01", admission_date: "2026-01-01" }];
  const node = layoutTree(old).nodes.find((n) => n.id === "P001");
  assert.equal(node.status, "unknown");
  assert.equal(sectorOf(old[0]), "moderate", "an unrated record still gets a place");
});

test("layout is deterministic", () => {
  assert.deepEqual(layoutTree(SEED), layoutTree(SEED));
});
