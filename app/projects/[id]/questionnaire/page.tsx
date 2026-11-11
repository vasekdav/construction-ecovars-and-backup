import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { QuestionnaireSectionForm } from "@/components/questionnaire/section-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { asLocale } from "@/lib/i18n-helpers";
import { getQuestionnaire } from "@/lib/questionnaire/service";
import { userNames } from "@/lib/workflow/queries";
import { advancePhaseAction, saveQuestionnaireAction } from "../../questionnaire-actions";

export default async function QuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("project.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const view = await getQuestionnaire(db, id);
  if (!view) notFound();
  const locale = asLocale(await getLocale());
  const [t, tMedium, format, names] = await Promise.all([
    getTranslations("questionnaire"),
    getTranslations("medium"),
    getFormatter(),
    userNames(db, [view.updatedBy]),
  ]);
  const mayWrite = can(user.roles, "questionnaire.write") && !view.stepClosed;
  const { project, template } = view;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${project.id}`} className="text-sm text-primary underline">
          ← {project.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {t("step")}: {template.title[locale]}
          </h1>
          <Badge data-testid="questionnaire-phase">{t(view.phase === "INITIAL" ? "phaseINITIAL" : "phaseDETAILED")}</Badge>
          <Link href={`/projects/${project.id}/design-basis`} className="ml-auto text-sm text-primary underline">
            {t("openDesignBasis")}
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("medium", { medium: tMedium(project.medium) })} · {template.key}@{template.version}
          {view.updatedAt &&
            ` · ${t("lastSaved", {
              date: format.dateTime(view.updatedAt, { dateStyle: "short", timeStyle: "short" }),
              name: (view.updatedBy && names.get(view.updatedBy)) || "—",
            })}`}
        </p>
      </div>

      <Alert tone="warning">{t("fictitious")}</Alert>
      {view.stepClosed && <Alert tone="success">{t("frozen")}</Alert>}
      {!view.stepClosed && !can(user.roles, "questionnaire.write") && <Alert>{t("readOnly")}</Alert>}

      <Card className="space-y-4">
        <Progress value={view.initial.percent} label={t("initialProgress")} testId="progress-initial" />
        <Progress value={view.detailed.percent} label={t("detailedProgress")} testId="progress-detailed" />
        {view.detailed.missing.length > 0 && (
          <p className="text-xs text-muted-foreground">{t("missing", { count: view.detailed.missing.length })}</p>
        )}
        {mayWrite && view.phase === "INITIAL" && (
          <div>
            <ActionForm action={advancePhaseAction} submitLabel={t("advance")} variant="outline" successText="" testId="advance-phase">
              <input type="hidden" name="projectId" value={project.id} />
            </ActionForm>
            <p className="mt-1 text-xs text-muted-foreground">{t("advanceHint")}</p>
          </div>
        )}
      </Card>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="sections">
        {template.sections.map((s) => {
          const sec = (view.phase === "INITIAL" ? view.initial : view.detailed).bySection[s.id];
          return (
            <a key={s.id} href={`#section-${s.id}`} className="rounded border border-border bg-card px-2 py-1 hover:bg-muted">
              {s.title[locale]}{" "}
              {sec && sec.total > 0 && (
                <span className={sec.answered === sec.total ? "text-go" : "text-muted-foreground"}>
                  ({sec.answered}/{sec.total})
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {template.sections.map((s) => (
        <Card key={s.id} id={`section-${s.id}`}>
          <CardTitle>{s.title[locale]}</CardTitle>
          <QuestionnaireSectionForm
            projectId={project.id}
            section={s}
            medium={project.medium}
            answers={view.answers}
            locale={locale}
            readOnly={!mayWrite}
            action={saveQuestionnaireAction}
          />
        </Card>
      ))}
    </div>
  );
}
