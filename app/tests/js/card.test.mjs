// The card, legend and status summary logic (view-model.js): pure functions, no DOM.
import assert from "node:assert/strict";
import test from "node:test";

import { NO_WARD, RISK_ORDER, layoutTree, statusKey, wardOf } from "../../static/layout.js";
import { NOT_RECORDED, PLACEHOLDER_NOTE, arcCard, cardSections, initials, labBars, legendText, nodeCard, statusSummary, visiblePatients, vitalGauges } from "../../static/view-model.js";
import { SEED } from "./dom_shim.mjs";

const rowsOf = (p) => Object.fromEntries(cardSections(p).flatMap((s) => s.rows));
const V1 = { patient_id: "P001", name: "Test Person", age: 40, condition: "Asthma", date_of_birth: "1986-01-01", admission_date: "2026-03-01" };

test("the card shows every field of a full record, with units", () => {
  const full = SEED.find((p) => "hba1c_percent" in p && "egfr_ml_min" in p && p.allergies.length > 0);
  assert.ok(full, "the seed has at least one record with every optional field");
  const rows = rowsOf(full);
  assert.equal(rows["Blood pressure"], `${full.systolic_bp}/${full.diastolic_bp} mmHg`);
  assert.equal(rows["Heart rate"], `${full.heart_rate} bpm`);
  assert.equal(rows.Temperature, `${full.temperature_c.toFixed(1)} °C`);
  assert.equal(rows.HbA1c, `${full.hba1c_percent.toFixed(1)} %`);
  assert.match(rows.eGFR, /mL\/min/);
  assert.equal(rows.Medications, full.medications.length ? full.medications.join(", ") : NOT_RECORDED);
  assert.equal(rows.Allergies, full.allergies.join(", "));
  assert.equal(rows["Care team"], full.care_team.join(", "));
  assert.equal(rows["Next visit"], full.next_visit);
  assert.equal(rows.Note, full.note);
  assert.equal(rows.Data, "synthetic");
});

test("every label in every card has a value: missing reads 'not recorded', never blank", () => {
  for (const p of [...SEED, V1, {}]) {
    for (const [label, value] of Object.entries(rowsOf(p))) {
      assert.equal(typeof value, "string", label);
      assert.ok(value.trim().length > 0, `${label} is blank`);
      assert.ok(!/undefined|null|NaN/.test(value), `${label}: ${value}`);
    }
  }
});

test("a v1 record: new fields and status read 'not recorded', never 'watch'", () => {
  const rows = rowsOf(V1);
  for (const label of ["Status", "Blood pressure", "Heart rate", "HbA1c", "eGFR", "Medications", "Allergies", "Care team", "Last visit", "Note"]) {
    assert.equal(rows[label], NOT_RECORDED, label);
  }
  assert.equal(rows.Conditions, "Asthma", "falls back to the single v1 condition");
  assert.ok(!Object.values(rows).includes("watch"));
});

test("blood pressure needs both values; empty lists read 'not recorded'", () => {
  assert.equal(rowsOf({ ...V1, systolic_bp: 120 })["Blood pressure"], NOT_RECORDED);
  assert.equal(rowsOf({ ...V1, allergies: [] }).Allergies, NOT_RECORDED);
});

test("status summary: the seed's mix is real; one status or none is a placeholder", () => {
  const seed = statusSummary(SEED);
  assert.equal(seed.placeholder, false);
  assert.equal(seed.counts.stable + seed.counts.watch + seed.counts.review, SEED.length);
  assert.equal(seed.counts.unknown, 0);

  const none = statusSummary(SEED.map(({ status, ...rest }) => rest));
  assert.equal(none.placeholder, true);
  assert.equal(none.counts.unknown, SEED.length);
  assert.equal(none.counts.watch, 0, "missing status is not counted as watch");
  assert.equal(none.note, PLACEHOLDER_NOTE);

  assert.equal(statusSummary(SEED.map((p) => ({ ...p, status: "watch" }))).placeholder, true);
  assert.equal(statusSummary([]).placeholder, false, "an empty list says nothing");
});

test("the legend line describes the arcs and the branches, every colour, and that it is illustrative", () => {
  const line = legendText();
  for (const part of ["registry", "four arcs", "Arc length", "share of patients", "green to red", "review patients", "Click an arc", "Branches", "Dot size", "Illustrative", "green stable", "amber watch", "red review", "grey status not recorded"]) {
    assert.ok(line.includes(part), part);
  }
  assert.ok(!line.includes("\n"), "one line");
});

test("the arc card gives the ward, the total and the Stable, Watch and Review counts", () => {
  const arcs = layoutTree(SEED).arcs;
  for (const arc of arcs) {
    const card = arcCard(arc);
    assert.equal(card.title, `Ward ${arc.ward}`);
    assert.ok(card.detail.startsWith(`${arc.total} patients`));
    assert.ok(card.detail.includes(`Stable ${arc.stable}`) && card.detail.includes(`Watch ${arc.watch}`) && card.detail.includes(`Review ${arc.review}`));
    assert.ok(!card.detail.includes("Not recorded"), "only shown when some status is missing");
  }
  const odd = arcCard({ text: "Ward A", total: 1, stable: 0, watch: 0, review: 0, unknown: 1 });
  assert.equal(odd.detail, "1 patient · Stable 0 · Watch 0 · Review 0 · Not recorded 1");
});

test("the list filter: statuses, one ward, search, sorted by risk", () => {
  const all = new Set(["stable", "watch", "review", "unknown"]);
  assert.equal(visiblePatients(SEED, all).length, SEED.length);
  assert.equal(visiblePatients(SEED, all, "", "B").length, SEED.filter((p) => wardOf(p) === "B").length);
  assert.ok(visiblePatients(SEED, all, "", "B").every((p) => wardOf(p) === "B"));
  assert.equal(visiblePatients(SEED, new Set(["review"]), "", "B").length, SEED.filter((p) => wardOf(p) === "B" && p.status === "review").length);
  assert.equal(visiblePatients(SEED.map((p) => ({ ...p, ward: null })), all, "", NO_WARD).length, SEED.length, "no ward is its own filter");
  assert.deepEqual(visiblePatients(SEED, all, SEED[2].patient_id.toLowerCase()).map((p) => p.patient_id), [SEED[2].patient_id]);
  const order = visiblePatients(SEED, all).map((p) => RISK_ORDER[statusKey(p)]);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("one-decimal fields keep their decimal even when JSON drops it", () => {
  const rows = rowsOf({ ...V1, temperature_c: 37, hba1c_percent: 5 });
  assert.equal(rows.Temperature, "37.0 °C");
  assert.equal(rows.HbA1c, "5.0 %");
  assert.equal(rowsOf({ ...V1, temperature_c: 36.8 }).Temperature, "36.8 °C");
});

test("vital gauges reuse the card text and place each value on the model range, or show none", () => {
  const full = SEED.find((p) => "temperature_c" in p);
  const rows = rowsOf(full);
  const g = Object.fromEntries(vitalGauges(full).map((x) => [x.label, x]));
  assert.deepEqual(Object.keys(g), ["Blood pressure", "Heart rate", "Temperature"]);
  assert.equal(g["Blood pressure"].text, rows["Blood pressure"]);
  assert.equal(g.Temperature.text, rows.Temperature);
  for (const x of Object.values(g)) assert.ok(x.fraction >= 0 && x.fraction <= 1, x.label);
  assert.equal(vitalGauges({ heart_rate: 200 })[1].fraction, 1, "top of the model range is a full ring");
  for (const x of vitalGauges(V1)) {
    assert.equal(x.fraction, null, `${x.label}: no value, no ring`);
    assert.equal(x.text, NOT_RECORDED);
  }
});

test("lab bars: a marker only when there is a value, and a fixed illustrative band", () => {
  const bars = Object.fromEntries(labBars({ ...V1, hba1c_percent: 4, egfr_ml_min: 150 }).map((b) => [b.label, b]));
  assert.equal(bars.HbA1c.position, 0);
  assert.equal(bars.eGFR.position, 1);
  for (const b of Object.values(bars)) assert.ok(b.band[0] >= 0 && b.band[1] <= 1 && b.band[0] < b.band[1], b.label);
  for (const b of labBars(V1)) {
    assert.equal(b.position, null);
    assert.equal(b.text, NOT_RECORDED);
  }
});

test("care-team initials", () => {
  assert.equal(initials("primary care"), "PC");
  assert.equal(initials("cardiology"), "CA");
  assert.equal(initials("sleep medicine"), "SM");
  assert.equal(initials(""), "?");
});

test("the node card gives the ID, name, ward, age and risk", () => {
  const p = SEED[0];
  const card = nodeCard(p);
  assert.equal(card.title, `${p.patient_id} ${p.name}`);
  assert.equal(card.detail, `Ward ${wardOf(p)} · age ${p.age} · risk: ${p.status}`);
  assert.equal(nodeCard(V1).detail, "Ward not recorded · age 40 · risk: not recorded");
});
