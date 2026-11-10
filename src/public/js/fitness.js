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
  lastSaved: null,
  historyLimit: 20,
};
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const shortDateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
// Dates are stored as YYYY-MM-DD; format them without shifting time zones.
const parseDate = (value) =>
  new Date(String(value).slice(0, 10) + "T12:00:00Z");
const formatDate = (value, short = false) => {
  const date = parseDate(value);
  if (!value || Number.isNaN(date.getTime())) return "Date unavailable";
  return (short ? shortDateFormat : dateFormat).format(date);
};
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const plural = (count, word) => count + " " + word + (count === 1 ? "" : "s");
const signed = (value) => (value > 0 ? "+" : "") + format.format(value);
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const addDays = (date, days) => {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const apiBase = (window.LANTERN_CONFIG?.apiBase || "").replace(/\/$/, "");
const remoteApi = Boolean(apiBase);
const demoEnabled = window.LANTERN_CONFIG?.demoEnabled !== false;
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
$("demoBlock").hidden = !demoEnabled;
$("homeDemo").hidden = !demoEnabled;
let noticeTimer;
// A short status message, optionally with one action such as Undo.
function notice(message, action) {
  const element = $("notice");
  element.replaceChildren(document.createTextNode(message));
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "notice-action";
    button.textContent = action.label;
    button.onclick = () => {
      element.replaceChildren();
      action.run();
    };
    element.append(button);
  }
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => element.replaceChildren(),
    action ? 10000 : 7000,
  );
}
async function api(path, method = "GET", data) {
  let response;
  try {
    response = await fetch(apiBase + "/api" + path, {
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
  } catch {
    throw new Error(
      "Cannot reach the server. Check your connection and try again.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server sent an unexpected response. Try again.");
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/account/delete") {
      const wasSignedIn = Boolean(state.user) && !path.startsWith("/auth/");
      saveSessionToken("");
      if (wasSignedIn) {
        state.user = null;
        $("authError").textContent =
          "Your session ended. Sign in again; a workout in progress is still on this device.";
        if (location.hash === "#signin") route();
        else location.hash = "signin";
      }
    }
    throw new Error(result.error || "Request failed.");
  }
  if (remoteApi && result.sessionToken) saveSessionToken(result.sessionToken);
  return result;
}
async function busy(button, work, workingLabel = "Working…") {
  if (button.disabled) return;
  const original = button.innerHTML;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = workingLabel;
  try {
    await work();
  } catch (error) {
    notice(error.message);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.id === "saveWorkout")
      button.textContent = state.draft?.version
        ? "Save changes"
        : "Finish workout";
    else button.innerHTML = original;
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
const equipmentNames = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  machine: "Machine",
  cable: "Cable",
  bodyweight: "Bodyweight",
  "pullup-bar": "Pull-up bar",
  "dip-bars": "Dip bars",
};
const equipmentChecks = (name) =>
  Object.entries(equipmentNames)
    .map(
      ([value, text]) =>
        '<label><input type="checkbox" name="' +
        name +
        '" value="' +
        value +
        '">' +
        text +
        "</label>",
    )
    .join("");

/* Sign in and account creation */
let register = false;
function setAuthMode(next) {
  register = next;
  $("nameLabel").hidden = !register;
  $("authName").required = register;
  $("authTitle").textContent = register ? "Create your account" : "Sign in";
  $("authLead").textContent = register
    ? "Start logging in under a minute."
    : "Welcome back to your training log.";
  $("authSubmit").textContent = register ? "Create account" : "Sign in";
  $("authToggle").textContent = register
    ? "I already have an account"
    : "Create an account";
  $("authPassword").autocomplete = register
    ? "new-password"
    : "current-password";
  if (register) $("authPassword").minLength = 12;
  else $("authPassword").removeAttribute("minlength");
  $("passwordHint").hidden = !register;
  $("recoveryNote").hidden = register;
  document.title =
    (register ? "Create account" : "Sign in") + " · Lantern Training";
}
$("authToggle").onclick = () => {
  $("authError").textContent = "";
  setAuthMode(!register);
};
$("togglePassword").onclick = () => {
  const show = $("authPassword").type === "password";
  $("authPassword").type = show ? "text" : "password";
  $("togglePassword").textContent = show ? "Hide" : "Show";
  $("togglePassword").setAttribute("aria-pressed", String(show));
  $("togglePassword").setAttribute(
    "aria-label",
    show ? "Hide password" : "Show password",
  );
};
$("authForm").onsubmit = (event) => {
  event.preventDefault();
  // The hosted server sleeps when idle; say so instead of looking frozen.
  const slow = setTimeout(
    () =>
      ($("authWait").textContent =
        "Still working. The server may be waking up, which can take up to a minute."),
    6000,
  );
  busy(
    $("authSubmit"),
    async () => {
      $("authError").textContent = "";
      const creating = register;
      try {
        state.user = await api(
          "/auth/" + (creating ? "register" : "login"),
          "POST",
          {
            ...(creating ? { name: $("authName").value } : {}),
            email: $("authEmail").value,
            password: $("authPassword").value,
          },
        );
        $("authPassword").value = "";
        await enterApp(creating ? "welcome" : "today");
      } catch (error) {
        $("authError").textContent =
          creating && /already exists/i.test(error.message)
            ? "An account with this email already exists. Sign in instead."
            : error.message;
        $("authError").scrollIntoView?.({ block: "nearest" });
      } finally {
        clearTimeout(slow);
        $("authWait").textContent = "";
      }
    },
    register ? "Creating account…" : "Signing in…",
  );
};
function signOut(button) {
  busy(button, async () => {
    if (
      logger.hasDraft() &&
      !confirm("Sign out and discard the workout you have in progress?")
    )
      return;
    logger.clearDraft();
    try {
      await api("/auth/logout", "POST");
    } finally {
      saveSessionToken("");
    }
    location.hash = "";
    location.reload();
  });
}
$("logout").onclick = () => signOut($("logout"));
$("logoutProfile").onclick = () => signOut($("logoutProfile"));
function demoSignIn(button) {
  busy(button, async () => {
    state.user = await api("/auth/demo", "POST", {});
    await enterApp("today");
  });
}
$("demoLogin").onclick = () => demoSignIn($("demoLogin"));
$("homeDemo").onclick = () => demoSignIn($("homeDemo"));

async function enterApp(landing) {
  $("accountName").textContent = state.user.name;
  $("accountNameFull").textContent = state.user.name;
  $("accountEmail").textContent = state.user.email;
  $("demoBanner").hidden = !state.user.is_demo;
  $("deleteBox").hidden = Boolean(state.user.is_demo);
  [state.exercises, state.profile] = await Promise.all([
    api("/exercises"),
    api("/profile"),
  ]);
  $("currentDate").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  $("equipmentOptions").innerHTML = equipmentChecks("equipment");
  $("onboardEquipment").innerHTML = equipmentChecks("onboardEquipment");
  fillProfile();
  await refresh();
  fillExerciseSelects();
  logger.reset(true);
  iconRefresh();
  if (landing && !(location.hash.slice(1) in pages && landing === "today"))
    location.hash = landing;
  route();
}
function fillExerciseSelects() {
  const logged = new Set(
    state.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)),
  );
  const current = $("progressSelect").value;
  const yours = state.exercises.filter((e) => logged.has(e.id));
  const option = (e) =>
    '<option value="' +
    escapeHtml(e.id) +
    '">' +
    escapeHtml(e.name) +
    "</option>";
  $("progressSelect").innerHTML =
    (yours.length
      ? '<optgroup label="Exercises you have logged">' +
        yours.map(option).join("") +
        "</optgroup>"
      : "") +
    '<optgroup label="All exercises">' +
    state.exercises
      .filter((e) => !logged.has(e.id))
      .map(option)
      .join("") +
    "</optgroup>";
  if (current && state.exercises.some((e) => e.id === current))
    $("progressSelect").value = current;
  const goalExercise = $("goalExercise").value;
  $("goalExercise").innerHTML = options(goalExercise);
  $("libraryMuscle").innerHTML =
    '<option value="">All muscles</option>' +
    [...new Set(state.exercises.map((e) => e.muscle))]
      .sort()
      .map((m) => "<option>" + escapeHtml(m) + "</option>")
      .join("");
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
  fillExerciseSelects();
  renderHistory();
  renderDashboard();
  renderLibrary();
  renderProgress();
  renderPlans();
  renderBody();
  renderGoals();
  iconRefresh();
}

/* Views and navigation */
// page id -> [heading, main navigation group]
const pages = {
  today: ["Today", "today"],
  welcome: ["Welcome", "today"],
  plans: ["Routines", "routines"],
  library: ["Routines", "routines"],
  dashboard: ["Progress", "progress"],
  history: ["Progress", "progress"],
  progress: ["Progress", "progress"],
  body: ["Progress", "progress"],
  goals: ["Progress", "progress"],
  coach: ["Coach", "coach"],
  settings: ["Profile", "profile"],
};
// Friendly names for the five destinations resolve to their first page.
const aliases = {
  routines: "plans",
  overview: "dashboard",
  profile: "settings",
  account: "settings",
};
function showView(name) {
  const changed = $(name + "View").hidden;
  for (const view of ["home", "auth", "legal", "app"])
    $(view + "View").hidden = view !== name;
  if (changed) document.documentElement.scrollTop = 0;
}
let lastPage = "";
function navigate() {
  const hash = aliases[location.hash.slice(1)] || location.hash.slice(1);
  const page = hash in pages ? hash : "today";
  const [title, group] = pages[page];
  document
    .querySelectorAll("[data-page]")
    .forEach((element) => (element.hidden = element.dataset.page !== page));
  document
    .querySelectorAll("#navigation a")
    .forEach((link) =>
      link.setAttribute(
        "aria-current",
        link.dataset.group === group ? "page" : "false",
      ),
    );
  document.querySelectorAll(".subnav").forEach((nav) => {
    nav.hidden = nav.id !== "subnav-" + group;
    nav
      .querySelectorAll("a")
      .forEach((link) =>
        link.setAttribute(
          "aria-current",
          link.hash === "#" + page ? "page" : "false",
        ),
      );
  });
  $("pageTitle").textContent = title;
  $("currentDate").hidden = page !== "today";
  document.title = title + " · Lantern Training";
  if (page !== lastPage) {
    lastPage = page;
    document.documentElement.scrollTop = 0;
  }
  if (page === "coach" && state.user)
    loadCoach().catch((error) => notice(error.message));
}
// Where "Back" on the privacy and help page returns to.
let returnHash = "";
function route() {
  const hash = location.hash.slice(1);
  if (hash !== "privacy" && hash !== "help") returnHash = hash;
  if (hash === "privacy" || hash === "help") {
    showView("legal");
    document.title = "Privacy and help · Lantern Training";
    $(hash + "-title").scrollIntoView?.();
    return;
  }
  if (!state.user) {
    if (hash === "signin" || hash === "signup") {
      setAuthMode(hash === "signup");
      showView("auth");
      return;
    }
    showView("home");
    document.title = "Lantern Training";
    return;
  }
  showView("app");
  navigate();
}
addEventListener("hashchange", route);
$("legalBack").onclick = (event) => {
  event.preventDefault();
  location.hash = returnHash;
};
const logger = window.createWorkoutLogger({
  state,
  api,
  busy,
  notice,
  today,
  escapeHtml,
  format,
  formatDate,
  refresh,
  iconRefresh,
});
logger.init();

/* History */
const workingSets = (exercise) =>
  exercise.sets.filter((s) => s.kind === "working");
const volumeOf = (sets) => sets.reduce((n, s) => n + s.weight * s.reps, 0);
const estimate = (sets) => {
  const values = sets
    .filter((s) => s.weight > 0 && s.reps <= 10)
    .map((s) => s.weight * (1 + s.reps / 30));
  return values.length ? Math.max(...values) : null;
};
function renderHistory() {
  const query = $("historySearch").value.toLowerCase();
  const matches = state.workouts.filter((w) =>
    (w.name + " " + w.exercises.map((e) => e.name).join(" "))
      .toLowerCase()
      .includes(query),
  );
  const shown = matches.slice(0, state.historyLimit);
  $("historyCount").textContent = state.workouts.length
    ? "Showing " +
      shown.length +
      " of " +
      plural(matches.length, "workout") +
      (query ? " matching your search" : "") +
      ". Weights in kg."
    : "";
  $("historyMore").hidden = matches.length <= shown.length;
  $("historyList").innerHTML = shown.length
    ? shown
        .map((w) => {
          const sets = w.exercises.flatMap(workingSets);
          return (
            '<article class="card history-card"><div class="section-heading"><div><h2>' +
            escapeHtml(w.name) +
            '</h2><p class="hint">' +
            escapeHtml(formatDate(w.date)) +
            " · " +
            plural(w.exercises.length, "exercise") +
            " · " +
            plural(sets.length, "working set") +
            " · " +
            format.format(volumeOf(sets)) +
            " kg volume" +
            (w.pain ? " · pain noted" : "") +
            "</p></div></div>" +
            w.exercises
              .map(
                (e) =>
                  '<div class="item"><strong>' +
                  escapeHtml(e.name) +
                  '</strong><p class="set-line">' +
                  e.sets
                    .map(
                      (s) =>
                        format.format(s.weight) +
                        " kg × " +
                        s.reps +
                        (s.kind === "warmup" ? " (warm-up)" : ""),
                    )
                    .join(" · ") +
                  "</p>" +
                  (e.notes
                    ? '<p class="hint">' + escapeHtml(e.notes) + "</p>"
                    : "") +
                  "</div>",
              )
              .join("") +
            (w.notes ? '<p class="hint">' + escapeHtml(w.notes) + "</p>" : "") +
            '<div class="actions"><button class="secondary" data-repeat="' +
            w.id +
            '">Repeat workout</button><button class="secondary" data-edit="' +
            w.id +
            '">Edit</button><button class="text-button danger-text" data-delete="' +
            w.id +
            '">Delete</button></div></article>'
          );
        })
        .join("")
    : '<div class="card empty-state"><h2>' +
      (state.workouts.length ? "No sessions match" : "No workouts yet") +
      '</h2><p class="muted">' +
      (state.workouts.length
        ? "Try a different workout or exercise name."
        : "Each workout you finish appears here with its sets, and can be repeated or edited.") +
      "</p>" +
      (state.workouts.length
        ? ""
        : '<a class="button primary" href="#today">Start a workout</a>') +
      "</div>";
}
$("historySearch").oninput = () => {
  state.historyLimit = 20;
  renderHistory();
};
$("historyMore").onclick = () => {
  state.historyLimit += 20;
  renderHistory();
};
$("historyList").onclick = (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  busy(button, async () => {
    const id =
      button.dataset.repeat || button.dataset.edit || button.dataset.delete;
    const workout = state.workouts.find((w) => w.id === id);
    if (button.dataset.delete) {
      if (
        !confirm(
          'Delete "' +
            workout.name +
            '" and its sets from your account? This cannot be undone.',
        )
      )
        return;
      await api("/workouts/" + id, "DELETE");
      await refresh();
      notice("Workout deleted.");
      return;
    }
    logger.open(workout, Boolean(button.dataset.repeat));
  });
};

/* Progress overview */
// One entry per exercise: dated sessions, oldest first, with measured and estimated values.
function liftSessions() {
  const lifts = new Map();
  for (const w of state.workouts) {
    if (!w.date) continue;
    for (const e of w.exercises) {
      const sets = workingSets(e);
      if (!sets.length) continue;
      const lift = lifts.get(e.exerciseId) || {
        id: e.exerciseId,
        name: e.name,
        muscle: e.muscle,
        sessions: [],
      };
      lift.sessions.push({
        date: w.date,
        sets,
        e1rm: estimate(sets),
        top: Math.max(...sets.map((s) => s.weight)),
        volume: volumeOf(sets),
      });
      lifts.set(e.exerciseId, lift);
    }
  }
  for (const lift of lifts.values())
    lift.sessions.sort((a, b) => a.date.localeCompare(b.date));
  return [...lifts.values()];
}
function trendWord(change) {
  if (Math.abs(change) < 0.05) return ["minus", "No change"];
  return change > 0 ? ["trending-up", "Up"] : ["trending-down", "Down"];
}
function barChart(rows, label) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const width = 600 / rows.length;
  return (
    '<svg class="bars" viewBox="0 0 600 150" role="img" aria-label="' +
    escapeHtml(label) +
    '">' +
    rows
      .map((r, i) => {
        const height = (r.value / max) * 92;
        const x = i * width + width * 0.2;
        return (
          '<rect class="' +
          (r.current ? "current" : "") +
          '" x="' +
          x +
          '" y="' +
          (112 - Math.max(height, 2)) +
          '" width="' +
          width * 0.6 +
          '" height="' +
          Math.max(height, 2) +
          '" rx="4"><title>' +
          escapeHtml(r.title) +
          '</title></rect><text class="value" x="' +
          (x + width * 0.3) +
          '" y="' +
          (104 - height) +
          '">' +
          r.value +
          '</text><text x="' +
          (x + width * 0.3) +
          '" y="134">' +
          escapeHtml(r.label) +
          "</text>"
        );
      })
      .join("") +
    "</svg>"
  );
}
function renderDashboard() {
  const a = state.analytics;
  const planned = state.profile.frequency || 3;
  const dates = a.trainingDates || [];
  const hasData = state.workouts.length > 0;
  $("stats").innerHTML = [
    ["Workouts this week", a.weeklyWorkouts ?? 0, ""],
    [
      "Training days this week",
      (a.weeklyDays ?? 0) + " / " + planned,
      "planned",
    ],
    ["Volume this week", format.format(a.weekVolume || 0), "kg"],
    ["Workouts recorded", a.totalWorkouts ?? 0, "all time"],
  ]
    .map(
      ([name, value, unit]) =>
        '<div class="stat"><p>' +
        name +
        "</p><strong>" +
        value +
        "</strong>" +
        (unit ? " <span>" + unit + "</span>" : "") +
        "</div>",
    )
    .join("");

  // Consistency: training days in each of the last eight weeks.
  const now = today();
  const monday = addDays(now, -((parseDate(now).getUTCDay() + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(monday, (i - 7) * 7);
    const end = addDays(start, 6);
    const value = dates.filter((d) => d >= start && d <= end).length;
    return {
      value,
      current: i === 7,
      label: i === 7 ? "This week" : formatDate(start, true),
      title:
        "Week of " + formatDate(start) + ": " + plural(value, "training day"),
    };
  });
  $("adherence").textContent = hasData
    ? (a.weeklyDays ?? 0) +
      " of " +
      planned +
      " planned training days recorded this week."
    : "No workouts recorded yet.";
  $("weekChart").innerHTML = hasData
    ? barChart(weeks, "Training days per week over the last eight weeks") +
      '<p class="hint chart-caption">Training days per week, last 8 weeks. Your plan is ' +
      plural(planned, "day") +
      " a week (change it in Profile).</p>"
    : '<p class="muted">After your first workout, this shows how many days you trained in each of the last eight weeks against your weekly plan.</p>';
  const met = weeks.slice(0, 7).filter((w) => w.value >= planned).length;
  $("streak").textContent = hasData
    ? "You met your weekly plan in " +
      met +
      " of the previous 7 weeks. " +
      (a.streak > 1 ? a.streak + " consecutive days logged. " : "") +
      "Rest days are part of training."
    : "";

  // Lifts: latest estimated 1RM against the oldest session in the previous eight weeks.
  const lifts = liftSessions();
  const trends = lifts
    .map((lift) => {
      const sessions = lift.sessions.filter((s) => s.e1rm !== null);
      if (sessions.length < 2) return null;
      const latest = sessions.at(-1);
      const earlier = sessions.filter(
        (s) => s.date >= addDays(latest.date, -56) && s !== latest,
      );
      const base = earlier[0] || sessions.at(-2);
      return { lift, latest, base, change: latest.e1rm - base.e1rm, sessions };
    })
    .filter(Boolean)
    .sort((x, y) => y.latest.date.localeCompare(x.latest.date));
  $("liftTrends").innerHTML = trends.length
    ? trends
        .slice(0, 6)
        .map((t) => {
          const [icon, word] = trendWord(t.change);
          return (
            '<div class="item trend"><div><strong>' +
            escapeHtml(t.lift.name) +
            '</strong><p class="hint">Estimated 1RM ' +
            format.format(t.latest.e1rm) +
            " kg on " +
            escapeHtml(formatDate(t.latest.date, true)) +
            '</p></div><p class="trend-change" data-trend="' +
            word.toLowerCase().replace(" ", "-") +
            '"><i data-lucide="' +
            icon +
            '"></i><span>' +
            (word === "No change"
              ? "No change"
              : word + " " + format.format(Math.abs(t.change)) + " kg") +
            "</span><small>since " +
            escapeHtml(formatDate(t.base.date, true)) +
            "</small></p></div>"
          );
        })
        .join("") +
      '<p class="hint"><a href="#progress">See every session for a lift</a></p>'
    : '<p class="muted">Log the same exercise on two different days to compare it here. Sets of 10 reps or fewer are used for the estimate.</p>';

  // Focus: plain rules over recorded data, each with its reason.
  const focus = [];
  if (!hasData)
    focus.push([
      "Log your first workout.",
      "Suggestions are based only on what you record.",
      "#today",
      "Go to Today",
    ]);
  else {
    const remaining = planned - (a.weeklyDays ?? 0);
    focus.push(
      remaining > 0
        ? [
            "Train on " + plural(remaining, "more day") + " this week.",
            "Your plan is " +
              plural(planned, "day") +
              " a week and " +
              (a.weeklyDays ?? 0) +
              " " +
              ((a.weeklyDays ?? 0) === 1 ? "is" : "are") +
              " recorded.",
            "#today",
            "Start a workout",
          ]
        : [
            "Weekly plan reached.",
            (a.weeklyDays ?? 0) +
              " training days recorded against a plan of " +
              planned +
              ". Recovery counts too.",
          ],
    );
    for (const t of trends
      .filter((t) => {
        const last = t.sessions.slice(-3);
        const values = last.map((s) => s.e1rm);
        return (
          last.length === 3 &&
          Math.max(...values) - Math.min(...values) < Math.max(...values) * 0.01
        );
      })
      .slice(0, 2))
      focus.push([
        t.lift.name + " has held steady for your last 3 sessions.",
        "Estimated 1RM stayed at about " +
          format.format(t.latest.e1rm) +
          " kg. Check its suggested target next time you log it.",
        "#progress",
        "View lift history",
      ]);
    const lastByMuscle = new Map();
    for (const lift of lifts)
      if (lift.muscle && lift.muscle !== "unclassified")
        lastByMuscle.set(
          lift.muscle,
          [lastByMuscle.get(lift.muscle), lift.sessions.at(-1).date]
            .filter(Boolean)
            .sort()
            .at(-1),
        );
    for (const [muscle, date] of [...lastByMuscle]
      .filter(
        ([, date]) => date < addDays(now, -14) && date >= addDays(now, -70),
      )
      .slice(0, 2))
      focus.push([
        "No " + muscle + " work logged in over two weeks.",
        "Your last recorded " +
          muscle +
          " exercise was on " +
          formatDate(date) +
          ".",
      ]);
  }
  $("focusList").innerHTML = focus
    .map(
      ([title, reason, href, action]) =>
        "<li><strong>" +
        escapeHtml(title) +
        '</strong><p class="hint"><span class="reason-label">Why:</span> ' +
        escapeHtml(reason) +
        "</p>" +
        (href
          ? '<a class="text-link" href="' + href + '">' + action + "</a>"
          : "") +
        "</li>",
    )
    .join("");

  $("muscleChart").innerHTML =
    Object.entries(a.muscles || {})
      .sort((x, y) => y[1] - x[1])
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
    '<p class="muted">Working sets you log this week are counted here by muscle group.</p>';
  $("records").innerHTML =
    Object.values(a.prs || {})
      .sort((x, y) => x.name.localeCompare(y.name))
      .map(
        (r) =>
          '<div class="record"><strong>' +
          escapeHtml(r.name) +
          "</strong><p>" +
          (r.weight > 0
            ? format.format(r.weight) +
              ' kg <span class="hint">heaviest load</span>'
            : '<span class="hint">Bodyweight only so far</span>') +
          "</p>" +
          (r.e1rm
            ? '<p class="hint">' +
              format.format(r.e1rm) +
              " kg estimated 1RM</p>"
            : "") +
          "</div>",
      )
      .join("") ||
    '<p class="muted">Your first completed workout sets your starting records.</p>';
  const date = parseDate(now);
  const days = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const offset =
    (new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    ).getUTCDay() +
      6) %
    7;
  $("calendar").innerHTML =
    '<p class="muted">' +
    new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date) +
    '</p><div class="calendar">' +
    ["M", "T", "W", "T", "F", "S", "S"]
      .map((d) => '<span class="weekday" aria-hidden="true">' + d + "</span>")
      .join("") +
    "<span></span>".repeat(offset) +
    Array.from({ length: days }, (_, i) => {
      const day = now.slice(0, 8) + String(i + 1).padStart(2, "0");
      const trained = dates.includes(day);
      return (
        '<span class="' +
        (trained ? "trained" : "") +
        (day === now ? " is-today" : "") +
        '" aria-label="' +
        formatDate(day) +
        (trained ? ", workout recorded" : "") +
        '">' +
        (i + 1) +
        "</span>"
      );
    }).join("") +
    "</div>";
}

/* Exercise library */
function renderLibrary() {
  const query = $("librarySearch").value.toLowerCase();
  const muscle = $("libraryMuscle").value;
  const matches = state.exercises.filter(
    (e) =>
      (e.name + " " + e.muscle + " " + e.equipment)
        .toLowerCase()
        .includes(query) &&
      (!muscle || e.muscle === muscle),
  );
  $("libraryCount").textContent =
    matches.length + " of " + plural(state.exercises.length, "exercise");
  $("libraryList").innerHTML =
    matches
      .map(
        (e) =>
          '<div class="library-row"><div><strong>' +
          escapeHtml(e.name) +
          "</strong>" +
          (e.owner_id ? ' <span class="tag">Custom</span>' : "") +
          '<p class="hint">' +
          escapeHtml(e.muscle) +
          " · " +
          escapeHtml(equipmentNames[e.equipment] || e.equipment) +
          '</p></div><button class="secondary small" data-exercise="' +
          escapeHtml(e.id) +
          '" aria-label="Add ' +
          escapeHtml(e.name) +
          " to today's workout\">Add to workout</button></div>",
      )
      .join("") ||
    '<p class="muted empty-note">No matching exercises. You can add a custom exercise above.</p>';
}
$("librarySearch").oninput = renderLibrary;
$("libraryMuscle").onchange = renderLibrary;
$("libraryList").onclick = (event) => {
  const button = event.target.closest("[data-exercise]");
  if (button) {
    logger.add(button.dataset.exercise);
    location.hash = "today";
  }
};
$("customExerciseForm").onsubmit = (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const data = Object.fromEntries(new FormData($("customExerciseForm")));
    const created = await api("/exercises", "POST", data);
    state.exercises = await api("/exercises");
    fillExerciseSelects();
    $("customExerciseForm").reset();
    $("librarySearch").value = created.name;
    $("libraryMuscle").value = "";
    renderLibrary();
    notice(created.name + " added to your library.");
  });
};

/* Charts */
function chart(container, points, { label, unit, empty }) {
  if (points.length < 2) {
    container.innerHTML =
      '<p class="muted">' +
      (points.length
        ? "One value recorded so far: " +
          format.format(points[0].value) +
          " " +
          unit +
          " on " +
          formatDate(points[0].date) +
          ". A trend line appears after a second date."
        : empty) +
      "</p>";
    return;
  }
  const values = points.map((p) => p.value);
  const pad = (Math.max(...values) - Math.min(...values)) * 0.12 || 1;
  const min = Math.max(0, Math.min(...values) - pad);
  const max = Math.max(...values) + pad;
  const left = 56;
  const right = 588;
  const x = (i) => left + (i * (right - left)) / (points.length - 1);
  const y = (value) => 172 - ((value - min) * 152) / (max - min);
  const ticks = [min, (min + max) / 2, max];
  container.innerHTML =
    '<svg class="chart" viewBox="0 0 600 212" role="img" aria-label="' +
    escapeHtml(label) +
    '">' +
    ticks
      .map(
        (tick) =>
          '<line x1="' +
          left +
          '" y1="' +
          y(tick) +
          '" x2="' +
          right +
          '" y2="' +
          y(tick) +
          '"/><text class="axis" x="' +
          (left - 8) +
          '" y="' +
          (y(tick) + 4) +
          '">' +
          format.format(tick) +
          "</text>",
      )
      .join("") +
    '<text class="unit" x="' +
    (left - 8) +
    '" y="10">' +
    escapeHtml(unit) +
    '</text><path d="' +
    points.map((p, i) => (i ? "L" : "M") + x(i) + "," + y(p.value)).join(" ") +
    '"/>' +
    points
      .map(
        (p, i) =>
          '<circle cx="' +
          x(i) +
          '" cy="' +
          y(p.value) +
          '" r="' +
          (points.length > 40 ? 2 : 3.5) +
          '"><title>' +
          escapeHtml(
            formatDate(p.date) + ": " + format.format(p.value) + " " + unit,
          ) +
          "</title></circle>",
      )
      .join("") +
    '<text x="' +
    left +
    '" y="200">' +
    escapeHtml(formatDate(points[0].date)) +
    '</text><text class="end" x="' +
    right +
    '" y="200">' +
    escapeHtml(formatDate(points.at(-1).date)) +
    "</text></svg>";
}
function renderProgress() {
  const id = $("progressSelect").value;
  const range = Number($("progressRange").value);
  const from = range ? addDays(today(), -range) : "";
  const lift = liftSessions().find((l) => l.id === id);
  const rows = (lift?.sessions || []).filter((s) => s.date >= from);
  const estimated = rows.filter((r) => r.e1rm !== null);
  const rangeText = range
    ? "since " + formatDate(from)
    : "across all recorded sessions";
  if (!rows.length)
    $("progressSummary").textContent = lift
      ? "No sessions for this exercise " + rangeText + "."
      : "";
  else if (estimated.length >= 2) {
    const first = estimated[0];
    const last = estimated.at(-1);
    $("progressSummary").textContent =
      "Estimated 1RM went from " +
      format.format(first.e1rm) +
      " kg (" +
      formatDate(first.date) +
      ") to " +
      format.format(last.e1rm) +
      " kg (" +
      formatDate(last.date) +
      "): " +
      signed(last.e1rm - first.e1rm) +
      " kg over " +
      plural(estimated.length, "session") +
      ".";
  } else
    $("progressSummary").textContent =
      plural(rows.length, "session") +
      " recorded " +
      rangeText +
      ". Heaviest working set: " +
      format.format(Math.max(...rows.map((r) => r.top))) +
      " kg.";
  chart(
    $("strengthChart"),
    estimated.map((r) => ({ date: r.date, value: r.e1rm })),
    {
      label:
        "Estimated one-rep maximum in kilograms for " +
        exerciseName(id) +
        ", " +
        rangeText,
      unit: "kg",
      empty: rows.length
        ? "These sessions have no loaded sets of 10 reps or fewer, so no estimate is calculated. The recorded sets are listed below."
        : "Log this exercise to see its estimated strength over time.",
    },
  );
  $("progressTable").innerHTML = rows.length
    ? '<div class="table-scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Working sets (kg × reps)</th><th scope="col" class="num">Est. 1RM (kg)</th><th scope="col" class="num">Volume (kg)</th></tr></thead><tbody>' +
      [...rows]
        .reverse()
        .map(
          (r) =>
            "<tr><td>" +
            escapeHtml(formatDate(r.date)) +
            "</td><td>" +
            r.sets
              .map((s) => format.format(s.weight) + " × " + s.reps)
              .join(" · ") +
            '</td><td class="num">' +
            (r.e1rm === null ? "–" : format.format(r.e1rm)) +
            '</td><td class="num">' +
            format.format(r.volume) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div>"
    : '<p class="muted">' +
      (lift
        ? "Nothing in this date range. Choose a longer range."
        : "No recorded sessions for this exercise yet. It appears here after you finish a workout that includes it.") +
      "</p>";
}
$("progressSelect").onchange = renderProgress;
$("progressRange").onchange = renderProgress;

/* Profile */
function fillProfile() {
  for (const [key, value] of Object.entries(state.profile)) {
    if (key === "equipment") {
      document
        .querySelectorAll('[name="equipment"],[name="onboardEquipment"]')
        .forEach((input) => (input.checked = value.includes(input.value)));
      continue;
    }
    for (const form of [$("profileForm"), $("onboardForm")]) {
      const input = form.elements.namedItem(key);
      if (!input) continue;
      if (input.type === "checkbox") input.checked = value;
      else
        input.value = Array.isArray(value) ? value.join(", ") : (value ?? "");
    }
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
    if (!profile.equipment.length)
      throw Error("Choose at least one type of equipment. Bodyweight counts.");
    profile.muscles = profile.muscles
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    profile.aiConsent = form.has("aiConsent");
    state.profile = await api("/profile", "PUT", profile);
    fillProfile();
    renderDashboard();
    iconRefresh();
    notice("Training profile saved.");
  });
};
$("onboardForm").onsubmit = (event) => {
  event.preventDefault();
  busy(event.submitter, async () => {
    const form = new FormData($("onboardForm"));
    const equipment = form.getAll("onboardEquipment");
    if (!equipment.length)
      throw Error("Choose at least one type of equipment. Bodyweight counts.");
    state.profile = await api("/profile", "PUT", {
      ...state.profile,
      goal: form.get("goal"),
      experience: form.get("experience"),
      frequency: Number(form.get("frequency")),
      equipment,
    });
    fillProfile();
    renderDashboard();
    iconRefresh();
    location.hash = "today";
    notice("Profile saved. Add your first exercise to begin.");
  });
};
$("exportData").onclick = () =>
  busy(
    $("exportData"),
    async () => {
      const data = await api("/export");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      link.download = "lantern-training-export-" + today() + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      notice(
        "Export downloaded: " + plural(data.workouts.length, "workout") + ".",
      );
    },
    "Preparing…",
  );
$("deleteForm").onsubmit = (event) => {
  event.preventDefault();
  busy(
    event.submitter,
    async () => {
      if (
        !confirm(
          "Permanently delete your account and all of its data? This cannot be undone.",
        )
      )
        return;
      await api("/account/delete", "POST", {
        password: $("deleteForm").elements.password.value,
      });
      logger.clearDraft();
      saveSessionToken("");
      state.user = null;
      location.hash = "";
      location.reload();
    },
    "Deleting…",
  );
};

/* Routines */
function renderPlanEditor() {
  const plan = state.plan;
  if (!plan) {
    $("planEditor").replaceChildren();
    return;
  }
  $("planEditor").innerHTML =
    '<label>Routine name<input id="planName" value="' +
    escapeHtml(plan.name) +
    '" maxlength="100"></label><p class="hint">' +
    escapeHtml(plan.guidance) +
    "</p>" +
    plan.days
      .map(
        (day, i) =>
          '<div class="item plan-day"><label>Day name<input data-day-name="' +
          i +
          '" value="' +
          escapeHtml(day.name) +
          '"></label>' +
          day.exercises
            .map(
              (e, j) =>
                '<div class="plan-exercise" data-plan-exercise="' +
                i +
                "," +
                j +
                '"><label class="plan-exercise-name">Exercise<select data-key="exerciseId">' +
                options(e.exerciseId) +
                '</select></label><label>Sets<input data-key="sets" type="number" inputmode="numeric" min="1" max="6" value="' +
                e.sets +
                '"></label><label>Min reps<input data-key="targetMin" type="number" inputmode="numeric" min="1" max="30" value="' +
                e.targetMin +
                '"></label><label>Max reps<input data-key="targetMax" type="number" inputmode="numeric" min="1" max="30" value="' +
                e.targetMax +
                '"></label><label>Rest (s)<input data-key="restSeconds" type="number" inputmode="numeric" min="30" max="300" value="' +
                e.restSeconds +
                '"></label><button class="text-button danger-text" type="button" data-remove-plan-exercise="' +
                i +
                "," +
                j +
                '">Remove</button></div>',
            )
            .join("") +
          '<button class="secondary small" type="button" data-add-plan-exercise="' +
          i +
          '">Add exercise</button></div>',
      )
      .join("") +
    '<div class="actions"><button class="secondary" type="button" id="addPlanDay">Add day</button><button class="primary" type="button" id="savePlan">Save reviewed plan</button><button class="text-button" type="button" id="cancelPlan">Cancel</button></div>';
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
const planSources = {
  disabled: "AI is turned off on this server",
  not_configured: "AI is not set up on this server",
  no_consent: "AI consent is off in your profile",
  daily_limit: "today's AI request limit is used up",
  provider_error: "the AI provider did not return a usable plan",
  demo: "AI is off in the demo",
};
$("generatePlan").onclick = () =>
  busy($("generatePlan"), async () => {
    if (state.plan && !confirm("Replace the unsaved plan draft?")) return;
    state.plan = await api("/plans/generate", "POST", state.profile);
    $("planSource").textContent =
      (state.plan.source === "xAI draft"
        ? "Draft written by xAI from your profile and recent sessions."
        : "Draft built from a fixed template using your profile (" +
          (planSources[state.plan.sourceReason] || "AI was not used") +
          ").") + " Review and adjust before saving.";
    renderPlanEditor();
  });
$("customPlan").onclick = () => {
  if (state.plan && !confirm("Replace the unsaved plan draft?")) return;
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
  $("planSource").textContent = "";
  renderPlanEditor();
};
$("planEditor").onclick = (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.id === "cancelPlan") {
    state.plan = null;
    $("planSource").textContent = "";
    renderPlanEditor();
    return;
  }
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
      $("planSource").textContent = "";
      renderPlanEditor();
      await refresh();
      logger.render();
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
          '</h2><button class="text-button" data-edit-plan="' +
          plan.id +
          '">Edit routine</button></div><div class="plan-days">' +
          plan.data.days
            .map(
              (day, i) =>
                '<div class="plan-day-card"><strong>' +
                escapeHtml(day.name) +
                '</strong><ul class="plain-list hint">' +
                day.exercises
                  .map(
                    (e) =>
                      "<li>" +
                      escapeHtml(exerciseName(e.exerciseId)) +
                      " · " +
                      e.sets +
                      " × " +
                      e.targetMin +
                      "–" +
                      e.targetMax +
                      "</li>",
                  )
                  .join("") +
                '</ul><button class="secondary" data-start-plan="' +
                plan.id +
                '" data-day="' +
                i +
                '">Start this session</button></div>',
            )
            .join("") +
          "</div></article>",
      )
      .join("") ||
    '<div class="card empty-state"><h2>No routines yet</h2><p class="muted">A routine is a set of training days you can start with one tap. Generate a draft from your profile or build one yourself below.</p></div>';
}
$("planList").onclick = (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const plan = state.plans.find(
    (p) => p.id === (button.dataset.editPlan || button.dataset.startPlan),
  );
  if (button.dataset.editPlan) {
    state.plan = { ...structuredClone(plan.data), id: plan.id };
    $("planSource").textContent = "Editing " + plan.name + ".";
    renderPlanEditor();
    $("planEditor").scrollIntoView?.({ block: "start" });
    return;
  }
  logger.startRoutine(plan.data.days[Number(button.dataset.day)]);
};

/* Body measurements */
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
  const records = [...state.body].reverse();
  $("bodySummary").textContent =
    records.length >= 2
      ? "Latest " +
        format.format(records.at(-1).weight) +
        " kg on " +
        formatDate(records.at(-1).date) +
        ": " +
        signed(records.at(-1).weight - records[0].weight) +
        " kg since " +
        formatDate(records[0].date) +
        "."
      : "";
  chart(
    $("bodyChart"),
    records.map((r) => ({ date: r.date, value: Number(r.weight) })),
    {
      label: "Bodyweight in kilograms over time",
      unit: "kg",
      empty:
        "Record your bodyweight on two dates to see a trend. Measurements are values you enter, not estimates.",
    },
  );
  $("bodyHistory").innerHTML = state.body
    .map(
      (r) =>
        '<div class="item measurement"><span>' +
        escapeHtml(formatDate(r.date)) +
        "</span><strong>" +
        format.format(r.weight) +
        " kg</strong>" +
        (r.waist
          ? '<span class="hint">' + format.format(r.waist) + " cm waist</span>"
          : "") +
        "</div>",
    )
    .join("");
}

/* Goals */
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
  $("goalList").innerHTML =
    state.goals
      .map((g) => {
        const value =
          g.kind === "strength"
            ? state.analytics.prs[g.exercise_id]?.weight
            : g.kind === "bodyweight"
              ? state.analytics.latestWeight
              : state.analytics.weeklyDays;
        const known = value !== null && value !== undefined;
        const unit = g.kind === "frequency" ? "days" : "kg";
        const label =
          g.kind === "strength"
            ? exerciseName(g.exercise_id)
            : g.kind === "bodyweight"
              ? "Bodyweight"
              : "Training days per week";
        const source =
          g.kind === "strength"
            ? "heaviest logged load"
            : g.kind === "bodyweight"
              ? "latest measurement"
              : "this week";
        const target = Number(g.target);
        const reached =
          known && g.kind !== "bodyweight" && Number(value) >= target;
        return (
          '<article class="card goal"><h2>' +
          escapeHtml(label) +
          '</h2><p class="goal-target"><strong>' +
          format.format(target) +
          " " +
          unit +
          '</strong> <span class="hint">target' +
          (g.deadline ? " by " + escapeHtml(formatDate(g.deadline)) : "") +
          "</span></p>" +
          (known && g.kind !== "bodyweight"
            ? '<progress max="' +
              target +
              '" value="' +
              Math.min(target, Number(value)) +
              '" aria-label="' +
              escapeHtml(label) +
              ' progress toward target"></progress>'
            : "") +
          '<p class="hint">' +
          (known
            ? "Now " +
              format.format(value) +
              " " +
              unit +
              " (" +
              source +
              "). " +
              (reached
                ? "Target reached."
                : format.format(Math.abs(target - value)) +
                  " " +
                  unit +
                  " from target.")
            : "No data yet. Log " +
              (g.kind === "bodyweight" ? "a measurement" : "a workout") +
              " to track this goal.") +
          '</p><button class="text-button danger-text" data-goal-delete="' +
          g.id +
          '">Delete goal</button></article>'
        );
      })
      .join("") ||
    '<div class="card empty-state"><h2>No goals yet</h2><p class="muted">Set a strength, bodyweight or weekly training target below. Progress is measured from what you log.</p></div>';
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

/* Coach */
const coachReasons = {
  disabled:
    "AI interpretation is turned off on this server. Answers summarise your recorded data using built-in rules.",
  not_configured:
    "AI interpretation is not set up on this server. Answers summarise your recorded data using built-in rules.",
  no_consent:
    "AI interpretation is available, but you have not allowed your training summary to be sent to xAI. Until you do, answers use built-in rules.",
  daily_limit:
    "Today's AI request limit has been reached. Answers use built-in rules until tomorrow.",
  provider_error:
    "The AI provider could not be reached or returned an unusable answer, so built-in rules were used instead.",
  demo: "AI is off in the demo workspace. Answers use built-in rules on the sample data.",
};
function renderCoachStatus(status) {
  const few = state.workouts.length < 2;
  $("coachStatus").dataset.state = status.available ? "ai" : "rules";
  $("coachStatus").innerHTML =
    '<i data-lucide="' +
    (status.available ? "sparkles" : "list-checks") +
    '"></i><div><strong>' +
    (status.available
      ? "Answers use xAI interpretation"
      : "Answers use built-in rules, not AI") +
    "</strong><p>" +
    (status.available
      ? "When you ask, a summary of your recent training and your coaching details is sent to xAI without your name or email. " +
        status.usedToday +
        " of " +
        status.dailyLimit +
        " requests used today."
      : escapeHtml(coachReasons[status.reason] || coachReasons.disabled)) +
    (status.reason === "no_consent"
      ? ' <a href="#settings">Review AI consent in Profile</a>.'
      : "") +
    "</p>" +
    (few
      ? "<p>You have " +
        plural(state.workouts.length, "recorded workout") +
        ". Answers become more useful after a few sessions.</p>"
      : "") +
    "</div>";
  iconRefresh();
}
function answerHtml(answer) {
  const ai = answer.source === "xAI interpretation";
  const facts = answer.facts || {};
  const list = (items) =>
    "<ul>" +
    (items || [])
      .map((item) => {
        // A trailing "Why: ..." is shown as the reason for the suggestion.
        const [text, ...why] = String(item).split(/\s+Why:\s*/);
        return (
          "<li>" +
          escapeHtml(text) +
          (why.length
            ? '<p class="hint"><span class="reason-label">Why:</span> ' +
              escapeHtml(why.join(" Why: ")) +
              "</p>"
            : "") +
          "</li>"
        );
      })
      .join("") +
    "</ul>";
  return (
    '<p class="source-tag" data-source="' +
    (ai ? "ai" : "rules") +
    '"><i data-lucide="' +
    (ai ? "sparkles" : "list-checks") +
    '"></i>' +
    (ai
      ? "Interpretation generated by xAI"
      : "Built-in rules, not AI" +
        (answer.sourceReason === "provider_error"
          ? " (the AI provider was unavailable)"
          : answer.sourceReason === "daily_limit"
            ? " (daily AI limit reached)"
            : "")) +
    '</p><h3>Recorded facts</h3><dl class="summary-facts"><div><dt>Workouts this week</dt><dd>' +
    (facts.weeklyWorkouts ?? 0) +
    "</dd></div><div><dt>Training days this week</dt><dd>" +
    (facts.weeklyDays ?? 0) +
    "</dd></div><div><dt>Volume this week</dt><dd>" +
    format.format(facts.weekVolume || 0) +
    " kg</dd></div><div><dt>Workouts recorded</dt><dd>" +
    (facts.totalWorkouts ?? 0) +
    "</dd></div></dl><p>" +
    escapeHtml(answer.summary) +
    "</p><h3>" +
    (ai ? "Interpretation (generated)" : "Interpretation") +
    "</h3>" +
    list(answer.interpretations) +
    "<h3>Suggested next steps</h3>" +
    list([...(answer.adjustments || []), ...(answer.nextTargets || [])]) +
    '<p class="hint">General training guidance, not medical advice. Nothing here changes your saved records.</p>'
  );
}
async function loadCoach() {
  const [status, messages] = await Promise.all([
    api("/coach/status"),
    api("/coach"),
  ]);
  renderCoachStatus(status);
  $("coachAnswers").innerHTML = messages
    .map(
      (message) =>
        '<article class="card coach-answer"><p class="hint">You asked · ' +
        escapeHtml(formatDate(String(message.created_at).slice(0, 10))) +
        "</p><h2>" +
        escapeHtml(message.question) +
        "</h2>" +
        answerHtml(message.answer) +
        "</article>",
    )
    .join("");
  iconRefresh();
}
$("coachForm").onsubmit = (event) => {
  event.preventDefault();
  busy(
    event.submitter,
    async () => {
      await api("/coach", "POST", {
        question: $("coachQuestion").value,
        today: today(),
      });
      $("coachQuestion").value = "";
      await loadCoach();
    },
    "Reviewing…",
  );
};
$("weeklyReview").onclick = () => {
  $("coachQuestion").value =
    "Review this week's workouts, improvements, personal records, consistency, areas needing attention, and next week's targets.";
  $("coachForm").requestSubmit($("coachForm").querySelector('[type="submit"]'));
};

/* Import from the earlier tracker */
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
// Drafts are stored on the device, so only warn when that storage failed.
addEventListener("beforeunload", (event) => {
  if (state.user && logger.hasDraft() && !logger.isStored()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
iconRefresh();
route();
(async () => {
  try {
    state.user = await api("/auth/me");
    await enterApp();
  } catch (error) {
    if (
      error.message !== "Please sign in." &&
      !error.message.includes("expired") &&
      !error.message.includes("Cannot reach")
    )
      $("authError").textContent = error.message;
  }
})();
