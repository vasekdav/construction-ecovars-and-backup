import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("sizing result with source, autonomy with assumptions, R-CAP-01 from autonomy", async ({ page }) => {
  const name = `E2E sizing ${Date.now()}`;
  await login(page, "oam@demo.local");
  await page.goto("/projects/new");
  const form = page.getByTestId("new-project-form");
  await form.getByLabel("Název").fill(name);
  await form.getByLabel("Zákazník").fill("Demo");
  await form.getByLabel("Lokalita").fill("Demo");
  await form.getByLabel("Médium").selectOption("N2");
  await form.getByRole("button", { name: "Založit projekt" }).click();
  await expect(page.getByTestId("project-name")).toHaveText(name);
  const projectUrl = page.url();

  // Fictitious consumption and required autonomy.
  await page.goto(`${projectUrl}/questionnaire`);
  const consumption = page.getByTestId("section-form-consumption");
  await consumption.getByRole("textbox", { name: /^Špičková spotřeba Q_peak/ }).fill("400");
  await consumption.getByRole("button", { name: "Uložit sekci" }).click();
  await expect(consumption.getByText("Sekce uložena.")).toBeVisible();
  const autonomy = page.getByTestId("section-form-autonomy");
  await autonomy.getByRole("textbox", { name: /^Požadovaná doba krytí/ }).fill("12");
  await autonomy.getByRole("button", { name: "Uložit sekci" }).click();
  await expect(autonomy.getByText("Sekce uložena.")).toBeVisible();
  await logout(page);

  // Sizing responsible records the result; the source is mandatory.
  await login(page, "sizing@demo.local");
  await page.goto(`${projectUrl}/sizing`);
  await expect(page.getByTestId("decision-support-banner")).toBeVisible();
  const f = page.getByTestId("section-form-multi");
  await f.getByLabel("Název souboru AAE nástroje").fill("AAE_e2e.xlsx");
  await f.getByLabel("Autor výpočtu").fill("Demo Sizing");
  await f.getByLabel("Datum výpočtu").fill("2026-11-01");
  await f.getByRole("textbox", { name: /^Geometrický objem zásobníku/ }).fill("20");
  await f.getByRole("textbox", { name: /^Návrhový průtok/ }).fill("400");
  await f.getByRole("textbox", { name: /^Minimální teplota okolí/ }).fill("-25");
  await f.getByTestId("question-inputs.icing_considered").getByLabel("Ano").check();
  await f.getByRole("textbox", { name: /^Kapacita odpařovače/ }).fill("500");
  await f.getByLabel("Typ odpařovače / modulu").fill("Demo AAE");
  await f.getByLabel("Počet modulů").fill("2");
  await f.getByRole("button", { name: "Uložit novou verzi výsledku sizingu" }).click();
  await expect(f.getByText("Povinná položka.")).toBeVisible(); // revision missing
  // Regression: the entered values survive the validation error.
  await expect(f.getByLabel("Název souboru AAE nástroje")).toHaveValue("AAE_e2e.xlsx");
  await f.getByLabel("Revize souboru").fill("R1");
  await f.getByRole("button", { name: "Uložit novou verzi výsledku sizingu" }).click();
  await expect(page.getByTestId("sizing-source")).toContainText("AAE_e2e.xlsx rev. R1");
  await expect(page.getByTestId("sizing-history")).toContainText("v1");
  await logout(page);

  // Process Safety enters calculation parameters (TEST VALUES ONLY, not physical properties).
  await login(page, "safety@demo.local");
  await page.goto("/calc/autonomy");
  const calc = page.getByTestId("calc-edit-form");
  const set = async (param: string, medium: string, value: string, unit: string) => {
    await calc.locator(`input[name="p:${param}:${medium}"]`).fill(value);
    await calc.locator(`select[name="pu:${param}:${medium}"]`).selectOption(unit);
  };
  for (const m of ["O2", "N2"]) {
    await set("fill_max", m, "50", "%");
    await set("heel_fraction", m, "20", "%");
    await set("rho_liquid", m, "1000", "kg/m3");
    await set("rho_gas_normal", m, "2", "kg/m3");
  }
  await calc.getByLabel("Popis změny (povinné)").fill("e2e: testovací hodnoty");
  await calc.getByRole("button", { name: "Uložit jako novou verzi (DRAFT)" }).click();
  await expect(page.getByTestId("calc-status")).toContainText("DRAFT");

  // 20 m³ · 0.5 · 0.8 · (1000/2) = 4000 Nm³; / 400 Nm³/h = 10 h < 12 h required.
  await page.goto(`${projectUrl}/sizing`);
  await expect(page.getByTestId("autonomy-peak")).toHaveText("10 h");
  await expect(page.getByTestId("autonomy-verdict")).toContainText("Nesplňuje požadavek");
  await page.goto(`${projectUrl}/safety?result=NO-GO`);
  await expect(page.getByTestId("rule-R-CAP-01")).toBeVisible();
});
