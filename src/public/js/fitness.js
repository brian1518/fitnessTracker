"use strict";
const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  exercises: [],
  workouts: [],
  plans: [],
  body: [],
  goals: [],
  profile: {},
  analytics: {},
  draft: null,
  plan: null,
  recommendation: null,
};
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const apiBase = (window.LANTERN_CONFIG?.apiBase || "").replace(/\/$/, "");
const remoteApi = Boolean(apiBase);
const authStorageKey = "lantern-session:" + apiBase;
let sessionToken = "";
try {
  if (remoteApi) sessionToken = sessionStorage.getItem(authStorageKey) || "";
} catch {}
function saveSessionToken(value) {
  sessionToken = value || "";
  try {
    if (sessionToken) sessionStorage.setItem(authStorageKey, sessionToken);
    else sessionStorage.removeItem(authStorageKey);
  } catch {}
}
$("demoLogin").hidden = window.LANTERN_CONFIG?.demoEnabled === false;
let noticeTimer;
function notice(message) {
  $("notice").textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("notice").textContent = ""), 7000);
}
async function api(path, method = "GET", data) {
  const response = await fetch(apiBase + "/api" + path, {
    method,
    credentials: remoteApi ? "omit" : "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": state.user?.csrf || "",
      ...(remoteApi && sessionToken
        ? { Authorization: "Bearer " + sessionToken }
        : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) saveSessionToken("");
    if (response.status === 401 && state.user) {
      state.user = null;
      $("appView").hidden = true;
      $("authView").hidden = false;
    }
    throw new Error(result.error || "Request failed.");
  }
  if (remoteApi && result.sessionToken) saveSessionToken(result.sessionToken);
  return result;
}
async function busy(button, work) {
  if (button.disabled) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Working…";
  try {
    await work();
  } catch (error) {
    notice(error.message);
  } finally {
    button.disabled = false;
    button.textContent =
      button.id === "saveWorkout"
        ? state.draft?.version
          ? "Save changes"
          : "Finish workout"
        : original;
  }
}
const options = (selected = "") =>
  state.exercises
    .map(
      (e) =>
        '<option value="' +
        escapeHtml(e.id) +
        '"' +
        (e.id === selected ? " selected" : "") +
        ">" +
        escapeHtml(e.name) +
        "</option>",
    )
    .join("");
const exerciseName = (id) =>
  state.exercises.find((e) => e.id === id)?.name || id;
const iconRefresh = () => window.lucide?.createIcons();
let register = false;
$("authToggle").onclick = () => {
  register = !register;
  $("nameLabel").hidden = !register;
  $("authName").required = register;
  $("authTitle").textContent = register
    ? "Create your account"
    : "Welcome back";
  $("authSubmit").textContent = register ? "Create account" : "Sign in";
  $("authToggle").textContent = register
    ? "Already have an account? Sign in"
    : "Create an account";
  $("authPassword").autocomplete = register
    ? "new-password"
    : "current-password";
};
$("authForm").onsubmit = (event) => {
  event.preventDefault();
  busy($("authSubmit"), async () => {
    $("authError").textContent = "";
    try {
      state.user = await api(
        "/auth/" + (register ? "register" : "login"),
        "POST",
        {
          name: $("authName").value,
          email: $("authEmail").value,
          password: $("authPassword").value,
        },
      );
      $("authPassword").value = "";
      await enterApp();
    } catch (error) {
      $("authError").textContent = error.message;
      throw error;
    }
  });
};
$("logout").onclick = () =>
  busy($("logout"), async () => {
    if (
      state.draft.exercises.length &&
      !confirm("Sign out and discard the unsaved session?")
    )
      return;
    sessionStorage.removeItem("lantern-draft:" + state.user.id);
    await api("/auth/logout", "POST");
    saveSessionToken("");
    location.reload();
  });
async function enterApp() {
  $("accountName").textContent = state.user.name;
  $("demoBanner").hidden = !state.user.is_demo;
  [state.exercises, state.profile] = await Promise.all([
    api("/exercises"),
    api("/profile"),
  ]);

  $("progressSelect").innerHTML = options();
  $("goalExercise").innerHTML = options();
  $("currentDate").textContent = new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
  }).format(new Date());
  $("equipmentOptions").innerHTML = [
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "bodyweight",
    "pullup-bar",
    "dip-bars",
  ]
    .map(
      (name) =>
        '<label><input type="checkbox" name="equipment" value="' +
        name +
        '">' +
        name +
        "</label>",
    )
    .join("");
  fillProfile();
  await refresh();
  logger.reset(true);
  navigate();
  iconRefresh();
  $("authView").hidden = true;
  $("appView").hidden = false;
}
async function refresh() {
  [state.workouts, state.plans, state.body, state.goals, state.analytics] =
    await Promise.all([
      api("/workouts"),
      api("/plans"),
      api("/body"),
      api("/goals"),
      api("/analytics?today=" + today()),
    ]);
  renderHistory();
  renderDashboard();
  renderLibrary();
  renderProgress();
  renderPlans();
  renderBody();
  renderGoals();
}
const pages = {
  today: "Today's workout",
  dashboard: "Your progress",
  history: "Workout history",
  library: "Exercise library",
  progress: "Exercise progress",
  plans: "Workout plans",
  coach: "Fitness coach",
  body: "Body progress",
  goals: "Your goals",
  settings: "Settings",
};
function navigate() {
  const page =
    location.hash.slice(1) in pages ? location.hash.slice(1) : "today";
  document
    .querySelectorAll("[data-page]")
    .forEach((element) => (element.hidden = element.dataset.page !== page));
  document
    .querySelectorAll("nav a")
    .forEach((link) =>
      link.setAttribute(
        "aria-current",
        link.hash === "#" + page ? "page" : "false",
      ),
    );
  $("pageTitle").textContent = pages[page];
  if (page === "coach" && state.user)
    loadCoach().catch((error) => notice(error.message));
}
addEventListener("hashchange", navigate);
const logger = window.createWorkoutLogger({
  state,
  api,
  busy,
  notice,
  today,
  escapeHtml,
  format,
  refresh,
  iconRefresh,
});
logger.init();
$("demoLogin").onclick = () =>
  busy($("demoLogin"), async () => {
    state.user = await api("/auth/demo", "POST", {});
    await enterApp();
  });
function renderHistory() {
  const query = $("historySearch").value.toLowerCase();
  const matches = state.workouts.filter((w) =>
    (w.name + " " + w.exercises.map((e) => e.name).join(" "))
      .toLowerCase()
      .includes(query),
  );
  $("historyList").innerHTML = matches.length
    ? matches
        .map(
          (w) =>
            '<article class="card"><div class="section-heading"><h2>' +
            escapeHtml(w.name) +
            '</h2><span class="muted">' +
            escapeHtml(w.date || "Date unavailable") +
            "</span></div>" +
            w.exercises
              .map(
                (e) =>
                  '<div class="item"><strong>' +
                  escapeHtml(e.name) +
                  '</strong><p class="hint">' +
                  e.sets
                    .map(
                      (s) =>
                        format.format(s.weight) +
                        " kg × " +
                        s.reps +
                        (s.kind === "warmup" ? " (warm-up)" : ""),
                    )
                    .join(" / ") +
                  '</p><p class="hint">' +
                  escapeHtml(e.notes) +
                  "</p></div>",
              )
              .join("") +
            '<div class="actions"><button class="secondary" data-repeat="' +
            w.id +
            '">Repeat workout</button><button class="secondary" data-edit="' +
            w.id +
            '">Edit</button><button class="text-button" data-delete="' +
            w.id +
            '">Delete</button></div></article>',
        )
        .join("")
    : '<div class="card muted">No saved sessions match. Your completed workouts will appear here.</div>';
}
$("historySearch").oninput = renderHistory;
$("historyList").onclick = (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  busy(button, async () => {
    const id =
      button.dataset.repeat || button.dataset.edit || button.dataset.delete;
    const workout = state.workouts.find((w) => w.id === id);
    if (button.dataset.delete) {
      if (!confirm("Delete this workout and its sets?")) return;
      await api("/workouts/" + id, "DELETE");
      await refresh();
      return;
    }
    logger.open(workout, Boolean(button.dataset.repeat));
  });
};
function renderDashboard() {
  $("adherence").textContent =
    state.analytics.weeklyDays +
    " of " +
    state.profile.frequency +
    " planned training days recorded this week.";
  $("streak").textContent =
    state.analytics.streak +
    " consecutive logged days. Plan rest days around your recovery.";
  const a = state.analytics;
  $("stats").innerHTML = [
    ["This week's workouts", a.weeklyWorkouts],
    ["Working sets", a.workingSets],
    ["Total volume (kg)", format.format(a.volume)],
    ["Training days this week", a.weeklyDays],
  ]
    .map(
      ([name, value]) =>
        '<div class="stat"><p>' +
        name +
        "</p><strong>" +
        value +
        "</strong></div>",
    )
    .join("");
  $("muscleChart").innerHTML =
    Object.entries(a.muscles || {})
      .map(
        ([name, value]) =>
          '<div class="bar"><span>' +
          escapeHtml(name) +
          '</span><progress max="' +
          Math.max(1, ...Object.values(a.muscles)) +
          '" value="' +
          value +
          '" aria-label="' +
          escapeHtml(name) +
          ' working sets"></progress><span>' +
          value +
          "</span></div>",
      )
      .join("") ||
    '<p class="muted">Log working sets to see your weekly muscle breakdown.</p>';
  $("records").innerHTML =
    Object.values(a.prs || {})
      .map(
        (r) =>
          '<div class="item"><strong>' +
          escapeHtml(r.name) +
          '</strong><p class="hint">' +
          format.format(r.weight) +
          " kg heaviest load" +
          (r.e1rm ? " · " + format.format(r.e1rm) + " kg estimated 1RM" : "") +
          "</p></div>",
      )
      .join("") ||
    '<p class="muted">Your first completed workout establishes your records.</p>';
  const now = new Date();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const offset =
    (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
  $("calendar").innerHTML =
    '<p class="muted">' +
    new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(now) +
    '</p><div class="calendar">' +
    ["M", "T", "W", "T", "F", "S", "S"]
      .map((d) => "<span>" + d + "</span>")
      .join("") +
    "<span></span>".repeat(offset) +
    Array.from({ length: days }, (_, i) => {
      const date = today().slice(0, 8) + String(i + 1).padStart(2, "0");
      const trained = a.trainingDates?.includes(date);
      return (
        '<span class="' +
        (trained ? "trained" : "") +
        '" aria-label="' +
        date +
        (trained ? ", workout recorded" : "") +
        '">' +
        (i + 1) +
        "</span>"
      );
    }).join("") +
    "</div>";
}
function renderLibrary() {
  const query = $("librarySearch").value.toLowerCase();
  $("libraryList").innerHTML =
    state.exercises
      .filter((e) =>
        (e.name + " " + e.muscle + " " + e.equipment)
          .toLowerCase()
          .includes(query),
      )
      .map(
        (e) =>
          '<article class="card"><h2>' +
          escapeHtml(e.name) +
          '</h2><p class="muted">' +
          escapeHtml(e.muscle) +
          " · " +
          escapeHtml(e.equipment) +
          '</p><button class="secondary" data-exercise="' +
          escapeHtml(e.id) +
          '">Log exercise</button></article>',
      )
      .join("") || '<p class="muted">No matching exercises.</p>';
}
$("librarySearch").oninput = renderLibrary;
$("libraryList").onclick = (event) => {
  const button = event.target.closest("[data-exercise]");
  if (button) {
    logger.add(button.dataset.exercise);
    location.hash = "today";
  }
};
function chart(container, points, label) {
  if (points.length < 2) {
    container.innerHTML =
      '<p class="muted">Record data on at least two dates to see a trend.</p>';
    return;
  }
  const values = points.map((p) => p.value),
    min = Math.min(...values),
    max = Math.max(...values),
    spread = max - min || 1;
  const coordinates = points.map((p, i) => [
    45 + (i * 490) / (points.length - 1),
    170 - ((p.value - min) * 130) / spread,
  ]);
  const path = coordinates
    .map(([x, y], i) => (i ? "L" : "M") + x + "," + y)
    .join(" ");
  container.innerHTML =
    '<svg class="chart" viewBox="0 0 580 215" role="img" aria-label="' +
    escapeHtml(label) +
    '"><line x1="45" y1="175" x2="540" y2="175"/><path d="' +
    path +
    '"/>' +
    coordinates
      .map(
        ([x, y], i) =>
          '<circle cx="' +
          x +
          '" cy="' +
          y +
          '" r="3"><title>' +
          escapeHtml(points[i].date + " · " + format.format(points[i].value)) +
          "</title></circle>",
      )
      .join("") +
    '<text x="5" y="45">' +
    format.format(max) +
    '</text><text x="5" y="175">' +
    format.format(min) +
    '</text><text x="45" y="203">' +
    escapeHtml(points[0].date) +
    '</text><text x="455" y="203">' +
    escapeHtml(points.at(-1).date) +
    "</text></svg>";
}
function renderProgress() {
  const id = $("progressSelect").value;
  const rows = state.workouts
    .filter((w) => w.date)
    .flatMap((w) =>
      w.exercises
        .filter((e) => e.exerciseId === id)
        .map((e) => {
          const sets = e.sets.filter((s) => s.kind === "working");
          const estimates = sets
            .filter((s) => s.weight > 0 && s.reps <= 10)
            .map((s) => s.weight * (1 + s.reps / 30));
          return {
            date: w.date,
            value: estimates.length ? Math.max(...estimates) : null,
            volume: sets.reduce((n, s) => n + s.weight * s.reps, 0),
            sets,
          };
        }),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  chart(
    $("strengthChart"),
    rows.filter((r) => r.value !== null),
    "Estimated one-rep maximum in kilograms",
  );
  $("progressTable").innerHTML = rows.length
    ? '<div class="table-scroll"><table><thead><tr><th>Date</th><th>Working sets</th><th>Volume (kg)</th></tr></thead><tbody>' +
      rows
        .map(
          (r) =>
            "<tr><td>" +
            r.date +
            "</td><td>" +
            r.sets
              .map((s) => format.format(s.weight) + " × " + s.reps)
              .join(" / ") +
            "</td><td>" +
            format.format(r.volume) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div>"
    : '<p class="muted">No recorded sessions for this exercise yet.</p>';
}
$("progressSelect").onchange = renderProgress;
function fillProfile() {
  for (const [key, value] of Object.entries(state.profile)) {
    if (key === "equipment") {
      document
        .querySelectorAll('[name="equipment"]')
        .forEach((input) => (input.checked = value.includes(input.value)));
      continue;
    }
    const input = $("profileForm").elements.namedItem(key);
    if (!input) continue;
    if (input.type === "checkbox") input.checked = value;
    else input.value = Array.isArray(value) ? value.join(", ") : (value ?? "");
  }
}
$("profileForm").onsubmit = (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const form = new FormData($("profileForm"));
    const profile = Object.fromEntries(form);
    ["age", "frequency", "duration"].forEach(
      (key) =>
        (profile[key] = profile[key] === "" ? null : Number(profile[key])),
    );
    profile.equipment = form.getAll("equipment");
    profile.muscles = profile.muscles
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    profile.aiConsent = form.has("aiConsent");
    state.profile = await api("/profile", "PUT", profile);
    notice("Training profile saved.");
  });
};
function renderPlanEditor() {
  const plan = state.plan;
  if (!plan) {
    $("planEditor").replaceChildren();
    return;
  }
  $("planEditor").innerHTML =
    '<label>Plan name<input id="planName" value="' +
    escapeHtml(plan.name) +
    '" maxlength="100"></label><p class="hint">' +
    escapeHtml(plan.guidance) +
    "</p>" +
    plan.days
      .map(
        (day, i) =>
          '<div class="item"><label>Day name<input data-day-name="' +
          i +
          '" value="' +
          escapeHtml(day.name) +
          '"></label>' +
          day.exercises
            .map(
              (e, j) =>
                '<div class="fields compact" data-plan-exercise="' +
                i +
                "," +
                j +
                '"><label>Exercise<select data-key="exerciseId">' +
                options(e.exerciseId) +
                '</select></label><label>Sets<input data-key="sets" type="number" min="1" max="6" value="' +
                e.sets +
                '"></label><label>Min reps<input data-key="targetMin" type="number" min="1" max="30" value="' +
                e.targetMin +
                '"></label><label>Max reps<input data-key="targetMax" type="number" min="1" max="30" value="' +
                e.targetMax +
                '"></label><label>Rest seconds<input data-key="restSeconds" type="number" min="30" max="300" value="' +
                e.restSeconds +
                '"></label><button class="text-button" data-remove-plan-exercise="' +
                i +
                "," +
                j +
                '">Remove</button></div>',
            )
            .join("") +
          '<button class="secondary" data-add-plan-exercise="' +
          i +
          '">Add exercise</button></div>',
      )
      .join("") +
    '<div class="actions"><button class="secondary" id="addPlanDay">Add day</button><button class="primary" id="savePlan">Save reviewed plan</button></div>';
}
function readPlanEditor() {
  state.plan.name = $("planName").value;
  document
    .querySelectorAll("[data-day-name]")
    .forEach(
      (input) =>
        (state.plan.days[Number(input.dataset.dayName)].name = input.value),
    );
  document.querySelectorAll("[data-plan-exercise]").forEach((row) => {
    const [i, j] = row.dataset.planExercise.split(",").map(Number);
    row
      .querySelectorAll("[data-key]")
      .forEach(
        (input) =>
          (state.plan.days[i].exercises[j][input.dataset.key] =
            input.dataset.key === "exerciseId"
              ? input.value
              : Number(input.value)),
      );
  });
}
$("generatePlan").onclick = () =>
  busy($("generatePlan"), async () => {
    if (state.plan && !confirm("Replace the unsaved plan draft?")) return;
    state.plan = await api("/plans/generate", "POST", state.profile);
    $("planSource").textContent =
      "Draft source · " +
      state.plan.source +
      ". Review and adjust before saving.";
    renderPlanEditor();
  });
$("customPlan").onclick = () => {
  state.plan = {
    name: "Custom routine",
    guidance: "Review your exercises, working sets and rep targets.",
    days: [
      {
        name: "Day 1",
        exercises: [
          {
            exerciseId: state.exercises[0].id,
            sets: 3,
            targetMin: 8,
            targetMax: 12,
            restSeconds: 120,
          },
        ],
      },
    ],
  };
  renderPlanEditor();
};
$("planEditor").onclick = (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  readPlanEditor();
  if (button.id === "savePlan")
    return busy(button, async () => {
      const id = state.plan.id;
      await api(
        "/plans" + (id ? "/" + id : ""),
        id ? "PUT" : "POST",
        state.plan,
      );
      state.plan = null;
      renderPlanEditor();
      await refresh();
      notice("Plan saved.");
    });
  if (button.id === "addPlanDay") {
    if (state.plan.days.length >= 6)
      return notice("A plan supports up to six training days.");
    state.plan.days.push({
      name: "Day " + (state.plan.days.length + 1),
      exercises: [],
    });
  }
  if (button.dataset.addPlanExercise !== undefined)
    state.plan.days[Number(button.dataset.addPlanExercise)].exercises.push({
      exerciseId: state.exercises[0].id,
      sets: 3,
      targetMin: 8,
      targetMax: 12,
      restSeconds: 120,
    });
  if (button.dataset.removePlanExercise) {
    const [i, j] = button.dataset.removePlanExercise.split(",").map(Number);
    state.plan.days[i].exercises.splice(j, 1);
  }
  renderPlanEditor();
};
function renderPlans() {
  $("planList").innerHTML =
    state.plans
      .map(
        (plan) =>
          '<article class="card"><div class="section-heading"><h2>' +
          escapeHtml(plan.name) +
          '</h2><button class="secondary" data-edit-plan="' +
          plan.id +
          '">Edit routine</button></div>' +
          plan.data.days
            .map(
              (day, i) =>
                '<div class="item"><strong>' +
                escapeHtml(day.name) +
                '</strong><p class="hint">' +
                day.exercises
                  .map(
                    (e) =>
                      escapeHtml(exerciseName(e.exerciseId)) +
                      " · " +
                      e.sets +
                      " × " +
                      e.targetMin +
                      "–" +
                      e.targetMax,
                  )
                  .join("<br>") +
                '</p><button class="secondary" data-start-plan="' +
                plan.id +
                '" data-day="' +
                i +
                '">Start this session</button></div>',
            )
            .join("") +
          "</article>",
      )
      .join("") ||
    '<div class="card muted">Generate or create your first routine above.</div>';
}
$("planList").onclick = (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const plan = state.plans.find(
    (p) => p.id === (button.dataset.editPlan || button.dataset.startPlan),
  );
  if (button.dataset.editPlan) {
    state.plan = { ...structuredClone(plan.data), id: plan.id };
    renderPlanEditor();
    return;
  }
  logger.startRoutine(plan.data.days[Number(button.dataset.day)]);
};
$("bodyForm").elements.date.value = today();
$("bodyForm").onsubmit = (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const data = Object.fromEntries(new FormData($("bodyForm")));
    data.weight = Number(data.weight);
    data.waist = data.waist === "" ? null : Number(data.waist);
    await api("/body", "POST", data);
    await refresh();
    notice("Measurement saved.");
  });
};
function renderBody() {
  chart(
    $("bodyChart"),
    [...state.body].reverse().map((r) => ({ date: r.date, value: r.weight })),
    "Bodyweight in kilograms",
  );
  $("bodyHistory").innerHTML =
    state.body
      .map(
        (r) =>
          '<div class="item">' +
          r.date +
          " · <strong>" +
          format.format(r.weight) +
          " kg</strong>" +
          (r.waist ? " · " + format.format(r.waist) + " cm waist" : "") +
          "</div>",
      )
      .join("") || '<p class="muted">Your measurements will appear here.</p>';
}
$("goalKind").onchange = () => {
  $("goalExerciseLabel").hidden = $("goalKind").value !== "strength";
};
$("goalForm").onsubmit = (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const data = Object.fromEntries(new FormData($("goalForm")));
    data.target = Number(data.target);
    data.deadline = data.deadline || null;
    if (data.kind !== "strength") data.exerciseId = null;
    await api("/goals", "POST", data);
    await refresh();
    notice("Goal saved.");
  });
};
function renderGoals() {
  $("goalList").innerHTML = state.goals
    .map((g) => {
      const value =
        g.kind === "strength"
          ? state.analytics.prs[g.exercise_id]?.weight
          : g.kind === "bodyweight"
            ? state.analytics.latestWeight
            : state.analytics.weeklyDays;
      const label =
        g.kind === "strength"
          ? exerciseName(g.exercise_id)
          : g.kind === "bodyweight"
            ? "Bodyweight"
            : "Training days per week";
      return (
        '<article class="card"><h2>' +
        escapeHtml(label) +
        "</h2><p>Target · <strong>" +
        format.format(g.target) +
        (g.kind === "frequency" ? " days" : " kg") +
        '</strong></p><p class="muted">Current · ' +
        (value === null || value === undefined
          ? "No data"
          : format.format(value)) +
        '</p><p class="hint">' +
        (value === null || value === undefined
          ? "Log data to track this goal."
          : format.format(Math.abs(g.target - value)) +
            " " +
            (g.kind === "frequency" ? "days" : "kg") +
            " difference from target.") +
        (g.deadline ? " Target date " + g.deadline + "." : "") +
        '</p><button class="text-button" data-goal-delete="' +
        g.id +
        '">Delete goal</button></article>'
      );
    })
    .join("");
}
$("goalList").onclick = (event) => {
  const button = event.target.closest("[data-goal-delete]");
  if (button)
    busy(button, async () => {
      if (!confirm("Delete this goal?")) return;
      await api("/goals/" + button.dataset.goalDelete, "DELETE");
      await refresh();
    });
};
function answerHtml(answer) {
  return (
    '<p class="hint">' +
    escapeHtml(answer.source) +
    "</p><h3>Recorded facts</h3><p>" +
    answer.facts.weeklyWorkouts +
    " workouts this week · " +
    format.format(answer.facts.weekVolume) +
    " kg weekly volume.</p><h3>Summary</h3><p>" +
    escapeHtml(answer.summary) +
    "</p>" +
    [
      ["Interpretations", answer.interpretations],
      ["Suggested adjustments", answer.adjustments],
      ["Next targets", answer.nextTargets],
    ]
      .map(
        ([name, items]) =>
          "<h3>" +
          name +
          "</h3><ul>" +
          items.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") +
          "</ul>",
      )
      .join("")
  );
}
async function loadCoach() {
  const messages = await api("/coach");
  $("coachAnswers").innerHTML = messages
    .map(
      (message) =>
        '<article class="card"><h2>' +
        escapeHtml(message.question) +
        "</h2>" +
        answerHtml(message.answer) +
        "</article>",
    )
    .join("");
}
$("coachForm").onsubmit = (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    await api("/coach", "POST", {
      question: $("coachQuestion").value,
      today: today(),
    });
    await loadCoach();
  });
};
$("weeklyReview").onclick = () => {
  $("coachQuestion").value =
    "Review this week's workouts, improvements, personal records, consistency, areas needing attention, and next week's targets.";
  $("coachForm").requestSubmit($("coachForm").querySelector('[type="submit"]'));
};
let importData = null;
function previewImport(data) {
  if (!Array.isArray(data) || data.length > 10000)
    throw Error("Choose a JSON array with up to 10,000 sets.");
  importData = data;
  $("importPreview").innerHTML =
    "<p>" +
    data.length +
    ' sets found. Original dates will be preserved; undated sets stay undated.</p><button id="confirmImport" class="primary">Confirm import to my account</button>';
  $("confirmImport").onclick = () =>
    busy($("confirmImport"), async () => {
      const result = await api("/import", "POST", { sets: importData });
      await refresh();
      $("importPreview").textContent =
        result.imported +
        " sessions imported. Previously imported sets were skipped.";
    });
}
$("importLocal").onclick = () => {
  try {
    previewImport(JSON.parse(localStorage.getItem("workouts") || "[]"));
  } catch (error) {
    notice(error.message);
  }
};
$("importFile").onchange = async () => {
  try {
    const file = $("importFile").files[0];
    if (file) {
      if (file.size > 900000)
        throw Error("Choose a JSON file smaller than 900 KB.");
      previewImport(JSON.parse(await file.text()));
    }
  } catch (error) {
    notice(error.message);
  }
};
addEventListener("beforeunload", (event) => {
  if (state.user && state.draft?.exercises.length) {
    event.preventDefault();
    event.returnValue = "";
  }
});
(async () => {
  try {
    state.user = await api("/auth/me");
    await enterApp();
  } catch (error) {
    if (
      error.message !== "Please sign in." &&
      !error.message.includes("expired")
    )
      $("authError").textContent = error.message;
  }
})();
