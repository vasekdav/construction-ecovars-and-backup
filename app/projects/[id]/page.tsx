import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { StageStateBadge } from "@/components/stage-state-badge";
import { StageTimeline } from "@/components/stage-timeline";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { WaitingText } from "@/components/waiting-text";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { asLocale } from "@/lib/i18n-helpers";
import { canManageStage } from "@/lib/workflow/permissions";
import { getQuestionnaire } from "@/lib/questionnaire/service";
import { getProjectOverview } from "@/lib/workflow/queries";
import { appliesToMedium } from "@/lib/workflow/template";
import { stageEnabledAction } from "../actions";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("project.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const data = await getProjectOverview(db, id);
  if (!data) notFound();
  const questionnaire = await getQuestionnaire(db, id);
  const { project, stages, deadlines, names } = data;
  const locale = asLocale(await getLocale());
  const [t, tMedium, tStatus, tRoles, tQ, format] = await Promise.all([
    getTranslations("projects"),
    getTranslations("medium"),
    getTranslations("projectStatus"),
    getTranslations("roles"),
    getTranslations("questionnaire"),
    getFormatter(),
  ]);
  const enabled = stages.filter((s) => s.enabled);
  const optional = stages.filter((s) => s.def.optional);
  const active = enabled.filter((s) => s.state !== "CLOSED");
  const mayManage = canManageStage(user.roles);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-primary underline">
          ← {t("title")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold" data-testid="project-name">
          {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {project.customer} · {project.location} · {tMedium(project.medium)} · {t("owner")}: {names.get(project.ownerUserId)} ·{" "}
          {tStatus(project.status)}
        </p>
      </div>

      <Card>
        <StageTimeline
          projectId={project.id}
          stages={enabled.map((s) => ({ key: s.key, state: s.state, title: s.def.title[locale] }))}
        />
      </Card>

      <Card className="flex flex-wrap items-center gap-4" data-testid="questionnaire-card">
        <Link href={`/projects/${project.id}/questionnaire`} className="font-semibold text-primary underline">
          {tQ("step")}: {tQ("title")}
        </Link>
        <span className="text-sm text-muted-foreground">
          {tQ(questionnaire?.phase === "DETAILED" ? "phaseDETAILED" : "phaseINITIAL")} · {tQ("initialProgress")}{" "}
          {questionnaire?.initial.percent ?? 0} % · {tQ("detailedProgress")} {questionnaire?.detailed.percent ?? 0} %
        </span>
        <Link href={`/projects/${project.id}/design-basis`} className="ml-auto text-sm text-primary underline">
          {tQ("openDesignBasis")}
        </Link>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardTitle>{t("openRisks")}</CardTitle>
          <p className="text-3xl font-semibold text-muted-foreground">—</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("risksPending")}</p>
        </Card>
        <Card>
          <CardTitle>{t("deadlines")}</CardTitle>
          {deadlines.length === 0 ? (
            <p className="text-sm">{t("noDeadlines")}</p>
          ) : (
            <ul className="space-y-1 text-sm" data-testid="deadlines">
              {deadlines.map((d, i) => (
                <li key={i}>
                  <span className="font-medium">{format.dateTime(new Date(d.date), { dateStyle: "medium" })}</span> ·{" "}
                  <Link className="text-primary underline" href={`/projects/${project.id}/stages/${d.stageKey}`}>
                    {d.stageKey}
                  </Link>{" "}
                  {d.kind === "task" ? `${t("task")}: ` : ""}
                  {d.label}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>{t("waiting")}</CardTitle>
          <ul className="space-y-1 text-sm" data-testid="waiting-list">
            {active.map((s) => (
              <li key={s.key}>
                <span className="font-medium">{s.key}</span>: <WaitingText waiting={s.waiting} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardTitle>{t("allSteps")}</CardTitle>
        <Table data-testid="stages-table">
          <THead>
            <Tr>
              <Th>{t("step")}</Th>
              <Th>{t("status")}</Th>
              <Th>{t("ownerRoles")}</Th>
              <Th>{t("responsible")}</Th>
              <Th>{t("due")}</Th>
              <Th>{t("openTasks")}</Th>
              <Th>{t("waiting")}</Th>
            </Tr>
          </THead>
          <TBody>
            {enabled.map((s) => (
              <Tr key={s.key} data-testid={`stage-row-${s.key}`}>
                <Td>
                  <Link className="font-medium text-primary underline-offset-2 hover:underline" href={`/projects/${project.id}/stages/${s.key}`}>
                    {s.key}. {s.def.title[locale]}
                  </Link>
                </Td>
                <Td>
                  <StageStateBadge state={s.state} />
                </Td>
                <Td>{s.def.ownerRoles.map((r) => tRoles(r)).join(", ")}</Td>
                <Td>{s.ownerUserId ? names.get(s.ownerUserId) : "—"}</Td>
                <Td>{s.dueDate ? format.dateTime(new Date(s.dueDate), { dateStyle: "short" }) : "—"}</Td>
                <Td>{s.openTasks || "—"}</Td>
                <Td className="text-muted-foreground">
                  <WaitingText waiting={s.waiting} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardTitle>{t("optionalSteps")}</CardTitle>
        <p className="mb-3 text-xs text-muted-foreground">{t("optionalHint")}</p>
        <ul className="space-y-2">
          {optional.map((s) => {
            const applicable = appliesToMedium(s.def, project.medium);
            return (
              <li key={s.key} className="flex flex-wrap items-center gap-3 text-sm" data-testid={`optional-${s.key}`}>
                <span className="w-10 font-semibold">{s.key}</span>
                <span className="min-w-56 flex-1">
                  {s.enabled ? (
                    <Link className="text-primary underline" href={`/projects/${project.id}/stages/${s.key}`}>
                      {s.def.title[locale]}
                    </Link>
                  ) : (
                    s.def.title[locale]
                  )}
                </span>
                <span className="text-muted-foreground">
                  {!applicable ? t("notApplicable") : s.enabled ? t("enabled") : t("disabled")}
                </span>
                {mayManage && applicable && s.state === "NOT_STARTED" && (
                  <ActionForm action={stageEnabledAction} submitLabel={s.enabled ? t("disable") : t("enable")} variant="outline" successText="">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="stageId" value={s.id} />
                    <input type="hidden" name="enabled" value={String(!s.enabled)} />
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
