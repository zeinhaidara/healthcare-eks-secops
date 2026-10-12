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
