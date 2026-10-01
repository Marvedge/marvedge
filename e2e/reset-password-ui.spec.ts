import { expect, test } from "@playwright/test";

const RESET_URL = "/auth/reset-password?email=qa%40example.com&token=qa-reset-token";

test.describe("Reset-password UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(RESET_URL);

    await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
  });

  test("renders the reset-password controls", async ({ page }) => {
    await expect(page.getByText("Enter your new password to reset your account.")).toBeVisible();

    await expect(page.getByPlaceholder("Your Email")).toBeVisible();
    await expect(page.getByPlaceholder("Enter New Password")).toBeVisible();
    await expect(page.getByPlaceholder("Confirm New Password")).toBeVisible();

    await expect(page.getByRole("button", { name: "Reset Password" })).toBeVisible();
  });

  test("prefills the email from the reset link", async ({ page }) => {
    await expect(page.getByPlaceholder("Your Email")).toHaveValue("qa@example.com");
  });

  test("prevents an empty form from being submitted", async ({ page }) => {
    let resetRequests = 0;

    await page.route("**/api/auth/verify-reset", async (route) => {
      resetRequests++;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset successfully.",
        }),
      });
    });

    await page.getByPlaceholder("Your Email").fill("");
    await page.getByRole("button", { name: "Reset Password" }).click();

    expect(resetRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/reset-password/);
  });

  test("rejects an invalid email before calling the reset API", async ({ page }) => {
    let resetRequests = 0;

    await page.route("**/api/auth/verify-reset", async (route) => {
      resetRequests++;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset successfully.",
        }),
      });
    });

    await page.getByPlaceholder("Your Email").fill("not-an-email");
    await page.getByPlaceholder("Enter New Password").fill("newpassword123");
    await page.getByPlaceholder("Confirm New Password").fill("newpassword123");

    await page.getByRole("button", { name: "Reset Password" }).click();

    expect(resetRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/reset-password/);
  });

  test("rejects a short password before calling the reset API", async ({ page }) => {
    let resetRequests = 0;

    await page.route("**/api/auth/verify-reset", async (route) => {
      resetRequests++;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset successfully.",
        }),
      });
    });

    await page.getByPlaceholder("Enter New Password").fill("short");
    await page.getByPlaceholder("Confirm New Password").fill("short");

    await page.getByRole("button", { name: "Reset Password" }).click();

    expect(resetRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/reset-password/);

    await expect(page.getByPlaceholder("Enter New Password")).toHaveValue("short");
  });

  test("rejects mismatched passwords before calling the reset API", async ({ page }) => {
    let resetRequests = 0;

    await page.route("**/api/auth/verify-reset", async (route) => {
      resetRequests++;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset successfully.",
        }),
      });
    });

    await page.getByPlaceholder("Enter New Password").fill("newpassword123");
    await page.getByPlaceholder("Confirm New Password").fill("differentpassword123");

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByText("Passwords do not match")).toBeVisible();

    expect(resetRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/reset-password/);
  });

  test("rejects a reset request when the token is missing", async ({ page }) => {
    let resetRequests = 0;

    await page.goto("/auth/reset-password?email=qa%40example.com");

    await page.route("**/api/auth/verify-reset", async (route) => {
      resetRequests++;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset successfully.",
        }),
      });
    });

    await page.getByPlaceholder("Enter New Password").fill("newpassword123");
    await page.getByPlaceholder("Confirm New Password").fill("newpassword123");

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByText("Invalid reset token")).toBeVisible();

    expect(resetRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/reset-password/);
  });

  test("toggles new-password and confirmation visibility", async ({ page }) => {
    const password = page.getByPlaceholder("Enter New Password");
    const confirmPassword = page.getByPlaceholder("Confirm New Password");

    await expect(password).toHaveAttribute("type", "password");
    await expect(confirmPassword).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Toggle Password" }).click();
    await page.getByRole("button", { name: "Toggle Confirm" }).click();

    await expect(password).toHaveAttribute("type", "text");
    await expect(confirmPassword).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "Toggle Password" }).click();
    await page.getByRole("button", { name: "Toggle Confirm" }).click();

    await expect(password).toHaveAttribute("type", "password");
    await expect(confirmPassword).toHaveAttribute("type", "password");
  });

  test("sends the correct reset payload and redirects after success", async ({ page }) => {
    let capturedBody: unknown;

    await page.route("**/api/auth/verify-reset", async (route) => {
      capturedBody = route.request().postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Password reset successfully.",
        }),
      });
    });

    await page.getByPlaceholder("Enter New Password").fill("newpassword123");
    await page.getByPlaceholder("Confirm New Password").fill("newpassword123");

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByText("Password reset successfully!")).toBeVisible();

    expect(capturedBody).toEqual({
      email: "qa@example.com",
      token: "qa-reset-token",
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });

    await expect(page).toHaveURL(/\/auth\/signin/, {
      timeout: 5000,
    });
  });

  test("shows a controlled invalid-or-expired-token error", async ({ page }) => {
    await page.route("**/api/auth/verify-reset", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Invalid or expired reset link.",
        }),
      });
    });

    await page.getByPlaceholder("Enter New Password").fill("newpassword123");
    await page.getByPlaceholder("Confirm New Password").fill("newpassword123");

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByText("Invalid or expired reset link.")).toBeVisible();

    await expect(page).toHaveURL(/\/auth\/reset-password/);
  });

  test("shows a generic message when the reset API cannot be reached", async ({ page }) => {
    await page.route("**/api/auth/verify-reset", async (route) => {
      await route.abort("connectionfailed");
    });

    await page.getByPlaceholder("Enter New Password").fill("newpassword123");
    await page.getByPlaceholder("Confirm New Password").fill("newpassword123");

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByText("Reset failed.")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/reset-password/);
  });
});
