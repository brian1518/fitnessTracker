const test = require("node:test");
const assert = require("node:assert/strict");
const { recommend } = require("../src/backend/services/progression");
const {
  analytics,
  generatePlan,
} = require("../src/backend/services/analytics");
const { responseSchema } = require("../src/backend/services/ai");
const options = {
  exerciseId: "bench",
  targetMin: 8,
  targetMax: 12,
  increment: 2.5,
  setCount: 3,
  fatigue: 0,
  pain: false,
  today: "2026-11-09",
};
const session = (reps, date = "2026-11-08", extra = {}) => ({
  date,
  exercises: [
    {
      exerciseId: "bench",
      name: "Bench",
      muscle: "chest",
      targetMin: 8,
      targetMax: 12,
      restSeconds: 120,
      sets: reps.map((reps) => ({
        weight: 40,
        reps,
        kind: "working",
        rpe: null,
        rir: null,
        ...extra,
      })),
    },
  ],
});
test("missing history requires a user-chosen baseline", () =>
  assert.equal(recommend([], options).weight, null));
test("inconsistent reps retain load and aim for next rep", () => {
  const r = recommend([session([8, 8, 7])], options);
  assert.equal(r.weight, 40);
  assert.equal(r.reps, 8);
});
test("double progression increases only after all targets are met", () => {
  assert.equal(recommend([session([12, 12, 12])], options).weight, 42.5);
  assert.equal(recommend([session([12, 12, 11])], options).weight, 40);
});
test("maximal effort prevents load increase", () =>
  assert.equal(
    recommend([session([12, 12, 12], "2026-11-08", { rpe: 10 })], options)
      .weight,
    40,
  ));
test("pain blocks applying a suggestion", () =>
  assert.equal(
    recommend([session([12, 12, 12])], { ...options, pain: true }).canApply,
    false,
  ));
test("fatigue reduces volume and available load increment", () => {
  const r = recommend([session([8, 8, 8])], { ...options, fatigue: 8 });
  assert.equal(r.weight, 37.5);
  assert.equal(r.setCount, 2);
});
test("changed targets, skipped weeks, and absent increments do not escalate", () => {
  assert.equal(
    recommend([session([12, 12, 12])], { ...options, targetMax: 15 }).weight,
    40,
  );
  assert.equal(
    recommend([session([12, 12, 12], "2026-10-01")], options).action,
    "return",
  );
  assert.equal(
    recommend([session([12, 12, 12])], { ...options, increment: 0 }).weight,
    40,
  );
});
test("warm-ups are excluded from progression and working volume", () => {
  const w = session([8, 8, 8]);
  w.exercises[0].sets.push({ weight: 100, reps: 1, kind: "warmup" });
  assert.equal(recommend([w], options).weight, 40);
  const result = analytics([w], [], "2026-11-09");
  assert.equal(result.volume, 960);
  assert.equal(result.workingSets, 3);
  assert.equal(result.prs.bench.weight, 40);
});
test("unsafe or malformed AI output fails validation", () => {
  assert.equal(responseSchema.safeParse({ summary: 12 }).success, false);
  assert.equal(
    responseSchema.safeParse({
      summary: "x",
      interpretations: [],
      adjustments: [],
      nextTargets: [],
    }).success,
    true,
  );
});
test("plans respect equipment and frequency", () => {
  const plan = generatePlan(
    {
      equipment: ["bodyweight"],
      split: "Full Body",
      frequency: 2,
      duration: 20,
      experience: "beginner",
      muscles: [],
      limitations: "",
      age: 20,
    },
    [
      { id: "push", muscle: "chest", equipment: "bodyweight" },
      { id: "squat", muscle: "quads", equipment: "barbell" },
    ],
  );
  assert.equal(plan.days.length, 2);
  assert.equal(plan.days[0].exercises[0].exerciseId, "push");
});
