import { expect, test } from "@playwright/test";

/**
 * Full user journey against a configured deployment (scenarios 1–5, 9–17).
 * Requires: a running server with Supabase + AI configured, and
 *   E2E_SIGNUP_EMAIL_DOMAIN  — a domain whose mail you can ignore (email
 *                              confirmation must be disabled in Supabase Auth
 *                              for automated sign-up), or
 *   E2E_EMAIL / E2E_PASSWORD — an existing test account.
 * Set E2E_WITH_AI=1 to include the steps that call the AI provider (costs tokens).
 */
const email = process.env.E2E_EMAIL ?? (process.env.E2E_SIGNUP_EMAIL_DOMAIN ? `e2e-${Date.now()}@${process.env.E2E_SIGNUP_EMAIL_DOMAIN}` : null);
const password = process.env.E2E_PASSWORD ?? "E2e-test-pass-123";
const withAi = process.env.E2E_WITH_AI === "1";

test.describe.configure({ mode: "serial" });
test.skip(!email, "Set E2E_EMAIL/E2E_PASSWORD or E2E_SIGNUP_EMAIL_DOMAIN to run the journey.");
test.skip(({ isMobile }) => isMobile, "Journey runs once on desktop.");

test("register or sign in, build a profile, and persist it", async ({ page }) => {
  if (!process.env.E2E_EMAIL) {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Tester");
    await page.getByLabel("Email").fill(email!);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding/);
  } else {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  }

  // Add two projects and edit one (scenarios 4 and 5).
  await page.goto("/profile/edit#section-projects");
  const projects = page.locator("#section-projects");
  for (const title of ["E2E Forecasting Project", "E2E Dashboard Project"]) {
    await projects.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Project title").fill(title);
    await dialog.getByLabel("Tools and technologies").fill("Python, SQL");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(projects.getByText(title)).toBeVisible();
  }
  await projects.getByRole("button", { name: "Edit: E2E Dashboard Project" }).click();
  await page.getByRole("dialog").getByLabel("Project title").fill("E2E Dashboard Project v2");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(projects.getByText("E2E Dashboard Project v2")).toBeVisible();

  // Persists after sign-out and sign-in (scenario 3).
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email!);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/profile");
  await expect(page.getByText("E2E Dashboard Project v2")).toBeVisible();
});

test("manual opportunity → analysis → match → resume → edit → PDF", async ({ page }) => {
  test.skip(!withAi, "Set E2E_WITH_AI=1 to run AI-dependent steps.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.goto("/opportunities/new");
  const consent = page.getByRole("button", { name: "I agree — enable AI features" });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("tab", { name: "Manual entry" }).click();
  await page.getByLabel("Job title").fill("Junior Data Analyst");
  await page.getByLabel("Organization").fill("Acme Fintech");
  await page.getByLabel("Required skills").fill("Python, SQL, data cleaning");
  await page.getByLabel("Preferred skills").fill("Tableau");
  await page.getByRole("button", { name: "Save and analyze" }).click();

  await expect(page.getByRole("button", { name: "Approve analysis" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Approve analysis" }).click();
  await page.getByRole("button", { name: "Match my profile" }).click();
  await expect(page.getByText("Evidence coverage estimate")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Generate resume" }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+\/edit/, { timeout: 180_000 });

  // Manual edit is saved as a new version (scenario 14).
  await page.getByLabel("Resume title").fill("E2E edited resume");
  await page.getByRole("button", { name: "Save version" }).click();
  await expect(page.getByText(/Saved as version 2/)).toBeVisible();

  // Reopen (scenario 17) and export (scenario 15).
  await page.goto("/resumes");
  await expect(page.getByText("E2E edited resume")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).first().click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
});
