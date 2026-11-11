import { getLocale } from "next-intl/server";
import { getDb } from "@/db/client";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/auth/rbac";
import { getCurrentUser, logForbidden } from "@/lib/auth/session";
import { renderMarkdown } from "@/lib/export/markdown";
import { renderPdf } from "@/lib/export/pdf";
import { buildReport } from "@/lib/export/report";
import { renderXlsx } from "@/lib/export/xlsx";
import { exportLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = {
  md: { type: "text/markdown; charset=utf-8", ext: "md" },
  pdf: { type: "application/pdf", ext: "pdf" },
  xlsx: { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
} as const;
type Format = keyof typeof FORMATS;

function slug(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "projekt"
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.roles, "project.read")) {
    await logForbidden(user.id, "project.read", undefined);
    return new Response("Forbidden", { status: 403 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(format in FORMATS)) return new Response("Not found", { status: 404 });
  if (!exportLimiter.consume(user.id).allowed) return new Response("Too Many Requests", { status: 429 });

  const db = await getDb();
  const locale = (await getLocale()) === "en" ? "en" : "cs";
  const model = await buildReport(db, id, user, locale);
  if (!model) return new Response("Not found", { status: 404 });

  const f = FORMATS[format as Format];
  const body: Buffer | string =
    format === "md" ? renderMarkdown(model) : format === "pdf" ? await renderPdf(model) : await renderXlsx(model);

  await writeAudit(db, {
    actorUserId: user.id,
    action: "export.generate",
    entityType: "export",
    entityId: model.meta.reportId,
    projectId: id,
    after: {
      format,
      appVersion: model.meta.appVersion,
      rules: model.safety.rules.map((r) => `${r.id}@${r.version}:${r.result}${r.overridden ? ":override" : ""}`),
      overrides: model.overrides.length,
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `design-basis-safety-review-${slug(model.project.name)}-${date}.${f.ext}`;
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": f.type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
