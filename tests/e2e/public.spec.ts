import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("explains the product and links to sign-up", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One career profile");
    await expect(page.locator("#how")).toBeVisible();
    await expect(page.locator("#faq details").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Get started|Build your career profile/ }).first()).toHaveAttribute("href", /\/signup|\/dashboard/);
  });

  test("has no horizontal overflow (responsive, scenario 22)", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("FAQ is keyboard operable", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("#faq summary").first();
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#faq details").first()).toHaveAttribute("open", "");
  });
});

test.describe("Arabic / English interface (scenario 21)", () => {
  test("switches to Arabic with right-to-left layout and back", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.getByRole("button", { name: "Change language" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ملف مهني واحد");
    await page.getByRole("button", { name: "تغيير اللغة" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("defaults to the browser language", async ({ browser }) => {
    const context = await browser.newContext({ locale: "ar-SA" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await context.close();
  });
});

test.describe("Authorization boundaries", () => {
  for (const path of ["/dashboard", "/profile/edit", "/opportunities/new", "/resumes", "/settings"]) {
    test(`redirects ${path} to sign-in when signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("API rejects unauthenticated requests", async ({ request }) => {
    const res = await request.get("/api/resumes");
    expect([401, 503]).toContain(res.status());
    const body = await res.json();
    expect(["unauthorized", "not_configured"]).toContain(body.error.code);
  });

  test("API never returns another resume without a session", async ({ request }) => {
    const res = await request.get("/api/resumes/11111111-1111-4111-8111-111111111111/pdf");
    expect([401, 503]).toContain(res.status());
  });
});

test.describe("Auth forms", () => {
  test("validate input client-side", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("This field is required.").first()).toBeVisible();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("textbox", { name: "Password", exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters with a letter and a number.")).toBeVisible();
  });

  test("login page links to password reset", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });
});
