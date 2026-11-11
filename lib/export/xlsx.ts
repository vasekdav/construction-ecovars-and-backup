import ExcelJS from "exceljs";
import { LABELS } from "./labels";
import type { ReportModel } from "./report";

const RED_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } };
const RED_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFB91C1C" }, bold: true };
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C4A6E" } };

function sheetTable(ws: ExcelJS.Worksheet, head: string[], rows: (string | number)[][], widths: number[]) {
  const h = ws.addRow(head);
  h.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEAD_FILL;
  });
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col, i) => {
    col.width = widths[i] ?? 20;
    col.alignment = { wrapText: true, vertical: "top" };
  });
  return h.number;
}

/** XLSX with the rule table (SPEC §8) plus summary, overrides, Design Basis and standards. */
export async function renderXlsx(m: ReportModel): Promise<Buffer> {
  const L = LABELS[m.meta.locale];
  const wb = new ExcelJS.Workbook();
  wb.creator = "Backup Station Project Hub";
  wb.created = new Date();

  // Summary
  const s = wb.addWorksheet(L.summary);
  s.addRow([m.meta.title]).font = { bold: true, size: 14 };
  const disc = s.addRow([m.meta.disclaimer]);
  disc.font = RED_FONT;
  s.addRow([m.meta.fictitious]);
  s.addRow([]);
  const kv: [string, string | number][] = [
    [L.meta.report, m.meta.reportId],
    [L.meta.appVersion, m.meta.appVersion],
    [L.meta.commit, m.meta.commit ?? "—"],
    [L.meta.generatedAt, m.meta.generatedAt],
    [L.meta.generatedBy, m.meta.generatedBy],
    [L.projectFields.name, m.project.name],
    [L.projectFields.customer, m.project.customer],
    [L.projectFields.location, m.project.location],
    [L.projectFields.medium, m.project.medium],
    [L.projectFields.owner, m.project.owner],
    [L.questionnaire, `${m.questionnaire.phase} · ${m.questionnaire.initialPercent} % / ${m.questionnaire.detailedPercent} %`],
    [L.conservative, m.autonomy.conservative],
    [L.informative, m.autonomy.informative],
    [L.required, m.autonomy.required],
    [L.verdict, m.autonomy.verdict],
    [L.config, `${m.autonomy.config} · ${m.autonomy.configStatus}`],
    ...m.safety.counts.map((c) => [c.label, c.value] as [string, number]),
  ];
  for (const [k, v] of kv) s.addRow([k, v]).getCell(1).font = { bold: true };
  s.getColumn(1).width = 34;
  s.getColumn(2).width = 70;

  // Rules (the main table)
  const r = wb.addWorksheet(L.safety);
  const headRow = sheetTable(
    r,
    [L.rule, L.item, L.result, "Override", L.ruleStatus, L.version, L.severity, L.stagesCol, L.inputs, L.params, L.source, L.condition, L.message, L.remediation, L.fingerprint],
    m.safety.rules.map((x) => [
      x.id,
      x.title,
      x.resultLabel,
      x.overridden ? "ANO / YES" : "",
      x.status,
      x.version,
      x.severity,
      x.stages,
      x.inputs.map((i) => `${i.key} = ${i.value}`).join("\n"),
      x.params.map((p) => `${p.key} = ${p.value}`).join("\n") || "—",
      x.source,
      x.condition,
      x.message,
      x.remediation,
      x.fingerprint,
    ]),
    [12, 30, 16, 10, 12, 8, 12, 10, 40, 30, 30, 50, 50, 40, 14],
  );
  m.safety.rules.forEach((x, i) => {
    if (!x.overridden) return;
    const row = r.getRow(headRow + 1 + i);
    row.eachCell((c) => {
      c.fill = RED_FILL;
      c.font = RED_FONT;
    });
  });
  r.views = [{ state: "frozen", ySplit: headRow }];
  r.autoFilter = { from: { row: headRow, column: 1 }, to: { row: headRow, column: 15 } };

  // Overrides (all red)
  const o = wb.addWorksheet(L.overrides);
  const oh = sheetTable(
    o,
    [L.rule, L.version, L.status, L.reason, L.by, L.revokedCol],
    m.overrides.map((x) => [x.ruleId, x.ruleVersion, x.stateLabel, x.reason, `${x.by}, ${x.at}`, x.revoked ?? "—"]),
    [12, 8, 10, 60, 30, 40],
  );
  for (let i = 0; i < m.overrides.length; i++) {
    o.getRow(oh + 1 + i).eachCell((c) => {
      c.font = RED_FONT;
      if (m.overrides[i]!.state === "applied") c.fill = RED_FILL;
    });
  }

  // Design Basis
  const d = wb.addWorksheet(L.designBasis);
  sheetTable(d, [L.item, "key", L.value, L.si, L.source], m.designBasis.map((x) => [x.label, x.key, x.value, x.si, x.source]), [40, 20, 30, 24, 30]);

  // Steps
  const st = wb.addWorksheet(L.steps);
  sheetTable(st, [L.step, L.item, L.state, L.gate], m.steps.map((x) => [x.key, x.title, x.stateLabel, x.gate]), [8, 45, 16, 30]);

  // Standards
  const sd = wb.addWorksheet(L.standards);
  sheetTable(sd, [L.code, L.item, L.revision, L.status], m.standards.map((x) => [x.code, x.title, x.revision, x.status]), [30, 50, 16, 12]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
