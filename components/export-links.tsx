import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";

/** Download links of the "Design Basis & Safety Review" export (SPEC §8). */
export async function ExportLinks({ projectId }: { projectId: string }) {
  const t = await getTranslations("export");
  const formats = [
    ["pdf", "PDF"],
    ["md", "Markdown"],
    ["xlsx", "XLSX"],
  ] as const;
  return (
    <Card data-testid="export-card">
      <CardTitle>{t("title")}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap gap-3">
        {formats.map(([f, label]) => (
          <a
            key={f}
            href={`/projects/${projectId}/export/${f}`}
            download
            data-testid={`export-${f}`}
            className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            {t("download", { format: label })}
          </a>
        ))}
      </div>
    </Card>
  );
}
