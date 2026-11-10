"use strict";
window.createWorkoutLogger = function ({
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
}) {
  const $ = (id) => document.getElementById(id);
  const cards = $("exerciseCards");
  const picker = $("exercisePicker");
  const selected = new Set();
  const DEFAULT_REST = 120;
  let requests = new Map();
  let timerEnd = null;
  let timerSeconds = DEFAULT_REST;
  let initialized = false;
  // False when the browser refused to store the draft, so it lives in memory only.
  let stored = true;
  const draftKey = () => "lantern-draft:" + state.user.id;
  const info = (id) => state.exercises.find((e) => e.id === id) || {};
  const label = (id) => info(id).name || id;
  const uid = () => crypto.randomUUID();
  const plural = (count, word) => count + " " + word + (count === 1 ? "" : "s");
  const emptySet = (previous = {}) => ({
    weight: previous.weight ?? "",
    reps: previous.reps ?? "",
    rpe: null,
    rir: null,
    kind: previous.kind || "working",
    completed: false,
  });
  function setStatus(kind, text) {
    const status = $("draftStatus");
    status.dataset.state = kind;
    status.textContent = text;
  }
  function clearDraft() {
    if (!state.user) return;
    for (const store of ["localStorage", "sessionStorage"]) {
      try {
        window[store].removeItem(draftKey());
      } catch {}
    }
  }
  function persist() {
    if (!state.user || !state.draft) return;
    if (state.draft.exercises.length) state.lastSaved = null;
    else if (!state.draft.version) {
      clearDraft();
      setStatus("idle", "");
      return;
    }
    try {
      localStorage.setItem(draftKey(), JSON.stringify(state.draft));
      stored = true;
      setStatus(
        "draft",
        state.draft.version
          ? "Unsaved edits, kept on this device. Save changes to update your account."
          : "Draft, kept on this device. It is saved to your account when you finish.",
      );
    } catch {
      stored = false;
      setStatus(
        "warn",
        "This browser cannot store drafts. Keep this tab open until you finish.",
      );
    }
  }
  function totals(exercises) {
    const all = exercises.flatMap((e) => e.sets);
    const done = all.filter((s) => s.completed);
    return {
      all: all.length,
      done: done.length,
      volume: done
        .filter((s) => s.kind === "working")
        .reduce((sum, s) => sum + Number(s.weight) * Number(s.reps), 0),
    };
  }
  function updateSummary() {
    const sum = totals(state.draft.exercises);
    $("sessionExerciseCount").textContent = plural(
      state.draft.exercises.length,
      "exercise",
    );
    $("sessionSetCount").textContent =
      sum.done + " / " + sum.all + " sets done";
    $("sessionVolume").textContent = format.format(sum.volume) + " kg volume";
    $("sessionDetailSummary").textContent =
      formatDate(state.draft.date || today()) +
      " · fatigue " +
      (Number(state.draft.fatigue) || 0) +
      "/10" +
      (state.draft.pain ? " · pain noted" : "");
    $("workoutForm").classList.toggle(
      "is-empty",
      !state.draft.exercises.length,
    );
  }
  function previousSets(exerciseId) {
    const previous = state.workouts.find(
      (w) =>
        w.id !== state.draft.id &&
        w.date &&
        w.date <= state.draft.date &&
        w.exercises.some((e) => e.exerciseId === exerciseId),
    );
    return (
      previous?.exercises
        .filter((e) => e.exerciseId === exerciseId)
        .flatMap((e) => e.sets) || []
    );
  }
  function field(key, labelText, value, min, max, step, options = {}) {
    return (
      '<input data-field="' +
      key +
      '" aria-label="' +
      escapeHtml(labelText) +
      '" type="number" inputmode="' +
      (step === "1" ? "numeric" : "decimal") +
      '" min="' +
      min +
      '" max="' +
      max +
      '" step="' +
      step +
      '" value="' +
      escapeHtml(value) +
      '" placeholder="' +
      escapeHtml(options.previous ?? "–") +
      '"' +
      (options.previous !== undefined
        ? ' data-previous="' + escapeHtml(options.previous) + '"'
        : "") +
      (options.required ? " required" : "") +
      ">"
    );
  }
  function showEffort(exercise) {
    return (
      exercise.showEffort ||
      exercise.sets.some((s) => s.rpe !== null || s.rir !== null)
    );
  }
  function setHtml(exercise, set, index) {
    const previous = previousSets(exercise.exerciseId)[index];
    const name = label(exercise.exerciseId) + " set " + (index + 1);
    return (
      '<tr data-set="' +
      index +
      '" class="' +
      (set.completed ? "set-complete" : "") +
      '"><td><select data-field="kind" aria-label="' +
      escapeHtml(name + " type") +
      '"><option value="working"' +
      (set.kind === "working" ? " selected" : "") +
      ">" +
      (index + 1) +
      '</option><option value="warmup"' +
      (set.kind === "warmup" ? " selected" : "") +
      ">W</option></select></td>" +
      '<td class="previous-value">' +
      (previous
        ? format.format(previous.weight) + " kg × " + previous.reps
        : '<span aria-label="No previous set">–</span>') +
      "</td>" +
      "<td>" +
      field("weight", name + " weight (kg)", set.weight, 0, 1500, "any", {
        required: true,
        previous: previous?.weight,
      }) +
      "</td>" +
      "<td>" +
      field("reps", name + " reps", set.reps, 1, 500, "1", {
        required: true,
        previous: previous?.reps,
      }) +
      "</td>" +
      '<td><button type="button" class="complete-set" data-action="complete" data-set-index="' +
      index +
      '" aria-label="' +
      escapeHtml((set.completed ? "Unmark" : "Complete") + " " + name) +
      '" aria-pressed="' +
      set.completed +
      '"><i data-lucide="check"></i></button></td></tr>' +
      '<tr class="set-extra" data-extra="' +
      index +
      '"' +
      (showEffort(exercise) ? "" : " hidden") +
      '><td colspan="5"><div class="set-extra-fields"><label>RPE (optional)' +
      field("rpe", name + " RPE", set.rpe, 1, 10, "any") +
      "</label><label>RIR (optional)" +
      field("rir", name + " RIR", set.rir, 0, 10, "any") +
      '</label><button class="text-button danger-text" type="button" data-action="delete-set" data-set-index="' +
      index +
      '">Remove set ' +
      (index + 1) +
      "</button></div></td></tr>"
    );
  }
  function optionsSummary(exercise) {
    return (
      "Notes, targets and rest · " +
      exercise.targetMin +
      "–" +
      exercise.targetMax +
      " reps · " +
      (Number(exercise.restSeconds) > 0
        ? exercise.restSeconds + " s rest"
        : "timer off") +
      (exercise.notes ? " · note added" : "")
    );
  }
  function cardHtml(exercise, index) {
    const details = info(exercise.exerciseId);
    const name = escapeHtml(label(exercise.exerciseId));
    const last = state.draft.exercises.length - 1;
    return (
      '<article class="card workout-exercise" data-card="' +
      exercise.clientId +
      '"><div class="exercise-card-heading"><div><h2>' +
      name +
      '</h2><p class="hint">' +
      escapeHtml(
        [details.muscle, details.equipment].filter(Boolean).join(" · ") ||
          "exercise",
      ) +
      '</p></div><div class="exercise-menu"><button type="button" class="icon-button" data-action="up" aria-label="Move ' +
      name +
      ' up"' +
      (index === 0 ? " disabled" : "") +
      '><i data-lucide="arrow-up"></i></button><button type="button" class="icon-button" data-action="down" aria-label="Move ' +
      name +
      ' down"' +
      (index === last ? " disabled" : "") +
      '><i data-lucide="arrow-down"></i></button><button type="button" class="icon-button" data-action="remove" aria-label="Remove ' +
      name +
      '"><i data-lucide="trash-2"></i></button></div></div>' +
      '<div class="next-target" data-recommendation><p class="hint">Checking your previous performance…</p></div>' +
      '<div class="set-grid-wrap"><table class="set-grid"><caption class="sr-only">' +
      name +
      ' sets</caption><thead><tr><th scope="col">Set</th><th scope="col">Previous</th><th scope="col">kg</th><th scope="col">Reps</th><th scope="col"><span class="sr-only">Done</span><i data-lucide="check"></i></th></tr></thead><tbody>' +
      exercise.sets.map((set, i) => setHtml(exercise, set, i)).join("") +
      "</tbody></table></div>" +
      '<div class="card-actions"><button type="button" class="add-set-button" data-action="add-set"><i data-lucide="plus"></i>Add set</button>' +
      '<button type="button" class="text-button" data-action="delete-set" data-set-index="' +
      (exercise.sets.length - 1) +
      '"' +
      (exercise.sets.length < 2 ? " disabled" : "") +
      ">Remove last set</button></div>" +
      '<details class="exercise-options"' +
      (exercise.optionsOpen ? " open" : "") +
      "><summary data-options-summary>" +
      escapeHtml(optionsSummary(exercise)) +
      '</summary><label class="exercise-note">Notes<textarea data-setting="notes" rows="2" maxlength="300" placeholder="Technique cues, setup, how it felt">' +
      escapeHtml(exercise.notes) +
      '</textarea></label><div class="fields compact">' +
      [
        ["targetMin", "Min reps", exercise.targetMin, 1, 50, "1"],
        ["targetMax", "Max reps", exercise.targetMax, 1, 50, "1"],
        ["increment", "Increment (kg)", exercise.increment, 0, 100, "any"],
        ["restSeconds", "Rest (seconds)", exercise.restSeconds, 0, 900, "1"],
      ]
        .map(
          ([key, text, value, min, max, step]) =>
            "<label>" +
            text +
            '<input data-setting="' +
            key +
            '" type="number" inputmode="decimal" min="' +
            min +
            '" max="' +
            max +
            '" step="' +
            step +
            '" required value="' +
            escapeHtml(value) +
            '"></label>',
        )
        .join("") +
      '</div><label class="check"><input type="checkbox" data-toggle="effort"' +
      (showEffort(exercise) ? " checked" : "") +
      '>Log effort (RPE / RIR) and show per-set removal</label><p class="hint">In the Set column, choose W to mark a warm-up; warm-ups do not count toward volume or targets. Set rest to 0 to turn the automatic timer off.</p></details>' +
      '<p class="card-error" role="alert"></p></article>'
    );
  }
  function savedSummaryHtml() {
    const saved = state.lastSaved;
    if (!saved) return "";
    return (
      '<div class="saved-summary"><i data-lucide="circle-check"></i><div><h2>' +
      (saved.edited
        ? "Changes saved to your account"
        : "Saved to your account") +
      '</h2><p class="muted">' +
      escapeHtml(saved.name) +
      " · " +
      escapeHtml(formatDate(saved.date)) +
      '</p><dl class="summary-facts"><div><dt>Exercises</dt><dd>' +
      saved.exercises +
      "</dd></div><div><dt>Sets</dt><dd>" +
      saved.sets +
      "</dd></div><div><dt>Volume</dt><dd>" +
      format.format(saved.volume) +
      ' kg</dd></div></dl><div class="actions"><a class="secondary button" href="#history">View in history</a><a class="text-link" href="#dashboard">See progress</a></div></div></div>'
    );
  }
  function routineChoices() {
    const days = state.plans
      .flatMap((plan) => plan.data.days.map((day, i) => ({ plan, day, i })))
      .slice(0, 6);
    if (!days.length)
      return '<p class="hint">No saved routines yet. <a href="#plans">Create a routine</a> to start sessions with one tap.</p>';
    return (
      '<h3>Start from a routine</h3><div class="routine-choices">' +
      days
        .map(
          ({ plan, day, i }) =>
            '<button type="button" class="secondary routine-choice" data-start-plan="' +
            plan.id +
            '" data-day="' +
            i +
            '"><span>' +
            escapeHtml(day.name) +
            "</span><small>" +
            escapeHtml(plan.name) +
            " · " +
            plural(day.exercises.length, "exercise") +
            "</small></button>",
        )
        .join("") +
      '</div><p class="hint"><a href="#plans">All routines</a></p>'
    );
  }
  function render() {
    cards.innerHTML = state.draft.exercises.length
      ? state.draft.exercises.map(cardHtml).join("")
      : savedSummaryHtml() +
        '<div class="card workout-empty"><h2>' +
        (state.lastSaved ? "Start another workout" : "Start today’s workout") +
        "</h2><p>Add exercises below, or start from a saved routine. Your last session and a suggested target appear with each exercise.</p>" +
        routineChoices() +
        "</div>";
    updateSummary();
    iconRefresh();
    state.draft.exercises.forEach((e) => recommend(e.clientId));
  }
  function readStoredDraft() {
    for (const store of ["localStorage", "sessionStorage"]) {
      try {
        const saved = JSON.parse(window[store].getItem(draftKey()) || "null");
        if (
          saved &&
          Array.isArray(saved.exercises) &&
          saved.exercises.every(
            (e) =>
              e.clientId &&
              state.exercises.some((x) => x.id === e.exerciseId) &&
              Array.isArray(e.sets),
          )
        )
          return saved;
      } catch {
        notice("The saved draft could not be restored.");
      }
    }
    return null;
  }
  function reset(restore = false) {
    requests.clear();
    timerEnd = null;
    timerSeconds = DEFAULT_REST;
    state.draft = {
      id: uid(),
      name: "Today's workout",
      date: today(),
      fatigue: 0,
      pain: false,
      notes: "",
      exercises: [],
    };
    setStatus("idle", "");
    if (restore) {
      state.lastSaved = null;
      const saved = readStoredDraft();
      if (saved) {
        state.draft = saved;
        if (saved.exercises.length)
          setStatus(
            "draft",
            "Draft restored from this device. It is saved to your account when you finish.",
          );
      }
    }
    syncMetadata();
    render();
    drawTimer();
  }
  function syncMetadata() {
    $("workoutName").value = state.draft.name;
    $("workoutDate").value = state.draft.date || today();
    $("fatigue").value = state.draft.fatigue;
    $("pain").checked = state.draft.pain;
    $("sessionNotes").value = state.draft.notes;
    $("saveWorkout").textContent = state.draft.version
      ? "Save changes"
      : "Finish workout";
    $("newWorkout").textContent = state.draft.version
      ? "Cancel editing"
      : "Discard";
    $("workoutError").textContent = "";
  }
  function makeExercise(id, plan) {
    const previous = previousSets(id).filter((s) => s.kind === "working");
    const count = plan?.sets || previous.length || 3;
    return {
      clientId: uid(),
      exerciseId: id,
      targetMin: plan?.targetMin ?? 8,
      targetMax: plan?.targetMax ?? 12,
      increment: 2.5,
      restSeconds: plan?.restSeconds ?? DEFAULT_REST,
      notes: "",
      // Sets start empty: the previous session shows beside them, not inside them.
      sets: Array.from({ length: Math.min(20, count) }, () => emptySet()),
    };
  }
  function add(id, plan) {
    const existing = state.draft.exercises.find((e) => e.exerciseId === id);
    if (existing) {
      cards
        .querySelector('[data-card="' + existing.clientId + '"]')
        ?.scrollIntoView?.({ block: "center" });
      notice("That exercise is already in your workout.");
      return;
    }
    if (state.draft.exercises.length >= 30) {
      notice("A workout supports up to 30 exercises.");
      return;
    }
    state.draft.exercises.push(makeExercise(id, plan));
    render();
    persist();
  }
  function hasDraft() {
    return Boolean(state.draft?.exercises.length);
  }
  function open(workout, repeat) {
    if (hasDraft() && !confirm("Replace the workout you have in progress?"))
      return;
    state.draft = structuredClone(workout);
    state.draft.exercises = state.draft.exercises.map((e) => ({
      ...e,
      clientId: uid(),
      sets: e.sets.map((s) => ({ ...s, completed: !repeat })),
    }));
    if (repeat) {
      state.draft.id = uid();
      delete state.draft.version;
      state.draft.date = today();
      state.draft.pain = false;
      state.draft.fatigue = 0;
    }
    syncMetadata();
    render();
    persist();
    location.hash = "today";
    if (repeat)
      notice("Previous values copied. Check each set after completing it.");
  }
  function startRoutine(day) {
    if (hasDraft() && !confirm("Replace the workout you have in progress?"))
      return;
    reset();
    state.draft.name = day.name;
    state.draft.exercises = day.exercises
      .filter((e) => state.exercises.some((x) => x.id === e.exerciseId))
      .map((e) => makeExercise(e.exerciseId, e));
    syncMetadata();
    render();
    persist();
    location.hash = "today";
  }
  function getExercise(id) {
    return state.draft.exercises.find((e) => e.clientId === id);
  }
  function getCard(id) {
    return cards.querySelector('[data-card="' + id + '"]');
  }
  function validSettings(exercise, report = false) {
    const card = getCard(exercise.clientId);
    const invalid = [...card.querySelectorAll("[data-setting]")].find(
      (input) => !input.checkValidity(),
    );
    if (invalid) {
      if (report) {
        invalid.closest("details")?.setAttribute("open", "");
        invalid.reportValidity();
      }
      return false;
    }
    return Number(exercise.targetMin) <= Number(exercise.targetMax);
  }
  async function recommend(id) {
    const exercise = getExercise(id);
    if (!exercise) return;
    const card = getCard(id);
    const slot = card.querySelector("[data-recommendation]");
    const ticket = uid();
    requests.set(id, ticket);
    exercise.recommendation = null;
    if (!validSettings(exercise)) {
      slot.innerHTML =
        '<p class="hint">Enter a valid rep range, increment, and rest period to see a suggested target.</p>';
      return;
    }
    slot.innerHTML = '<p class="hint">Checking previous performance…</p>';
    try {
      const result = await api("/recommendation", "POST", {
        exerciseId: exercise.exerciseId,
        targetMin: Number(exercise.targetMin),
        targetMax: Number(exercise.targetMax),
        increment: Number(exercise.increment),
        setCount: Math.max(
          1,
          Math.min(
            10,
            exercise.sets.filter((s) => s.kind === "working").length,
          ),
        ),
        fatigue: Number(state.draft.fatigue),
        pain: state.draft.pain,
        today: state.draft.date || today(),
      });
      if (requests.get(id) !== ticket || !getCard(id)) return;
      exercise.recommendation = result;
      slot.innerHTML =
        '<div><span class="target-label">Suggested target</span><p><strong>' +
        (result.weight === null
          ? "Choose a comfortable load"
          : format.format(result.weight) + " kg") +
        " · " +
        result.setCount +
        " × " +
        result.reps +
        '</strong></p></div><button type="button" class="secondary small" data-action="apply"' +
        (!result.canApply ? " disabled" : "") +
        '>Use target</button><p class="hint target-reason"><span class="sr-only">Why: </span>' +
        escapeHtml(result.reason) +
        "</p>";
    } catch (error) {
      if (requests.get(id) === ticket && getCard(id))
        slot.innerHTML =
          '<p class="hint">Suggested target unavailable: ' +
          escapeHtml(error.message) +
          " You can still log this exercise.</p>";
    }
  }
  function readSet(card, index, report = true) {
    const inputs = [
      ...card
        .querySelector('[data-set="' + index + '"]')
        .querySelectorAll("[data-field]"),
      ...card
        .querySelector('[data-extra="' + index + '"]')
        .querySelectorAll("[data-field]"),
    ];
    const values = {};
    for (const input of inputs) {
      if (!input.checkValidity()) {
        if (report) {
          const extra = input.closest("[data-extra]");
          if (extra) extra.hidden = false;
          input.reportValidity();
          input.focus();
        }
        throw Error(
          "Enter a weight of 0 kg or more and whole-number reps for this set, and check any effort values.",
        );
      }
      values[input.dataset.field] =
        input.dataset.field === "kind"
          ? input.value
          : input.value === ""
            ? null
            : Number(input.value);
    }
    return values;
  }
  // An empty weight or reps field means "same as last time" when a previous set exists.
  function adoptPrevious(card, index) {
    card
      .querySelector('[data-set="' + index + '"]')
      .querySelectorAll("[data-previous]")
      .forEach((input) => {
        if (input.value === "") input.value = input.dataset.previous;
      });
  }
  function updateCompletion(card, index, completed) {
    const row = card.querySelector('[data-set="' + index + '"]');
    row.classList.toggle("set-complete", completed);
    const button = row.querySelector("[data-action=complete]");
    button.setAttribute("aria-pressed", String(completed));
    button.setAttribute(
      "aria-label",
      (completed ? "Unmark" : "Complete") +
        " " +
        label(getExercise(card.dataset.card).exerciseId) +
        " set " +
        (index + 1),
    );
  }
  function handleInput(event) {
    const card = event.target.closest("[data-card]");
    if (!card) return;
    const exercise = getExercise(card.dataset.card);
    if (event.target.dataset.toggle === "effort") {
      exercise.showEffort = event.target.checked;
      card
        .querySelectorAll("[data-extra]")
        .forEach((row) => (row.hidden = !showEffort(exercise)));
    } else if (event.target.dataset.setting) {
      exercise[event.target.dataset.setting] = event.target.value;
      card.querySelector("[data-options-summary]").textContent =
        optionsSummary(exercise);
    } else if (event.target.dataset.field) {
      const row = event.target.closest("[data-set],[data-extra]");
      const index = Number(row.dataset.set ?? row.dataset.extra);
      exercise.sets[index][event.target.dataset.field] = event.target.value;
      exercise.sets[index].completed = false;
      updateCompletion(card, index, false);
    }
    card.querySelector(".card-error").textContent = "";
    updateSummary();
    persist();
  }
  cards.addEventListener("input", handleInput);
  cards.addEventListener("change", (event) => {
    if (event.target.tagName === "SELECT") handleInput(event);
    const id = event.target.closest("[data-card]")?.dataset.card;
    if (
      id &&
      event.target.dataset.setting &&
      event.target.dataset.setting !== "notes"
    )
      recommend(id);
  });
  // Remember which option panels are open across re-renders.
  cards.addEventListener(
    "toggle",
    (event) => {
      const card = event.target.closest?.("[data-card]");
      if (card && event.target.classList.contains("exercise-options"))
        getExercise(card.dataset.card).optionsOpen = event.target.open;
    },
    true,
  );
  function undoable(message, snapshot) {
    notice(message, {
      label: "Undo",
      run() {
        state.draft.exercises = snapshot;
        render();
        persist();
      },
    });
  }
  cards.onclick = (event) => {
    const routine = event.target.closest("[data-start-plan]");
    if (routine) {
      const plan = state.plans.find((p) => p.id === routine.dataset.startPlan);
      if (plan) startRoutine(plan.data.days[Number(routine.dataset.day)]);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest("[data-card]");
    const exercise = getExercise(card.dataset.card);
    const index = Number(button.dataset.setIndex);
    const name = label(exercise.exerciseId);
    try {
      switch (button.dataset.action) {
        case "complete":
          if (exercise.sets[index].completed) {
            exercise.sets[index].completed = false;
          } else {
            adoptPrevious(card, index);
            Object.assign(exercise.sets[index], readSet(card, index), {
              completed: true,
            });
            if (Number(exercise.restSeconds) > 0)
              startTimer(Number(exercise.restSeconds), name);
          }
          updateCompletion(card, index, exercise.sets[index].completed);
          updateSummary();
          persist();
          return;
        case "add-set":
          if (exercise.sets.length >= 20)
            throw Error("Maximum 20 sets per exercise.");
          exercise.sets.push(emptySet(exercise.sets.at(-1)));
          break;
        case "delete-set": {
          if (exercise.sets.length < 2)
            throw Error(
              "An exercise needs at least one set. Remove the exercise instead.",
            );
          const snapshot = structuredClone(state.draft.exercises);
          exercise.sets.splice(index, 1);
          undoable(
            "Set " + (index + 1) + " removed from " + name + ".",
            snapshot,
          );
          break;
        }
        case "remove": {
          const snapshot = structuredClone(state.draft.exercises);
          state.draft.exercises = state.draft.exercises.filter(
            (e) => e !== exercise,
          );
          undoable(name + " removed.", snapshot);
          break;
        }
        case "up":
        case "down": {
          const list = state.draft.exercises;
          const position = list.indexOf(exercise);
          const target = position + (button.dataset.action === "up" ? -1 : 1);
          if (target < 0 || target >= list.length) return;
          [list[position], list[target]] = [list[target], list[position]];
          break;
        }
        case "apply": {
          const rec = exercise.recommendation;
          if (!rec?.canApply) return;
          if (
            exercise.sets.some((s) => s.completed) &&
            !confirm("Replace completed sets with unchecked suggested sets?")
          )
            return;
          exercise.sets = Array.from({ length: rec.setCount }, () =>
            emptySet({ weight: rec.weight ?? "", reps: rec.reps }),
          );
          break;
        }
      }
      render();
      persist();
    } catch (error) {
      card.querySelector(".card-error").textContent = error.message;
      notice(error.message);
    }
  };
  function startTimer(seconds, name = "Rest") {
    timerSeconds = seconds;
    timerEnd = Date.now() + seconds * 1000;
    $("timerStatus").textContent = name + " · rest running";
    drawTimer();
  }
  function drawTimer() {
    const seconds = timerEnd
      ? Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000))
      : timerSeconds;
    $("timer").textContent =
      String(Math.floor(seconds / 60)).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0");
    if (timerEnd && seconds === 0) {
      timerEnd = null;
      timerSeconds = 0;
      $("timerStatus").textContent = "Rest complete. Continue when ready.";
      try {
        navigator.vibrate?.(200);
      } catch {}
    }
    $("restCard").classList.toggle("is-running", Boolean(timerEnd));
    $("startTimer").textContent = timerEnd ? "Restart" : "Start";
  }
  function updatePicker() {
    const query = $("exerciseSearch").value.trim().toLowerCase();
    const matches = state.exercises.filter(
      (e) =>
        (e.name + " " + e.muscle + " " + e.equipment)
          .toLowerCase()
          .includes(query) &&
        (!$("exerciseMuscle").value ||
          e.muscle === $("exerciseMuscle").value) &&
        (!$("exerciseEquipment").value ||
          e.equipment === $("exerciseEquipment").value),
    );
    // With no search, exercises from recent workouts come first.
    const recent = [];
    if (!query && !$("exerciseMuscle").value && !$("exerciseEquipment").value)
      for (const workout of state.workouts.slice(0, 12))
        for (const e of workout.exercises)
          if (!recent.includes(e.exerciseId) && recent.length < 8)
            recent.push(e.exerciseId);
    const choice = (e) => {
      const added = state.draft.exercises.some((x) => x.exerciseId === e.id);
      return (
        '<label class="exercise-choice"><input type="checkbox" value="' +
        escapeHtml(e.id) +
        '"' +
        (selected.has(e.id) || added ? " checked" : "") +
        (added ? " disabled" : "") +
        "><span><strong>" +
        escapeHtml(e.name) +
        "</strong><small>" +
        escapeHtml(e.muscle + " · " + e.equipment) +
        (added ? " · already in this workout" : "") +
        "</small></span></label>"
      );
    };
    const recentMatches = recent
      .map((id) => matches.find((e) => e.id === id))
      .filter(Boolean);
    const rest = matches.filter((e) => !recent.includes(e.id));
    $("pickerCount").textContent =
      matches.length + " of " + state.exercises.length + " exercises";
    $("exerciseResults").innerHTML = matches.length
      ? (recentMatches.length
          ? '<p class="results-heading">Recently logged</p>' +
            recentMatches.map(choice).join("") +
            '<p class="results-heading">All exercises</p>'
          : "") + rest.map(choice).join("")
      : '<p class="muted empty-note">No exercises match. Clear the filters, or add a custom exercise from Routines → Exercise library.</p>';
    updateSelection();
  }
  function updateSelection() {
    $("pickerSelection").textContent = selected.size
      ? selected.size + " selected"
      : "Choose one or more exercises";
    $("addSelectedExercises").disabled = selected.size === 0;
    $("addSelectedExercises").textContent = selected.size
      ? "Add " + plural(selected.size, "exercise")
      : "Add selected";
  }
  function openPicker() {
    selected.clear();
    $("exerciseSearch").value = "";
    for (const [id, key] of [
      ["exerciseMuscle", "muscle"],
      ["exerciseEquipment", "equipment"],
    ]) {
      $(id).innerHTML =
        '<option value="">All ' +
        (key === "muscle" ? "muscles" : "equipment") +
        "</option>" +
        [...new Set(state.exercises.map((e) => e[key]))]
          .sort()
          .map(
            (value) =>
              '<option value="' +
              escapeHtml(value) +
              '">' +
              escapeHtml(value) +
              "</option>",
          )
          .join("");
    }
    updatePicker();
    picker.showModal();
    $("exerciseSearch").focus();
  }
  function init() {
    if (initialized) return;
    initialized = true;
    $("newWorkout").onclick = () => {
      if (
        hasDraft() &&
        !confirm(
          state.draft.version
            ? "Stop editing? The saved workout stays as it was."
            : "Discard this draft? Sets you entered will be lost.",
        )
      )
        return;
      clearDraft();
      state.lastSaved = null;
      reset();
    };
    $("addExercise").onclick = openPicker;
    $("closePicker").onclick = () => picker.close();
    // A click on the backdrop lands on the dialog element itself.
    picker.addEventListener("click", (event) => {
      if (event.target === picker) picker.close();
    });
    ["exerciseSearch", "exerciseMuscle", "exerciseEquipment"].forEach((id) =>
      $(id).addEventListener("input", updatePicker),
    );
    $("exerciseResults").onchange = (event) => {
      if (event.target.type !== "checkbox") return;
      if (event.target.checked) selected.add(event.target.value);
      else selected.delete(event.target.value);
      updateSelection();
    };
    $("addSelectedExercises").onclick = () => {
      if (state.draft.exercises.length + selected.size > 30) {
        notice("Choose up to 30 exercises per workout.");
        return;
      }
      for (const id of selected) state.draft.exercises.push(makeExercise(id));
      render();
      persist();
      picker.close();
    };
    for (const [id, key] of [
      ["workoutName", "name"],
      ["workoutDate", "date"],
      ["fatigue", "fatigue"],
      ["pain", "pain"],
      ["sessionNotes", "notes"],
    ]) {
      $(id).addEventListener("input", () => {
        state.draft[key] =
          $(id).type === "checkbox" ? $(id).checked : $(id).value;
        updateSummary();
        persist();
      });
      if (["workoutDate", "fatigue", "pain"].includes(id))
        $(id).addEventListener("change", () =>
          state.draft.exercises.forEach((e) => recommend(e.clientId)),
        );
    }
    $("startTimer").onclick = () =>
      startTimer(timerEnd || !timerSeconds ? DEFAULT_REST : timerSeconds);
    $("addRest").onclick = () => {
      if (timerEnd) timerEnd += 30000;
      else timerSeconds = Math.min(900, timerSeconds + 30);
      drawTimer();
    };
    $("stopTimer").onclick = () => {
      timerEnd = null;
      timerSeconds = DEFAULT_REST;
      $("timerStatus").textContent = "Rest skipped.";
      drawTimer();
    };
    setInterval(drawTimer, 1000);
    $("workoutForm").onsubmit = (event) => {
      event.preventDefault();
      busy($("saveWorkout"), async () => {
        $("workoutError").textContent = "";
        try {
          for (const id of ["workoutName", "workoutDate", "fatigue"]) {
            if (
              !$(id).checkValidity() ||
              (id === "workoutName" && !$(id).value.trim())
            ) {
              $(id).closest("details")?.setAttribute("open", "");
              $(id).focus();
              $(id).reportValidity();
              throw Error(
                "Enter a workout name, valid date, and fatigue from 0–10.",
              );
            }
          }
          const exercises = [];
          for (const e of state.draft.exercises) {
            if (!e.sets.some((s) => s.completed)) continue;
            if (!validSettings(e, true))
              throw Error("Check the target rep range and rest settings.");
            const sets = e.sets.flatMap((s, i) =>
              s.completed ? [readSet(getCard(e.clientId), i)] : [],
            );
            exercises.push({
              exerciseId: e.exerciseId,
              notes: e.notes,
              targetMin: Number(e.targetMin),
              targetMax: Number(e.targetMax),
              increment: Number(e.increment),
              restSeconds: Number(e.restSeconds),
              sets,
            });
          }
          if (!exercises.length)
            throw Error(
              "Check off at least one completed set before finishing.",
            );
          const unchecked = state.draft.exercises.reduce(
            (sum, e) => sum + e.sets.filter((s) => !s.completed).length,
            0,
          );
          if (
            unchecked &&
            !confirm(
              "Save completed sets and leave out " +
                plural(unchecked, "unchecked set") +
                "?",
            )
          )
            return;
          const payload = {
            id: state.draft.id,
            version: state.draft.version,
            name: $("workoutName").value.trim(),
            date: $("workoutDate").value,
            fatigue: Number($("fatigue").value),
            pain: $("pain").checked,
            notes: $("sessionNotes").value,
            exercises,
          };
          setStatus("saving", "Saving to your account…");
          await api(
            "/workouts" + (payload.version ? "/" + payload.id : ""),
            payload.version ? "PUT" : "POST",
            payload,
          );
          const saved = exercises.flatMap((e) => e.sets);
          clearDraft();
          reset();
          state.lastSaved = {
            name: payload.name,
            date: payload.date,
            edited: Boolean(payload.version),
            exercises: exercises.length,
            sets: saved.length,
            volume: saved
              .filter((s) => s.kind === "working")
              .reduce((sum, s) => sum + s.weight * s.reps, 0),
          };
          await refresh();
          render();
          setStatus("saved", "Saved to your account.");
          notice(
            "Workout saved. Records, progress, and next-session targets are updated.",
          );
        } catch (error) {
          $("workoutError").textContent = error.message;
          if ($("draftStatus").dataset.state === "saving")
            setStatus(
              "error",
              "Not saved to your account. Your draft is still on this device; try again.",
            );
          throw error;
        }
      });
    };
  }
  return {
    init,
    reset,
    render,
    add,
    open,
    startRoutine,
    hasDraft,
    persist,
    clearDraft,
    isStored: () => stored,
  };
};
