import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("export Design Basis & Safety Review as Markdown, PDF and XLSX; export is audited", async ({ page }) => {
  await login(page, "ops@demo.local");
  await page.getByRole("link", { name: "Demo Zákazník, LOX 20 m³" }).first().click();
  await expect(page.getByTestId("project-name")).toBeVisible();
  await expect(page.getByTestId("export-card")).toBeVisible();
  const projectUrl = new URL(page.url()).pathname;

  const md = await page.request.get(`${projectUrl}/export/md`);
  expect(md.status()).toBe(200);
  expect(md.headers()["content-type"]).toContain("text/markdown");
  expect(md.headers()["content-disposition"]).toMatch(/attachment; filename="design-basis-safety-review-demo-zakaznik-lox-20-m3-\d{4}-\d{2}-\d{2}\.md"/);
  expect(md.headers()["cache-control"]).toBe("no-store");
  const text = await md.text();
  expect(text).toContain("Podpora rozhodování, nenahrazuje inženýrské schválení.");
  expect(text).toContain("Demo OPS"); // exporting user
  expect(text).toMatch(/\| 0\.1\.0 \|/); // app version
  expect(text).toContain("R-SD-01");

  const pdf = await page.request.get(`${projectUrl}/export/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const xlsx = await page.request.get(`${projectUrl}/export/xlsx`);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");

  expect((await page.request.get(`${projectUrl}/export/docx`)).status()).toBe(404);
});

test("export requires authentication", async ({ request }) => {
  const res = await request.get("/projects/11111111-1111-4111-8111-111111111111/export/md", { maxRedirects: 0 });
  expect([302, 307, 401]).toContain(res.status());
});
