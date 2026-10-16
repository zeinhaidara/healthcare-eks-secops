// Network layout. Pure functions, no DOM and no three.js, so it can be tested directly.
// Position carries meaning:
//   angle    = ward (A to D, one wedge each; a fifth wedge only if some patient has no ward recorded)
//   distance = status ring from the hub: review closest, then watch, then stable (not recorded outermost)
//   order    = within a wedge and ring, by patient ID
//   size     = age band (a small range, so every dot stays readable)
// The centre is a ward-risk summary: one arc per ward, its length the ward's share of all patients and its
// colour the share of that ward's patients in review (wardArcs below).
// Deterministic: no Math.random, and the input order does not matter. The only "noise" is a tiny radial
// offset hashed from the patient ID, so the same data always gives the same picture.

export const STATUSES = ["stable", "watch", "review"];
// "unknown" is a missing status. It is never shown as one of the real statuses.
export const STATUS_COLORS = { stable: "#19c3a6", watch: "#f2b84b", review: "#f2627f", unknown: "#8797a4" };
export const WARDS = ["A", "B", "C", "D"];
export const NO_WARD = "none";
// Distance from the hub, in world units: the riskier, the closer.
export const RING_RADIUS = { review: 9, watch: 12.5, stable: 16, unknown: 19.5 };
export const RISK_ORDER = { review: 0, watch: 1, stable: 2, unknown: 3 };

const WEDGE_MARGIN = 6; // degrees kept clear on each side of a wedge, so wards read as separate
const MIN_SPACING = 1.9; // world units between neighbours on one ring
const SUBRING_STEP = 1.7; // a crowded cell wraps onto further rings outward by this much
const RADIUS_JITTER = 0.15;
const LABEL_GAP = 3.4;

export const AGE_BANDS = [
  { below: 30, label: "under 30", size: 0.9 },
  { below: 50, label: "30 to 49", size: 1.0 },
  { below: 70, label: "50 to 69", size: 1.1 },
  { below: Infinity, label: "70 and over", size: 1.2 },
];
export const ageBand = (age) => (age === null || age === undefined || age === "" || !Number.isFinite(Number(age)) ? null : AGE_BANDS.find((b) => Number(age) < b.below));

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (r, deg) => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });

// A stable number in [0, 1) from a string and a salt. Used for the tiny radial offset, curve bend and depth.
export function unit(text, salt = "") {
  let h = 2166136261;
  for (const ch of `${salt}:${text}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export const statusKey = (p) => (STATUSES.includes(p && p.status) ? p.status : "unknown");
// "Ward C" -> "C". A missing or unrecognised ward is null.
export const wardOf = (p) => {
  const m = /^ward\s+([a-d])$/i.exec(String((p && p.ward) || "").trim());
  return m ? m[1].toUpperCase() : null;
};

// ---------- The centre: one arc per ward ----------
export const ARC_TICK = 2; // degrees: the mark the scene draws for a ward with no patients (its sweep stays 0)
export const REVIEW_FULL = 0.5; // half a ward in review reads as fully red

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("")}`;
};
// Green when no patient is in review, through amber to red when REVIEW_FULL or more are. The chip palette.
export function arcColor(reviewShare) {
  const t = Math.min(1, Math.max(0, reviewShare / REVIEW_FULL));
  return t < 0.5 ? mix(STATUS_COLORS.stable, STATUS_COLORS.watch, t * 2) : mix(STATUS_COLORS.watch, STATUS_COLORS.review, (t - 0.5) * 2);
}

// One arc per ward, running counterclockwise from the east: A first. The sweep is exactly count / total x 360
// degrees and the arcs meet end to end; the scene draws the thin gaps between them as separators on top.
// Pure data, the scene only draws it.
export function wardArcs(patients, wedgeNames = WARDS) {
  const total = patients.length;
  const rows = wedgeNames.map((ward) => ({ ward, text: ward === NO_WARD ? "No ward" : `Ward ${ward}`, total: 0, stable: 0, watch: 0, review: 0, unknown: 0 }));
  for (const p of patients) rows[wedgeNames.indexOf(wardOf(p) || NO_WARD)][statusKey(p)] += 1;
  let at = 0;
  return rows.map((r) => {
    r.total = r.stable + r.watch + r.review + r.unknown;
    r.share = total ? r.total / total : 0;
    r.reviewShare = r.total ? r.review / r.total : 0;
    const length = r.share * 360;
    const start = at;
    at += length;
    return { ...r, start, length, mid: start + length / 2, color: arcColor(r.reviewShare) };
  });
}

export function layoutTree(patients) {
  const nodes = [{ id: "root", type: "root", x: 0, y: 0, label: "Registry" }];
  const edges = [];
  const sorted = [...patients].sort((a, b) => a.patient_id.localeCompare(b.patient_id));
  const wedgeNames = sorted.some((p) => !wardOf(p)) ? [...WARDS, NO_WARD] : WARDS;
  const span = 360 / wedgeNames.length;
  const centerOf = (i) => 90 - span / 2 + span * i; // A starts at 45 degrees and the wards run counterclockwise
  const usable = span - 2 * WEDGE_MARGIN;

  // Group into cells: one per ward and status. Each cell is already in patient-ID order.
  const cells = new Map();
  for (const p of sorted) {
    const wedge = wedgeNames.indexOf(wardOf(p) || NO_WARD);
    const key = `${wedge}|${statusKey(p)}`;
    if (!cells.has(key)) cells.set(key, { wedge, status: statusKey(p), members: [] });
    cells.get(key).members.push(p);
  }

  for (const cell of cells.values()) {
    const base = RING_RADIUS[cell.status];
    const perRing = Math.max(1, Math.floor((base * rad(usable)) / MIN_SPACING));
    cell.members.forEach((p, i) => {
      const ring = Math.floor(i / perRing);
      const slot = i % perRing;
      const inRing = Math.min(perRing, cell.members.length - ring * perRing);
      const offset = ring % 2 ? 0.5 : 0; // stagger alternate rings
      const t = (slot + 1 + offset) / (inRing + 1 + offset);
      const angle = centerOf(cell.wedge) - usable / 2 + usable * t;
      const radius = base + ring * SUBRING_STEP + (unit(p.patient_id, "r") - 0.5) * 2 * RADIUS_JITTER;
      const band = ageBand(p.age);
      nodes.push({
        id: p.patient_id,
        type: "patient",
        ward: wardOf(p),
        wedge: cell.wedge,
        status: cell.status,
        band: p.risk_band || null,
        age: p.age ?? null,
        ageBand: band ? band.label : null,
        size: band ? band.size : 1,
        depth: unit(p.patient_id, "z"), // 0 far, 1 near: only used for halo size and brightness
        ...polar(radius, angle),
        label: p.name ? `${p.patient_id} ${p.name}` : p.patient_id,
      });
      edges.push({ from: "root", to: p.patient_id });
    });
  }

  // What the scene draws behind the dots: one faint ring per status that is present, the wedge
  // borders, and a label per ward.
  const present = new Set(sorted.map(statusKey));
  const rings = Object.keys(RING_RADIUS).filter((s) => present.has(s)).map((s) => ({ status: s, radius: RING_RADIUS[s] }));
  const outer = Math.max(...rings.map((r) => r.radius), RING_RADIUS.stable);
  const guides = {
    rings,
    outer,
    borders: wedgeNames.map((_, i) => centerOf(i) - span / 2),
    labels: wedgeNames.map((name, i) => ({ ward: name, text: name === NO_WARD ? "NO WARD" : `WARD ${name}`, ...polar(outer + LABEL_GAP, centerOf(i)) })),
  };
  return { nodes, edges, guides, arcs: wardArcs(sorted, wedgeNames) };
}
