import { expect, test } from "@playwright/test";

test.describe("Forgot-password UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/forgot-password");

    await expect(page.getByRole("heading", { name: "Forgot Password" })).toBeVisible();
  });

  test("renders the forgot-password controls", async ({ page }) => {
    await expect(
      page.getByText("Enter your email to receive a password reset link.")
    ).toBeVisible();

    await expect(page.getByPlaceholder("Your Email")).toBeVisible();

    await expect(page.getByRole("button", { name: "Send Reset Link" })).toBeVisible();
  });

  test("prevents an empty form from being submitted", async ({ page }) => {
    let resetRequests = 0;

    await page.route("**/api/auth/request-reset", async (route) => {
      resetRequests++;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset link sent to your email.",
        }),
      });
    });

    await page.getByRole("button", { name: "Send Reset Link" }).click();

    expect(resetRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
  });

  test("rejects an invalid email before calling the reset API", async ({ page }) => {
    let resetRequests = 0;

    await page.route("**/api/auth/request-reset", async (route) => {
      resetRequests++;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset link sent to your email.",
        }),
      });
    });

    await page.getByPlaceholder("Your Email").fill("not-an-email");
    await page.getByRole("button", { name: "Send Reset Link" }).click();

    expect(resetRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
    await expect(page.getByPlaceholder("Your Email")).toHaveValue("not-an-email");
  });

  test("sends the correct email to the reset API", async ({ page }) => {
    let capturedBody: unknown;

    await page.route("**/api/auth/request-reset", async (route) => {
      capturedBody = route.request().postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset link sent to your email.",
        }),
      });
    });

    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();

    await expect(page.getByText("Password reset link sent to your email!")).toBeVisible();

    expect(capturedBody).toEqual({
      email: "qa@example.com",
    });
  });

  test("shows the sign-in action after a successful request", async ({ page }) => {
    await page.route("**/api/auth/request-reset", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset link sent to your email.",
        }),
      });
    });

    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();

    const form = page.locator("form");

    await expect(form.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();

    await expect(form.getByRole("button", { name: "Send Reset Link" })).toHaveCount(0);
  });

  test("opens sign-in after a successful reset request", async ({ page }) => {
    await page.route("**/api/auth/request-reset", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset link sent to your email.",
        }),
      });
    });

    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();

    await page.locator("form").getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test("shows a controlled API error and remains on the page", async ({ page }) => {
    await page.route("**/api/auth/request-reset", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Too many attempts, please try again later",
        }),
      });
    });

    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();

    await expect(page.getByText("Too many attempts, please try again later")).toBeVisible();

    await expect(page).toHaveURL(/\/auth\/forgot-password/);

    await expect(page.getByRole("button", { name: "Send Reset Link" })).toBeVisible();
  });

  test("shows a generic message when the reset request cannot reach the server", async ({
    page,
  }) => {
    await page.route("**/api/auth/request-reset", async (route) => {
      await route.abort("connectionfailed");
    });

    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();

    await expect(page.getByText("Server error")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
  });
});
