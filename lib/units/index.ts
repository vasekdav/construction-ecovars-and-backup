/**
 * Central unit conversion (SPEC §4): every quantity is stored in SI together
 * with the unit it was entered in. Pure module, no dependencies.
 *
 * Only definitional constants are used (e.g. 1 psi = 0.45359237 kg · 9.80665
 * m/s² / (0.0254 m)², 1 h = 3600 s). No engineering limits live here.
 *
 * Gauge and absolute pressure are separate dimensions on purpose: converting
 * between them needs the local atmospheric pressure, which is a site input,
 * not a constant of this library.
 */

export const DIMENSIONS = [
  "normal_volume_flow",
  "pressure_gauge",
  "pressure_absolute",
  "temperature",
  "length",
  "area",
  "volume",
  "duration",
  "mass",
  "fraction",
  "angle",
  "velocity",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

interface UnitDef {
  dimension: Dimension;
  /** SI = input * factor + offset */
  factor: number;
  offset?: number;
  label: string;
}

const PSI_IN_PA = (0.45359237 * 9.80665) / 0.0254 ** 2;

export const UNITS = {
  // normal volumetric flow, SI base: Nm³/s (m³/s at normal conditions)
  "Nm3/s": { dimension: "normal_volume_flow", factor: 1, label: "Nm³/s" },
  "Nm3/min": { dimension: "normal_volume_flow", factor: 1 / 60, label: "Nm³/min" },
  "Nm3/h": { dimension: "normal_volume_flow", factor: 1 / 3600, label: "Nm³/h" },
  // gauge pressure, SI base: Pa(g)
  "Pa(g)": { dimension: "pressure_gauge", factor: 1, label: "Pa(g)" },
  "kPa(g)": { dimension: "pressure_gauge", factor: 1e3, label: "kPa(g)" },
  "MPa(g)": { dimension: "pressure_gauge", factor: 1e6, label: "MPa(g)" },
  "bar(g)": { dimension: "pressure_gauge", factor: 1e5, label: "bar(g)" },
  "psig": { dimension: "pressure_gauge", factor: PSI_IN_PA, label: "psig" },
  // absolute pressure, SI base: Pa(a)
  "Pa(a)": { dimension: "pressure_absolute", factor: 1, label: "Pa(a)" },
  "kPa(a)": { dimension: "pressure_absolute", factor: 1e3, label: "kPa(a)" },
  "MPa(a)": { dimension: "pressure_absolute", factor: 1e6, label: "MPa(a)" },
  "bar(a)": { dimension: "pressure_absolute", factor: 1e5, label: "bar(a)" },
  "psia": { dimension: "pressure_absolute", factor: PSI_IN_PA, label: "psia" },
  // temperature, SI base: K
  K: { dimension: "temperature", factor: 1, label: "K" },
  "°C": { dimension: "temperature", factor: 1, offset: 273.15, label: "°C" },
  "°F": { dimension: "temperature", factor: 5 / 9, offset: 273.15 - (32 * 5) / 9, label: "°F" },
  // length, SI base: m
  m: { dimension: "length", factor: 1, label: "m" },
  mm: { dimension: "length", factor: 1e-3, label: "mm" },
  cm: { dimension: "length", factor: 1e-2, label: "cm" },
  km: { dimension: "length", factor: 1e3, label: "km" },
  // area, SI base: m²
  m2: { dimension: "area", factor: 1, label: "m²" },
  ha: { dimension: "area", factor: 1e4, label: "ha" },
  // volume, SI base: m³
  m3: { dimension: "volume", factor: 1, label: "m³" },
  l: { dimension: "volume", factor: 1e-3, label: "l" },
  // duration, SI base: s
  s: { dimension: "duration", factor: 1, label: "s" },
  min: { dimension: "duration", factor: 60, label: "min" },
  h: { dimension: "duration", factor: 3600, label: "h" },
  d: { dimension: "duration", factor: 86400, label: "d" },
  // mass, SI base: kg
  kg: { dimension: "mass", factor: 1, label: "kg" },
  t: { dimension: "mass", factor: 1e3, label: "t" },
  // dimensionless fraction, SI base: 1
  "1": { dimension: "fraction", factor: 1, label: "–" },
  "%": { dimension: "fraction", factor: 1e-2, label: "%" },
  // plane angle, base: degree (geographic coordinates, wind direction)
  deg: { dimension: "angle", factor: 1, label: "°" },
  // velocity, SI base: m/s
  "m/s": { dimension: "velocity", factor: 1, label: "m/s" },
} as const satisfies Record<string, UnitDef>;

export type UnitId = keyof typeof UNITS;

export const BASE_UNIT: Record<Dimension, UnitId> = {
  normal_volume_flow: "Nm3/s",
  pressure_gauge: "Pa(g)",
  pressure_absolute: "Pa(a)",
  temperature: "K",
  length: "m",
  area: "m2",
  volume: "m3",
  duration: "s",
  mass: "kg",
  fraction: "1",
  angle: "deg",
  velocity: "m/s",
};

export class UnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitError";
  }
}

export function isUnit(value: unknown): value is UnitId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(UNITS, value);
}

function def(unit: UnitId): UnitDef {
  if (!isUnit(unit)) throw new UnitError(`Unknown unit ${String(unit)}`);
  return UNITS[unit];
}

function assertFinite(v: number): void {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new UnitError(`Not a finite number: ${String(v)}`);
}

export function dimensionOf(unit: UnitId): Dimension {
  return def(unit).dimension;
}

export function unitsFor(dimension: Dimension): UnitId[] {
  return (Object.keys(UNITS) as UnitId[]).filter((u) => UNITS[u].dimension === dimension);
}

export function unitLabel(unit: UnitId): string {
  return def(unit).label;
}

export function toSI(value: number, unit: UnitId): number {
  assertFinite(value);
  const d = def(unit);
  return value * d.factor + (d.offset ?? 0);
}

export function fromSI(value: number, unit: UnitId): number {
  assertFinite(value);
  const d = def(unit);
  return (value - (d.offset ?? 0)) / d.factor;
}

export function convert(value: number, from: UnitId, to: UnitId): number {
  if (dimensionOf(from) !== dimensionOf(to)) {
    throw new UnitError(`Cannot convert ${from} (${dimensionOf(from)}) to ${to} (${dimensionOf(to)})`);
  }
  return fromSI(toSI(value, from), to);
}

/** A stored quantity: SI value plus the value and unit the user entered. */
export interface Quantity {
  /** Value in the SI base unit of the dimension. */
  si: number;
  siUnit: UnitId;
  input: number;
  inputUnit: UnitId;
}

export function quantity(input: number, inputUnit: UnitId): Quantity {
  return { si: toSI(input, inputUnit), siUnit: BASE_UNIT[dimensionOf(inputUnit)], input, inputUnit };
}

/** Absolute temperatures below 0 K are physically impossible. */
export function isPhysicallyValid(q: Quantity): boolean {
  return dimensionOf(q.inputUnit) !== "temperature" || q.si >= 0;
}

/** Round for display without changing stored values. */
export function formatNumber(value: number, maxFractionDigits = 3, locale = "cs-CZ"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}
