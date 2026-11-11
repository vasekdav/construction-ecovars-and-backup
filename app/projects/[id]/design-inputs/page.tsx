import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { QuestionnaireSectionForm } from "@/components/questionnaire/section-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { projects, stages } from "@/db/schema";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { DESIGN_CHECKLIST_FORM } from "@/lib/forms";
import { asLocale } from "@/lib/i18n-helpers";
import { getDesignInputs } from "@/lib/safety/project";
import { saveDesignInputsAction } from "../../safety-actions";

export default async function DesignInputsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("project.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();
  const [s4] = await db.select({ state: stages.state }).from(stages).where(and(eq(stages.projectId, id), eq(stages.key, "4")));
  const row = await getDesignInputs(db, id);
  const locale = asLocale(await getLocale());
  const [t, tSafety] = await Promise.all([getTranslations("design"), getTranslations("safety")]);
  const frozen = s4?.state === "CLOSED";
  const mayWrite = can(user.roles, "design.write") && !frozen;
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-primary underline">
          ← {project.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <Link href={`/projects/${id}/safety`} className="ml-auto text-sm text-primary underline">
            {tSafety("title")} →
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {frozen && <Alert tone="success">{t("frozen")}</Alert>}
      {!frozen && !mayWrite && <Alert>{t("readOnly")}</Alert>}
      {DESIGN_CHECKLIST_FORM.sections.map((s) => (
        <Card key={s.id}>
          <CardTitle>{s.title[locale]}</CardTitle>
          <QuestionnaireSectionForm
            projectId={id}
            section={s}
            medium={project.medium}
            answers={row?.answers ?? {}}
            locale={locale}
            readOnly={!mayWrite}
            action={saveDesignInputsAction}
          />
        </Card>
      ))}
    </div>
  );
}
