import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NO_WARD, REVIEW_FULL, RING_RADIUS, STATUS_COLORS, WARDS, arcColor, layoutTree, statusKey, wardArcs, wardOf } from "../../static/layout.js";
import { SEED } from "./dom_shim.mjs";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleOf = (n) => ((Math.atan2(n.y, n.x) * 180) / Math.PI + 360) % 360;
const patientsOf = (layout) => layout.nodes.filter((n) => n.type === "patient");
const countBy = (list, key) => list.reduce((m, p) => ((m[key(p)] = (m[key(p)] || 0) + 1), m), {});

function minPatientGap(nodes) {
  const ps = nodes.filter((n) => n.type === "patient");
  let min = Infinity;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) min = Math.min(min, dist(ps[i], ps[j]));
  return min;
}

test("only the registry hub and one node per patient, each joined to the hub", () => {
  const { nodes, edges } = layoutTree(SEED);
  assert.deepEqual([...new Set(nodes.map((n) => n.type))].sort(), ["patient", "root"]);
  assert.equal(patientsOf({ nodes }).length, SEED.length);
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
  assert.equal(edges.length, SEED.length);
  assert.ok(edges.every((e) => e.from === "root"));
});

test("angle is the ward: each patient sits inside its own quarter, A to D counterclockwise", () => {
  for (const n of patientsOf(layoutTree(SEED))) {
    const i = WARDS.indexOf(n.ward);
    assert.ok(i >= 0, `${n.id} has a ward A to D`);
    const [lo, hi] = [90 * i + 6, 90 * (i + 1) - 6];
    assert.ok(angleOf(n) >= lo && angleOf(n) <= hi, `${n.id} (ward ${n.ward}) is outside its wedge`);
  }
});

test("distance is the status: review nearest the centre, then watch, then stable", () => {
  const mean = (status) => {
    const r = patientsOf(layoutTree(SEED)).filter((n) => n.status === status).map((n) => Math.hypot(n.x, n.y));
    assert.ok(r.length > 0, `seed has ${status} patients`);
    return r.reduce((a, b) => a + b, 0) / r.length;
  };
  assert.ok(mean("review") < mean("watch") && mean("watch") < mean("stable"));
  const rings = layoutTree(SEED).guides.rings.map((r) => r.status);
  assert.deepEqual(rings.slice(0, 3), ["review", "watch", "stable"], "the guide rings run in the same order");
});

test("within a ward and ring, patients run in ID order", () => {
  const cells = new Map();
  for (const n of patientsOf(layoutTree(SEED))) {
    const key = `${n.ward}|${n.status}`;
    cells.set(key, [...(cells.get(key) || []), n]);
  }
  for (const [key, members] of cells) {
    const base = RING_RADIUS[members[0].status];
    const firstRing = members.filter((n) => Math.hypot(n.x, n.y) < base + 0.9).sort((a, b) => a.id.localeCompare(b.id));
    assert.ok(firstRing.length > 0);
    const angles = firstRing.map(angleOf);
    assert.deepEqual(angles, [...angles].sort((a, b) => a - b), `${key}: IDs run around the wedge in order`);
  }
});

test("patient nodes do not overlap, for the real data and for the worst case", () => {
  assert.ok(minPatientGap(layoutTree(SEED).nodes) > 1.2);
  const crowded = Array.from({ length: 30 }, (_, i) => ({ ...SEED[0], patient_id: `P${String(i + 1).padStart(3, "0")}`, ward: "Ward A", status: "stable" }));
  assert.ok(minPatientGap(layoutTree(crowded).nodes) > 1.2);
});

test("a missing status is 'unknown', a missing ward gets its own wedge, neither is guessed", () => {
  assert.equal(statusKey({}), "unknown");
  assert.equal(statusKey({ status: "watch" }), "watch");
  assert.equal(statusKey({ status: "bogus" }), "unknown");
  assert.equal(wardOf({ ward: "Ward C" }), "C");
  assert.equal(wardOf({ ward: "ward d" }), "D");
  assert.equal(wardOf({ ward: "Ward Z" }), null);
  assert.equal(wardOf({}), null);
  const old = [{ patient_id: "P001", name: "A", age: 30, condition: "Asthma", date_of_birth: "1996-01-01", admission_date: "2026-01-01" }];
  const layout = layoutTree(old);
  const node = layout.nodes.find((n) => n.id === "P001");
  assert.equal(node.status, "unknown");
  assert.equal(node.ward, null);
  assert.deepEqual(layout.arcs.map((a) => a.ward), [...WARDS, NO_WARD], "a fifth arc appears only when a patient has no ward");
});

test("layout is deterministic: the same output on two loads, in any input order, with no Math.random", () => {
  assert.deepEqual(layoutTree(SEED), layoutTree(SEED));
  assert.equal(JSON.stringify(layoutTree(SEED)), JSON.stringify(layoutTree(SEED)));
  assert.deepEqual(layoutTree([...SEED].reverse()), layoutTree(SEED), "input order does not matter");
  const here = new URL("../../static/", import.meta.url);
  for (const file of ["layout.js", "view-model.js", "scene.js", "app.js", "session.js"]) {
    assert.doesNotMatch(readFileSync(new URL(file, here), "utf-8"), /Math\.random\s*\(/, `${file} never calls Math.random`);
  }
});

test("the ward arcs match the data: counts per ward and status, review counts, and arc length", () => {
  const { arcs } = layoutTree(SEED);
  assert.deepEqual(arcs.map((a) => a.ward), WARDS);
  const byWard = countBy(SEED, (p) => wardOf(p));
  for (const arc of arcs) {
    const mine = SEED.filter((p) => wardOf(p) === arc.ward);
    assert.equal(arc.total, byWard[arc.ward], `ward ${arc.ward} total`);
    for (const s of ["stable", "watch", "review", "unknown"]) assert.equal(arc[s], mine.filter((p) => statusKey(p) === s).length, `ward ${arc.ward} ${s}`);
    assert.equal(arc.stable + arc.watch + arc.review + arc.unknown, arc.total);
    assert.ok(Math.abs(arc.share - arc.total / SEED.length) < 1e-12);
    assert.ok(Math.abs(arc.reviewShare - arc.review / arc.total) < 1e-12);
  }
  assert.equal(arcs.reduce((n, a) => n + a.total, 0), SEED.length, "every patient is in one arc");
  assert.equal(arcs.reduce((n, a) => n + a.review, 0), SEED.filter((p) => p.status === "review").length);
  // Length is the share: the lengths plus the fixed gaps fill the circle, and a bigger ward has a longer arc.
  const gap = (360 - arcs.reduce((n, a) => n + a.length, 0)) / arcs.length;
  assert.ok(gap > 0 && gap < 10);
  for (const a of arcs) assert.ok(Math.abs(a.length + gap - a.share * 360) < 1e-9, `ward ${a.ward} arc length is its share`);
  const big = [...arcs].sort((a, b) => b.total - a.total);
  assert.ok(big[0].length >= big[big.length - 1].length);
});

test("arc colour runs from the stable green to the review red, by the review share", () => {
  assert.equal(arcColor(0), STATUS_COLORS.stable);
  assert.equal(arcColor(REVIEW_FULL), STATUS_COLORS.review);
  assert.equal(arcColor(1), STATUS_COLORS.review, "clamped");
  assert.equal(arcColor(REVIEW_FULL / 2), STATUS_COLORS.watch, "halfway is the amber of the watch chip");
  const away = (hex) => [1, 3, 5].reduce((n, i) => n + (parseInt(hex.slice(i, i + 2), 16) - parseInt(STATUS_COLORS.review.slice(i, i + 2), 16)) ** 2, 0);
  assert.ok(away(arcColor(0.1)) > away(arcColor(0.2)) && away(arcColor(0.2)) > away(arcColor(0.3)) && away(arcColor(0.3)) > away(arcColor(0.5)), "closer to red as the share grows");
  const { arcs } = layoutTree(SEED);
  for (const a of arcs) assert.equal(a.color, arcColor(a.reviewShare));
});

test("an empty ward still has a tick, and one ward holding everyone gets a near-full arc", () => {
  const one = SEED.map((p) => ({ ...p, ward: "Ward B" }));
  const arcs = wardArcs(one);
  assert.equal(arcs.find((a) => a.ward === "A").total, 0);
  assert.equal(arcs.find((a) => a.ward === "A").length, 2);
  assert.ok(arcs.find((a) => a.ward === "B").length > 340);
  assert.deepEqual(wardArcs([]).map((a) => a.total), [0, 0, 0, 0]);
});
