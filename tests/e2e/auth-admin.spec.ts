import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, login, logout } from "./helpers";

test.beforeAll(() => {
  if (!DEMO_PASSWORD) throw new Error("SEED_DEMO_PASSWORD must be set for e2e tests");
});

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin%2Fusers/);
  await expect(page.getByRole("heading", { name: "Přihlášení" })).toBeVisible();
});

test("opening the site first and then signing in lands on the projects (no redirect loop)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2F/);
  await page.getByLabel("E-mail").fill("admin@demo.local");
  await page.getByLabel("Heslo").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Přihlásit" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByTestId("current-user")).toHaveText("Demo Admin");
});

test("unauthenticated API calls get 401", async ({ request }) => {
  const res = await request.get("/api/anything");
  expect(res.status()).toBe(401);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("admin@demo.local");
  await page.getByLabel("Heslo").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Přihlásit" }).click();
  await expect(page.getByText("Neplatný e-mail nebo heslo.")).toBeVisible();
});

test("admin creates a user, the change is audited, the new user can sign in", async ({ page }) => {
  const email = `e2e-${Date.now()}@demo.local`;
  await login(page, "admin@demo.local");
  await page.goto("/admin/users");

  const form = page.getByTestId("create-user-form");
  await form.getByLabel("E-mail").fill(email);
  await form.getByLabel("Jméno").fill("E2E Uživatel");
  await form.getByLabel("Počáteční heslo").fill("e2e-password-123");
  await form.getByLabel("OPS", { exact: true }).check();
  await form.getByRole("button", { name: "Nový uživatel" }).click();
  await expect(form.getByText("Uživatel byl založen.")).toBeVisible();
  await expect(page.getByTestId(`user-row-${email}`)).toContainText("OPS");

  await page.goto("/admin/audit");
  await expect(page.getByTestId("audit-table")).toContainText("user.create");
  await expect(page.getByTestId("audit-table")).toContainText(email);

  await logout(page);
  await login(page, email, "e2e-password-123");
  await expect(page.getByText("Vítejte, E2E Uživatel")).toBeVisible();
});

test("RBAC is enforced on the server and denied access is audited", async ({ page }) => {
  await login(page, "ops@demo.local");
  await expect(page.getByRole("link", { name: "Uživatelé" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/forbidden/);
  await expect(page.getByRole("heading", { name: "Přístup odepřen" })).toBeVisible();
  await logout(page);

  await login(page, "admin@demo.local");
  await page.goto("/admin/audit");
  await expect(page.getByTestId("audit-table")).toContainText("security.forbidden");
});
