"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { guardedAction, type ActionState } from "@/lib/actions";
import { fieldErrorsOf, rawAnswersFromFormData as rawAnswers } from "@/lib/form-data";
import { advancePhase, QuestionnaireValidationError, saveAnswers } from "@/lib/questionnaire/service";

export async function saveQuestionnaireAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = String(fd.get("projectId") ?? "");
  return guardedAction("questionnaire.write", async (actor) => {
    try {
      await saveAnswers(await getDb(), actor, { projectId, answers: rawAnswers(fd) });
    } catch (e) {
      if (e instanceof QuestionnaireValidationError) {
        return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(e.errors) };
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
