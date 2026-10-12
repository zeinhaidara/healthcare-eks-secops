import assert from "node:assert/strict";
import test from "node:test";

import { BANDS, branchesFor, layoutTree } from "../../static/layout.js";
import { SEED } from "./dom_shim.mjs";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function minPatientGap(nodes) {
  const ps = nodes.filter((n) => n.type === "patient");
  let min = Infinity;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) min = Math.min(min, dist(ps[i], ps[j]));
  return min;
}

test("one node per patient, plus a root and one hub per band", () => {
  const { nodes, edges } = layoutTree(SEED);
  assert.equal(nodes.filter((n) => n.type === "patient").length, SEED.length);
  assert.equal(nodes.filter((n) => n.type === "band").length, BANDS.length);
  assert.equal(nodes.filter((n) => n.type === "root").length, 1);
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) assert.ok(ids.has(e.from) && ids.has(e.to));
  assert.equal(edges.length, nodes.length - 1, "a tree has one edge fewer than nodes");
});

test("patient nodes do not overlap, for the real data and for the worst case", () => {
  assert.ok(minPatientGap(layoutTree(SEED).nodes) > 1.3);
  const crowded = Array.from({ length: 30 }, (_, i) => ({ ...SEED[0], patient_id: `P${String(i + 1).padStart(3, "0")}`, risk_band: "low" }));
  assert.ok(minPatientGap(layoutTree(crowded).nodes) > 1.3);
});

test("every patient sits in its own risk band's sector", () => {
  const { nodes } = layoutTree(SEED);
  const hubs = Object.fromEntries(nodes.filter((n) => n.type === "band").map((n) => [n.band, n]));
  for (const n of nodes.filter((x) => x.type === "patient")) {
    const nearest = Object.values(hubs).sort((a, b) => dist(a, n) - dist(b, n))[0];
    assert.equal(nearest.band, n.band);
  }
});

test("selecting a patient adds its attributes as branches and no other node moves", () => {
  const base = layoutTree(SEED).nodes;
  const open = layoutTree(SEED, "P001");
  const extra = open.nodes.filter((n) => n.type === "branch");
  assert.equal(extra.length, branchesFor(SEED[0]).length);
  assert.ok(extra.every((n) => n.id.startsWith("P001:")));
  for (const n of base) {
    const same = open.nodes.find((m) => m.id === n.id);
    assert.deepEqual([same.x, same.y], [n.x, n.y]);
  }
});

test("opening a patient dims only nearby patient labels and puts each branch label on one side", () => {
  const open = layoutTree(SEED, "P001");
  const owner = open.nodes.find((n) => n.id === "P001");
  const dimmed = open.nodes.filter((n) => n.dim);
  assert.ok(dimmed.every((n) => n.type === "patient" && n.id !== "P001" && dist(n, owner) < 7.5));
  assert.ok(open.nodes.filter((n) => n.type === "patient" && !n.dim).length > 0);
  for (const b of open.nodes.filter((n) => n.type === "branch")) assert.ok(b.side === 1 || b.side === -1);
  assert.ok(layoutTree(SEED).nodes.every((n) => !n.dim), "nothing is dimmed when nothing is open");
});

test("layout is deterministic and tolerates older records without the new fields", () => {
  assert.deepEqual(layoutTree(SEED, "P003"), layoutTree(SEED, "P003"));
  const old = [{ patient_id: "P001", name: "A", age: 30, condition: "Asthma", date_of_birth: "1996-01-01", admission_date: "2026-01-01" }];
  const { nodes } = layoutTree(old, "P001");
  assert.equal(nodes.filter((n) => n.type === "patient").length, 1);
  assert.ok(nodes.some((n) => n.type === "branch"));
});
