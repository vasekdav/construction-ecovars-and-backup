"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { guardedAction, type ActionState } from "@/lib/actions";
import { advancePhase, QuestionnaireValidationError, saveAnswers } from "@/lib/questionnaire/service";

/**
 * Form fields: `q:<id>` holds the value (repeated for multiselect),
 * `u:<id>` the unit of a quantity, `m:<id>` marks a multiselect as present.
 * Only questions present in the form are changed (partial draft save).
 */
function rawAnswers(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const multi = new Set(
    [...fd.keys()].filter((k) => k.startsWith("m:")).map((k) => k.slice(2)),
  );
  for (const key of new Set(fd.keys())) {
    if (!key.startsWith("q:")) continue;
    const id = key.slice(2);
    if (multi.has(id)) continue;
    const unit = fd.get(`u:${id}`);
    out[id] = unit !== null ? { input: fd.get(key), unit } : fd.get(key);
  }
  for (const id of multi) out[id] = fd.getAll(`q:${id}`).map(String);
  return out;
}

export async function saveQuestionnaireAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = String(fd.get("projectId") ?? "");
  return guardedAction("questionnaire.write", async (actor) => {
    try {
      await saveAnswers(await getDb(), actor, { projectId, answers: rawAnswers(fd) });
    } catch (e) {
      if (e instanceof QuestionnaireValidationError) {
        return {
          ok: false,
          error: "validation",
          fieldErrors: Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, [v]])),
        };
      }
      throw e;
    }
    revalidatePath(`/projects/${projectId}`, "layout");
    return { ok: true, message: "saved" };
  });
}

export async function advancePhaseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = String(fd.get("projectId") ?? "");
  return guardedAction("questionnaire.write", async (actor) => {
    await advancePhase(await getDb(), actor, { projectId });
    revalidatePath(`/projects/${projectId}`, "layout");
    return { ok: true, message: "saved" };
  });
}
