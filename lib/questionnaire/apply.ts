import { parseAnswer, type AnswerError, type Answers } from "./answers";
import { findQuestion, type QuestionnaireTemplate } from "./template";

export type ApplyError = AnswerError | "unknown_question";

export interface ApplyResult {
  next: Answers;
  changes: Record<string, { before: unknown; after: unknown }>;
  errors: Record<string, ApplyError>;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Apply raw form values to stored answers (pure). Only provided questions
 * change; empty values clear an answer. Used by every form-based input
 * (questionnaire, layout geometry, design checklist).
 */
export function applyRawAnswers(tpl: QuestionnaireTemplate, existing: Answers, raw: Record<string, unknown>): ApplyResult {
  const errors: Record<string, ApplyError> = {};
  const next: Answers = { ...existing };
  const changes: ApplyResult["changes"] = {};
  for (const [id, value] of Object.entries(raw)) {
    const q = findQuestion(tpl, id);
    if (!q) {
      errors[id] = "unknown_question";
      continue;
    }
    const parsed = parseAnswer(q, value);
    if (!parsed.ok) {
      errors[id] = parsed.error;
      continue;
    }
    if (!same(next[id], parsed.value)) changes[id] = { before: next[id] ?? null, after: parsed.value };
    if (parsed.value === null) delete next[id];
    else next[id] = parsed.value;
  }
  return { next, changes, errors };
}
