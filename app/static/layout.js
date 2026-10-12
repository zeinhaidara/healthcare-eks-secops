// Skill-tree layout. Pure functions, no DOM and no three.js, so it can be tested directly.
// One node per patient. Patients sit on rings inside one sector per risk band. Selecting a
// patient adds its attributes as branch nodes. Risk bands are illustrative labels, not clinical.

export const BANDS = ["low", "moderate", "elevated", "high"];
export const STATUS_COLORS = { stable: "#3ccf91", watch: "#f2b84b", review: "#ef6b6b" };

const SECTOR_CENTER = { low: 45, moderate: 135, elevated: 225, high: 315 }; // degrees
const SECTOR_WIDTH = 78;
const SLOTS_PER_RING = 6;
const FIRST_RING = 8;
const RING_STEP = 2.7;
const HUB_RADIUS = 4;
const BRANCH_RADIUS = 4.2;
const DIM_RADIUS = 7.5; // patient labels this close to an open patient are hidden so branches stay readable

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (r, deg) => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });

export function branchesFor(p) {
  const out = [];
  if (p.age != null) out.push({ key: "age", text: `Age ${p.age}` });
  if (p.height_cm != null && p.weight_kg != null) {
    out.push({ key: "body", text: `${p.height_cm} cm, ${p.weight_kg} kg` });
  }
  if (p.blood_type) out.push({ key: "blood", text: `Blood ${p.blood_type}` });
  if (p.ward) out.push({ key: "ward", text: p.ward });
  if (p.admission_date) out.push({ key: "adm", text: `Admitted ${p.admission_date}` });
  (p.conditions && p.conditions.length ? p.conditions : [p.condition]).forEach((c, i) => {
    if (c) out.push({ key: `c${i}`, text: c });
  });
  return out;
}

export function layoutTree(patients, expandedId = null) {
  const nodes = [{ id: "root", type: "root", x: 0, y: 0, label: "Registry" }];
  const edges = [];
  const byBand = Object.fromEntries(BANDS.map((b) => [b, []]));
  for (const p of [...patients].sort((a, b) => a.patient_id.localeCompare(b.patient_id))) {
    // A record without a band (older table) goes in the middle sector, shown as "unrated".
    (byBand[p.risk_band] || byBand.moderate).push(p);
  }

  for (const band of BANDS) {
    const center = SECTOR_CENTER[band];
    const hub = polar(HUB_RADIUS, center);
    nodes.push({ id: `band:${band}`, type: "band", band, ...hub, label: band });
    edges.push({ from: "root", to: `band:${band}` });

    byBand[band].forEach((p, i) => {
      const ring = Math.floor(i / SLOTS_PER_RING);
      const slot = i % SLOTS_PER_RING;
      const inRing = Math.min(SLOTS_PER_RING, byBand[band].length - ring * SLOTS_PER_RING);
      // Spread this ring's patients evenly across the sector; stagger alternate rings.
      const t = (slot + 1 + (ring % 2 ? 0.5 : 0)) / (inRing + 1 + (ring % 2 ? 0.5 : 0));
      const angle = center - SECTOR_WIDTH / 2 + SECTOR_WIDTH * t;
      const pos = polar(FIRST_RING + ring * RING_STEP, angle);
      nodes.push({
        id: p.patient_id,
        type: "patient",
        band,
        status: p.status || "watch",
        ...pos,
        label: p.patient_id,
      });
      edges.push({ from: `band:${band}`, to: p.patient_id });
    });
  }

  if (expandedId) {
    const owner = nodes.find((n) => n.id === expandedId);
    const record = patients.find((p) => p.patient_id === expandedId);
    if (owner && record) {
      const items = branchesFor(record);
      const base = (Math.atan2(owner.y, owner.x) * 180) / Math.PI;
      const span = Math.min(150, 24 * Math.max(items.length - 1, 1));
      for (const n of nodes) {
        if (n.type === "patient" && n.id !== expandedId && Math.hypot(n.x - owner.x, n.y - owner.y) < DIM_RADIUS) {
          n.dim = true;
        }
      }
      items.forEach((item, i) => {
        const angle = items.length === 1 ? base : base - span / 2 + (span * i) / (items.length - 1);
        const pos = polar(BRANCH_RADIUS, angle);
        const id = `${expandedId}:${item.key}`;
        nodes.push({
          id,
          type: "branch",
          band: owner.band,
          status: owner.status,
          x: owner.x + pos.x,
          y: owner.y + pos.y,
          side: pos.x >= 0 ? 1 : -1, // the label sits on this side of its node
          label: item.text,
        });
        edges.push({ from: expandedId, to: id });
      });
    }
  }
  return { nodes, edges };
}
