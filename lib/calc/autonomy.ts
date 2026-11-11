/**
 * Backup autonomy (SPEC §6), informative. Pure module, all values in SI.
 *
 *   usable_liquid_volume = V_tank · fill_max · (1 − heel_fraction)
 *   expansion_ratio      = ρ_liquid / ρ_gas,normal
 *   gas_volume_normal    = usable_liquid_volume · expansion_ratio
 *   autonomy             = gas_volume_normal / Q
 *
 * The conservative variant uses Q_peak for the whole duration (used by
 * R-CAP-01); the informative variant uses Q_avg. No parameter has a default
 * value: anything missing yields NOT_EVALUATED (SPEC §0.3).
 */

export const AUTONOMY_PARAMS = ["fill_max", "heel_fraction", "rho_liquid", "rho_gas_normal"] as const;
export type AutonomyParamKey = (typeof AUTONOMY_PARAMS)[number];
export type AutonomyParams = Partial<Record<AutonomyParamKey, number>>;

export interface AutonomyInputs {
  /** Geometric tank volume [m³] (sizing result). */
  tankVolume?: number;
  /** Peak consumption [Nm³/s] (Design Basis). */
  qPeak?: number;
  /** Average consumption [Nm³/s] (Design Basis). */
  qAvg?: number;
  /** Required autonomy [s] (Design Basis). */
  requiredAutonomy?: number;
}

export interface AutonomyResult {
  status: "OK" | "NOT_EVALUATED";
  missingParams: AutonomyParamKey[];
  missingInputs: (keyof AutonomyInputs)[];
  /** Values outside their physical range (e.g. fill_max > 1, Q_peak = 0). */
  invalid: string[];
  usableLiquidVolume: number | null;
  expansionRatio: number | null;
  gasVolumeNormal: number | null;
  /** Conservative: Q_peak during the whole time [s]. */
  autonomyPeak: number | null;
  /** Informative: Q_avg [s]; null when Q_avg is missing. */
  autonomyAvg: number | null;
  /** Conservative autonomy ≥ required autonomy (null when not evaluable). */
  meetsRequirement: boolean | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function computeAutonomy(params: AutonomyParams, inputs: AutonomyInputs): AutonomyResult {
  const missingParams = AUTONOMY_PARAMS.filter((k) => !isNum(params[k]));
  const missingInputs = (["tankVolume", "qPeak"] as const).filter((k) => !isNum(inputs[k]));
  const invalid: string[] = [];
  const { fill_max, heel_fraction, rho_liquid, rho_gas_normal } = params;
  if (isNum(fill_max) && !(fill_max > 0 && fill_max <= 1)) invalid.push("fill_max");
  if (isNum(heel_fraction) && !(heel_fraction >= 0 && heel_fraction < 1)) invalid.push("heel_fraction");
  if (isNum(rho_liquid) && !(rho_liquid > 0)) invalid.push("rho_liquid");
  if (isNum(rho_gas_normal) && !(rho_gas_normal > 0)) invalid.push("rho_gas_normal");
  if (isNum(inputs.tankVolume) && !(inputs.tankVolume > 0)) invalid.push("tankVolume");
  if (isNum(inputs.qPeak) && !(inputs.qPeak > 0)) invalid.push("qPeak");
  if (isNum(inputs.qAvg) && !(inputs.qAvg > 0)) invalid.push("qAvg");

  const empty: AutonomyResult = {
    status: "NOT_EVALUATED",
    missingParams,
    missingInputs,
    invalid,
    usableLiquidVolume: null,
    expansionRatio: null,
    gasVolumeNormal: null,
    autonomyPeak: null,
    autonomyAvg: null,
    meetsRequirement: null,
  };
  if (missingParams.length || missingInputs.length || invalid.some((k) => k !== "qAvg")) return empty;

  const usableLiquidVolume = inputs.tankVolume! * fill_max! * (1 - heel_fraction!);
  const expansionRatio = rho_liquid! / rho_gas_normal!;
  const gasVolumeNormal = usableLiquidVolume * expansionRatio;
  const autonomyPeak = gasVolumeNormal / inputs.qPeak!;
  const autonomyAvg = isNum(inputs.qAvg) && inputs.qAvg > 0 ? gasVolumeNormal / inputs.qAvg : null;
  return {
    ...empty,
    status: "OK",
    usableLiquidVolume,
    expansionRatio,
    gasVolumeNormal,
    autonomyPeak,
    autonomyAvg,
    meetsRequirement: isNum(inputs.requiredAutonomy) ? autonomyPeak >= inputs.requiredAutonomy : null,
  };
}
