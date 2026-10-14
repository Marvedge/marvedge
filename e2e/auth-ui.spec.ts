import { expect, test } from "@playwright/test";

test.describe("Sign-in UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/signin");

    await expect(page.getByRole("heading", { name: "Sign In to your Account" })).toBeVisible();
  });

  test("renders the authentication controls", async ({ page }) => {
    await expect(page.getByPlaceholder("Your Email")).toBeVisible();
    await expect(page.getByPlaceholder("Enter Password")).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeVisible();
    await expect(page.getByText("Remember Me")).toBeVisible();

    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();

    await expect(page.getByRole("button", { name: "Sign Up here." })).toBeVisible();

    await expect(page.getByTitle("Sign in with Google")).toBeVisible();

    await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  });

  test("prevents an empty form from being submitted", async ({ page }) => {
    const credentialRequests: string[] = [];

    page.on("request", (request) => {
      if (request.url().includes("/api/auth/callback/credentials")) {
        credentialRequests.push(request.url());
      }
    });

    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    const emailValidity = await page
      .getByPlaceholder("Your Email")
      .evaluate((element: HTMLInputElement) => ({
        valid: element.validity.valid,
        valueMissing: element.validity.valueMissing,
        message: element.validationMessage,
      }));

    expect(emailValidity.valid).toBe(false);
    expect(emailValidity.valueMissing).toBe(true);
    expect(emailValidity.message.length).toBeGreaterThan(0);
    expect(credentialRequests).toHaveLength(0);
    await expect(page).toHaveURL(/\/auth\/signin$/);
  });

  test("rejects an invalid email before contacting authentication API", async ({ page }) => {
    const credentialRequests: string[] = [];

    page.on("request", (request) => {
      if (request.url().includes("/api/auth/callback/credentials")) {
        credentialRequests.push(request.url());
      }
    });

    await page.getByPlaceholder("Your Email").fill("abc");
    await page.getByPlaceholder("Enter Password").fill("testing123");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    const emailValidity = await page
      .getByPlaceholder("Your Email")
      .evaluate((element: HTMLInputElement) => ({
        valid: element.validity.valid,
        typeMismatch: element.validity.typeMismatch,
        message: element.validationMessage,
      }));

    expect(emailValidity.valid).toBe(false);
    expect(emailValidity.typeMismatch).toBe(true);
    expect(emailValidity.message.length).toBeGreaterThan(0);
    expect(credentialRequests).toHaveLength(0);
    await expect(page).toHaveURL(/\/auth\/signin$/);
  });

  test("toggles password visibility", async ({ page }) => {
    const password = page.getByPlaceholder("Enter Password");
    const toggle = page.getByRole("button", { name: "Toggle Password" });

    await password.fill("testing123");

    await expect(password).toHaveAttribute("type", "password");

    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");

    await toggle.click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("opens the signup page", async ({ page }) => {
    await page.getByRole("button", { name: "Sign Up here." }).click();
    await expect(page).toHaveURL(/\/auth\/signup$/);
  });

  test("opens the forgot-password page", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password$/);
  });

  test("does not expose internal database errors to the user", async ({ page }) => {
    await page.getByPlaceholder("Your Email").fill("qa-ui@example.com");
    await page.getByPlaceholder("Enter Password").fill("testing123");

    await Promise.all([
      page.waitForResponse((response) => response.url().includes("/api/auth/callback/credentials")),
      page.getByRole("button", { name: "Sign In", exact: true }).click(),
    ]);

    await page.waitForTimeout(1_000);

    await expect(page.locator("body")).not.toContainText(
      /prisma\.user\.findUnique|DATABASE_URL|schema\.prisma/i
    );
  });
});
