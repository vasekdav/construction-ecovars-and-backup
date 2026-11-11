import type { Medium } from "@/lib/workflow/template";
import { isAnswered, type Answers } from "./answers";
import { allQuestions, type Question, type QuestionnairePhase, type QuestionnaireTemplate } from "./template";

export interface AnswerContext {
  medium: Medium;
  answers: Answers;
}

/** Conditional display (SPEC §5): by project medium and/or another answer. */
export function isVisible(q: Question, ctx: AnswerContext): boolean {
  const s = q.showIf;
  if (!s) return true;
  if (s.medium && !s.medium.includes(ctx.medium)) return false;
  if (s.answer) {
    const v = ctx.answers[s.answer.question];
    if (s.answer.equals !== undefined) return v === s.answer.equals;
    if (!isAnswered(v)) return false;
    const str = String(v);
    if (s.answer.in) return s.answer.in.includes(str);
    if (s.answer.notIn) return !s.answer.notIn.includes(str);
  }
  return true;
}

/** Questions in scope of a phase: initial → initial only; detailed → all. */
export function inPhase(q: Question, phase: QuestionnairePhase): boolean {
  return phase === "detailed" || q.phase === "initial";
}

export interface Completeness {
  total: number;
  answered: number;
  percent: number;
  missing: string[];
  bySection: Record<string, { total: number; answered: number }>;
}

/** Share of visible, required questions in scope that are answered. */
export function completeness(tpl: QuestionnaireTemplate, ctx: AnswerContext, phase: QuestionnairePhase): Completeness {
  const bySection: Completeness["bySection"] = {};
  const missing: string[] = [];
  let total = 0;
  let answered = 0;
  for (const s of tpl.sections) {
    const sec = { total: 0, answered: 0 };
    for (const q of s.questions) {
      if (!q.required || !inPhase(q, phase) || !isVisible(q, ctx)) continue;
      sec.total += 1;
      if (isAnswered(ctx.answers[q.id])) sec.answered += 1;
      else missing.push(q.id);
    }
    bySection[s.id] = sec;
    total += sec.total;
    answered += sec.answered;
  }
  const percent = total === 0 ? 100 : Math.floor((answered / total) * 100);
  return { total, answered, percent, missing, bySection };
}

/** Answers of questions that are not visible are ignored downstream. */
export function visibleAnswers(tpl: QuestionnaireTemplate, ctx: AnswerContext): Answers {
  const out: Answers = {};
  for (const q of allQuestions(tpl)) {
    if (isVisible(q, ctx) && isAnswered(ctx.answers[q.id])) out[q.id] = ctx.answers[q.id];
  }
  return out;
}
