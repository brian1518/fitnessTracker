const { z } = require("zod");
const text = (max = 300) => z.string().trim().max(max);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T12:00:00Z");
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid date");
const set = z.object({
  weight: z.number().min(0).max(1500),
  reps: z.number().int().min(1).max(500),
  kind: z.enum(["warmup", "working"]).default("working"),
  rpe: z.number().min(1).max(10).nullable().default(null),
  rir: z.number().min(0).max(10).nullable().default(null),
});
const exercise = z
  .object({
    exerciseId: text(100).min(1),
    notes: text().default(""),
    targetMin: z.number().int().min(1).max(50).default(8),
    targetMax: z.number().int().min(1).max(50).default(12),
    increment: z.number().min(0).max(100).default(2.5),
    restSeconds: z.number().int().min(0).max(900).default(120),
    sets: z.array(set).min(1).max(20),
  })
  .refine(
    (value) => value.targetMax >= value.targetMin,
    "Maximum reps must be at least minimum reps",
  );
const workout = z.object({
  id: z.uuid(),
  version: z.number().int().min(1).optional(),
  name: text(100).min(1),
  date: date.nullable(),
  fatigue: z.number().int().min(0).max(10).default(0),
  pain: z.boolean().default(false),
  notes: text(1000).default(""),
  exercises: z.array(exercise).min(1).max(30),
});
const profile = z.object({
  goal: z.enum(["strength", "muscle", "general"]).default("general"),
  experience: z
    .enum(["beginner", "intermediate", "advanced"])
    .default("beginner"),
  age: z.number().int().min(13).max(100).nullable().default(null),
  frequency: z.number().int().min(1).max(6).default(3),
  duration: z.number().int().min(15).max(120).default(45),
  split: z
    .enum(["Full Body", "Upper/Lower", "Push/Pull/Legs", "Custom"])
    .default("Full Body"),
  equipment: z
    .array(
      z.enum([
        "barbell",
        "dumbbell",
        "machine",
        "cable",
        "bodyweight",
        "pullup-bar",
        "dip-bars",
      ]),
    )
    .min(1)
    .default(["bodyweight"]),
  muscles: z.array(text(30)).max(10).default([]),
  preferences: text(500).default(""),
  limitations: text(500).default(""),
  recovery: text(500).default(""),
  aiConsent: z.boolean().default(false),
});
const planExercise = z
  .object({
    exerciseId: text(100).min(1),
    sets: z.number().int().min(1).max(6),
    targetMin: z.number().int().min(1).max(30),
    targetMax: z.number().int().min(1).max(30),
    restSeconds: z.number().int().min(30).max(300),
  })
  .refine((v) => v.targetMax >= v.targetMin);
const plan = z.object({
  name: text(100).min(1),
  guidance: text(2000),
  days: z
    .array(
      z.object({
        name: text(100).min(1),
        exercises: z.array(planExercise).min(1).max(10),
      }),
    )
    .min(1)
    .max(6),
});
const goal = z
  .object({
    kind: z.enum(["strength", "bodyweight", "frequency"]),
    exerciseId: text(100).nullable().default(null),
    target: z.number().positive().max(1500),
    deadline: date.nullable().default(null),
  })
  .refine(
    (v) => v.kind !== "strength" || v.exerciseId,
    "Choose an exercise for a strength goal",
  )
  .refine(
    (v) =>
      v.kind !== "frequency" || (Number.isInteger(v.target) && v.target <= 7),
    "Frequency must be 1–7 days",
  )
  .refine(
    (v) => v.kind !== "bodyweight" || (v.target >= 20 && v.target <= 500),
    "Bodyweight target must be 20–500 kg",
  );
const body = z.object({
  date,
  weight: z.number().min(20).max(500),
  waist: z.number().min(20).max(300).nullable().default(null),
  notes: text().default(""),
});
module.exports = { z, workout, exercise, set, profile, plan, goal, body, date };
