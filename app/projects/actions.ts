"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { guardedAction, type ActionState } from "@/lib/actions";
import {
  addComment,
  addDocumentLink,
  addLayoutVersion,
  addTask,
  confirmCheck,
  createProject,
  recordDecision,
  removeDocumentLink,
  setStageEnabled,
  setTaskDone,
  transitionStage,
  updateStageSettings,
} from "@/lib/workflow/service";

/** FormData → plain object; repeated keys become arrays. */
function fields(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$")) continue; // React internal fields
    out[k] = typeof v === "string" ? v : null;
  }
  return out;
}

const bool = (v: unknown) => v === "true" || v === "on";

function revalidateProject(fd: FormData) {
  const projectId = fd.get("projectId");
  if (typeof projectId === "string" && projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

export async function createProjectAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let projectId: string | null = null;
  const res = await guardedAction("project.create", async (actor) => {
    projectId = await createProject(await getDb(), actor, fields(fd));
    return { ok: true, message: "created" };
  });
  if (res?.ok && projectId) {
    revalidatePath("/projects");
    redirect(`/projects/${projectId}`);
  }
  return res;
}

export async function transitionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guardedAction("project.read", async (actor) => {
    const out = await transitionStage(await getDb(), actor, fields(fd));
    revalidateProject(fd);
    if (!out.ok) return { ok: false, error: out.errors[0] ?? "invalid_transition" };
    return { ok: true, message: out.to };
  });
}

function simple(run: (actor: Parameters<Parameters<typeof guardedAction>[1]>[0], data: Record<string, unknown>) => Promise<unknown>) {
  return async (_prev: ActionState, fd: FormData): Promise<ActionState> =>
    guardedAction("project.read", async (actor) => {
      await run(actor, fields(fd));
      revalidateProject(fd);
      return { ok: true, message: "saved" };
    });
}

export const stageSettingsAction = simple(async (actor, d) => updateStageSettings(await getDb(), actor, d));
export const stageEnabledAction = simple(async (actor, d) =>
  setStageEnabled(await getDb(), actor, { stageId: d.stageId, enabled: bool(d.enabled) }),
);
export const confirmCheckAction = simple(async (actor, d) =>
  confirmCheck(await getDb(), actor, { stageId: d.stageId, checkId: d.checkId, confirmed: bool(d.confirmed) }),
);
export const addTaskAction = simple(async (actor, d) => addTask(await getDb(), actor, d));
export const setTaskDoneAction = simple(async (actor, d) =>
  setTaskDone(await getDb(), actor, { taskId: d.taskId, done: bool(d.done) }),
);
export const addDocumentLinkAction = simple(async (actor, d) => addDocumentLink(await getDb(), actor, d));
export const removeDocumentLinkAction = simple(async (actor, d) => removeDocumentLink(await getDb(), actor, d));
export const addCommentAction = simple(async (actor, d) => addComment(await getDb(), actor, d));
export const recordDecisionAction = simple(async (actor, d) => recordDecision(await getDb(), actor, d));
export const addLayoutVersionAction = simple(async (actor, d) =>
  addLayoutVersion(await getDb(), actor, { ...d, drawingUrl: d.drawingUrl ? d.drawingUrl : null }),
);
