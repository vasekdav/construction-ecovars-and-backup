import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/export/markdown";
import { renderPdf } from "@/lib/export/pdf";
import { renderXlsx } from "@/lib/export/xlsx";
import { fixture } from "./fixture";

describe("Markdown export", () => {
  const md = renderMarkdown(fixture());

  it("contains the disclaimer, app version, date, exporting user and project", () => {
    expect(md).toContain("Podpora rozhodování, nenahrazuje inženýrské schválení.");
    expect(md).toContain("| 00000000-0000-4000-8000-000000000001 | 0.1.0 | — | 11.11.26 12:00 | Demo Process Safety |");
    expect(md).toContain("# Design Basis & Safety Review: Demo Zákazník, LOX 20 m³");
  });

  it("lists rules with version, status, source and fingerprint; TBD-VERIFY parameters stay visible", () => {
    expect(md).toContain("R-SD-01 Bezpečné vzdálenosti | NEVYHODNOCENO | DRAFT | 1 | NO-GO | 9 | EIGA Doc 75 · TBD-VERIFY | 0123456789ab");
    expect(md).toContain("| Min. vzdálenost od budov [min_dist_buildings] | TBD-VERIFY |");
    expect(md).toContain("DRAFT nejsou podkladem pro schválení návrhu");
  });

  it("marks overrides in red, including revoked ones", () => {
    expect(md).toContain('<span style="color:#b91c1c">**NO-GO (OVERRIDE)**</span>');
    expect(md).toContain('<span style="color:#b91c1c">**OVERRIDE platí**</span>');
    expect(md).toContain('<span style="color:#b91c1c">**OVERRIDE neplatí (změnila se verze pravidla nebo vstupy)**</span>');
    expect(md).toContain('<span style="color:#b91c1c">**OVERRIDE zrušen**</span>');
    expect(md).toContain("Demo PS, 11.11.26 10:30: zrušeno");
    expect(md).toContain("| R-ACC-01 v1 | Posouzení WARNING | posouzení platí |");
  });

  it("escapes table cells", () => {
    expect(md).toContain("Zpětná armatura \\| napojení");
  });

  it("handles empty sections", () => {
    const empty = renderMarkdown(fixture({ designBasis: [], sizing: null, overrides: [] }));
    expect(empty).toContain("Výsledek sizingu není uložen.");
    expect(empty).toContain("Žádné overridy.");
  });

  it("renders English labels", () => {
    const en = renderMarkdown(fixture({ meta: { ...fixture().meta, locale: "en", disclaimer: "Decision support only, does not replace engineering approval." } }));
    expect(en).toContain('<span style="color:#b91c1c">**NO-GO overrides and WARNING reviews**</span>');
    expect(en).toContain("Decision support only");
  });
});

describe("XLSX export", () => {
  it("has the rule table with overrides highlighted in red and the summary with the disclaimer", async () => {
    const buf = await renderXlsx(fixture());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Souhrn", "Safety Review", "Overridy a posouzení", "Design Basis", "Stav kroků", "Standardy"]);

    const summary = wb.getWorksheet("Souhrn")!;
    expect(summary.getCell("A2").value).toBe("Podpora rozhodování, nenahrazuje inženýrské schválení.");
    const values = summary.getColumn(2).values as unknown[];
    expect(values).toContain("0.1.0");
    expect(values).toContain("Demo Process Safety");

    const rules = wb.getWorksheet("Safety Review")!;
    expect(rules.getCell("A1").value).toBe("Pravidlo");
    expect(rules.getCell("A2").value).toBe("R-CTL-01");
    expect(rules.getCell("D2").value).toBe("ANO / YES");
    expect((rules.getCell("A2").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFDE2E2");
    expect((rules.getCell("A3").fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).not.toBe("FFFDE2E2");
    expect(rules.getCell("J3").value).toBe("min_dist_buildings = TBD-VERIFY");

    const ov = wb.getWorksheet("Overridy a posouzení")!;
    expect(ov.getCell("A2").font?.color?.argb).toBe("FFB91C1C");
    expect(ov.getCell("C2").value).toBe("Override NO-GO");
    expect(ov.getCell("D2").value).toBe("OVERRIDE platí");
    expect(ov.getCell("D3").value).toBe("OVERRIDE zrušen");
    // WARNING reviews are listed but not red
    expect(ov.getCell("C5").value).toBe("Posouzení WARNING");
    expect(ov.getCell("A5").font?.color?.argb).not.toBe("FFB91C1C");
    expect((ov.getCell("A2").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFDE2E2");
    expect((ov.getCell("A4").fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).not.toBe("FFFDE2E2");
    expect(ov.getCell("A4").font?.color?.argb).toBe("FFB91C1C");
  });
});

describe("PDF export", () => {
  it("renders a valid PDF with Czech text (embedded DejaVu font)", async () => {
    const buf = await renderPdf(fixture());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.toString("latin1")).toContain("DejaVu");
  }, 30_000);
});
