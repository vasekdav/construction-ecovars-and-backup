import { describe, expect, it } from "vitest";
import {
  BASE_UNIT,
  convert,
  DIMENSIONS,
  dimensionOf,
  formatNumber,
  fromSI,
  isPhysicallyValid,
  isUnit,
  quantity,
  toSI,
  UnitError,
  unitLabel,
  UNITS,
  unitsFor,
  type UnitId,
} from "@/lib/units";

describe("units", () => {
  it("every dimension has a base unit with factor 1 and no offset", () => {
    for (const d of DIMENSIONS) {
      const base = UNITS[BASE_UNIT[d]];
      expect(base.dimension).toBe(d);
      expect(base.factor).toBe(1);
      expect("offset" in base).toBe(false);
      expect(unitsFor(d)).toContain(BASE_UNIT[d]);
    }
  });

  it("round-trips every unit through SI", () => {
    for (const u of Object.keys(UNITS) as UnitId[]) {
      for (const v of [-40, 0, 1, 12.5, 1234.5678]) {
        expect(fromSI(toSI(v, u), u)).toBeCloseTo(v, 9);
      }
    }
  });

  it.each([
    [3600, "Nm3/h", 1],
    [60, "Nm3/min", 1],
    [1, "bar(g)", 100_000],
    [250, "kPa(a)", 250_000],
    [1.6, "MPa(g)", 1_600_000],
    [1, "psig", 6894.757293168361],
    [0, "°C", 273.15],
    [-40, "°F", 233.15],
    [32, "°F", 273.15],
    [2500, "mm", 2.5],
    [12, "cm", 0.12],
    [1.2, "km", 1200],
    [0.5, "ha", 5000],
    [20_000, "l", 20],
    [2, "h", 7200],
    [3, "min", 180],
    [1, "d", 86400],
    [40, "t", 40_000],
    [99.5, "%", 0.995],
  ] as [number, UnitId, number][])("%s %s = %s SI", (value, unit, expected) => {
    expect(toSI(value, unit)).toBeCloseTo(expected, 9);
  });

  it("converts within a dimension", () => {
    expect(convert(1, "bar(g)", "psig")).toBeCloseTo(14.503773773, 6);
    expect(convert(-40, "°C", "°F")).toBeCloseTo(-40, 9);
    expect(convert(120, "Nm3/min", "Nm3/h")).toBeCloseTo(7200, 9);
  });

  it("refuses to convert between dimensions, including gauge ↔ absolute pressure", () => {
    expect(() => convert(1, "bar(g)", "bar(a)")).toThrow(UnitError);
    expect(() => convert(1, "m", "h")).toThrow(UnitError);
  });

  it("rejects unknown units and non-finite numbers", () => {
    expect(isUnit("bar(g)")).toBe(true);
    expect(isUnit("furlong")).toBe(false);
    expect(isUnit(5)).toBe(false);
    expect(() => toSI(1, "furlong" as UnitId)).toThrow(UnitError);
    expect(() => toSI(Number.NaN, "m")).toThrow(UnitError);
    expect(() => fromSI(Number.POSITIVE_INFINITY, "m")).toThrow(UnitError);
  });

  it("builds quantities that keep the input unit", () => {
    expect(quantity(500, "Nm3/h")).toEqual({ si: 500 / 3600, siUnit: "Nm3/s", input: 500, inputUnit: "Nm3/h" });
    expect(quantity(-20, "°C").si).toBeCloseTo(253.15, 9);
    expect(dimensionOf("psia")).toBe("pressure_absolute");
    expect(unitLabel("m2")).toBe("m²");
  });

  it("flags temperatures below absolute zero", () => {
    expect(isPhysicallyValid(quantity(-300, "°C"))).toBe(false);
    expect(isPhysicallyValid(quantity(-30, "°C"))).toBe(true);
    expect(isPhysicallyValid(quantity(-5, "m"))).toBe(true);
  });

  it("formats numbers for display", () => {
    expect(formatNumber(1234.56789, 2)).toBe("1 234,57".replace(" ", " "));
    expect(formatNumber(0.5, 3, "en-US")).toBe("0.5");
  });
});
