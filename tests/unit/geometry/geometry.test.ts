import { describe, expect, it } from "vitest";
import {
  analysePlan,
  closestOnSegment,
  formatPoints,
  objectDistance,
  parsePoints,
  planSchema,
  pointInPolygon,
  rectangle,
  segmentDistance,
  type PlanObject,
} from "@/lib/geometry";

const obj = (id: string, type: PlanObject["type"], points: [number, number][], closed = points.length >= 3): PlanObject => ({
  id,
  type,
  label: id,
  points,
  closed,
});

describe("primitives", () => {
  it("closest point on a segment", () => {
    expect(closestOnSegment([5, 5], [0, 0], [10, 0])).toEqual([5, 0]);
    expect(closestOnSegment([-3, 4], [0, 0], [10, 0])).toEqual([0, 0]);
    expect(closestOnSegment([1, 1], [2, 2], [2, 2])).toEqual([2, 2]);
  });

  it("segment distance: parallel, crossing, touching", () => {
    expect(segmentDistance([0, 0], [10, 0], [0, 3], [10, 3]).distance).toBe(3);
    expect(segmentDistance([0, 0], [10, 10], [0, 10], [10, 0]).distance).toBe(0);
    expect(segmentDistance([0, 0], [5, 0], [5, 0], [5, 5]).distance).toBe(0);
    expect(segmentDistance([0, 0], [0, 0], [3, 4], [3, 4]).distance).toBe(5);
  });

  it("point in polygon (edge counts as inside)", () => {
    const sq = rectangle(0, 0, 10, 10);
    expect(pointInPolygon([5, 5], sq)).toBe(true);
    expect(pointInPolygon([10, 5], sq)).toBe(true);
    expect(pointInPolygon([11, 5], sq)).toBe(false);
  });
});

describe("objectDistance (edge to edge)", () => {
  const tank = obj("tank", "tank", rectangle(0, 0, 3, 3));
  it("between rectangles is the gap, not centre distance", () => {
    const b = obj("b", "building", rectangle(10, 0, 5, 5));
    expect(objectDistance(tank, b).distance).toBe(7);
  });
  it("diagonal gap", () => {
    const b = obj("b", "building", rectangle(6, 7, 2, 2));
    expect(objectDistance(tank, b).distance).toBe(5);
  });
  it("is 0 when overlapping or contained", () => {
    expect(objectDistance(tank, obj("b", "building", rectangle(2, 2, 5, 5))).distance).toBe(0);
    expect(objectDistance(tank, obj("big", "building", rectangle(-10, -10, 30, 30))).distance).toBe(0);
    expect(objectDistance(obj("p", "ignition_source", [[1, 1]]), tank).distance).toBe(0);
  });
  it("outline-only measures to the edge of an enclosing area", () => {
    const boundary = obj("boundary", "site_boundary", rectangle(-20, -5, 100, 100));
    expect(objectDistance(tank, boundary, true).distance).toBe(5);
    expect(objectDistance(tank, boundary).distance).toBe(0);
  });
  it("point to polyline", () => {
    const road = obj("road", "public_road", [
      [0, 20],
      [50, 20],
    ], false);
    expect(objectDistance(tank, road).distance).toBe(17);
  });
});

describe("analysePlan", () => {
  const plan = {
    objects: [
      obj("t1", "tank", rectangle(0, 0, 3, 3)),
      obj("v1", "vaporizer", rectangle(5, 0, 2, 4)),
      obj("b1", "building", rectangle(20, 0, 10, 10)),
      obj("b2", "building", rectangle(-15, 0, 5, 5)),
      obj("r1", "public_road", [
        [-50, 30],
        [50, 30],
      ], false),
      obj("ct", "cooling_tower", rectangle(5, -12, 4, 4)),
      obj("site", "site_boundary", rectangle(-40, -40, 100, 65)),
    ],
  };

  it("derives minimum distances from the station (tank + vaporizer)", () => {
    const a = analysePlan(planSchema.parse(plan));
    const d = Object.fromEntries(a.distances.map((x) => [x.key, x]));
    expect(d.dist_buildings?.distance).toBe(10); // b2 right edge x=-10 to tank x=0
    expect(d.dist_buildings?.toLabel).toBe("b2");
    expect(d.dist_public_roads?.distance).toBe(26); // vaporizer top y=4 to road y=30
    expect(d.dist_boundary?.distance).toBe(21); // vaporizer top y=4 to boundary y=25
    expect(d.dist_vap_cooling_towers?.distance).toBe(8); // vaporizer bottom y=0 to tower top y=-8
    expect(d.dist_ignition_sources).toBeUndefined(); // not in the plan → not derived
    expect(d.dist_low_points).toBeUndefined();
    expect(a.outsideBoundary).toEqual([]);
  });

  it("a station outside the site boundary gives boundary distance 0", () => {
    const outside = { objects: [...plan.objects.filter((o) => o.id !== "site"), obj("site", "site_boundary", rectangle(-1, -1, 4, 4))] };
    const a = analysePlan(planSchema.parse(outside));
    expect(a.outsideBoundary).toEqual(["v1"]);
    expect(a.distances.find((x) => x.key === "dist_boundary")?.distance).toBe(0);
  });

  it("derives nothing without station objects", () => {
    expect(analysePlan({ objects: [obj("b", "building", rectangle(0, 0, 1, 1))] }).distances).toEqual([]);
  });
});

describe("validation and parsing", () => {
  it("validates plans", () => {
    expect(planSchema.safeParse({ objects: [obj("a", "tank", [[0, 0]], true)] }).success).toBe(false);
    expect(planSchema.safeParse({ objects: [obj("a", "site_boundary", [[0, 0], [1, 1]], false)] }).success).toBe(false);
    expect(planSchema.safeParse({ objects: [obj("a", "tank", [[0, 0]]), obj("a", "tank", [[1, 1]])] }).success).toBe(false);
    expect(planSchema.safeParse({ objects: [obj("a", "tank", [[1e9, 0]])] }).success).toBe(false);
  });
  it("parses and formats point lists", () => {
    expect(parsePoints("0,0; 10, 0 ; 10 5")).toEqual([
      [0, 0],
      [10, 0],
      [10, 5],
    ]);
    expect(parsePoints("")).toBeNull();
    expect(parsePoints("1,2,3")).toBeNull();
    expect(parsePoints("a,b")).toBeNull();
    expect(formatPoints([[1.5, 2]])).toBe("1.5, 2");
  });
});
