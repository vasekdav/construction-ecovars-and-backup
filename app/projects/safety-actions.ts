"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { guardedAction, type ActionState } from "@/lib/actions";
import { fieldErrorsOf, rawAnswersFromFormData } from "@/lib/form-data";
import { FormValidationError } from "@/lib/safety/errors";
import {
  overrideNoGo,
  revokeOverride,
  saveDesignInputs,
  saveEvaluationSnapshot,
  saveLayoutGeometry,
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

export async function revokeOverrideAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("rule.override", async (actor) => {
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
