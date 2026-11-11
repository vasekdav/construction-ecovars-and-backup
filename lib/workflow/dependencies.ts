import type { Role } from "@/lib/auth/roles";
import type { ProcessTemplate } from "./template";
import type { StageSnapshot } from "./types";

/**
 * Dependencies of `stageKey` that are enabled in the project and not yet
 * closed. Disabled (or not applicable) stages are ignored.
 */
export function unmetDependencies(
  tpl: ProcessTemplate,
  stageKey: string,
  stages: readonly StageSnapshot[],
): string[] {
  const def = tpl.stages.find((s) => s.key === stageKey);
  if (!def) throw new Error(`Unknown stage ${stageKey}`);
  const byKey = new Map(stages.map((s) => [s.key, s]));
  return def.dependsOn.filter((d) => {
    const s = byKey.get(d);
    return s !== undefined && s.enabled && s.state !== "CLOSED";
  });
}

export type WaitingOn =
  | { kind: "dependencies"; stageKeys: string[] }
  | { kind: "owner"; roles: Role[] }
  | { kind: "approver"; roles: Role[] }
  | { kind: "blocked" }
  | { kind: "done" };

/** Approver of every gate (SPEC §2: OAM accepts the gate). */
export const GATE_APPROVER_ROLES: Role[] = ["OAM"];

/** "Who is waiting for whom" for one stage (SPEC §8 dashboard). */
export function waitingOn(tpl: ProcessTemplate, stage: StageSnapshot, stages: readonly StageSnapshot[]): WaitingOn {
  const def = tpl.stages.find((s) => s.key === stage.key);
  if (!def) throw new Error(`Unknown stage ${stage.key}`);
  switch (stage.state) {
    case "CLOSED":
      return { kind: "done" };
    case "BLOCKED":
      return { kind: "blocked" };
    case "IN_REVIEW":
      return { kind: "approver", roles: GATE_APPROVER_ROLES };
    case "IN_PROGRESS":
      return { kind: "owner", roles: [...def.ownerRoles] };
    case "NOT_STARTED": {
      const unmet = unmetDependencies(tpl, stage.key, stages);
      return unmet.length ? { kind: "dependencies", stageKeys: unmet } : { kind: "owner", roles: [...def.ownerRoles] };
    }
  }
}
