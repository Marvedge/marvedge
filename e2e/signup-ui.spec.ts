import { expect, test } from "@playwright/test";

test.describe("Signup UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/signup");

    await expect(page.getByRole("heading", { name: "Create your Account" })).toBeVisible();
  });

  test("renders the signup controls", async ({ page }) => {
    await expect(page.getByPlaceholder("Your First Name")).toBeVisible();
    await expect(page.getByPlaceholder("Your Email")).toBeVisible();
    await expect(page.getByPlaceholder("Enter Password")).toBeVisible();
    await expect(page.getByPlaceholder("Enter Confirm Password")).toBeVisible();

    await expect(page.getByRole("button", { name: "Sign Up", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Sign In here." })).toBeVisible();
    await expect(page.getByText("Remember Me")).toBeVisible();
    await expect(page.getByText("or sign up with")).toBeVisible();
  });

  test("prevents an empty form from being submitted", async ({ page }) => {
    let signupRequests = 0;

    await page.route("**/api/auth/signup", async (route) => {
      signupRequests++;

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "qa-user" } }),
      });
    });

    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    expect(signupRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/signup/);
  });

  test("rejects an invalid email before calling the signup API", async ({ page }) => {
    let signupRequests = 0;

    await page.route("**/api/auth/signup", async (route) => {
      signupRequests++;

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "qa-user" } }),
      });
    });

    await page.getByPlaceholder("Your First Name").fill("QA User");
    await page.getByPlaceholder("Your Email").fill("not-an-email");
    await page.getByPlaceholder("Enter Password").fill("password123");
    await page.getByPlaceholder("Enter Confirm Password").fill("password123");

    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    expect(signupRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/signup/);
  });

  test("rejects a short password before calling the signup API", async ({ page }) => {
    let signupRequests = 0;

    await page.route("**/api/auth/signup", async (route) => {
      signupRequests++;

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "qa-user" } }),
      });
    });

    await page.getByPlaceholder("Your First Name").fill("QA User");
    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByPlaceholder("Enter Password").fill("short");
    await page.getByPlaceholder("Enter Confirm Password").fill("short");

    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect(page).toHaveURL(/\/auth\/signup/);
    expect(signupRequests).toBe(0);
    await expect(page.getByPlaceholder("Enter Password")).toHaveValue("short");
  });

  test("rejects mismatched passwords before calling the signup API", async ({ page }) => {
    let signupRequests = 0;

    await page.route("**/api/auth/signup", async (route) => {
      signupRequests++;

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ user: { id: "qa-user" } }),
      });
    });

    await page.getByPlaceholder("Your First Name").fill("QA User");
    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByPlaceholder("Enter Password").fill("password123");
    await page.getByPlaceholder("Enter Confirm Password").fill("different123");

    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect(page.getByText("Passwords do not match")).toBeVisible();
    expect(signupRequests).toBe(0);
    await expect(page).toHaveURL(/\/auth\/signup/);
  });

  test("toggles password and confirm-password visibility", async ({ page }) => {
    const password = page.getByPlaceholder("Enter Password");
    const confirmPassword = page.getByPlaceholder("Enter Confirm Password");

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

  test("prefills name and email from query parameters", async ({ page }) => {
    await page.goto("/auth/signup?name=QA%20Tester&email=qa.tester%40example.com");

    await expect(page.getByPlaceholder("Your First Name")).toHaveValue("QA Tester");

    await expect(page.getByPlaceholder("Your Email")).toHaveValue("qa.tester@example.com");
  });

  test("redirects to sign-in after successful signup", async ({ page }) => {
    await page.route("**/api/auth/signup", async (route) => {
      const requestBody = route.request().postDataJSON();

      expect(requestBody).toEqual({
        name: "QA User",
        email: "qa@example.com",
        password: "password123",
        confirmPassword: "password123",
      });

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "qa-user",
            name: "QA User",
            email: "qa@example.com",
          },
        }),
      });
    });

    await page.getByPlaceholder("Your First Name").fill("QA User");
    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByPlaceholder("Enter Password").fill("password123");
    await page.getByPlaceholder("Enter Confirm Password").fill("password123");

    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect(page.getByText("Account created successfully!")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test("shows a safe generic message when signup fails", async ({ page }) => {
    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Internal database connection failed",
          details: "DATABASE_URL is empty",
        }),
      });
    });

    await page.getByPlaceholder("Your First Name").fill("QA User");
    await page.getByPlaceholder("Your Email").fill("qa@example.com");
    await page.getByPlaceholder("Enter Password").fill("password123");
    await page.getByPlaceholder("Enter Confirm Password").fill("password123");

    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    await expect(page.getByText("Sign-up failed.")).toBeVisible();
    await expect(page.getByText(/DATABASE_URL/i)).toHaveCount(0);
    await expect(page.getByText(/database connection failed/i)).toHaveCount(0);
    await expect(page).toHaveURL(/\/auth\/signup/);
  });

  test("opens the sign-in page", async ({ page }) => {
    await page.getByRole("button", { name: "Sign In here." }).click();

    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
