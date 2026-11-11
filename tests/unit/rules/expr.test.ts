import { describe, expect, it } from "vitest";
import { boolExprSchema, collectRefs, describe as describeExpr, evalBool, evalValue, type BoolExpr, type EvalContext } from "@/lib/rules/expr";

const ctx: EvalContext = { inputs: { "a.x": 5, "a.y": 10, "a.t": true, "a.f": false, "a.s": "concrete", "a.e": "  " }, params: { p: 7 } };
const I = (k: string) => ({ input: k });
const T: BoolExpr = { op: "isTrue", value: I("a.t") };
const F: BoolExpr = { op: "isTrue", value: I("a.f") };
const U: BoolExpr = { op: "isTrue", value: I("a.missing") };

describe("evalValue", () => {
  it("resolves inputs, params, constants and arithmetic", () => {
    expect(evalValue(I("a.x"), ctx)).toBe(5);
    expect(evalValue({ param: "p" }, ctx)).toBe(7);
    expect(evalValue({ const: "x" }, ctx)).toBe("x");
    expect(evalValue({ op: "add", args: [I("a.x"), I("a.y")] }, ctx)).toBe(15);
    expect(evalValue({ op: "sub", args: [I("a.y"), I("a.x")] }, ctx)).toBe(5);
    expect(evalValue({ op: "mul", args: [I("a.x"), { param: "p" }] }, ctx)).toBe(35);
    expect(evalValue({ op: "mul", args: [I("a.x"), I("a.missing")] }, ctx)).toBeUndefined();
    expect(evalValue({ op: "add", args: [I("a.x"), I("a.s")] }, ctx)).toBeUndefined();
  });
});

describe("evalBool: Kleene three-valued logic", () => {
  it("and / or / not", () => {
    expect(evalBool({ op: "and", args: [T, T] }, ctx)).toBe("T");
    expect(evalBool({ op: "and", args: [T, U] }, ctx)).toBe("U");
    expect(evalBool({ op: "and", args: [F, U] }, ctx)).toBe("F");
    expect(evalBool({ op: "or", args: [F, U] }, ctx)).toBe("U");
    expect(evalBool({ op: "or", args: [T, U] }, ctx)).toBe("T");
    expect(evalBool({ op: "or", args: [F, F] }, ctx)).toBe("F");
    expect(evalBool({ op: "not", arg: T }, ctx)).toBe("F");
    expect(evalBool({ op: "not", arg: F }, ctx)).toBe("T");
    expect(evalBool({ op: "not", arg: U }, ctx)).toBe("U");
  });

  it("comparisons", () => {
    const c = (op: "gte" | "gt" | "lte" | "lt" | "eq" | "neq", l: string, r: string) =>
      evalBool({ op, left: I(l), right: I(r) }, ctx);
    expect(c("gte", "a.y", "a.x")).toBe("T");
    expect(c("gt", "a.x", "a.y")).toBe("F");
    expect(c("lte", "a.x", "a.x")).toBe("T");
    expect(c("lt", "a.y", "a.x")).toBe("F");
    expect(c("eq", "a.s", "a.s")).toBe("T");
    expect(c("neq", "a.x", "a.y")).toBe("T");
    expect(c("eq", "a.x", "a.y")).toBe("F");
    expect(c("gte", "a.x", "a.missing")).toBe("U");
    expect(c("gte", "a.s", "a.x")).toBe("U");
  });

  it("isTrue / isFalse / exists / in / notIn", () => {
    expect(evalBool({ op: "isFalse", value: I("a.f") }, ctx)).toBe("T");
    expect(evalBool({ op: "isFalse", value: I("a.t") }, ctx)).toBe("F");
    expect(evalBool({ op: "isTrue", value: I("a.x") }, ctx)).toBe("U");
    expect(evalBool({ op: "exists", value: I("a.s") }, ctx)).toBe("T");
    expect(evalBool({ op: "exists", value: I("a.e") }, ctx)).toBe("F");
    expect(evalBool({ op: "exists", value: I("a.missing") }, ctx)).toBe("U");
    expect(evalBool({ op: "in", value: I("a.s"), values: ["concrete"] }, ctx)).toBe("T");
    expect(evalBool({ op: "in", value: I("a.s"), values: ["asphalt"] }, ctx)).toBe("F");
    expect(evalBool({ op: "notIn", value: I("a.s"), values: ["asphalt"] }, ctx)).toBe("T");
    expect(evalBool({ op: "in", value: I("a.missing"), values: ["x"] }, ctx)).toBe("U");
  });
});

describe("schema, refs, describe", () => {
  const e: BoolExpr = {
    op: "and",
    args: [
      { op: "gte", left: I("a.x"), right: { op: "mul", args: [I("a.y"), { param: "p" }] } },
      { op: "not", arg: { op: "in", value: I("a.s"), values: ["concrete", 1] } },
      { op: "or", args: [{ op: "exists", value: I("a.x") }] },
      { op: "isFalse", value: I("a.f") },
      { op: "notIn", value: { const: 1 }, values: [2] },
    ],
  };
  it("validates expressions strictly", () => {
    expect(boolExprSchema.safeParse(e).success).toBe(true);
    expect(boolExprSchema.safeParse({ op: "xor", args: [] }).success).toBe(false);
    expect(boolExprSchema.safeParse({ op: "isTrue", value: { input: "noDot" } }).success).toBe(false);
    expect(boolExprSchema.safeParse({ op: "isTrue", value: { input: "a.b" }, extra: 1 }).success).toBe(false);
  });
  it("collects references", () => {
    expect(collectRefs(e)).toEqual({ inputs: ["a.f", "a.s", "a.x", "a.y"], params: ["p"] });
  });
  it("renders a readable condition", () => {
    expect(describeExpr(e)).toBe(
      '(a.x ≥ (a.y × [p]) AND NOT a.s ∈ {concrete, 1} AND a.x vyplněno AND a.f = ne AND 1 ∉ {2})',
    );
    expect(describeExpr({ op: "isTrue", value: I("a.t") })).toBe("a.t = ano");
    expect(describeExpr({ op: "lt", left: I("a.x"), right: { op: "sub", args: [I("a.y"), { op: "add", args: [I("a.x"), I("a.x")] }] } })).toBe(
      "a.x < (a.y − (a.x + a.x))",
    );
  });
});
