import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/action-form";
import { DecisionSupportBanner } from "@/components/decision-support-banner";
import { QuestionnaireSectionForm } from "@/components/questionnaire/section-form";
import { StageStateBadge } from "@/components/stage-state-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, Textarea } from "@/components/ui/select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { LAYOUT_GEOMETRY_FORM } from "@/lib/forms";
import { asLocale, type AppLocale } from "@/lib/i18n-helpers";
import type { Answers } from "@/lib/questionnaire/answers";
import { completeness } from "@/lib/questionnaire/completeness";
import type { ConditionResult } from "@/lib/workflow/gate";
import { canConfirmCheck, canEditStage, canManageStage, canTransition } from "@/lib/workflow/permissions";
import { getStageDetail, listActiveUsers } from "@/lib/workflow/queries";
import { isSharePointUrl } from "@/lib/workflow/schemas";
import { availableTransitions } from "@/lib/workflow/state-machine";
import { documentKindTitle, type GateCondition, type ProcessTemplate } from "@/lib/workflow/template";
import { DECISION_OUTCOMES, type Transition } from "@/lib/workflow/types";
import {
  addCommentAction,
  addDocumentLinkAction,
  addLayoutVersionAction,
  addTaskAction,
  confirmCheckAction,
  recordDecisionAction,
  removeDocumentLinkAction,
  setTaskDoneAction,
  stageSettingsAction,
  transitionAction,
} from "../../../actions";
import { saveLayoutGeometryAction } from "../../../safety-actions";

const REASON_TRANSITIONS: readonly Transition[] = ["block", "reopen", "return"];

type T = Awaited<ReturnType<typeof getTranslations>>;

function conditionLabel(c: GateCondition, tpl: ProcessTemplate, locale: AppLocale, tGate: T): string {
  switch (c.type) {
    case "documentLinks": {
      const kinds = c.kinds.map((k) => documentKindTitle(tpl, k, locale)).join(", ");
      const extra = [c.requireVersion && tGate("withVersion"), c.requireDate && tGate("withDate")].filter(Boolean).join(", ");
      return tGate("docs", { kinds }) + (extra ? ` (${extra})` : "");
    }
    case "layoutVersion":
      return c.which === "concept" ? tGate("layoutConcept") : tGate("layoutFinal");
    default:
      return c.label[locale];
  }
}

function failureText(r: ConditionResult, tpl: ProcessTemplate, locale: AppLocale, tGate: T): string {
  if (!r.failure) return "";
  const details = (r.details ?? []).map((d) => documentKindTitle(tpl, d, locale)).join(", ");
  return tGate(`failure.${r.failure}`, { details });
}

function Hidden({ projectId, stageId }: { projectId: string; stageId: string }) {
  return (
    <>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="stageId" value={stageId} />
    </>
  );
}

export default async function StagePage({ params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  const user = await requirePermission("project.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const d = await getStageDetail(db, id, key);
  if (!d || !d.stage.enabled) notFound();
  const { project, tpl, def, stage, gate, names } = d;
  const locale = asLocale(await getLocale());
  const [t, tGate, tTr, tRoles, tCommon, tOutcome, tProjects, tQ, tGeo, tSafety, tSizing, format, users] = await Promise.all([
    getTranslations("stage"),
    getTranslations("gate"),
    getTranslations("transitions"),
    getTranslations("roles"),
    getTranslations("common"),
    getTranslations("outcome"),
    getTranslations("projects"),
    getTranslations("questionnaire"),
    getTranslations("geometry"),
    getTranslations("safety"),
    getTranslations("sizing"),
    getFormatter(),
    listActiveUsers(db),
  ]);
  const fmtDate = (v: string | Date | null) => (v ? format.dateTime(new Date(v), { dateStyle: "medium" }) : "—");
  const fmtDateTime = (v: string | Date) => format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "short" });

  const editable = canEditStage(user.roles, def, stage.state);
  const transitions = availableTransitions(stage.state).filter((tr) => canTransition(user.roles, def, tr));
  const hid = { projectId: project.id, stageId: stage.id };
  const docKinds = [
    ...new Set([...def.gate.flatMap((g) => (g.type === "documentLinks" ? g.kinds : [])), ...tpl.documentKinds.map((k) => k.key)]),
  ];
  const hasDecision = def.gate.some((g) => g.type === "decisionRecorded");
  const hasRules = def.gate.some((g) => g.type === "rulesNoNoGo" || g.type === "standardsVerified");
  // Geometry inputs belong to v0 (step 3) or to the latest final version (step 9).
  const geometryLayout = def.layout
    ? def.layout === "concept"
      ? d.layouts.find((l) => l.version === 0)
      : [...d.layouts].filter((l) => l.version >= 1).pop()
    : undefined;
  const geometryAnswers = (geometryLayout?.geometry as Answers | null) ?? {};
  const geometryMissing = geometryLayout
    ? completeness(LAYOUT_GEOMETRY_FORM, { medium: project.medium, answers: geometryAnswers }, "detailed").missing.length
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${project.id}`} className="text-sm text-primary underline">
          ← {project.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold" data-testid="stage-title">
            {def.number ? `${tProjects("step")} ${def.number}` : def.key}: {def.title[locale]}
          </h1>
          <span data-testid="stage-state">
            <StageStateBadge state={stage.state} />
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {tProjects("ownerRoles")}: {def.ownerRoles.map((r) => tRoles(r)).join(", ")} · {tProjects("responsible")}:{" "}
          {stage.ownerUserId ? names.get(stage.ownerUserId) : "—"} · {tProjects("due")}: {fmtDate(stage.dueDate)}
          {def.dependsOn.length > 0 && ` · ${t("dependsOn")}: ${def.dependsOn.join(", ")}`}
        </p>
      </div>

      {hasRules && (
        <div className="space-y-2">
          <DecisionSupportBanner />
          <Link href={`/projects/${project.id}/safety`} className="text-sm font-medium text-primary underline">
            {tSafety("title")} →
          </Link>
        </div>
      )}

      {stage.state === "CLOSED" && (
        <Alert tone="success">
          {stage.gatePassedBy && stage.gatePassedAt
            ? t("gatePassedBy", { name: names.get(stage.gatePassedBy) ?? "", date: fmtDateTime(stage.gatePassedAt) })
            : null}{" "}
          {t("frozen")}
        </Alert>
      )}
      {stage.state === "BLOCKED" && (
        <Alert tone="error">
          {t("blockedReason")}: {stage.blockedReason}
        </Alert>
      )}

      <Card>
        <CardTitle>{t("definitionOfDone")}</CardTitle>
        <p className="text-sm">{def.definitionOfDone[locale]}</p>
        {def.gate.some((g) => g.type === "sizingResultRecorded") && (
          <Link href={`/projects/${project.id}/sizing`} className="mt-3 mr-4 inline-block text-sm font-medium text-primary underline">
            {tSizing("open")} →
          </Link>
        )}
        {def.gate.some((g) => g.type === "questionnaireComplete") && (
          <Link href={`/projects/${project.id}/questionnaire`} className="mt-3 inline-block text-sm font-medium text-primary underline">
            {tQ("title")} →
          </Link>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="gate-card">
          <CardTitle>{tGate("title")}</CardTitle>
          <Alert tone={gate.passed ? "success" : "warning"} className="mb-4" data-testid="gate-status">
            {gate.passed ? tGate("passed") : tGate("notPassed")}
          </Alert>
          <ul className="space-y-3">
            {def.gate.map((c, i) => {
              const r = gate.results[i]!;
              const confirmed = c.type === "manualCheck" ? stage.manualChecks[c.id] : undefined;
              return (
                <li key={c.id} className="flex gap-2 text-sm" data-testid={`gate-${c.id}`} data-met={r.met}>
                  <span aria-hidden className={r.met ? "text-go" : "text-nogo"}>
                    {r.met ? "✔" : "✘"}
                  </span>
                  <div className="flex-1 space-y-1">
                    <div>{conditionLabel(c, tpl, locale, tGate)}</div>
                    {!r.met && <div className="text-xs text-nogo">{failureText(r, tpl, locale, tGate)}</div>}
                    {c.type === "manualCheck" && (
                      <div className="text-xs text-muted-foreground">
                        {confirmed
                          ? tGate("confirmedBy", { name: names.get(confirmed.by) ?? "", date: fmtDateTime(confirmed.at) })
                          : tGate("confirmRoles", { roles: c.roles.map((x) => tRoles(x)).join(", ") })}
                      </div>
                    )}
                    {c.type === "manualCheck" && canConfirmCheck(user.roles, c, stage.state) && (
                      <ActionForm
                        action={confirmCheckAction}
                        submitLabel={confirmed ? tGate("revoke") : tGate("confirm")}
                        variant={confirmed ? "outline" : "default"}
                        successText=""
                      >
                        <Hidden {...hid} />
                        <input type="hidden" name="checkId" value={c.id} />
                        <input type="hidden" name="confirmed" value={String(!confirmed)} />
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardTitle>{t("actions")}</CardTitle>
          {d.unmetDependencies.length > 0 && (
            <Alert tone="warning" className="mb-3">
              {t("unmetDeps", { keys: d.unmetDependencies.join(", ") })}
            </Alert>
          )}
          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noActions")}</p>
          ) : (
            <div className="space-y-4">
              {transitions.map((tr) => (
                <ActionForm
                  key={tr}
                  action={transitionAction}
                  submitLabel={tTr(tr)}
                  variant={tr === "block" ? "destructive" : tr === "close" ? "default" : "outline"}
                  successText=""
                  testId={`transition-${tr}`}
                >
                  <Hidden {...hid} />
                  <input type="hidden" name="transition" value={tr} />
                  {REASON_TRANSITIONS.includes(tr) && (
                    <div className="space-y-1">
                      <Label htmlFor={`reason-${tr}`}>{tCommon("reason")}</Label>
                      <Textarea id={`reason-${tr}`} name="reason" rows={2} maxLength={1000} />
                    </div>
                  )}
                </ActionForm>
              ))}
              <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>{t("tasks")}</CardTitle>
        {d.tasks.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">{t("noTasks")}</p>
        ) : (
          <ul className="mb-4 space-y-2" data-testid="tasks">
            {d.tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className={task.done ? "text-go" : "text-muted-foreground"} aria-hidden>
                  {task.done ? "☑" : "☐"}
                </span>
                <span className={task.done ? "line-through" : ""}>{task.title}</span>
                <span className="text-xs text-muted-foreground">
                  {task.assigneeUserId ? names.get(task.assigneeUserId) : ""} {task.dueDate ? `· ${fmtDate(task.dueDate)}` : ""}
                </span>
                {editable && (
                  <ActionForm
                    action={setTaskDoneAction}
                    submitLabel={task.done ? t("markOpen") : t("markDone")}
                    variant="outline"
                    successText=""
                    className="ml-auto"
                  >
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="done" value={String(!task.done)} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <ActionForm action={addTaskAction} submitLabel={tCommon("add")} successText="" testId="add-task-form">
            <Hidden {...hid} />
            <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
              <div className="space-y-1">
                <Label htmlFor="task-title">{t("taskTitle")}</Label>
                <Input id="task-title" name="title" required maxLength={300} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-assignee">{t("assignee")}</Label>
                <Select id="task-assignee" name="assigneeUserId" defaultValue="">
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="task-due">{t("dueDate")}</Label>
                <Input id="task-due" name="dueDate" type="date" />
              </div>
            </div>
          </ActionForm>
        )}
      </Card>

      <Card>
        <CardTitle>{t("documents")}</CardTitle>
        <p className="mb-3 text-xs text-muted-foreground">{t("documentsHint")}</p>
        {d.links.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">{t("noDocuments")}</p>
        ) : (
          <Table className="mb-4" data-testid="links-table">
            <THead>
              <Tr>
                <Th>{t("kind")}</Th>
                <Th>{t("docTitle")}</Th>
                <Th>{t("version")}</Th>
                <Th>{t("documentDate")}</Th>
                <Th>{t("author")}</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {d.links.map((l) => (
                <Tr key={l.id}>
                  <Td>{documentKindTitle(tpl, l.kind, locale)}</Td>
                  <Td>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      {l.title}
                    </a>
                    {!isSharePointUrl(l.url) && (
                      <Badge variant="warning" className="ml-2">
                        {t("notSharePoint")}
                      </Badge>
                    )}
                  </Td>
                  <Td>{l.version ?? "—"}</Td>
                  <Td>{fmtDate(l.documentDate)}</Td>
                  <Td>{l.author ?? "—"}</Td>
                  <Td>
                    {editable && (
                      <ActionForm action={removeDocumentLinkAction} submitLabel={tCommon("remove")} variant="ghost" successText="">
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="linkId" value={l.id} />
                      </ActionForm>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {editable && (
          <ActionForm action={addDocumentLinkAction} submitLabel={tCommon("add")} successText="" testId="add-link-form">
            <Hidden {...hid} />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="link-kind">{t("kind")}</Label>
                <Select id="link-kind" name="kind" defaultValue={docKinds[0]}>
                  {docKinds.map((k) => (
                    <option key={k} value={k}>
                      {documentKindTitle(tpl, k, locale)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="link-title">{t("docTitle")}</Label>
                <Input id="link-title" name="title" required maxLength={200} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="link-url">{t("url")}</Label>
                <Input id="link-url" name="url" type="url" required pattern="https://.*" placeholder="https://….sharepoint.com/…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="link-version">{t("version")}</Label>
                <Input id="link-version" name="version" maxLength={60} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="link-date">{t("documentDate")}</Label>
                <Input id="link-date" name="documentDate" type="date" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="link-author">{t("author")}</Label>
                <Input id="link-author" name="author" maxLength={120} />
              </div>
            </div>
          </ActionForm>
        )}
      </Card>

      {def.layout && (
        <Card>
          <CardTitle>{t("layout")}</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">{t("layoutHint")}</p>
          {d.layouts.length === 0 ? (
            <p className="mb-4 text-sm text-muted-foreground">{t("noLayouts")}</p>
          ) : (
            <ul className="mb-4 space-y-1 text-sm" data-testid="layouts">
              {d.layouts.map((l) => (
                <li key={l.id}>
                  <span className="font-semibold">v{l.version}</span> · {l.label} ·{" "}
                  {l.drawingUrl ? (
                    <a href={l.drawingUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      {t("drawingUrl")}
                    </a>
                  ) : (
                    "—"
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && (def.layout === "final" || !d.layouts.some((l) => l.version === 0)) && (
            <ActionForm
              action={addLayoutVersionAction}
              submitLabel={def.layout === "concept" ? t("addLayoutConcept") : t("addLayoutFinal")}
              successText=""
              testId="add-layout-form"
            >
              <Hidden {...hid} />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="layout-label">{t("layoutLabel")}</Label>
                  <Input id="layout-label" name="label" required maxLength={160} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="layout-url">{t("drawingUrl")}</Label>
                  <Input id="layout-url" name="drawingUrl" type="url" pattern="https://.*" />
                </div>
              </div>
            </ActionForm>
          )}
        </Card>
      )}

      {def.layout && (
        <Card data-testid="geometry-card">
          <CardTitle>{geometryLayout ? tGeo("title", { version: geometryLayout.version }) : tGeo("title", { version: def.layout === "concept" ? 0 : "N" })}</CardTitle>
          {!geometryLayout ? (
            <p className="text-sm text-muted-foreground">{tGeo("none")}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{tGeo("description")}</p>
              {geometryMissing > 0 && <Alert tone="warning">{tGeo("missing", { count: geometryMissing })}</Alert>}
              {LAYOUT_GEOMETRY_FORM.sections.map((sec) => (
                <details key={sec.id} className="rounded border border-border p-3" open={sec.id === "distances"}>
                  <summary className="cursor-pointer font-medium">{sec.title[locale]}</summary>
                  <div className="mt-3">
                    <QuestionnaireSectionForm
                      projectId={project.id}
                      section={sec}
                      medium={project.medium}
                      answers={geometryAnswers}
                      locale={locale}
                      readOnly={!editable}
                      action={saveLayoutGeometryAction}
                      hidden={{ version: String(geometryLayout.version) }}
                    />
                  </div>
                </details>
              ))}
            </div>
          )}
        </Card>
      )}

      {hasDecision && (
        <Card>
          <CardTitle>{t("decisions")}</CardTitle>
          {d.decisions.length === 0 ? (
            <p className="mb-4 text-sm text-muted-foreground">{t("noDecisions")}</p>
          ) : (
            <ul className="mb-4 space-y-2 text-sm" data-testid="decisions">
              {d.decisions.map((dec) => (
                <li key={dec.id}>
                  <span className="font-semibold">{dec.subject}</span>: <Badge>{tOutcome(dec.outcome)}</Badge> – {dec.rationale}
                  <div className="text-xs text-muted-foreground">
                    {names.get(dec.decidedBy)} · {fmtDateTime(dec.decidedAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <ActionForm action={recordDecisionAction} submitLabel={t("record")} successText="" testId="decision-form">
              <Hidden {...hid} />
              <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
                <div className="space-y-1">
                  <Label htmlFor="dec-subject">{t("subject")}</Label>
                  <Input id="dec-subject" name="subject" required maxLength={200} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dec-outcome">{t("outcome")}</Label>
                  <Select id="dec-outcome" name="outcome" defaultValue="DEFERRED">
                    {DECISION_OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {tOutcome(o)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dec-rationale">{t("rationale")}</Label>
                <Textarea id="dec-rationale" name="rationale" required maxLength={4000} />
              </div>
            </ActionForm>
          )}
        </Card>
      )}

      {canManageStage(user.roles) && stage.state !== "CLOSED" && (
        <Card>
          <CardTitle>{t("settings")}</CardTitle>
          <ActionForm action={stageSettingsAction} submitLabel={tCommon("save")} resetOnSuccess={false} testId="stage-settings-form">
            <Hidden {...hid} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="st-owner">{tProjects("responsible")}</Label>
                <Select id="st-owner" name="ownerUserId" defaultValue={stage.ownerUserId ?? ""}>
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-due">{tProjects("due")}</Label>
                <Input id="st-due" name="dueDate" type="date" defaultValue={stage.dueDate ?? ""} />
              </div>
            </div>
          </ActionForm>
        </Card>
      )}

      <Card>
        <CardTitle>{t("comments")}</CardTitle>
        {d.comments.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">{t("noComments")}</p>
        ) : (
          <ul className="mb-4 space-y-3 text-sm" data-testid="comments">
            {d.comments.map((c) => (
              <li key={c.id}>
                <div className="text-xs text-muted-foreground">
                  {names.get(c.authorUserId)} · {fmtDateTime(c.createdAt)}
                </div>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addCommentAction} submitLabel={t("send")} successText="" testId="comment-form">
          <Hidden {...hid} />
          <Label htmlFor="comment-body" className="sr-only">
            {t("comment")}
          </Label>
          <Textarea id="comment-body" name="body" required maxLength={4000} />
        </ActionForm>
      </Card>

      <Card>
        <CardTitle>{t("history")}</CardTitle>
        {d.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="history">
            {d.history.map((h) => (
              <li key={h.id}>
                <span className="text-muted-foreground">{fmtDateTime(h.occurredAt)}</span> ·{" "}
                {h.actorUserId ? names.get(h.actorUserId) : "—"} · <code>{h.action}</code>
                {h.reason && <span> · „{h.reason}“</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
