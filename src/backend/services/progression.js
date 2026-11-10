function recommend(history, options) {
  const {
    exerciseId,
    targetMin = 8,
    targetMax = 12,
    increment = 2.5,
    setCount = 3,
    fatigue = 0,
    pain = false,
    today,
  } = options;
  const sessions = history
    .filter(
      (w) =>
        w.date &&
        w.date <= today &&
        w.exercises.some((e) => e.exerciseId === exerciseId),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        String(b.created_at).localeCompare(String(a.created_at)),
    );
  const previous = sessions[0];
  const exercise = previous?.exercises.find((e) => e.exerciseId === exerciseId);
  const sets = exercise?.sets.filter((s) => s.kind === "working") || [];
  const weight = sets.length ? Math.max(...sets.map((s) => s.weight)) : null;
  const result = {
    action: "baseline",
    weight,
    reps: targetMin,
    setCount,
    restSeconds: exercise?.restSeconds || 120,
    previous: sets,
    reason: "",
    canApply: true,
  };
  if (pain)
    return {
      ...result,
      action: "pause",
      canApply: false,
      reason:
        "Pause this exercise if it hurts. Choose a comfortable alternative and seek qualified advice for persistent or worsening pain.",
    };
  if (!sets.length)
    return {
      ...result,
      reason:
        "No working-set history yet. Choose a manageable starting load and record how the sets feel.",
    };
  const daysSince = (new Date(today) - new Date(previous.date)) / 86400000;
  if (daysSince > 14)
    return {
      ...result,
      action: "return",
      reason:
        "Your last recorded session was over two weeks ago. Reassess your starting load and effort before progressing.",
    };
  const prior =
    sessions[1]?.exercises
      .find((e) => e.exerciseId === exerciseId)
      ?.sets.filter((s) => s.kind === "working") || [];
  const sameLoad = sets.every((s) => s.weight === weight);
  const highEffort = sets.some(
    (s) => (s.rpe !== null && s.rpe >= 9.5) || (s.rir !== null && s.rir < 1),
  );
  const declined =
    sameLoad &&
    prior.length === sets.length &&
    prior.every((s) => s.weight === weight) &&
    sets.reduce((sum, s) => sum + s.reps, 0) <
      prior.reduce((sum, s) => sum + s.reps, 0) * 0.85;
  if (fatigue >= 7 || (declined && highEffort)) {
    return {
      ...result,
      action: "recover",
      weight:
        increment > 0 && weight > 0
          ? Math.max(0, Math.round((weight - increment) * 100) / 100)
          : weight,
      setCount: Math.max(1, setCount - 1),
      reason:
        "High fatigue or a marked performance drop was recorded. Consider a lighter session with one fewer working set, then reassess recovery.",
    };
  }
  const targetsChanged =
    exercise.targetMin !== targetMin || exercise.targetMax !== targetMax;
  if (targetsChanged || !sameLoad || sets.length !== setCount) {
    return {
      ...result,
      action: "maintain",
      reason:
        "The load, number of sets, or rep targets differ from this plan. Establish a comparable session before increasing weight.",
    };
  }
  if (
    sets.every((s) => s.reps >= targetMax) &&
    !highEffort &&
    increment > 0 &&
    weight > 0
  ) {
    return {
      ...result,
      action: "increase",
      weight: Math.round((weight + increment) * 100) / 100,
      reason:
        "Every working set reached the top of your rep range without recorded maximal effort. Consider the configured increment and return to the lower rep target.",
    };
  }
  const nextReps = Math.min(
    targetMax,
    Math.max(targetMin, Math.min(...sets.map((s) => s.reps)) + 1),
  );
  return {
    ...result,
    action: "reps",
    reps: highEffort ? targetMin : nextReps,
    reason:
      "Keep the current load and aim for " +
      (highEffort ? targetMin : nextReps) +
      " reps per set with controlled technique. Increase weight only after all working sets reach the top of your range with manageable effort.",
  };
}
module.exports = { recommend };
