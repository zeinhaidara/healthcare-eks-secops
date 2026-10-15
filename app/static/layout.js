// Skill-tree layout. Pure functions, no DOM and no three.js, so it can be tested directly.
// One registry hub in the centre and one node per patient, each joined to the hub by a branch.
// Patients sit on rings inside one sector per risk band. Risk bands are illustrative labels.

export const BANDS = ["low", "moderate", "elevated", "high"];
export const STATUSES = ["stable", "watch", "review"];
// "unknown" is a missing status. It is never shown as one of the real statuses.
export const STATUS_COLORS = { stable: "#19c3a6", watch: "#f2b84b", review: "#f2627f", unknown: "#8797a4" };

const SECTOR_CENTER = { low: 45, moderate: 135, elevated: 225, high: 315 }; // degrees
const SECTOR_WIDTH = 78;
const SLOTS_PER_RING = 6;
const FIRST_RING = 9.6;
const RING_STEP = 2.9;
// Slight, deterministic jitter so the rings look organic. It is small enough that a patient never
// leaves its risk-band sector and two patients never touch (see layout.test.mjs).
const ANGLE_JITTER = 1.0; // degrees
const RADIUS_JITTER = 0.25;

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (r, deg) => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });

// A stable number in [0, 1) from a string and a salt. Used for jitter, curve bend and depth.
export function unit(text, salt = "") {
  let h = 2166136261;
  for (const ch of `${salt}:${text}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export const statusKey = (p) => (STATUSES.includes(p && p.status) ? p.status : "unknown");
export const sectorOf = (p) => (BANDS.includes(p && p.risk_band) ? p.risk_band : "moderate");

export function layoutTree(patients) {
  const nodes = [{ id: "root", type: "root", x: 0, y: 0, label: "Registry" }];
  const edges = [];
  const bySector = Object.fromEntries(BANDS.map((b) => [b, []]));
  for (const p of [...patients].sort((a, b) => a.patient_id.localeCompare(b.patient_id))) {
    bySector[sectorOf(p)].push(p);
  }
  for (const band of BANDS) {
    const center = SECTOR_CENTER[band];
    const group = bySector[band];
    group.forEach((p, i) => {
      const ring = Math.floor(i / SLOTS_PER_RING);
      const slot = i % SLOTS_PER_RING;
      const inRing = Math.min(SLOTS_PER_RING, group.length - ring * SLOTS_PER_RING);
      // Spread this ring's patients evenly across the sector; stagger alternate rings.
      const offset = ring % 2 ? 0.5 : 0;
      const t = (slot + 1 + offset) / (inRing + 1 + offset);
      const angle = center - SECTOR_WIDTH / 2 + SECTOR_WIDTH * t + (unit(p.patient_id, "a") - 0.5) * 2 * ANGLE_JITTER;
      const pos = polar(FIRST_RING + ring * RING_STEP + (unit(p.patient_id, "r") - 0.5) * 2 * RADIUS_JITTER, angle);
      nodes.push({
        id: p.patient_id,
        type: "patient",
        band: p.risk_band || null,
        sector: band,
        status: statusKey(p),
        depth: unit(p.patient_id, "z"), // 0 far, 1 near: only used for halo size and brightness
        ...pos,
        label: p.name ? `${p.patient_id} ${p.name}` : p.patient_id,
      });
      edges.push({ from: "root", to: p.patient_id });
    });
  }
  return { nodes, edges };
}
