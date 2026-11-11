import { z } from "zod";

/**
 * Simple plan geometry (SPEC §12 phase 6): objects of the plot plan in a local
 * site coordinate system [m]. Distances are edge-to-edge (minimum distance
 * between outlines), not centre-to-centre. Pure module.
 */

export type Point = readonly [number, number];

export const OBJECT_TYPES = [
  "tank",
  "vaporizer",
  "building",
  "public_road",
  "site_boundary",
  "ignition_source",
  "low_point",
  "cooling_tower",
  "other",
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

const MAX_COORD = 100_000;
const coord = z.number().finite().min(-MAX_COORD).max(MAX_COORD);

export const planObjectSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(OBJECT_TYPES),
    label: z.string().trim().min(1).max(80),
    /** 1 point = point object, 2+ = polyline, closed = polygon (≥ 3 points). */
    points: z.array(z.tuple([coord, coord])).min(1).max(200),
    closed: z.boolean(),
  })
  .refine((o) => !o.closed || o.points.length >= 3, { message: "closed shape needs at least 3 points" })
  .refine((o) => o.type !== "site_boundary" || (o.closed && o.points.length >= 3), {
    message: "site boundary must be a closed polygon",
  });
export type PlanObject = z.infer<typeof planObjectSchema>;

export const planSchema = z.object({ objects: z.array(planObjectSchema).max(200) }).refine(
  (p) => new Set(p.objects.map((o) => o.id)).size === p.objects.length,
  { message: "duplicate object id" },
);
export type Plan = z.infer<typeof planSchema>;

// ------------------------------------------------------------------ primitives

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Closest point on segment ab to p. */
export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return [a[0] + t * ab[0], a[1] + t * ab[1]];
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: Point, q: Point, r: Point, v: number) =>
    v === 0 && Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  return on(a, b, c, d1) || on(a, b, d, d2) || on(c, d, a, d3) || on(c, d, b, d4);
}

export interface Closest {
  distance: number;
  from: Point;
  to: Point;
}

/** Minimum distance between two segments with the closest pair of points. */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): Closest {
  if (segmentsIntersect(a, b, c, d)) {
    // any intersection point will do for display; use the closest endpoint projection
    const p = closestOnSegment(a, c, d);
    return { distance: 0, from: p, to: p };
  }
  const candidates: Closest[] = [
    { from: a, to: closestOnSegment(a, c, d), distance: 0 },
    { from: b, to: closestOnSegment(b, c, d), distance: 0 },
    { from: closestOnSegment(c, a, b), to: c, distance: 0 },
    { from: closestOnSegment(d, a, b), to: d, distance: 0 },
  ].map((x) => ({ ...x, distance: dist(x.from, x.to) }));
  return candidates.reduce((m, x) => (x.distance < m.distance ? x : m));
}

/** Ray casting; points on the edge count as inside. */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (dist(closestOnSegment(p, a, b), p) === 0) return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function edges(o: Pick<PlanObject, "points" | "closed">): [Point, Point][] {
  const pts = o.points as Point[];
  if (pts.length === 1) return [[pts[0]!, pts[0]!]];
  const out: [Point, Point][] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push([pts[i]!, pts[i + 1]!]);
  if (o.closed) out.push([pts[pts.length - 1]!, pts[0]!]);
  return out;
}

/**
 * Edge-to-edge distance between two objects. Areas (closed shapes) count as
 * filled: an object inside or overlapping another area has distance 0.
 * `outlineOnly` treats b as its outline (used for the site boundary, which
 * the station is expected to be inside).
 */
export function objectDistance(a: PlanObject, b: PlanObject, outlineOnly = false): Closest {
  let best: Closest = { distance: Number.POSITIVE_INFINITY, from: a.points[0] as Point, to: b.points[0] as Point };
  for (const [p, q] of edges(a)) {
    for (const [r, s] of edges(b)) {
      const c = segmentDistance(p, q, r, s);
      if (c.distance < best.distance) best = c;
    }
  }
  if (best.distance > 0) {
    const inside = (x: PlanObject, y: PlanObject) => y.closed && x.points.some((p) => pointInPolygon(p as Point, y.points as Point[]));
    if ((!outlineOnly && inside(a, b)) || inside(b, a)) {
      const p = a.points[0] as Point;
      best = { distance: 0, from: p, to: p };
    }
  }
  return best;
}

// ------------------------------------------------------------------ layout distances

/** Layout geometry inputs that can be derived from the plan (question names of the layout form). */
export const DERIVED_DISTANCES = {
  dist_buildings: { from: ["tank", "vaporizer"], to: "building" },
  dist_public_roads: { from: ["tank", "vaporizer"], to: "public_road" },
  dist_boundary: { from: ["tank", "vaporizer"], to: "site_boundary" },
  dist_ignition_sources: { from: ["tank", "vaporizer"], to: "ignition_source" },
  dist_low_points: { from: ["tank", "vaporizer"], to: "low_point" },
  dist_vap_cooling_towers: { from: ["vaporizer"], to: "cooling_tower" },
} as const satisfies Record<string, { from: readonly ObjectType[]; to: ObjectType }>;
export type DerivedKey = keyof typeof DERIVED_DISTANCES;

export interface DerivedDistance {
  key: DerivedKey;
  /** Metres. */
  distance: number;
  fromLabel: string;
  toLabel: string;
  from: Point;
  to: Point;
}

export interface PlanAnalysis {
  distances: DerivedDistance[];
  /** Station objects (tank / vaporizer) that lie outside the site boundary. */
  outsideBoundary: string[];
}

/**
 * Derive the minimum edge-to-edge distances. A distance is produced only when
 * both the station objects and at least one target object exist in the plan:
 * an object missing from the plan does not mean it is missing on site.
 */
export function analysePlan(plan: Plan): PlanAnalysis {
  const distances: DerivedDistance[] = [];
  const outsideBoundary: string[] = [];
  const boundaries = plan.objects.filter((o) => o.type === "site_boundary");
  for (const s of plan.objects.filter((o) => o.type === "tank" || o.type === "vaporizer")) {
    if (boundaries.length && !boundaries.some((b) => s.points.every((p) => pointInPolygon(p as Point, b.points as Point[])))) {
      outsideBoundary.push(s.label);
    }
  }
  for (const [key, spec] of Object.entries(DERIVED_DISTANCES) as [DerivedKey, (typeof DERIVED_DISTANCES)[DerivedKey]][]) {
    const sources = plan.objects.filter((o) => (spec.from as readonly ObjectType[]).includes(o.type));
    const targets = plan.objects.filter((o) => o.type === spec.to);
    if (!sources.length || !targets.length) continue;
    let best: DerivedDistance | null = null;
    for (const s of sources) {
      for (const t of targets) {
        const c = objectDistance(s, t, spec.to === "site_boundary");
        if (!best || c.distance < best.distance) {
          best = { key, distance: c.distance, fromLabel: s.label, toLabel: t.label, from: c.from, to: c.to };
        }
      }
    }
    // A station object outside the site boundary is treated as distance 0 (conservative).
    if (key === "dist_boundary" && outsideBoundary.length && best) best = { ...best, distance: 0 };
    if (best) distances.push(best);
  }
  return { distances, outsideBoundary };
}

/** Parse "x,y; x,y; …" (decimal comma or dot inside numbers is not allowed – use dots). */
export function parsePoints(text: string): [number, number][] | null {
  const parts = text.split(";").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const pts: [number, number][] = [];
  for (const p of parts) {
    const xy = p.split(/[,\s]+/).filter(Boolean).map(Number);
    if (xy.length !== 2 || !xy.every((n) => Number.isFinite(n) && Math.abs(n) <= MAX_COORD)) return null;
    pts.push([xy[0]!, xy[1]!]);
  }
  return pts;
}

export function formatPoints(points: readonly Point[] | readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${x}, ${y}`).join("; ");
}

/** Axis-aligned rectangle helper (x, y = lower-left corner). */
export function rectangle(x: number, y: number, w: number, h: number): [number, number][] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}
