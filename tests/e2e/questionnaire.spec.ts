import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function newProject(page: import("@playwright/test").Page, medium: "O2" | "N2") {
  await page.goto("/projects/new");
  const form = page.getByTestId("new-project-form");
  await form.getByLabel("Název").fill(`E2E dotazník ${medium} ${Date.now()}`);
  await form.getByLabel("Zákazník").fill("Demo");
  await form.getByLabel("Lokalita").fill("Demo");
  await form.getByLabel("Médium").selectOption(medium);
  await form.getByRole("button", { name: "Založit projekt" }).click();
  await expect(page.getByTestId("project-name")).toBeVisible();
}

test("OAM fills the questionnaire: units, conditional questions, validation, Design Basis", async ({ page }) => {
  await login(page, "oam@demo.local");
  await newProject(page, "N2");
  await page.getByTestId("questionnaire-card").getByRole("link", { name: /Zákaznický dotazník/ }).click();
  await expect(page.getByTestId("questionnaire-phase")).toHaveText("Počáteční požadavky");
  await expect(page.getByTestId("progress-initial")).toContainText("0 %");

  // N₂ project: confined-space question visible, O₂-only question hidden.
  await expect(page.getByTestId("question-surroundings.confined_spaces")).toBeVisible();
  await expect(page.getByTestId("question-surroundings.flammables")).toHaveCount(0);

  // Validation error is shown next to the field and nothing is saved.
  const consumption = page.getByTestId("section-form-consumption");
  await consumption.getByRole("textbox", { name: /^Špičková spotřeba Q_peak/ }).fill("-5");
  await consumption.getByRole("button", { name: "Uložit sekci" }).click();
  await expect(consumption.getByText("Hodnota nesmí být záporná.")).toBeVisible();

  // Decimal comma and unit selection.
  await consumption.getByRole("textbox", { name: /^Špičková spotřeba Q_peak/ }).fill("12,5");
  await consumption.getByRole("combobox", { name: "Špičková spotřeba Q_peak – jednotka" }).selectOption("Nm3/min");
  await consumption.getByRole("button", { name: "Uložit sekci" }).click();
  await expect(consumption.getByText("Sekce uložena.")).toBeVisible();
  await expect(page.getByTestId("progress-initial")).toContainText("10 %");
  await page.reload();
  await expect(page.getByTestId("section-form-consumption").getByRole("textbox", { name: /^Špičková spotřeba Q_peak/ })).toHaveValue("12,5");

  // Conditional question appears when the answer changes.
  const space = page.getByTestId("section-form-space");
  await expect(space.getByTestId("question-space.cooling_towers_detail")).toHaveCount(0);
  await space.getByTestId("question-space.cooling_towers").getByLabel("Ano").check();
  await expect(space.getByTestId("question-space.cooling_towers_detail")).toBeVisible();

  // Phase cannot advance while initial requirements are incomplete.
  await page.getByTestId("advance-phase").getByRole("button").click();
  await expect(page.getByText("Počáteční požadavky nejsou kompletní.")).toBeVisible();

  await page.getByRole("link", { name: "Zobrazit Design Basis" }).click();
  await expect(page.getByTestId("db-qPeak")).toContainText("12,5 Nm³/min");
  await expect(page.getByTestId("db-qPeak")).toContainText("0,208333 Nm³/s");
});

test("other roles see the questionnaire read-only", async ({ page }) => {
  await login(page, "ops@demo.local");
  await page.getByRole("link", { name: "Demo Zákazník, LOX 20 m³" }).first().click();
  await expect(page.getByTestId("project-name")).toBeVisible();
  await page.getByTestId("questionnaire-card").getByRole("link", { name: /Zákaznický dotazník/ }).click();
  await expect(page.getByText("Pouze pro čtení: dotazník vyplňuje OAM.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Uložit sekci" })).toHaveCount(0);
  await expect(page.getByTestId("section-form-consumption").getByRole("textbox", { name: /^Průměrná spotřeba Q_avg/ })).toBeDisabled();
});
