"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { guardedAction, type ActionState } from "@/lib/actions";
import { updateRule, verifyRule } from "@/lib/safety/rules-service";
import { updateStandard, verifyStandard } from "@/lib/safety/standards-service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Fields: p:<param>:<medium> (value), pu:<param>:<medium> (unit), document, clause, changeNote. */
export async function updateRuleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ruleId = str(fd, "ruleId");
  return guardedAction("rule.manage", async (actor) => {
    const parameters: Record<string, Record<string, { input: string; unit: string } | null>> = {};
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith("p:")) continue;
      const [, param, medium] = key.split(":");
      if (!param || !medium) continue;
      const input = String(value).trim();
      (parameters[param] ??= {})[medium] = input === "" ? null : { input, unit: str(fd, `pu:${param}:${medium}`) };
    }
    await updateRule(await getDb(), actor, {
      ruleId,
      parameters,
      source: { document: str(fd, "document"), clause: str(fd, "clause") },
      changeNote: str(fd, "changeNote"),
    });
    revalidatePath("/rules", "layout");
    revalidatePath("/projects", "layout");
    return { ok: true, message: "saved" };
  });
}

export async function verifyRuleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guardedAction("rule.verify", async (actor) => {
    await verifyRule(await getDb(), actor, { ruleId: str(fd, "ruleId"), version: Number(str(fd, "version")) });
    revalidatePath("/rules", "layout");
    revalidatePath("/projects", "layout");
    return { ok: true, message: "saved" };
  });
}

export async function updateStandardAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guardedAction("rule.manage", async (actor) => {
    await updateStandard(await getDb(), actor, {
      standardId: str(fd, "standardId"),
      revision: str(fd, "revision"),
      notes: str(fd, "notes"),
      appliesTo: fd.getAll("appliesTo").map(String),
    });
    revalidatePath("/standards");
    revalidatePath("/projects", "layout");
    return { ok: true, message: "saved" };
  });
}

export async function verifyStandardAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guardedAction("standard.verify", async (actor) => {
    await verifyStandard(await getDb(), actor, { standardId: str(fd, "standardId") });
    revalidatePath("/standards");
    revalidatePath("/projects", "layout");
    return { ok: true, message: "saved" };
  });
}
