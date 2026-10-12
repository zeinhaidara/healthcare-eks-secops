// The card, legend and status summary logic (view-model.js): pure functions, no DOM.
import assert from "node:assert/strict";
import test from "node:test";

import { NOT_RECORDED, PLACEHOLDER_NOTE, cardSections, legendText, statusSummary } from "../../static/view-model.js";
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

test("the legend line names the hub, the branches, every colour and that bands are illustrative", () => {
  const line = legendText();
  for (const part of ["registry", "Branches", "risk band", "illustrative", "green stable", "amber watch", "red review", "grey status not recorded"]) {
    assert.ok(line.includes(part), part);
  }
  assert.ok(!line.includes("\n"), "one line");
});

test("one-decimal fields keep their decimal even when JSON drops it", () => {
  const rows = rowsOf({ ...V1, temperature_c: 37, hba1c_percent: 5 });
  assert.equal(rows.Temperature, "37.0 °C");
  assert.equal(rows.HbA1c, "5.0 %");
  assert.equal(rowsOf({ ...V1, temperature_c: 36.8 }).Temperature, "36.8 °C");
});
