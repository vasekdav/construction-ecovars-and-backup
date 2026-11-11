import { z } from "zod";

/**
 * Rule condition language (SPEC §7.1): rules are data, the code only
 * evaluates expressions. Three-valued (Kleene) logic: T, F, U(nknown).
 * A missing input yields U; U never becomes GO.
 */

export type Primitive = number | string | boolean;

export type ValueExpr =
  | { input: string }
  | { param: string }
  | { const: Primitive }
  | { op: "add" | "sub" | "mul"; args: ValueExpr[] };

export type BoolExpr =
  | { op: "and" | "or"; args: BoolExpr[] }
  | { op: "not"; arg: BoolExpr }
  | { op: "gte" | "gt" | "lte" | "lt" | "eq" | "neq"; left: ValueExpr; right: ValueExpr }
  | { op: "isTrue" | "isFalse" | "exists"; value: ValueExpr }
  | { op: "in" | "notIn"; value: ValueExpr; values: Primitive[] };

const primitive = z.union([z.number(), z.string(), z.boolean()]);
const refKey = z.string().regex(/^[a-z]+\.[a-zA-Z0-9_]+$/);
const paramKey = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const valueExprSchema: z.ZodType<ValueExpr> = z.lazy(() =>
  z.union([
    z.strictObject({ input: refKey }),
    z.strictObject({ param: paramKey }),
    z.strictObject({ const: primitive }),
    z.strictObject({ op: z.enum(["add", "sub", "mul"]), args: z.array(valueExprSchema).min(2) }),
  ]),
);

export const boolExprSchema: z.ZodType<BoolExpr> = z.lazy(() =>
  z.union([
    z.strictObject({ op: z.enum(["and", "or"]), args: z.array(boolExprSchema).min(1) }),
    z.strictObject({ op: z.literal("not"), arg: boolExprSchema }),
    z.strictObject({ op: z.enum(["gte", "gt", "lte", "lt", "eq", "neq"]), left: valueExprSchema, right: valueExprSchema }),
    z.strictObject({ op: z.enum(["isTrue", "isFalse", "exists"]), value: valueExprSchema }),
    z.strictObject({ op: z.enum(["in", "notIn"]), value: valueExprSchema, values: z.array(primitive).min(1) }),
  ]),
);

export type Tri = "T" | "F" | "U";

export interface EvalContext {
  inputs: Readonly<Record<string, Primitive | undefined>>;
  params: Readonly<Record<string, number | undefined>>;
}

export function evalValue(v: ValueExpr, ctx: EvalContext): Primitive | undefined {
  if ("input" in v) return ctx.inputs[v.input];
  if ("param" in v) return ctx.params[v.param];
  if ("const" in v) return v.const;
  const values = v.args.map((a) => evalValue(a, ctx));
  if (values.some((x) => typeof x !== "number")) return undefined;
  const nums = values as number[];
  switch (v.op) {
    case "add":
      return nums.reduce((a, b) => a + b);
    case "sub":
      return nums.reduce((a, b) => a - b);
    case "mul":
      return nums.reduce((a, b) => a * b);
  }
}

function compare(op: "gte" | "gt" | "lte" | "lt" | "eq" | "neq", a: Primitive | undefined, b: Primitive | undefined): Tri {
  if (a === undefined || b === undefined) return "U";
  if (op === "eq") return a === b ? "T" : "F";
  if (op === "neq") return a !== b ? "T" : "F";
  if (typeof a !== "number" || typeof b !== "number") return "U";
  const r = op === "gte" ? a >= b : op === "gt" ? a > b : op === "lte" ? a <= b : a < b;
  return r ? "T" : "F";
}

export function evalBool(e: BoolExpr, ctx: EvalContext): Tri {
  switch (e.op) {
    case "and": {
      const rs = e.args.map((a) => evalBool(a, ctx));
      return rs.includes("F") ? "F" : rs.includes("U") ? "U" : "T";
    }
    case "or": {
      const rs = e.args.map((a) => evalBool(a, ctx));
      return rs.includes("T") ? "T" : rs.includes("U") ? "U" : "F";
    }
    case "not": {
      const r = evalBool(e.arg, ctx);
      return r === "U" ? "U" : r === "T" ? "F" : "T";
    }
    case "isTrue":
    case "isFalse": {
      const v = evalValue(e.value, ctx);
      if (typeof v !== "boolean") return "U";
      return v === (e.op === "isTrue") ? "T" : "F";
    }
    case "exists": {
      // A missing input is unknown (→ NEVYHODNOCENO), an empty string is "not filled in".
      const v = evalValue(e.value, ctx);
      if (v === undefined) return "U";
      return typeof v === "string" && v.trim() === "" ? "F" : "T";
    }
    case "in":
    case "notIn": {
      const v = evalValue(e.value, ctx);
      if (v === undefined) return "U";
      return e.values.includes(v) === (e.op === "in") ? "T" : "F";
    }
    default:
      return compare(e.op, evalValue(e.left, ctx), evalValue(e.right, ctx));
  }
}

export interface Refs {
  inputs: string[];
  params: string[];
}

/** Inputs and parameters referenced by an expression (sorted, unique). */
export function collectRefs(e: BoolExpr | ValueExpr): Refs {
  const inputs = new Set<string>();
  const params = new Set<string>();
  const walk = (x: BoolExpr | ValueExpr): void => {
    if ("input" in x) inputs.add(x.input);
    else if ("param" in x) params.add(x.param);
    else if ("const" in x) return;
    else if ("args" in x) (x.args as (BoolExpr | ValueExpr)[]).forEach(walk);
    else if ("arg" in x) walk(x.arg);
    else if ("left" in x) {
      walk(x.left);
      walk(x.right);
    } else walk(x.value);
  };
  walk(e);
  return { inputs: [...inputs].sort(), params: [...params].sort() };
}

const SYMBOL: Record<string, string> = { gte: "≥", gt: ">", lte: "≤", lt: "<", eq: "=", neq: "≠", add: "+", sub: "−", mul: "×" };

/** Human-readable rendering of a condition for the UI and exports. */
export function describe(e: BoolExpr | ValueExpr): string {
  if ("input" in e) return e.input;
  if ("param" in e) return `[${e.param}]`;
  if ("const" in e) return JSON.stringify(e.const);
  switch (e.op) {
    case "and":
    case "or":
      return e.args.length === 1 ? describe(e.args[0]!) : `(${e.args.map(describe).join(e.op === "and" ? " AND " : " OR ")})`;
    case "add":
    case "sub":
    case "mul":
      return `(${e.args.map(describe).join(` ${SYMBOL[e.op]} `)})`;
    case "not":
      return `NOT ${describe(e.arg)}`;
    case "isTrue":
      return `${describe(e.value)} = ano`;
    case "isFalse":
      return `${describe(e.value)} = ne`;
    case "exists":
      return `${describe(e.value)} vyplněno`;
    case "in":
      return `${describe(e.value)} ∈ {${e.values.join(", ")}}`;
    case "notIn":
      return `${describe(e.value)} ∉ {${e.values.join(", ")}}`;
    default:
      return `${describe(e.left)} ${SYMBOL[e.op]} ${describe(e.right)}`;
  }
}
