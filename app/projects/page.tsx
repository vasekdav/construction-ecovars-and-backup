import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { StageTimeline } from "@/components/stage-timeline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { asLocale } from "@/lib/i18n-helpers";
import { listProjects } from "@/lib/workflow/queries";
import { getTemplate, stageTemplate } from "@/lib/workflow/template";

export default async function ProjectsPage() {
  const user = await requirePermission("project.read");
  const locale = asLocale(await getLocale());
  const [t, tHome, tRoles, tMedium, tStatus, projects] = await Promise.all([
    getTranslations("projects"),
    getTranslations("home"),
    getTranslations("roles"),
    getTranslations("medium"),
    getTranslations("projectStatus"),
    listProjects(await getDb()),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <span className="text-sm text-muted-foreground">
          {tHome("welcome", { name: user.name })} · {user.roles.map((r) => tRoles(r)).join(", ") || tHome("noRoles")}
        </span>
        {can(user.roles, "project.create") && (
          <Link
            href="/projects/new"
            className="ml-auto inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("new")}
          </Link>
        )}
      </div>
      <Card>
        {projects.length === 0 ? (
          <p className="text-sm">{t("empty")}</p>
        ) : (
          <Table data-testid="projects-table">
            <THead>
              <Tr>
                <Th>{t("name")}</Th>
                <Th>{t("customer")}</Th>
                <Th>{t("medium")}</Th>
                <Th>{t("owner")}</Th>
                <Th>{t("steps")}</Th>
              </Tr>
            </THead>
            <TBody>
              {projects.map((p) => {
                const tpl = getTemplate(p.templateKey, p.templateVersion);
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                        {p.name}
                      </Link>
                      {p.status !== "ACTIVE" && <Badge className="ml-2">{tStatus(p.status)}</Badge>}
                    </Td>
                    <Td>
                      {p.customer}
                      <div className="text-xs text-muted-foreground">{p.location}</div>
                    </Td>
                    <Td>{tMedium(p.medium)}</Td>
                    <Td>{p.ownerName}</Td>
                    <Td>
                      <StageTimeline
                        compact
                        projectId={p.id}
                        stages={p.stages.map((s) => ({ key: s.key, state: s.state, title: stageTemplate(tpl, s.key).title[locale] }))}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
