import { expect, test, type Page } from "@playwright/test";
import { login, logout } from "./helpers";

async function newProject(page: Page, name: string) {
  await page.goto("/projects/new");
  const form = page.getByTestId("new-project-form");
  await form.getByLabel("Název").fill(name);
  await form.getByLabel("Zákazník").fill("Demo");
  await form.getByLabel("Lokalita").fill("Demo");
  await form.getByLabel("Médium").selectOption("O2");
  await form.getByRole("button", { name: "Založit projekt" }).click();
  await expect(page.getByTestId("project-name")).toHaveText(name);
  return page.url();
}

test("Safety Review: banner, NEVYHODNOCENO by default, NO-GO from the checklist, override by Process Safety", async ({ page }) => {
  const name = `E2E safety ${Date.now()}`;
  await login(page, "oam@demo.local");
  const projectUrl = await newProject(page, name);

  // Every screen with rule results shows the decision-support banner (SPEC §11.10).
  await expect(page.getByTestId("decision-support-banner")).toContainText("Podpora rozhodování, nenahrazuje inženýrské schválení.");
  await page.getByRole("link", { name: "Otevřít Safety Review" }).click();
  await expect(page.getByTestId("decision-support-banner")).toBeVisible();
  await expect(page.getByTestId("count-NOT_EVALUATED")).toContainText("21");
  await expect(page.getByTestId("count-GO")).toContainText("0");

  const sd01 = page.getByTestId("rule-R-SD-01");
  await sd01.locator("summary").click();
  await expect(sd01).toContainText("DRAFT, není podkladem pro schválení návrhu");
  await expect(sd01).toContainText("TBD-VERIFY");
  await expect(sd01).toContainText("EIGA Doc 75");
  await logout(page);

  // ROC fills the design checklist: no check valve at the tie-in → R-CTL-01 NO-GO.
  await login(page, "roc@demo.local");
  await page.goto(`${projectUrl}/design-inputs`);
  const control = page.getByTestId("section-form-control");
  await control.getByTestId("question-control.check_valve_at_tie_in").getByLabel("Ne", { exact: true }).check();
  await control.getByRole("button", { name: "Uložit sekci" }).click();
  await expect(control.getByText("Sekce uložena.")).toBeVisible();
  await page.goto(`${projectUrl}/safety?result=NO-GO`);
  await expect(page.getByTestId("count-NO-GO")).toContainText("1");
  const ctl = page.getByTestId("rule-R-CTL-01");
  await expect(ctl.locator("[data-result]").first()).toHaveAttribute("data-result", "NO-GO");
  await ctl.locator("summary").click();
  await expect(ctl.getByTestId("override-R-CTL-01")).toHaveCount(0); // only Process Safety may override
  await logout(page);

  // Process Safety overrides the NO-GO with a mandatory justification.
  await login(page, "safety@demo.local");
  await page.goto(`${projectUrl}/safety?result=NO-GO`);
  await page.getByTestId("rule-R-CTL-01").locator("summary").click();
  const form = page.getByTestId("override-R-CTL-01");
  await form.getByRole("textbox").fill("Zpětný tok vyloučen jiným opatřením (fiktivní e2e).");
  await form.getByRole("button", { name: "Přepsat NO-GO" }).click();
  await expect(page.getByTestId("count-overridden")).toContainText("1");
  await expect(page.getByTestId("count-NO-GO")).toContainText("0");
  await page.goto(`${projectUrl}/safety?result=overridden`);
  await page.getByTestId("rule-R-CTL-01").locator("summary").click();
  await expect(page.getByTestId("rule-R-CTL-01")).toContainText("Zpětný tok vyloučen jiným opatřením");

  // Snapshot for reproducibility.
  await page.getByTestId("snapshot-form").getByRole("button").click();
  await expect(page.getByTestId("snapshots")).toContainText("NO-GO: 1");
});

test("rules are versioned; only Process Safety verifies; other roles read only", async ({ page }) => {
  await login(page, "ops@demo.local");
  await page.goto("/rules/R-CTL-01");
  await expect(page.getByTestId("rule-edit-form")).toHaveCount(0);
  await expect(page.getByText("Úpravy smí Admin a Process Safety")).toBeVisible();
  await logout(page);

  await login(page, "safety@demo.local");
  await page.goto("/rules/R-CTL-01");
  const form = page.getByTestId("rule-edit-form");
  await form.getByLabel("Kapitola / článek").fill(`e2e ${Date.now()}`);
  await form.getByLabel("Popis změny (povinné)").fill("e2e: doplnění citace (fiktivní)");
  await form.getByRole("button", { name: "Uložit jako novou verzi (DRAFT)" }).click();
  await expect(page.getByTestId("rule-status")).toContainText("DRAFT");
  await page.getByTestId("rule-verify-form").getByRole("button", { name: "Ověřit (VERIFIED)" }).click();
  await expect(page.getByTestId("rule-status")).toHaveText("VERIFIED");

  // A rule with TBD parameters cannot be verified.
  await page.goto("/rules/R-SD-01");
  await page.getByTestId("rule-verify-form").getByRole("button").click();
  await expect(page.getByText("Chybí hodnoty parametrů (TBD-VERIFY).")).toBeVisible();
});
