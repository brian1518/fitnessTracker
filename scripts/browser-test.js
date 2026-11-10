const { chromium } = require("@playwright/test");
const { migrate } = require("./migrate");
const { seed } = require("./seed");
const { pool } = require("../src/backend/db");
const app = require("../src/app");
(async () => {
  await migrate();
  await seed();
  const server = app.listen(3101, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:3101");
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await page.locator("#authName").fill("Browser Test");
    await page.locator("#authEmail").fill("browser@example.test");
    await page.locator("#authPassword").fill("browser-test-password");
    await page.locator("#authSubmit").click();
    await page.locator("#appView").waitFor({ state: "visible" });
    page.on("dialog", (dialog) => dialog.accept());
    await page.locator("#addExercise").click();
    await page.locator('#exerciseResults input[value="bench-press"]').check();
    await page.locator("#addSelectedExercises").click();
    await page.locator('[data-field="weight"]').first().fill("20.1");
    await page.locator('[data-field="reps"]').first().fill("10");
    await page.locator('[data-action="complete"]').first().click();
    await page.locator("#saveWorkout").click();
    await page
      .getByText(
        "Workout saved. Records, progress, and next-session targets are updated.",
      )
      .waitFor();
    for (const pageName of [
      "dashboard",
      "history",
      "library",
      "progress",
      "plans",
      "body",
      "goals",
      "settings",
      "coach",
    ]) {
      await page.locator('nav a[href="#' + pageName + '"]').click();
      await page
        .locator('[data-page="' + pageName + '"]')
        .waitFor({ state: "visible" });
    }
    await page.locator('nav a[href="#plans"]').click();
    await page.locator("#generatePlan").click();
    await page.locator("#savePlan").waitFor({ state: "visible" });
    await page.locator("#savePlan").click();
    await page.getByText("Plan saved.", { exact: true }).waitFor();
    await page.locator('nav a[href="#today"]').click();
    await page.locator("#addExercise").click();
    await page.locator('#exerciseResults input[value="bench-press"]').check();
    await page.locator("#addSelectedExercises").click();
    await page.screenshot({
      path: process.env.SCREENSHOT_PATH || "test-results/desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw Error("Mobile page overflows horizontally.");
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      "Browser flow passed: registration, recommendations, logging, navigation, plans, and mobile overflow.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
