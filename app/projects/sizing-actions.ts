"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { guardedAction, type ActionState } from "@/lib/actions";
import { AUTONOMY_KEY, updateCalcConfig, verifyCalcConfig } from "@/lib/calc/config-service";
import { fieldErrorsOf, rawAnswersFromFormData } from "@/lib/form-data";
import { FormValidationError } from "@/lib/safety/errors";
import { recordSizingResult } from "@/lib/sizing/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function recordSizingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const projectId = str(fd, "projectId");
  return guardedAction("sizing.write", async (actor) => {
    try {
      await recordSizingResult(await getDb(), actor, { projectId, answers: rawAnswersFromFormData(fd) });
    } catch (e) {
      if (e instanceof FormValidationError) return { ok: false, error: "validation", fieldErrors: fieldErrorsOf(e.errors) };
      throw e;
    }
    revalidatePath(`/projects/${projectId}`, "layout");
    return { ok: true, message: "saved" };
  });
}

/** Fields: p:<param>:<medium>, pu:<param>:<medium>, normalConditions, document, clause, changeNote. */
export async function updateCalcConfigAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guardedAction("rule.manage", async (actor) => {
    const parameters: Record<string, Record<string, { input: string; unit: string } | null>> = {};
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith("p:")) continue;
      const [, param, medium] = key.split(":");
      if (!param || !medium) continue;
      const input = String(value).trim();
      (parameters[param] ??= {})[medium] = input === "" ? null : { input, unit: str(fd, `pu:${param}:${medium}`) };
    }
    await updateCalcConfig(await getDb(), actor, {
      key: AUTONOMY_KEY,
      parameters,
      normalConditions: str(fd, "normalConditions"),
      source: { document: str(fd, "document"), clause: str(fd, "clause") },
      changeNote: str(fd, "changeNote"),
    });
    revalidatePath("/calc/autonomy");
    revalidatePath("/projects", "layout");
    return { ok: true, message: "saved" };
  });
}

export async function verifyCalcConfigAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guardedAction("rule.verify", async (actor) => {
    await verifyCalcConfig(await getDb(), actor, { key: AUTONOMY_KEY, version: Number(str(fd, "version")) });
    revalidatePath("/calc/autonomy");
    revalidatePath("/projects", "layout");
    return { ok: true, message: "saved" };
  });
}
