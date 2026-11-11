import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeAutonomy, type AutonomyParams } from "@/lib/calc/autonomy";
import { calcConfigGaps, calcConfigSchema, calcParamValues, type CalcConfig } from "@/lib/calc/config";
import { quantity } from "@/lib/units";

/**
 * TEST FIXTURES ONLY – arbitrary round numbers chosen so the arithmetic is easy
 * to check by hand. They are NOT physical or engineering values.
 */
const P: AutonomyParams = { fill_max: 0.5, heel_fraction: 0.2, rho_liquid: 1000, rho_gas_normal: 2 };
const hour = 3600;

describe("computeAutonomy (SPEC §6)", () => {
  it("follows the formula step by step", () => {
    // usable = 20 · 0.5 · 0.8 = 8 m³; ratio = 500; gas = 4000 Nm³; Q_peak = 400 Nm³/h → 10 h
    const r = computeAutonomy(P, { tankVolume: 20, qPeak: 400 / hour, qAvg: 200 / hour, requiredAutonomy: 8 * hour });
    expect(r.status).toBe("OK");
    expect(r.usableLiquidVolume).toBeCloseTo(8, 12);
    expect(r.expansionRatio).toBe(500);
    expect(r.gasVolumeNormal).toBeCloseTo(4000, 9);
    expect(r.autonomyPeak! / hour).toBeCloseTo(10, 9);
    expect(r.autonomyAvg! / hour).toBeCloseTo(20, 9);
    expect(r.meetsRequirement).toBe(true);
  });

  it("the conservative (Q_peak) variant decides the requirement", () => {
    const r = computeAutonomy(P, { tankVolume: 20, qPeak: 400 / hour, qAvg: 100 / hour, requiredAutonomy: 12 * hour });
    expect(r.autonomyAvg! / hour).toBeCloseTo(40, 9);
    expect(r.meetsRequirement).toBe(false);
  });

  it("is NOT_EVALUATED when any parameter is missing (no defaults)", () => {
    const r = computeAutonomy({ ...P, heel_fraction: undefined }, { tankVolume: 20, qPeak: 0.1 });
    expect(r).toMatchObject({ status: "NOT_EVALUATED", missingParams: ["heel_fraction"], autonomyPeak: null });
    expect(computeAutonomy({}, {}).missingParams).toEqual(["fill_max", "heel_fraction", "rho_liquid", "rho_gas_normal"]);
  });

  it("is NOT_EVALUATED when V_tank or Q_peak is missing; Q_avg and requirement are optional", () => {
    expect(computeAutonomy(P, { qPeak: 0.1 })).toMatchObject({ status: "NOT_EVALUATED", missingInputs: ["tankVolume"] });
    expect(computeAutonomy(P, { tankVolume: 20 })).toMatchObject({ status: "NOT_EVALUATED", missingInputs: ["qPeak"] });
    const r = computeAutonomy(P, { tankVolume: 20, qPeak: 0.1 });
    expect(r).toMatchObject({ status: "OK", autonomyAvg: null, meetsRequirement: null });
  });

  it("rejects physically invalid values instead of computing", () => {
    expect(computeAutonomy({ ...P, fill_max: 1.2 }, { tankVolume: 20, qPeak: 0.1 }).invalid).toEqual(["fill_max"]);
    expect(computeAutonomy({ ...P, fill_max: 0 }, { tankVolume: 20, qPeak: 0.1 }).status).toBe("NOT_EVALUATED");
    expect(computeAutonomy({ ...P, heel_fraction: 1 }, { tankVolume: 20, qPeak: 0.1 }).invalid).toEqual(["heel_fraction"]);
    expect(computeAutonomy({ ...P, rho_liquid: 0, rho_gas_normal: -1 }, { tankVolume: 20, qPeak: 0.1 }).invalid).toEqual([
      "rho_liquid",
      "rho_gas_normal",
    ]);
    expect(computeAutonomy(P, { tankVolume: 0, qPeak: 0 }).invalid).toEqual(["tankVolume", "qPeak"]);
    // Q_avg = 0 only drops the informative variant
    const r = computeAutonomy(P, { tankVolume: 20, qPeak: 0.1, qAvg: 0 });
    expect(r).toMatchObject({ status: "OK", autonomyAvg: null, invalid: ["qAvg"] });
  });
});

describe("calculation config", () => {
  const shipped = calcConfigSchema.parse(JSON.parse(readFileSync("data/calc/autonomy.json", "utf8")));

  it("ships as DRAFT with no parameter values and TBD-VERIFY texts", () => {
    expect(shipped.status).toBe("DRAFT");
    expect(calcParamValues(shipped, "O2")).toEqual({
      fill_max: undefined,
      heel_fraction: undefined,
      rho_liquid: undefined,
      rho_gas_normal: undefined,
    });
    expect(calcConfigGaps(shipped)).toEqual(["fill_max", "heel_fraction", "rho_liquid", "rho_gas_normal", "normalConditions", "source"]);
  });

  it("has no gaps once every value and text is filled in", () => {
    const filled: CalcConfig = {
      ...shipped,
      normalConditions: "test conditions",
      source: { document: "test doc", clause: "1.1" },
      parameters: shipped.parameters.map((p) => ({ ...p, values: { O2: quantity(1, p.dimension === "density" ? "kg/m3" : "1"), N2: quantity(1, p.dimension === "density" ? "kg/m3" : "1") } })),
    };
    expect(calcConfigGaps(filled)).toEqual([]);
    expect(calcParamValues(filled, "N2").rho_liquid).toBe(1);
  });
});
