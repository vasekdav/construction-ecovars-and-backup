"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { guardedAction, type ActionState } from "@/lib/actions";
import { fieldErrorsOf, rawAnswersFromFormData } from "@/lib/form-data";
import { FormValidationError } from "@/lib/safety/errors";
import {
  acknowledgeWarning,
  overrideNoGo,
  revokeOverride,
  saveDesignInputs,
  saveEvaluationSnapshot,
  saveLayoutGeometry,
  saveLayoutPlan,
} from "@/lib/safety/project";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function revalidateProject(projectId: string) {
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

async function withFormErrors(run: () => Promise<unknown>): Promise<ActionState> {
  try {
    await run();
  } catch (e) {
    if (e instanceof FormValidationError) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(e.errors) };
    throw e;
  }
  return { ok: true, message: "saved" };
}

export async function saveDesignInputsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("project.read", async (actor) => {
    const res = await withFormErrors(async () =>
      saveDesignInputs(await getDb(), actor, { projectId, answers: rawAnswersFromFormData(fd) }),
    );
    if (res?.ok) revalidateProject(projectId);
    return res;
  });
}

export async function saveLayoutGeometryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("project.read", async (actor) => {
    const res = await withFormErrors(async () =>
      saveLayoutGeometry(await getDb(), actor, { projectId, version: str(fd, "version"), answers: rawAnswersFromFormData(fd) }),
    );
    if (res?.ok) revalidateProject(projectId);
    return res;
  });
}

export async function overrideNoGoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("rule.override", async (actor) => {
    await overrideNoGo(await getDb(), actor, { projectId, ruleId: str(fd, "ruleId"), reason: str(fd, "reason") });
    revalidateProject(projectId);
    return { ok: true, message: "saved" };
  });
}

export async function acknowledgeWarningAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("rule.acknowledge", async (actor) => {
    await acknowledgeWarning(await getDb(), actor, { projectId, ruleId: str(fd, "ruleId"), reason: str(fd, "reason") });
    revalidateProject(projectId);
    return { ok: true, message: "saved" };
  });
}

/** Permission depends on the kind (override: Process Safety, review: Process Safety / OAM); checked in the service. */
export async function revokeOverrideAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("project.read", async (actor) => {
    await revokeOverride(await getDb(), actor, { overrideId: str(fd, "overrideId"), reason: str(fd, "reason") });
    revalidateProject(projectId);
    return { ok: true, message: "saved" };
  });
}

export async function snapshotAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("safety.snapshot", async (actor) => {
    await saveEvaluationSnapshot(await getDb(), actor, { projectId });
    revalidateProject(projectId);
    return { ok: true, message: "saved" };
  });
}

export async function saveLayoutPlanAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("project.read", async (actor) => {
    let plan: unknown;
    try {
      plan = JSON.parse(str(fd, "plan"));
    } catch {
      return { ok: false, error: "validation" };
    }
    await saveLayoutPlan(await getDb(), actor, { projectId, version: str(fd, "version"), plan });
    revalidateProject(projectId);
    return { ok: true, message: "saved" };
  });
}
