"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useSubmit } from "@/components/use-submit";
import { ActionMessage } from "@/components/action-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import type { ActionState } from "@/lib/actions";
import { isQuantity, type AnswerValue, type Answers } from "@/lib/questionnaire/answers";
import { isVisible } from "@/lib/questionnaire/completeness";
import type { Question, Section } from "@/lib/questionnaire/template";
import { unitLabel } from "@/lib/units";
import type { Medium } from "@/lib/workflow/template";

type Locale = "cs" | "en";

/** Number shown in the locale's decimal format (the parser accepts both "," and "."). */
function numberText(n: number, locale: Locale): string {
  return locale === "cs" ? String(n).replace(".", ",") : String(n);
}

function inputText(v: AnswerValue | null | undefined, locale: Locale): string {
  if (v === null || v === undefined) return "";
  if (isQuantity(v)) return numberText(v.input, locale);
  if (typeof v === "number") return numberText(v, locale);
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function Field({
  q,
  value,
  locale,
  error,
  onLiveChange,
}: {
  q: Question;
  value: AnswerValue | null | undefined;
  locale: Locale;
  error?: string;
  onLiveChange: (v: AnswerValue | null) => void;
}) {
  const t = useTranslations("questionnaire");
  const tErr = useTranslations("qerrors");
  const name = `q:${q.id}`;
  const id = `f-${q.id}`;
  const label = (
    <Label htmlFor={id} className="flex flex-wrap items-center gap-2">
      <span>
        {q.label[locale]}
        {q.required && <span className="text-nogo"> *</span>}
      </span>
      {q.phase === "detailed" && <Badge variant="outline">{t("detailedBadge")}</Badge>}
    </Label>
  );
  let control: React.ReactNode;
  switch (q.type) {
    case "textarea":
      control = <Textarea id={id} name={name} defaultValue={inputText(value, locale)} maxLength={4000} rows={3} />;
      break;
    case "number":
      control = <Input id={id} name={name} inputMode="decimal" defaultValue={inputText(value, locale)} />;
      break;
    case "date":
      control = <Input id={id} name={name} type="date" defaultValue={inputText(value, locale)} />;
      break;
    case "url":
      control = <Input id={id} name={name} type="url" pattern="https://.*" defaultValue={inputText(value, locale)} />;
      break;
    case "quantity":
      control = (
        <div className="flex gap-2">
          <Input id={id} name={name} inputMode="decimal" defaultValue={inputText(value, locale)} className="flex-1" />
          <Select
            name={`u:${q.id}`}
            aria-label={`${q.label[locale]} – ${t("unit")}`}
            defaultValue={isQuantity(value) ? value.inputUnit : q.defaultUnit}
            className="w-32"
          >
            {q.units!.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </Select>
        </div>
      );
      break;
    case "select":
      control = (
        <Select id={id} name={name} defaultValue={inputText(value, locale)} onChange={(e) => onLiveChange(e.target.value || null)}>
          <option value="">{t("choose")}</option>
          {q.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label[locale]}
            </option>
          ))}
        </Select>
      );
      break;
    case "multiselect":
      control = (
        <div className="flex flex-wrap gap-x-4 gap-y-1" id={id}>
          <input type="hidden" name={`m:${q.id}`} value="1" />
          {q.options!.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                defaultChecked={Array.isArray(value) && value.includes(o.value)}
              />
              {o.label[locale]}
            </label>
          ))}
        </div>
      );
      break;
    case "boolean": {
      const current = value === true ? "true" : value === false ? "false" : "";
      control = (
        <div className="flex gap-4 text-sm" role="radiogroup" id={id} aria-label={q.label[locale]}>
          {[
            ["true", t("yes")],
            ["false", t("no")],
            ["", t("unset")],
          ].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input
                type="radio"
                name={name}
                value={v}
                defaultChecked={current === v}
                onChange={() => onLiveChange(v === "" ? null : v === "true")}
              />
              {l}
            </label>
          ))}
        </div>
      );
      break;
    }
    default:
      control = <Input id={id} name={name} defaultValue={inputText(value, locale)} maxLength={500} />;
  }
  return (
    <div className="space-y-2" data-testid={`question-${q.id}`}>
      {label}
      {control}
      {q.help && <p className="text-xs text-muted-foreground">{q.help[locale]}</p>}
      {error && (
        <p className="text-xs text-nogo" role="alert">
          {tErr.has(error) ? tErr(error) : error}
        </p>
      )}
    </div>
  );
}

export function QuestionnaireSectionForm({
  projectId,
  section,
  medium,
  answers,
  locale,
  readOnly,
  action,
  hidden = {},
  submitLabel,
  successText,
  locked = {},
}: {
  projectId: string;
  /** One section, or several rendered in one form with headings. */
  section: Section | Section[];
  medium: Medium;
  answers: Answers;
  locale: Locale;
  readOnly: boolean;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  /** Extra hidden fields (e.g. the layout version). */
  hidden?: Record<string, string>;
  submitLabel?: string;
  successText?: string;
  /** Read-only values (e.g. distances derived from the plan): question id → display text. */
  locked?: Record<string, string>;
}) {
  const t = useTranslations("questionnaire");
  const [state, formAction, pending] = useActionState(action, null);
  // Live values of select/boolean answers, so that conditional questions react immediately.
  const [live, setLive] = useState<Answers>(answers);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  const sections = Array.isArray(section) ? section : [section];
  const onSubmit = useSubmit(formAction);
  const testId = Array.isArray(section) ? "multi" : section.id;
  return (
    <form onSubmit={onSubmit} method="post" className="space-y-5" data-testid={`section-form-${testId}`}>
      <input type="hidden" name="projectId" value={projectId} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <fieldset disabled={readOnly || pending} className="space-y-5">
        {sections.map((sec) => (
          <div key={sec.id} className="space-y-5">
            {sections.length > 1 && <h3 className="border-b border-border pb-1 font-semibold">{sec.title[locale]}</h3>}
            {sec.questions
              .filter((q) => isVisible(q, { medium, answers: live }))
              .map((q) =>
                locked[q.id] !== undefined ? (
                  <div key={q.id} className="space-y-1" data-testid={`question-${q.id}`} data-locked="true">
                    <div className="text-sm font-medium">{q.label[locale]}</div>
                    <div className="text-sm">
                      <span className="font-semibold">{locked[q.id]}</span>{" "}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t("fromPlan")}</span>
                    </div>
                  </div>
                ) : (
                <Field
                  key={q.id}
                  q={q}
                  value={answers[q.id]}
                  locale={locale}
                  error={errors?.[q.id]?.[0]}
                  onLiveChange={(v) => setLive((prev) => ({ ...prev, [q.id]: v }))}
                />
                ),
              )}
          </div>
        ))}
      </fieldset>
      {!readOnly && (
        <div className="space-y-2">
          <Button type="submit" size="sm" disabled={pending}>
            {submitLabel ?? t("saveSection")}
          </Button>
          <ActionMessage state={state} successText={successText ?? t("saved")} />
        </div>
      )}
    </form>
  );
}
