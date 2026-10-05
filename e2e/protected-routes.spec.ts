import { expect, test } from "@playwright/test";

// SDET regression for middleware auth guard:
// every app/(signed) route must redirect unauthenticated users to /auth/signin,
// including dotted-path variants that previously bypassed via `includes(".")`.
const PROTECTED_ROUTES = [
  "/dashboard",
  "/demos",
  "/templates",
  "/exported-videos",
  "/payment-gateway",
  "/editor",
  "/recorder",
  "/team",
  "/settings",
  "/analytics",
  "/leads",
  "/view/123",
];

test.describe("Protected routes require auth", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`redirects unauthenticated GET ${route} to sign-in`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/signin/);
    });
  }

  test("dotted protected variants do not bypass auth", async ({ page }) => {
    for (const route of ["/dashboard.evil", "/editor/foo.bar", "/settings/x.json"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/auth\/signin/);
    }
  });

  test("public pages stay open", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/auth\/signin/);

    await page.goto("/auth/signin");
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
