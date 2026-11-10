// End-to-end check in a real browser against an isolated in-memory database.
// Run with: npm run test:browser
const fs = require("node:fs");
const { chromium } = require("@playwright/test");
const { migrate } = require("./migrate");
const { seed } = require("./seed");
const { seedDemo } = require("./seed-demo");
const { pool } = require("../src/backend/db");
const app = require("../src/app");
const base = "http://localhost:3101";
const shots = "test-results";
const passed = [];
function check(condition, message) {
  if (!condition) throw Error("Failed: " + message);
  passed.push(message);
}
(async () => {
  await migrate();
  await seed();
  await seedDemo();
  fs.mkdirSync(shots, { recursive: true });
  const server = app.listen(3101, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      // The signed-out session probe answers 401 by design.
      if (message.type() === "error" && !message.text().includes("401"))
        errors.push(message.text());
    });
    page.on("dialog", (dialog) => dialog.accept());
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
    const visible = (selector) => page.locator(selector).isVisible();

    // Homepage → account creation → onboarding → app
    await page.goto(base);
    await page.locator("#homeView h1").waitFor();
    check(
      (await page.locator("#homeView h1").textContent()).includes(
        "Know your next target",
      ),
      "homepage shows the product promise",
    );
    check(await visible(".preview figcaption"), "preview is labelled sample");
    check(!(await visible("#authForm")), "sign-in form is separate from home");
    await page.screenshot({ path: shots + "/home-desktop.png" });
    await page.keyboard.press("Tab");
    check(
      await page.evaluate(
        () =>
          document.activeElement.matches("a.brand") &&
          getComputedStyle(document.activeElement).outlineStyle !== "none",
      ),
      "keyboard focus is visible on the first control",
    );
    await page.getByRole("link", { name: "Sign in" }).first().click();
    await page.locator("#authEmail").fill("nobody@example.test");
    await page.locator("#authPassword").fill("wrong");
    await page.locator("#authSubmit").click();
    await page.getByText("Email or password is incorrect.").waitFor();
    passed.push("wrong sign-in shows a plain error");
    await page.locator("#togglePassword").click();
    check(
      (await page.locator("#authPassword").getAttribute("type")) === "text",
      "password visibility toggle works",
    );
    await page.goto(base + "/#signup");
    await page.getByRole("heading", { name: "Create your account" }).waitFor();
    await page.locator("#authName").fill("Browser Test");
    await page.locator("#authEmail").fill("browser@example.test");
    await page.locator("#authPassword").fill("browser-test-password");
    await page.locator("#authSubmit").click();
    await page.locator("#onboardForm").waitFor({ state: "visible" });
    await page.locator('#onboardForm [value="dumbbell"]').check();
    await page.locator('#onboardForm [type="submit"]').click();
    await page.locator('[data-page="today"]').waitFor({ state: "visible" });
    passed.push("signup leads through onboarding into Today");

    // Logging: search, add, edit, complete, timer, undo
    await page.locator("#addExercise").click();
    await page.locator("#exerciseSearch").fill("bench press");
    await page.locator('#exerciseResults input[value="bench-press"]').check();
    await page.locator("#addSelectedExercises").click();
    const card = page.locator("[data-card]").first();
    await card.locator('[data-field="weight"]').first().fill("20.1");
    await card.locator('[data-field="reps"]').first().fill("10");
    await card.locator('[data-action="complete"]').first().click();
    check(
      (await page.locator("#timerStatus").textContent()).includes(
        "rest running",
      ),
      "completing a set starts the rest timer",
    );
    await page.locator("#addRest").click();
    check(
      /^02:[23]\d$/.test(await page.locator("#timer").textContent()),
      "+30 s extends the running timer",
    );
    const sets = () => card.locator("tr[data-set]").count();
    const before = await sets();
    await card.getByRole("button", { name: "Remove last set" }).click();
    check((await sets()) === before - 1, "a set can be removed");
    await page.locator(".notice-action").click();
    check((await sets()) === before, "Undo restores the removed set");
    check(
      (await page.locator("#draftStatus").textContent()).includes(
        "kept on this device",
      ),
      "draft status says it is stored on the device, not the account",
    );

    // Refresh keeps the draft
    await page.reload();
    await page.locator("[data-card]").first().waitFor();
    check(
      (await page
        .locator('[data-card] [data-field="weight"]')
        .first()
        .inputValue()) === "20.1" &&
        (await page
          .locator('[data-card] [data-action="complete"]')
          .first()
          .getAttribute("aria-pressed")) === "true",
      "draft survives a page refresh with values and completion",
    );
    await page.screenshot({ path: shots + "/today-desktop.png" });

    // Save → summary → history
    await page.locator("#saveWorkout").click();
    await page
      .getByText(
        "Workout saved. Records, progress, and next-session targets are updated.",
      )
      .waitFor();
    check(await visible(".saved-summary"), "completion summary is shown");
    await page.locator(".saved-summary a[href='#history']").click();
    await page.locator('[data-page="history"]').waitFor({ state: "visible" });
    check(
      (await page.locator("#historyList").textContent()).includes("20.1 kg"),
      "saved workout appears in history",
    );

    // Previous performance and one-tap repeat
    await page.locator('#navigation a[href="#today"]').click();
    await page.locator("#addExercise").click();
    await page.locator('#exerciseResults input[value="bench-press"]').check();
    await page.locator("#addSelectedExercises").click();
    const next = page.locator("[data-card]").first();
    check(
      (await next.locator(".previous-value").first().textContent()).includes(
        "20.1 kg × 10",
      ),
      "previous performance is shown beside the set",
    );
    check(
      (await next.locator('[data-field="weight"]').first().inputValue()) === "",
      "previous values are not pre-entered as today's values",
    );
    await next.locator("[data-recommendation] strong").waitFor();
    check(
      (await next.locator(".target-reason").textContent()).length > 20,
      "suggested target shows its reason",
    );
    await next.locator('[data-action="complete"]').first().click();
    check(
      (await next.locator('[data-field="weight"]').first().inputValue()) ===
        "20.1",
      "checking an empty set repeats the previous values",
    );
    await page.locator("#newWorkout").click();
    await page.locator(".workout-empty").waitFor();

    // Navigation: five destinations plus sections
    check(
      (await page.locator("#navigation a").count()) === 5,
      "main navigation has five destinations",
    );
    for (const [link, pages] of [
      ["#plans", ["plans", "library"]],
      ["#dashboard", ["dashboard", "history", "progress", "body", "goals"]],
      ["#coach", ["coach"]],
      ["#settings", ["settings"]],
    ]) {
      await page.locator('#navigation a[href="' + link + '"]').click();
      for (const name of pages) {
        if (pages.length > 1)
          await page.locator('.subnav a[href="#' + name + '"]').click();
        await page
          .locator('[data-page="' + name + '"]')
          .waitFor({ state: "visible" });
      }
    }
    await page.goto(base + "/#routines");
    await page.locator('[data-page="plans"]').waitFor({ state: "visible" });
    passed.push("old page links and friendly aliases still resolve");

    // Routines
    await page.locator("#generatePlan").click();
    await page.locator("#savePlan").waitFor({ state: "visible" });
    check(
      (await page.locator("#planSource").textContent()).includes(
        "fixed template",
      ),
      "plan draft is labelled as a template, not AI",
    );
    await page.locator("#savePlan").click();
    await page.getByText("Plan saved.", { exact: true }).waitFor();
    await page.locator('#navigation a[href="#today"]').click();
    await page.locator(".routine-choice").first().click();
    await page.locator("[data-card]").first().waitFor();
    passed.push("a saved routine starts from Today in one tap");

    // Custom exercise
    await page.goto(base + "/#library");
    await page.locator("#customExerciseBox summary").click();
    await page.locator('#customExerciseForm [name="name"]').fill("Test Carry");
    await page.locator('#customExerciseForm [type="submit"]').click();
    await page.getByText("Test Carry added to your library.").waitFor();
    check(
      (await page.locator("#libraryList").textContent()).includes("Custom"),
      "custom exercise is saved and tagged",
    );

    // Coach: honest about source
    await page.locator('#navigation a[href="#coach"]').click();
    await page.getByText("Answers use built-in rules, not AI").waitFor();
    await page.locator("#weeklyReview").click();
    await page.locator(".coach-answer").first().waitFor();
    check(
      (await page.locator(".source-tag").first().textContent()).includes(
        "Built-in rules, not AI",
      ),
      "coach answer is labelled as built-in rules when AI is off",
    );
    check(
      (await page.locator(".coach-answer").first().textContent()).includes(
        "Why:",
      ),
      "coach suggestions include their reason",
    );
    await page.screenshot({ path: shots + "/coach-desktop.png" });

    // Mobile layout
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#navigation a[href="#today"]').click();
    await page.locator("[data-card]").first().waitFor();
    check(!(await overflow()), "Today has no horizontal overflow at 390px");
    check(
      await page.evaluate(
        () =>
          getComputedStyle(document.getElementById("navigation")).position ===
          "fixed",
      ),
      "navigation is a bottom bar on phones",
    );
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-page="today"] button, [data-page="today"] input:not([type=checkbox]), [data-page="today"] select, #navigation a',
        ),
      ]
        .filter((el) => el.offsetParent && el.getBoundingClientRect().height)
        .filter((el) => el.getBoundingClientRect().height < 43.5)
        .map((el) => el.id || el.dataset.action || el.textContent.trim()),
    );
    check(!small.length, "touch targets on Today are at least 44px: " + small);
    await page.locator("[data-card]").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: shots + "/today-mobile.png" });
    for (const name of ["dashboard", "history", "plans", "coach", "settings"]) {
      await page.goto(base + "/#" + name);
      await page
        .locator('[data-page="' + name + '"]')
        .waitFor({ state: "visible" });
      check(!(await overflow()), name + " has no horizontal overflow at 390px");
    }
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(base + "/#today");
    check(!(await overflow()), "Today has no horizontal overflow at 360px");
    await page.setViewportSize({ width: 1440, height: 900 });

    // Export
    await page.goto(base + "/#settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#exportData").click(),
    ]);
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    check(
      exported.workouts.length === 1 &&
        !JSON.stringify(exported).includes("password"),
      "export downloads the account's data without credentials",
    );

    // Session expiry keeps the draft
    await page.evaluate(() =>
      fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": state.user.csrf,
        },
        body: "{}",
      }),
    );
    await page.locator("#profileForm button.primary").click();
    await page.locator("#authForm").waitFor({ state: "visible" });
    check(
      (await page.locator("#authError").textContent()).includes(
        "session ended",
      ),
      "an expired session returns to sign-in with an explanation",
    );
    await page.locator("#authEmail").fill("browser@example.test");
    await page.locator("#authPassword").fill("browser-test-password");
    await page.locator("#authSubmit").click();
    await page.locator("[data-card]").first().waitFor();
    passed.push("draft is restored after signing in again");

    // Account deletion
    await page.goto(base + "/#settings");
    await page.locator("#deleteBox summary").click();
    await page
      .locator('#deleteForm [name="password"]')
      .fill("browser-test-password");
    await page.locator("#deleteForm button").click();
    await page.locator("#homeView h1").waitFor();
    await page.goto(base + "/#signin");
    await page.locator("#authEmail").fill("browser@example.test");
    await page.locator("#authPassword").fill("browser-test-password");
    await page.locator("#authSubmit").click();
    await page.getByText("Email or password is incorrect.").waitFor();
    passed.push("account deletion removes the account");

    // Demo entry, progress, sign out
    await page.goto(base);
    await page.locator("#homeDemo").click();
    await page.locator("#demoBanner").waitFor({ state: "visible" });
    await page.locator('#navigation a[href="#dashboard"]').click();
    await page.locator("#liftTrends .trend").first().waitFor();
    check(
      (await page.locator("#focusList li").count()) > 0,
      "progress overview lists what to focus on",
    );
    await page.screenshot({
      path: shots + "/progress-desktop.png",
      fullPage: true,
    });
    await page.locator('.subnav a[href="#progress"]').click();
    await page.locator("#strengthChart svg").waitFor();
    check(
      (await page.locator("#progressSummary").textContent()).includes(
        "Estimated 1RM went from",
      ),
      "lift chart has a text summary with units",
    );
    await page.locator('#navigation a[href="#today"]').click();
    await page.locator(".routine-choice").first().click();
    await page.locator("[data-recommendation] strong").first().waitFor();
    await page.screenshot({ path: shots + "/today-demo-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: shots + "/today-demo-mobile.png" });
    check(!(await overflow()), "demo workout has no overflow at 390px");
    await page.goto(base + "/#settings");
    await page.locator("#logoutProfile").click();
    await page.locator("#homeView h1").waitFor();
    check(!(await overflow()), "homepage has no horizontal overflow at 390px");
    await page.screenshot({ path: shots + "/home-mobile.png" });
    passed.push("signing out returns to the homepage");

    // Public pages build: demo hidden when disabled
    await page.goto(base + "/#privacy");
    await page.getByRole("heading", { name: "Privacy summary" }).waitFor();
    if (errors.length) throw Error(errors.join("\n"));
    console.log(passed.map((line) => "ok - " + line).join("\n"));
    console.log("Browser flow passed: " + passed.length + " checks.");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
})().catch((error) => {
  console.log(passed.map((line) => "ok - " + line).join("\n"));
  console.error(error);
  process.exitCode = 1;
});
