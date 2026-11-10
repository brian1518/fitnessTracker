function analytics(workouts, body, today) {
  const monday = new Date(today + "T12:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const start = monday.toISOString().slice(0, 10);
  const week = workouts.filter(
    (w) => w.date && w.date >= start && w.date <= today,
  );
  const prs = {};
  const muscles = {};
  let volume = 0;
  let workingSets = 0;
  for (const w of workouts) {
    for (const e of w.exercises) {
      for (const s of e.sets.filter((s) => s.kind === "working")) {
        volume += s.weight * s.reps;
        workingSets += 1;
        const record = (prs[e.exerciseId] ||= {
          name: e.name,
          weight: 0,
          e1rm: null,
        });
        record.weight = Math.max(record.weight, s.weight);
        if (s.weight > 0 && s.reps <= 10)
          record.e1rm = Math.max(
            record.e1rm || 0,
            s.weight * (1 + s.reps / 30),
          );
        if (week.includes(w)) muscles[e.muscle] = (muscles[e.muscle] || 0) + 1;
      }
    }
  }
  const trainingDates = [
    ...new Set(
      workouts.filter((w) => w.date && w.date <= today).map((w) => w.date),
    ),
  ]
    .sort()
    .reverse();
  let streak = 0;
  const current = new Date(today + "T12:00:00Z");
  if (trainingDates[0] !== today) current.setUTCDate(current.getUTCDate() - 1);
  for (const day of trainingDates) {
    if (day !== current.toISOString().slice(0, 10)) break;
    streak += 1;
    current.setUTCDate(current.getUTCDate() - 1);
  }
  return {
    totalWorkouts: workouts.length,
    workingSets,
    volume,
    weeklyWorkouts: week.length,
    weeklyDays: new Set(week.map((w) => w.date)).size,
    muscles,
    prs,
    streak,
    latestWeight: body[0]?.weight ?? null,
    trainingDates,
    weekVolume: week.reduce(
      (total, w) =>
        total +
        w.exercises.reduce(
          (sum, e) =>
            sum +
            e.sets
              .filter((s) => s.kind === "working")
              .reduce((n, s) => n + s.weight * s.reps, 0),
          0,
        ),
      0,
    ),
  };
}
function generatePlan(profile, exercises) {
  const available = exercises.filter((e) =>
    profile.equipment.includes(e.equipment),
  );
  const splits = {
    "Full Body": ["Full Body"],
    "Upper/Lower": ["Upper", "Lower"],
    "Push/Pull/Legs": ["Push", "Pull", "Legs"],
    Custom: ["Custom"],
  };
  const lower = ["quads", "hamstrings", "glutes", "calves"];
  const push = ["chest", "shoulders", "triceps"];
  const labels = splits[profile.split];
  const days = Array.from({ length: profile.frequency }, (_, i) => {
    const label = labels[i % labels.length];
    const choices = available.filter((e) =>
      label === "Lower" || label === "Legs"
        ? lower.includes(e.muscle)
        : label === "Upper"
          ? !lower.includes(e.muscle) && e.muscle !== "core"
          : label === "Push"
            ? push.includes(e.muscle)
            : label === "Pull"
              ? ["back", "biceps"].includes(e.muscle)
              : true,
    );
    const chosen = [];
    const muscles = new Set();
    const movementPriority = [
      "quads",
      "chest",
      "back",
      "hamstrings",
      "glutes",
      "shoulders",
      "core",
      "biceps",
      "triceps",
      "calves",
    ];
    const ordered = [...choices].sort(
      (a, b) =>
        Number(profile.muscles.includes(b.muscle)) -
          Number(profile.muscles.includes(a.muscle)) ||
        movementPriority.indexOf(a.muscle) - movementPriority.indexOf(b.muscle),
    );
    for (const exercise of ordered) {
      if (muscles.has(exercise.muscle)) continue;
      chosen.push(exercise);
      muscles.add(exercise.muscle);
      if (
        chosen.length >=
        Math.min(6, Math.max(2, Math.floor(profile.duration / 10)))
      )
        break;
    }
    return {
      name: "Day " + (i + 1) + " · " + label,
      exercises: chosen.map((e) => ({
        exerciseId: e.id,
        sets: profile.experience === "beginner" ? 2 : 3,
        targetMin: 8,
        targetMax: 12,
        restSeconds: 120,
      })),
    };
  });
  if (days.some((d) => !d.exercises.length))
    throw Object.assign(
      new Error(
        "Your equipment does not support this split yet. Choose Full Body or add equipment.",
      ),
      { status: 400 },
    );
  return {
    name: profile.split + " · " + profile.frequency + " days",
    guidance:
      "Start with light warm-up sets and comfortable working loads. Work through the rep range before increasing weight. Space sessions around recovery and keep rest days. Review exercise choices against your preferences and limitations. " +
      (profile.limitations || (profile.age !== null && profile.age < 18)
        ? "Because you reported limitations or are under 18, review this general template with a qualified coach before training."
        : ""),
    days,
  };
}
module.exports = { analytics, generatePlan };
