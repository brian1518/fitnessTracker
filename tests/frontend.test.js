process.env.DATABASE_MODE = "embedded";
process.env.PGLITE_PATH = "memory://";
process.env.PORT = "3102";
process.env.AI_ENABLED = "false";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { JSDOM } = require("jsdom");
const { migrate } = require("../scripts/migrate");
const { seed } = require("../scripts/seed");
const { pool } = require("../src/backend/db");
const app = require("../src/app");
test.after(() => pool.end());
for (const remote of [false, true])
  test(
    "frontend authenticated flow " +
      (remote ? "from Pages without cookies" : "locally"),
    async () => {
      await migrate();
      await seed();
      const server = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = "http://127.0.0.1:" + server.address().port;
      const dom = new JSDOM(fs.readFileSync("src/public/index.html", "utf8"), {
        url: remote ? "https://brian1518.github.io/fitnessTracker/" : base,
        runScripts: "outside-only",
        pretendToBeVisual: true,
      });
      const w = dom.window;
      if (remote) w.LANTERN_CONFIG = { apiBase: base, demoEnabled: false };
      process.env.APP_ORIGIN = remote
        ? "https://brian1518.github.io"
        : "http://localhost:3102";
      let cookie = "";
      let pending = 0;
      w.fetch = async (url, options = {}) => {
        options.headers = {
          ...options.headers,
          ...(remote ? { Origin: process.env.APP_ORIGIN } : { Cookie: cookie }),
        };
        if (remote && !options.headers.Authorization) {
          const token = w.sessionStorage.getItem("lantern-session:" + base);
          if (token) options.headers.Authorization = "Bearer " + token;
        }
        pending++;
        if (remote && url.startsWith(base))
          assert.equal(options.credentials, "omit");
        const response = await fetch(
          url.startsWith("http") ? url : base + url,
          options,
        );
        const nextCookie = response.headers.get("set-cookie");
        if (nextCookie) cookie = nextCookie.split(";")[0];
        const originalJson = response.json.bind(response);
        response.json = async () => {
          try {
            return await originalJson();
          } finally {
            pending--;
          }
        };
        return response;
      };
      w.crypto.randomUUID = randomUUID;
      w.structuredClone = structuredClone;
      w.confirm = () => true;
      const errors = [];
      w.addEventListener("error", (event) => errors.push(event.message));
      w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
      w.eval(fs.readFileSync("src/public/js/workout-logger.js", "utf8"));
      w.eval(fs.readFileSync("src/public/js/fitness.js", "utf8"));
      const $ = (id) => w.document.getElementById(id);
      async function waitFor(check) {
        for (let i = 0; i < 100; i++) {
          if (check()) return;
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw Error(
          "UI timeout. Notice: " +
            $("notice").textContent +
            " Auth: " +
            $("authError").textContent,
        );
      }
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        $("authToggle").click();
        $("authName").value = "UI Test";
        $("authEmail").value = remote
          ? "pages-ui@example.test"
          : "ui@example.test";
        $("authPassword").value = "ui-password-long";
        $("authForm").dispatchEvent(
          new w.SubmitEvent("submit", {
            bubbles: true,
            cancelable: true,
            submitter: $("authSubmit"),
          }),
        );
        await waitFor(() => !$("appView").hidden);
        $("addExercise").click();
        for (const id of ["bench-press", "squat"]) {
          const choice = $("exerciseResults").querySelector(
            'input[value="' + id + '"]',
          );
          choice.checked = true;
          choice.dispatchEvent(new w.Event("change", { bubbles: true }));
        }
        $("addSelectedExercises").click();
        assert.equal(w.document.querySelectorAll("[data-card]").length, 2);
        const card = w.document.querySelector("[data-card]");
        const complete = () => card.querySelector('[data-action="complete"]');
        complete().click();
        assert.equal(complete().getAttribute("aria-pressed"), "false");
        const fill = (field, value) => {
          const input = card.querySelector('[data-field="' + field + '"]');
          input.value = value;
          input.dispatchEvent(new w.Event("input", { bubbles: true }));
        };
        fill("weight", "20.1");
        fill("reps", "10");
        complete().click();
        assert.equal(complete().getAttribute("aria-pressed"), "true");
        assert.match($("timerStatus").textContent, /rest running/);
        fill("reps", "11");
        assert.equal(complete().getAttribute("aria-pressed"), "false");
        complete().click();
        assert.equal(
          w.document
            .querySelectorAll("[data-card]")[1]
            .querySelector('[data-field="weight"]').value,
          "",
        );
        $("saveWorkout").click();
        await waitFor(() => $("notice").textContent.includes("Workout saved"));
        assert.match($("historyList").textContent, /20.1 kg/);
        const stored = await (await w.fetch("/api/workouts")).json();
        assert.equal(stored[0].exercises.length, 1);
        assert.equal(stored[0].exercises[0].sets.length, 1);
        assert.equal(stored[0].exercises[0].sets[0].reps, 11);
        $("historyList").querySelector("[data-edit]").click();
        const edited = w.document.querySelector(
          '[data-card] [data-field="reps"]',
        );
        edited.value = "12";
        edited.dispatchEvent(new w.Event("input", { bubbles: true }));
        w.document.querySelector('[data-action="complete"]').click();
        $("saveWorkout").click();
        await waitFor(() => !w.document.querySelector("[data-card]"));
        await waitFor(() => !$("saveWorkout").disabled);
        const revised = await (await w.fetch("/api/workouts")).json();
        assert.equal(revised.length, 1);
        assert.equal(revised[0].exercises[0].sets[0].reps, 12);
        assert.equal($("saveWorkout").textContent, "Finish workout");
        $("generatePlan").click();
        await waitFor(() => $("savePlan"));
        $("savePlan").click();
        await waitFor(() =>
          $("planList").textContent.includes("Start this session"),
        );
        $("planList").querySelector("[data-day]").click();
        assert.ok(w.document.querySelectorAll("[data-card]").length > 1);
        assert.equal(
          w.document.querySelectorAll('.complete-set[aria-pressed="true"]')
            .length,
          0,
        );
        $("profileForm").elements.frequency.value = "4";
        $("profileForm").dispatchEvent(
          new w.SubmitEvent("submit", {
            bubbles: true,
            cancelable: true,
            submitter: $("profileForm").querySelector("button"),
          }),
        );
        await waitFor(
          () => $("notice").textContent === "Training profile saved.",
        );
        for (const route of [
          "dashboard",
          "history",
          "library",
          "progress",
          "plans",
          "coach",
          "body",
          "goals",
          "settings",
        ]) {
          w.location.hash = route;
          w.dispatchEvent(new w.HashChangeEvent("hashchange"));
          assert.equal(
            w.document.querySelector('[data-page="' + route + '"]').hidden,
            false,
          );
        }
        await waitFor(() => pending === 0);
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.deepEqual(errors, []);
      } finally {
        dom.window.close();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  );
