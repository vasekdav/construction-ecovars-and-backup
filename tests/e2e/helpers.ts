import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Heslo").fill(password);
  await page.getByRole("button", { name: "Přihlásit" }).click();
  await expect(page.getByTestId("current-user")).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Odhlásit" }).click();
  await expect(page).toHaveURL(/\/login/);
}
