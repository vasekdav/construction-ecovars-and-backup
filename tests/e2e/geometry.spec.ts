import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("plot plan derives edge-to-edge distances; a WARNING must be reviewed by OAM / Process Safety", async ({ page }) => {
  const name = `E2E plán ${Date.now()}`;
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
  await logout(page);

  // OPS (owner of step 3) creates layout v0 and enters the plan.
  await login(page, "ops@demo.local");
  await page.goto(`${projectUrl}/stages/3`);
  const layoutForm = page.getByTestId("add-layout-form");
  await layoutForm.getByLabel("Popis verze").fill("Koncept");
  await layoutForm.getByLabel("Odkaz na výkres (https)").fill("https://demo.sharepoint.com/v0.pdf");
  await layoutForm.getByRole("button").click();
  const editor = page.getByTestId("plan-editor");
  await expect(editor).toBeVisible();

  const addRow = async (i: number, type: string, label: string, points: string) => {
    await editor.getByRole("button", { name: "Přidat objekt" }).click();
    const row = editor.getByTestId(`plan-row-${i}`);
    await row.getByLabel("Typ").selectOption(type);
    await row.getByLabel("Název").fill(label);
    await row.getByLabel("Body (x, y; x, y; …) [m]").fill(points);
  };
  await addRow(0, "tank", "Tank", "0, 0; 3, 0; 3, 3; 0, 3");
  await addRow(1, "building", "Hala", "10, 0; 20, 0; 20, 10; 10, 10");
  await addRow(2, "site_boundary", "Pozemek", "-10, -10; 40, -10; 40, 40; -10, 40");
  await editor.getByRole("button", { name: "Uložit plán" }).click();

  await expect(page.getByTestId("plan-preview")).toBeVisible();
  await expect(page.getByTestId("plan-distances")).toContainText("dist_buildings: 7 m (Tank → Hala)");
  await expect(page.getByTestId("plan-distances")).toContainText("dist_boundary: 10 m");
  const locked = page.getByTestId("geometry-card").getByTestId("question-distances.dist_buildings");
  await expect(locked).toHaveAttribute("data-locked", "true");
  await expect(locked).toContainText("z plánu");

  // Signage not OK → R-SIG-01 WARNING.
  const geometry = page.getByTestId("geometry-card");
  await geometry.getByText("Označení a ochrana").click();
  const signage = geometry.getByTestId("section-form-signage");
  await signage.getByTestId("question-signage.signage_ok").getByLabel("Ne", { exact: true }).check();
  await signage.getByRole("button", { name: "Uložit sekci" }).click();
  await expect(signage.getByText("Sekce uložena.")).toBeVisible();

  await page.goto(`${projectUrl}/safety?result=WARNING`);
  const sig = page.getByTestId("rule-R-SIG-01");
  await sig.locator("summary").click();
  await expect(sig.getByTestId("ack-R-SIG-01")).toHaveCount(0); // OPS may not review
  await logout(page);

  await login(page, "oam@demo.local");
  await page.goto(`${projectUrl}/safety?result=WARNING`);
  await page.getByTestId("rule-R-SIG-01").locator("summary").click();
  const ack = page.getByTestId("ack-R-SIG-01");
  await ack.getByRole("textbox").fill("Značení doplní zákazník před uvedením do provozu (demo).");
  await ack.getByRole("button", { name: "Potvrdit posouzení" }).click();
  await expect(page.getByTestId("count-acknowledged")).toContainText("1");
  await page.goto(`${projectUrl}/safety?result=acknowledged`);
  await page.getByTestId("rule-R-SIG-01").locator("summary").click();
  await expect(page.getByTestId("rule-R-SIG-01")).toContainText("Posoudil Demo OAM");
});
