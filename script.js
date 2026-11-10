// ===== Pre-filled Exercises =====
const exercises = [
  "Bench Press","Incline Bench Press","Decline Bench Press","Dumbbell Bench Press","Incline Dumbbell Press","Chest Fly","Cable Fly","Pec Deck","Push Up","Clap Push Up","Diamond Push Up","Chest Dips",
  "Squat","Front Squat","Back Squat","Goblet Squat","Bulgarian Split Squat","Hack Squat","Smith Machine Squat","Jump Squat","Pistol Squat","Wall Sit",
  "Deadlift","Romanian Deadlift","Sumo Deadlift","Trap Bar Deadlift","Stiff Leg Deadlift",
  "Pull Up","Chin Up","Wide Grip Pull Up","Neutral Grip Pull Up",
  "Barbell Row","Bent Over Row","Dumbbell Row",
  "Overhead Press","Standing Overhead Press","Seated Overhead Press","Dumbbell Shoulder Press",
  "Lateral Raise","Front Raise","Cable Lateral Raise",
  "Bicep Curl","Barbell Curl","EZ Bar Curl",
  "Tricep Extension","Overhead Tricep Extension","Dumbbell Overhead Extension",
  "Leg Press","Leg Extension","Hamstring Curl",
  "Standing Calf Raise","Seated Calf Raise","Donkey Calf Raise",
  "Crunch","Sit Up","Hanging Leg Raise",
  "Farmer's Walk","Sled Push","Sled Pull","Battle Ropes"
];

const $ = (id) => document.getElementById(id);
const form = $("workoutForm");
const exercise = $("exercise");
const weight = $("weight");
const reps = $("reps");
const date = $("date");
const status = $("status");
const list = $("workoutList");
const filter = $("filter");
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
let workouts = [];
let storageReadable = true;
let editing = null;

try {
  workouts = JSON.parse(localStorage.getItem("workouts") ?? "[]");
  if (!Array.isArray(workouts)) throw new Error("Invalid workout history");
} catch {
  workouts = [];
  storageReadable = false;
  status.textContent = "Saved history could not be read. Changes are disabled to protect your data.";
}

function today() {
  const now = new Date();
  const localTime = now.getTime() - now.getTimezoneOffset() * 60000;
  return new Date(localTime).toISOString().slice(0, 10);
}

function resetForm() {
  editing = null;
  form.reset();
  date.value = today();
  $("formTitle").textContent = "Log a set";
  $("saveButton").textContent = "Save set";
  $("cancelEdit").hidden = true;
}

function persist(next) {
  if (!storageReadable) return false;
  try {
    localStorage.setItem("workouts", JSON.stringify(next));
  } catch {
    status.textContent = "The browser could not save this change. Your history is unchanged.";
    return false;
  }
  workouts = next;
  render();
  return true;
}

function action(label, workout, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = label;
  button.setAttribute("aria-label", label + " set for " + workout.exercise);
  button.addEventListener("click", handler);
  return button;
}

function render() {
  updateProgressOptions();
  $("setCount").textContent = number.format(workouts.length);
  $("repCount").textContent = number.format(workouts.reduce((total, w) => total + Number(w.reps), 0));
  $("volume").textContent = number.format(workouts.reduce((total, w) => total + w.weight * w.reps, 0));
  $("exerciseList").replaceChildren(...Array.from(new Set([...exercises, ...workouts.map(w => w.exercise)]), name => new Option(name)));
  list.replaceChildren();

  const query = filter.value.trim().toLowerCase();
  const visible = workouts.map((workout, index) => ({ workout, index }))
    .filter(({ workout }) => workout.exercise.toLowerCase().includes(query))
    .sort((a, b) => (b.workout.date ?? "").localeCompare(a.workout.date ?? "") || b.index - a.index);

  $("empty").textContent = visible.length ? "" : workouts.length
    ? "No sets match your search."
    : "Your logged sets will appear here.";

  for (const { workout, index } of visible) {
    const row = document.createElement("li");
    const info = document.createElement("div");
    const title = document.createElement("strong");
    const detail = document.createElement("small");
    const controls = document.createElement("div");
    controls.className = "actions";
    title.textContent = workout.exercise;
    const load = Number(workout.weight) === 0 ? "Bodyweight" : number.format(workout.weight) + " kg";
    const trainingDate = workout.date ? dateFormat.format(new Date(workout.date + "T00:00:00")) : "Date unavailable";
    detail.textContent = load + " × " + workout.reps + " reps · " + trainingDate;
    info.append(title, detail);
    if (workout.notes) { const note = document.createElement("small"); note.textContent = workout.notes; info.append(note); }
    controls.append(
      action("Edit", workout, () => {
        editing = index;
        exercise.value = workout.exercise;
        weight.value = workout.weight;
        reps.value = workout.reps;
        date.value = workout.date ?? "";
        $("notes").value = workout.notes ?? "";
        $("formTitle").textContent = "Edit set";
        $("saveButton").textContent = "Save changes";
        $("cancelEdit").hidden = false;
        status.textContent = "";
        updatePreviousSet();
        exercise.focus();
      }),
      action("Delete", workout, () => {
        if (!confirm("Delete this set for " + workout.exercise + "?")) return;
        if (!persist(workouts.filter((_, position) => position !== index))) return;
        if (editing === index) resetForm();
        else if (editing !== null && editing > index) editing -= 1;
        status.textContent = "Set deleted.";
        filter.focus();
      })
    );
    row.append(info, controls);
    list.append(row);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = exercise.value.trim();
  const load = weight.valueAsNumber;
  const count = reps.valueAsNumber;
  if (!name) {
    status.textContent = "Enter an exercise name.";
    updatePreviousSet();
        exercise.focus();
    return;
  }
  if (!Number.isFinite(load) || load < 0 || !Number.isSafeInteger(count) || count < 1) {
    status.textContent = "Enter a weight of zero or more and a positive whole number of reps.";
    return;
  }

  const workout = { exercise: name, weight: load, reps: count, date: date.value, notes: $("notes").value.trim() };
  const next = [...workouts];
  const isNew = editing === null;
  if (isNew) next.push(workout);
  else next[editing] = workout;
  const saveButton = $("saveButton");
  if (saveButton.disabled) return;
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  form.setAttribute("aria-busy", "true");
  let saved = false;
  try {

    saved = persist(next);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = isNew ? "Save set" : "Save changes";
    form.removeAttribute("aria-busy");
  }
  if (!saved) return;
  resetForm();
  status.textContent = isNew ? "Set saved." : "Changes saved.";
  status.classList.remove("feedback");
  void status.offsetWidth;
  status.classList.add("feedback");
  updatePreviousSet();
        exercise.focus();
});

$("cancelEdit").addEventListener("click", () => {
  resetForm();
  status.textContent = "Edit canceled.";
  updatePreviousSet();
        exercise.focus();
});
filter.addEventListener("input", render);
resetForm();
render();
function matchingSets(name) {
  return workouts.filter(w => w.exercise.toLowerCase() === name.toLowerCase() && w.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function updatePreviousSet() {
  const matches = matchingSets(exercise.value.trim());
  const latest = matches.filter(w => w.date === matches[0]?.date).at(-1);
  $("previousSet").textContent = latest
    ? "Latest dated set · " + latest.date + " · " + number.format(latest.weight) + " kg × " + latest.reps + " reps"
    : "No dated sets for this exercise yet. Your first set will establish a baseline.";
}

function updateProgressOptions() {
  const select = $("progressExercise");
  const selected = select.value;
  const names = [...new Set(workouts.map(w => w.exercise))].sort();
  select.replaceChildren(new Option("Choose an exercise", ""), ...names.map(name => new Option(name, name)));
  select.value = selected;
  updateProgress();
}

function updateProgress() {
  const name = $("progressExercise").value;
  const sets = matchingSets(name);
  const dates = [...new Set(sets.map(w => w.date))];
  const summary = $("progressSummary");
  if (!name || dates.length < 2) {
    summary.textContent = name ? "Log this exercise on two different dates to compare sessions." : "Choose an exercise to compare your latest two dated sessions.";
    return;
  }
  summary.textContent = dates.slice(0, 2).map((day, index) => {
    const session = sets.filter(w => w.date === day);
    const totalReps = session.reduce((sum, w) => sum + Number(w.reps), 0);
    const maxWeight = Math.max(...session.map(w => Number(w.weight)));
    return (index === 0 ? "Latest" : "Previous") + " · " + day + " · " + session.length + " sets · " + totalReps + " reps · heaviest load " + number.format(maxWeight) + " kg";
  }).join("\n").replaceAll("\n", "\n");
}

exercise.addEventListener("input", updatePreviousSet);
$("progressExercise").addEventListener("change", updateProgress);

document.getElementById("exportHistory").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(workouts, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "lantern-workout-history.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
