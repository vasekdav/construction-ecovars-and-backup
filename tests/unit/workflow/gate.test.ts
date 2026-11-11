import { describe, expect, it } from "vitest";
import { evaluateGate, type GateContext } from "@/lib/workflow/gate";
import { DEFAULT_TEMPLATE, stageTemplate, type GateCondition } from "@/lib/workflow/template";

const empty: GateContext = {
  documentLinks: [],
  manualChecks: {},
  tasks: [],
  decisions: [],
  layoutVersions: [],
  ownerUserId: null,
};
const L = { cs: "x", en: "x" };
const link = (kind: string, version: string | null = "A", documentDate: string | null = "2026-01-01") => ({
  kind,
  url: "https://demo.sharepoint.com/x",
  version,
  documentDate,
});
const one = (c: GateCondition, ctx: Partial<GateContext>) => evaluateGate([c], { ...empty, ...ctx }).results[0]!;

describe("evaluateGate", () => {
  it("never passes an empty condition list", () => {
    expect(evaluateGate([], empty).passed).toBe(false);
  });

  describe("documentLinks", () => {
    const c: GateCondition = { id: "d", type: "documentLinks", kinds: ["a", "b"], requireVersion: true, requireDate: true };
    it("reports missing kinds", () => {
      expect(one(c, { documentLinks: [link("a")] })).toMatchObject({ met: false, failure: "missing_documents", details: ["b"] });
    });
    it("requires a version when configured", () => {
      expect(one(c, { documentLinks: [link("a"), link("b", " ")] })).toMatchObject({ failure: "missing_version", details: ["b"] });
    });
    it("requires a date when configured", () => {
      expect(one(c, { documentLinks: [link("a"), link("b", "A", null)] })).toMatchObject({ failure: "missing_date", details: ["b"] });
    });
    it("passes when all kinds have version and date", () => {
      expect(one(c, { documentLinks: [link("a"), link("b")] }).met).toBe(true);
    });
    it("ignores version/date when not required", () => {
      const lax: GateCondition = { ...c, requireVersion: false, requireDate: false } as GateCondition;
      expect(one(lax, { documentLinks: [link("a", null, null), link("b", null, null)] }).met).toBe(true);
    });
  });

  it("manualCheck", () => {
    const c: GateCondition = { id: "m", type: "manualCheck", roles: ["OAM"], label: L };
    expect(one(c, {})).toMatchObject({ met: false, failure: "not_confirmed" });
    expect(one(c, { manualChecks: { m: { by: "u", at: "t" } } }).met).toBe(true);
  });

  it("allTasksDone", () => {
    const c: GateCondition = { id: "t", type: "allTasksDone", label: L };
    expect(one(c, {}).met).toBe(true);
    expect(one(c, { tasks: [{ done: true }, { done: false }, { done: false }] })).toMatchObject({
      met: false,
      failure: "open_tasks",
      details: ["2"],
    });
  });

  it("ownerAssigned", () => {
    const c: GateCondition = { id: "o", type: "ownerAssigned", label: L };
    expect(one(c, {})).toMatchObject({ met: false, failure: "no_owner" });
    expect(one(c, { ownerUserId: "u" }).met).toBe(true);
  });

  it("decisionRecorded requires a rationale", () => {
    const c: GateCondition = { id: "d", type: "decisionRecorded", label: L };
    expect(one(c, {})).toMatchObject({ met: false, failure: "no_decision" });
    expect(one(c, { decisions: [{ rationale: "  " }] }).met).toBe(false);
    expect(one(c, { decisions: [{ rationale: "Economizer se nevyplatí" }] }).met).toBe(true);
  });

  it("layoutVersion concept (v0) and final (vN)", () => {
    const concept: GateCondition = { id: "l", type: "layoutVersion", which: "concept", requireDrawing: true };
    const final: GateCondition = { id: "l", type: "layoutVersion", which: "final", requireDrawing: true };
    expect(one(concept, {})).toMatchObject({ failure: "no_layout" });
    expect(one(concept, { layoutVersions: [{ version: 0, drawingUrl: null }] })).toMatchObject({ failure: "no_drawing" });
    expect(one(concept, { layoutVersions: [{ version: 0, drawingUrl: "https://x" }] }).met).toBe(true);
    expect(one(final, { layoutVersions: [{ version: 0, drawingUrl: "https://x" }] })).toMatchObject({ failure: "no_layout" });
    expect(one(final, { layoutVersions: [{ version: 2, drawingUrl: "https://x" }] }).met).toBe(true);
    const noDrawing: GateCondition = { ...final, requireDrawing: false } as GateCondition;
    expect(one(noDrawing, { layoutVersions: [{ version: 1, drawingUrl: null }] }).met).toBe(true);
  });

  it("pendingFeature is never met (safe default until the feature exists)", () => {
    const c: GateCondition = { id: "p", type: "pendingFeature", phase: 3, label: L };
    expect(one(c, {})).toMatchObject({ met: false, failure: "pending_feature", details: ["3"] });
  });

  it("step 1 gate passes with a SharePoint link and the OAM confirmation", () => {
    const gate = stageTemplate(DEFAULT_TEMPLATE, "1").gate;
    expect(evaluateGate(gate, empty).passed).toBe(false);
    const ctx: GateContext = {
      ...empty,
      documentLinks: [link("sharepoint_site", null, null)],
      manualChecks: { permissions_match_roles: { by: "u", at: "t" } },
    };
    expect(evaluateGate(gate, ctx).passed).toBe(true);
  });
});
