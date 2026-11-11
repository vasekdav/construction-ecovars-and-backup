import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("OAM creates a project, the gate blocks closing step 1 until it is satisfied", async ({ page }) => {
  const name = `E2E projekt ${Date.now()}`;
  await login(page, "oam@demo.local");
  await page.getByRole("link", { name: "Nový projekt" }).click();
  const form = page.getByTestId("new-project-form");
  await form.getByLabel("Název").fill(name);
  await form.getByLabel("Zákazník").fill("Demo Zákazník");
  await form.getByLabel("Lokalita").fill("Demo");
  await form.getByLabel("Médium").selectOption("N2");
  await form.getByRole("button", { name: "Založit projekt" }).click();

  await expect(page.getByTestId("project-name")).toHaveText(name);
  for (let i = 1; i <= 10; i++) await expect(page.getByTestId(`stage-pill-${i}`)).toHaveAttribute("data-state", "NOT_STARTED");
  await expect(page.getByTestId("optional-C1")).toContainText("neplatí pro toto médium");
  await expect(page.getByTestId("waiting-list")).toContainText("8: čeká na krok 4, 5, 7");

  await page.getByTestId("stage-pill-1").click();
  await expect(page.getByTestId("stage-title")).toContainText("Krok 1: Set up SharePoint");
  await page.getByTestId("transition-start").getByRole("button").click();
  await expect(page.getByTestId("stage-state")).toHaveText("ROZPRACOVÁNO");
  await page.getByTestId("transition-submit").getByRole("button").click();
  await expect(page.getByTestId("stage-state")).toHaveText("K REVIZI");

  // Attempt to close without a passed gate: rejected and recorded.
  await page.getByTestId("transition-close").getByRole("button").click();
  await expect(page.getByText("Gate není splněna, krok nelze uzavřít. Pokus byl zaznamenán.")).toBeVisible();
  await expect(page.getByTestId("history")).toContainText("stage.close_rejected");
  await expect(page.getByTestId("stage-state")).toHaveText("K REVIZI");

  // Satisfy the gate.
  const link = page.getByTestId("add-link-form");
  await link.getByLabel("Typ").selectOption("sharepoint_site");
  await link.getByLabel("Název").fill("Projektový site");
  await link.getByLabel("URL (https)").fill("https://demo.sharepoint.com/sites/e2e");
  await link.getByRole("button", { name: "Přidat" }).click();
  await expect(page.getByTestId("links-table")).toContainText("Projektový site");
  await page.getByTestId("gate-permissions_match_roles").getByRole("button", { name: "Potvrdit" }).click();
  await expect(page.getByTestId("gate-status")).toHaveText("Gate splněna.");

  await page.getByTestId("transition-close").getByRole("button").click();
  await expect(page.getByTestId("stage-state")).toHaveText("UZAVŘENO");
  await expect(page.getByTestId("history")).toContainText("stage.close");
  await expect(page.getByTestId("add-link-form")).toHaveCount(0);

  await page.getByRole("link", { name: `← ${name}` }).click();
  await expect(page.getByTestId("stage-pill-1")).toHaveAttribute("data-state", "CLOSED");
  await expect(page.getByTestId("waiting-list")).toContainText("2: na tahu: OAM");
});

test("other roles can comment but cannot move a step they do not own", async ({ page }) => {
  await login(page, "ops@demo.local");
  await page.getByRole("link", { name: "Demo Zákazník, LOX 20 m³" }).first().click();
  await expect(page.getByTestId("project-name")).toHaveText("Demo Zákazník, LOX 20 m³");
  await page.getByTestId("stage-pill-2").click();
  await expect(page.getByText("Pro vaši roli nejsou v tomto stavu dostupné žádné akce.")).toBeVisible();
  await expect(page.getByTestId("add-link-form")).toHaveCount(0);
  const body = `Připomínka OPS ${Date.now()}`;
  await page.getByTestId("comment-form").getByRole("textbox").fill(body);
  await page.getByTestId("comment-form").getByRole("button", { name: "Odeslat" }).click();
  await expect(page.getByTestId("comments")).toContainText(body);
  await logout(page);
});
