import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { projects, questionnaireResponses } from "@/db/schema";
import { completeness } from "./completeness";
import { getQuestionnaireTemplate } from "./template";

/** Questionnaire status used by the step 7 gate (read-only, no workflow imports). */
export async function questionnaireGateStatus(
  db: DbOrTx,
  projectId: string,
): Promise<{ phase: "INITIAL" | "DETAILED"; missing: number } | null> {
  const [row] = await db
    .select({ r: questionnaireResponses, medium: projects.medium })
    .from(questionnaireResponses)
    .innerJoin(projects, eq(projects.id, questionnaireResponses.projectId))
    .where(eq(questionnaireResponses.projectId, projectId));
  if (!row) return null;
  const tpl = getQuestionnaireTemplate(row.r.templateKey, row.r.templateVersion);
  const c = completeness(tpl, { medium: row.medium, answers: row.r.answers }, "detailed");
  return { phase: row.r.phase, missing: c.missing.length };
}
