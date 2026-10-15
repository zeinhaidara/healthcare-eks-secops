// What the page says about a record, as plain data. Pure functions, no DOM, testable in Node.
// Anything missing reads "not recorded", never a blank and never a guessed value.
import { STATUSES, statusKey } from "./layout.js";

export const NOT_RECORDED = "not recorded";
export const PLACEHOLDER_NOTE = "Note: status is a placeholder in this dataset.";
export const STATUS_LABELS = { stable: "stable", watch: "watch", review: "review", unknown: NOT_RECORDED };

const present = (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
const show = (v, unit = "") => (present(v) ? `${v}${unit}` : NOT_RECORDED);
const list = (v) => (present(v) ? v.join(", ") : NOT_RECORDED);
// One-decimal fields: JSON turns 37.0 into 37, so put the decimal back for display.
const oneDecimal = (v, unit) => (present(v) && Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}${unit}` : NOT_RECORDED);

// Counts per status, and whether status carries any information in this data at all.
export function statusSummary(patients) {
  const counts = { stable: 0, watch: 0, review: 0, unknown: 0 };
  for (const p of patients) counts[statusKey(p)] += 1;
  const used = Object.keys(counts).filter((k) => counts[k] > 0);
  // Placeholder when every record shows the same status, or none has one. Computed, not a rule.
  const placeholder = patients.length > 0 && (used.length === 1 || counts.unknown === patients.length);
  return { counts, placeholder, note: placeholder ? PLACEHOLDER_NOTE : "" };
}

const COLOUR_NAMES = { stable: "green", watch: "amber", review: "red" };

// One line: what the hub is, what the branches are, what the colours mean.
export function legendText() {
  const colours = STATUSES.map((s) => `${COLOUR_NAMES[s]} ${s}`).join(", ");
  return (
    "Centre: the patient registry. Branches: one per synthetic patient, grouped by risk band " +
    `(illustrative labels, not clinical advice). Colours: ${colours}, grey status not recorded.`
  );
}

function bloodPressure(p) {
  return present(p.systolic_bp) && present(p.diastolic_bp) ? `${p.systolic_bp}/${p.diastolic_bp} mmHg` : NOT_RECORDED;
}

// The card: sections of label and value pairs for one patient.
export function cardSections(p) {
  const status = statusKey(p);
  return [
    {
      title: "Patient",
      rows: [
        ["ID", show(p.patient_id)],
        ["Name", show(p.name)],
        ["Age", show(p.age)],
        ["Born", show(p.date_of_birth)],
        ["Ward", show(p.ward)],
        ["Data", show(p.data_classification)],
      ],
    },
    {
      title: "Status",
      rows: [
        ["Status", STATUS_LABELS[status]],
        ["Risk band (illustrative)", show(p.risk_band)],
      ],
    },
    {
      title: "Body and vitals",
      rows: [
        ["Height", show(p.height_cm, " cm")],
        ["Weight", show(p.weight_kg, " kg")],
        ["Blood type", show(p.blood_type)],
        ["Blood pressure", bloodPressure(p)],
        ["Heart rate", show(p.heart_rate, " bpm")],
        ["Temperature", oneDecimal(p.temperature_c, " °C")],
      ],
    },
    {
      title: "Labs",
      rows: [
        ["HbA1c", oneDecimal(p.hba1c_percent, " %")],
        ["eGFR", show(p.egfr_ml_min, " mL/min/1.73 m²")],
      ],
    },
    {
      title: "Conditions and medicines",
      rows: [
        ["Conditions", present(p.conditions) ? p.conditions.join(", ") : show(p.condition)],
        ["Medications", list(p.medications)],
        ["Allergies", list(p.allergies)],
      ],
    },
    {
      title: "Care",
      rows: [
        ["Care team", list(p.care_team)],
        ["Admitted", show(p.admission_date)],
        ["Last visit", show(p.last_visit)],
        ["Next visit", show(p.next_visit)],
        ["Note", show(p.note)],
      ],
    },
  ];
}

// ---------- Graphics for the card. Pure data, so they can be tested without a browser. ----------
// A fraction is where a value sits on the model's allowed range (app/src/models.py), clamped to 0..1.
// These describe the synthetic value only. They are not targets, scores or clinical advice.
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const fractionOf = (v, lo, hi) => (present(v) && Number.isFinite(Number(v)) ? clamp01((Number(v) - lo) / (hi - lo)) : null);

// Ring gauges for the vitals: the label, the same text the card shows, and the ring fill.
export function vitalGauges(p) {
  const rows = Object.fromEntries(cardSections(p).flatMap((s) => s.rows));
  return [
    { label: "Blood pressure", text: rows["Blood pressure"], fraction: present(p.diastolic_bp) ? fractionOf(p.systolic_bp, 70, 220) : null },
    { label: "Heart rate", text: rows["Heart rate"], fraction: fractionOf(p.heart_rate, 30, 200) },
    { label: "Temperature", text: rows.Temperature, fraction: fractionOf(p.temperature_c, 34, 42) },
  ];
}

// Range bars for the labs: the value's position on the model range and an illustrative reference band.
export const LAB_RANGES = {
  HbA1c: { field: "hba1c_percent", lo: 4, hi: 15, band: [4, 5.6] },
  eGFR: { field: "egfr_ml_min", lo: 5, hi: 150, band: [90, 150] },
};
export function labBars(p) {
  const rows = Object.fromEntries(cardSections(p).flatMap((s) => s.rows));
  return Object.entries(LAB_RANGES).map(([label, r]) => ({
    label,
    text: rows[label],
    position: fractionOf(p[r.field], r.lo, r.hi),
    band: [(r.band[0] - r.lo) / (r.hi - r.lo), (r.band[1] - r.lo) / (r.hi - r.lo)],
  }));
}

// Initials for a care-team role, e.g. "primary care" -> "PC", "cardiology" -> "CA".
export function initials(role) {
  const words = String(role || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
