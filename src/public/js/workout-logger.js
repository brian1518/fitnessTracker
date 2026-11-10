"use strict";
window.createWorkoutLogger = function ({
  state,
  api,
  busy,
  notice,
  today,
  escapeHtml,
  format,
  refresh,
  iconRefresh,
}) {
  const $ = (id) => document.getElementById(id);
  const cards = $("exerciseCards");
  const picker = $("exercisePicker");
  const selected = new Set();
  let requests = new Map();
  let timerEnd = null;
  let timerSeconds = 120;
  let initialized = false;
  const draftKey = () => "lantern-draft:" + state.user.id;
  const label = (id) => state.exercises.find((e) => e.id === id)?.name || id;
  const uid = () => crypto.randomUUID();
  const emptySet = (previous = {}) => ({
    weight: previous.weight ?? "",
    reps: previous.reps ?? "",
    rpe: null,
    rir: null,
    kind: previous.kind || "working",
    completed: false,
  });
  function persist() {
    if (!state.user || !state.draft) return;
    try {
      sessionStorage.setItem(draftKey(), JSON.stringify(state.draft));
      $("draftStatus").textContent = "Draft saved in this tab.";
    } catch {
      $("draftStatus").textContent =
        "Draft cannot be stored in this browser. Keep this tab open until you finish.";
    }
  }
  function updateSummary() {
    const all = state.draft.exercises.flatMap((e) => e.sets);
    const done = all.filter((s) => s.completed);
    $("sessionExerciseCount").textContent =
      state.draft.exercises.length + " exercises";
    $("sessionSetCount").textContent =
      done.length + " / " + all.length + " sets done";
    $("sessionVolume").textContent =
      format.format(
        done
          .filter((s) => s.kind === "working")
          .reduce((sum, s) => sum + Number(s.weight) * Number(s.reps), 0),
      ) + " kg volume";
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
  function field(key, labelText, value, min, max, step, required = false) {
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
      '" placeholder="—"' +
      (required ? " required" : "") +
      ">"
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
        ? format.format(previous.weight) + " × " + previous.reps
        : "—") +
      "</td>" +
      "<td>" +
      field("weight", name + " weight (kg)", set.weight, 0, 1500, "any", true) +
      "</td>" +
      "<td>" +
      field("reps", name + " reps", set.reps, 1, 500, "1", true) +
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
      '"><td colspan="5"><details><summary>Effort &amp; set options</summary><div class="set-extra-fields"><label>RPE (optional)' +
      field("rpe", name + " RPE", set.rpe, 1, 10, "any") +
      "</label><label>RIR (optional)" +
      field("rir", name + " RIR", set.rir, 0, 10, "any") +
      '</label><button class="text-button danger-text" type="button" data-action="delete-set" data-set-index="' +
      index +
      '">Remove set</button></div></details></td></tr>'
    );
  }
  function cardHtml(exercise, index) {
    const info =
      state.exercises.find((e) => e.id === exercise.exerciseId) || {};
    return (
      '<article class="card workout-exercise" data-card="' +
      exercise.clientId +
      '"><div class="exercise-card-heading"><div><p class="hint">' +
      String(index + 1).padStart(2, "0") +
      " · " +
      escapeHtml(info.muscle || "exercise") +
      "</p><h2>" +
      escapeHtml(label(exercise.exerciseId)) +
      '</h2></div><div class="exercise-menu"><button type="button" class="icon-button" data-action="up" aria-label="Move exercise up"' +
      (index === 0 ? " disabled" : "") +
      '><i data-lucide="arrow-up"></i></button><button type="button" class="icon-button" data-action="remove" aria-label="Remove ' +
      escapeHtml(label(exercise.exerciseId)) +
      '"><i data-lucide="x"></i></button></div></div>' +
      '<label class="exercise-note"><span class="sr-only">' +
      escapeHtml(label(exercise.exerciseId)) +
      ' notes</span><textarea data-setting="notes" rows="1" maxlength="300" placeholder="Add exercise notes…">' +
      escapeHtml(exercise.notes) +
      "</textarea></label>" +
      '<details class="exercise-options"><summary>Targets &amp; rest · ' +
      exercise.targetMin +
      "–" +
      exercise.targetMax +
      " reps · " +
      exercise.restSeconds +
      's</summary><div class="fields compact">' +
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
      '</div><p class="hint">Set rest to 0 to turn the automatic timer off. W marks a warm-up set.</p></details>' +
      '<div class="next-target" data-recommendation><p class="hint">Checking your previous performance…</p></div>' +
      '<div class="set-grid-wrap"><table class="set-grid"><caption class="sr-only">' +
      escapeHtml(label(exercise.exerciseId)) +
      ' sets</caption><thead><tr><th>Set</th><th>Previous</th><th>kg</th><th>Reps</th><th><span class="sr-only">Complete</span><i data-lucide="check"></i></th></tr></thead><tbody>' +
      exercise.sets.map((set, i) => setHtml(exercise, set, i)).join("") +
      "</tbody></table></div>" +
      '<button type="button" class="add-set-button" data-action="add-set"><i data-lucide="plus"></i>Add set</button><p class="card-error" role="alert"></p></article>'
    );
  }
  function render() {
    cards.innerHTML = state.draft.exercises.length
      ? state.draft.exercises.map(cardHtml).join("")
      : '<div class="card workout-empty"><i data-lucide="dumbbell"></i><h2>Build today’s workout</h2><p>Add exercises or start a saved routine. Your previous sets and next targets appear alongside each exercise.</p><a class="secondary button" href="#plans">Browse routines</a></div>';
    updateSummary();
    iconRefresh();
    state.draft.exercises.forEach((e) => recommend(e.clientId));
  }
  function reset(restore = false) {
    requests.clear();
    timerEnd = null;
    timerSeconds = 120;
    state.draft = {
      id: uid(),
      name: "Today's workout",
      date: today(),
      fatigue: 0,
      pain: false,
      notes: "",
      exercises: [],
    };
    if (restore) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(draftKey()) || "null");
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
          state.draft = saved;
      } catch {
        notice("The saved draft could not be restored.");
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
      restSeconds: plan?.restSeconds ?? 120,
      notes: "",
      sets: Array.from({ length: Math.min(20, count) }, (_, i) =>
        emptySet(previous[i] || {}),
      ),
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
    if (hasDraft() && !confirm("Replace your unsaved session?")) return;
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
    if (hasDraft() && !confirm("Replace your unsaved session?")) return;
    reset();
    state.draft.name = day.name;
    state.draft.exercises = day.exercises.map((e) =>
      makeExercise(e.exerciseId, e),
    );
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
      slot.textContent = "Enter a valid rep range, increment, and rest period.";
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
        '<div><span class="hint">NEXT TARGET</span><p><strong>' +
        (result.weight === null
          ? "Choose a comfortable load"
          : format.format(result.weight) + " kg") +
        " · " +
        result.setCount +
        " × " +
        result.reps +
        '</strong></p></div><button type="button" class="secondary" data-action="apply"' +
        (!result.canApply ? " disabled" : "") +
        '>Use target</button><p class="hint target-reason">' +
        escapeHtml(result.reason) +
        "</p>";
    } catch (error) {
      if (requests.get(id) === ticket && getCard(id))
        slot.textContent = error.message;
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
          input.closest("details")?.setAttribute("open", "");
          input.reportValidity();
          input.focus();
        }
        throw Error(
          "Enter a non-negative weight, whole reps, and valid optional effort values.",
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
    if (event.target.dataset.setting) {
      exercise[event.target.dataset.setting] = event.target.value;
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
  cards.onclick = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest("[data-card]");
    const exercise = getExercise(card.dataset.card);
    const index = Number(button.dataset.setIndex);
    try {
      switch (button.dataset.action) {
        case "complete":
          if (exercise.sets[index].completed) {
            exercise.sets[index].completed = false;
          } else {
            Object.assign(exercise.sets[index], readSet(card, index), {
              completed: true,
            });
            if (Number(exercise.restSeconds) > 0)
              startTimer(
                Number(exercise.restSeconds),
                label(exercise.exerciseId),
              );
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
        case "delete-set":
          exercise.sets.splice(index, 1);
          break;
        case "remove":
          if (
            exercise.sets.some((s) => s.completed) &&
            !confirm("Remove this exercise and its completed sets?")
          )
            return;
          state.draft.exercises = state.draft.exercises.filter(
            (e) => e !== exercise,
          );
          break;
        case "up": {
          const position = state.draft.exercises.indexOf(exercise);
          if (position > 0)
            [
              state.draft.exercises[position - 1],
              state.draft.exercises[position],
            ] = [exercise, state.draft.exercises[position - 1]];
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
    }
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
    $("pickerCount").textContent =
      matches.length + " of " + state.exercises.length + " exercises";
    $("exerciseResults").innerHTML = matches.length
      ? matches
          .map((e) => {
            const added = state.draft.exercises.some(
              (x) => x.exerciseId === e.id,
            );
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
              (added ? " · already added" : "") +
              "</small></span></label>"
            );
          })
          .join("")
      : '<p class="muted">No exercises match those filters.</p>';
    $("pickerSelection").textContent = selected.size
      ? selected.size + " selected"
      : "Choose one or more exercises";
    $("addSelectedExercises").disabled = selected.size === 0;
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
      if (hasDraft() && !confirm("Discard this draft and start a new workout?"))
        return;
      sessionStorage.removeItem(draftKey());
      reset();
    };
    $("addExercise").onclick = openPicker;
    $("closePicker").onclick = () => picker.close();
    ["exerciseSearch", "exerciseMuscle", "exerciseEquipment"].forEach((id) =>
      $(id).addEventListener("input", updatePicker),
    );
    $("exerciseResults").onchange = (event) => {
      if (event.target.type !== "checkbox") return;
      if (event.target.checked) selected.add(event.target.value);
      else selected.delete(event.target.value);
      $("pickerSelection").textContent = selected.size + " selected";
      $("addSelectedExercises").disabled = !selected.size;
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
        persist();
      });
      if (["workoutDate", "fatigue", "pain"].includes(id))
        $(id).addEventListener("change", () =>
          state.draft.exercises.forEach((e) => recommend(e.clientId)),
        );
    }
    $("startTimer").onclick = () => startTimer(120);
    $("stopTimer").onclick = () => {
      timerEnd = null;
      timerSeconds = 0;
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
                unchecked +
                " unchecked sets?",
            )
          )
            return;
          const payload = {
            ...state.draft,
            name: $("workoutName").value.trim(),
            date: $("workoutDate").value,
            fatigue: Number($("fatigue").value),
            pain: $("pain").checked,
            notes: $("sessionNotes").value,
            exercises,
          };
          await api(
            "/workouts" + (payload.version ? "/" + payload.id : ""),
            payload.version ? "PUT" : "POST",
            payload,
          );
          sessionStorage.removeItem(draftKey());
          reset();
          await refresh();
          notice(
            "Workout saved. Records, progress, and next-session targets are updated.",
          );
        } catch (error) {
          $("workoutError").textContent = error.message;
          throw error;
        }
      });
    };
  }
  return { init, reset, render, add, open, startRoutine, hasDraft, persist };
};
