import { expect, test } from "@playwright/test";

// ADR-039: without AUTH_MODE=password there is no sign-in; everyone is one shared user with all roles.
test("open mode needs no sign-in and uses the shared user", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("current-user")).toHaveText("Sdílený uživatel");
  await expect(page.getByTestId("open-mode")).toBeVisible();
  await expect(page.getByRole("button", { name: "Odhlásit" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Uživatelé" })).toBeVisible();

  await page.goto("/login");
  await expect(page).toHaveURL(/\/projects$/);
});
