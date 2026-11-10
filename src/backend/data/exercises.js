const base = [
  ["bench-press", "Bench Press", "chest", "barbell"],
  ["squat", "Squat", "quads", "barbell"],
  ["deadlift", "Deadlift", "hamstrings", "barbell"],
  ["row", "Barbell Row", "back", "barbell"],
  ["overhead-press", "Overhead Press", "shoulders", "barbell"],
  ["dumbbell-press", "Dumbbell Bench Press", "chest", "dumbbell"],
  ["goblet-squat", "Goblet Squat", "quads", "dumbbell"],
  ["dumbbell-row", "Dumbbell Row", "back", "dumbbell"],
  ["rdl", "Dumbbell Romanian Deadlift", "hamstrings", "dumbbell"],
  ["lateral-raise", "Lateral Raise", "shoulders", "dumbbell"],
  ["curl", "Bicep Curl", "biceps", "dumbbell"],
  ["triceps", "Tricep Extension", "triceps", "cable"],
  ["pulldown", "Lat Pulldown", "back", "machine"],
  ["leg-press", "Leg Press", "quads", "machine"],
  ["leg-curl", "Hamstring Curl", "hamstrings", "machine"],
  ["push-up", "Push Up", "chest", "bodyweight"],
  ["pull-up", "Pull Up", "back", "pullup-bar"],
  ["bodyweight-squat", "Bodyweight Squat", "quads", "bodyweight"],
  ["glute-bridge", "Glute Bridge", "glutes", "bodyweight"],
  ["crunch", "Crunch", "core", "bodyweight"],
  ["calf-raise", "Calf Raise", "calves", "bodyweight"],
  ["dips", "Dips", "triceps", "dip-bars"],
  ["pike-push-up", "Pike Push Up", "shoulders", "bodyweight"],
  ["floor-reverse-fly", "Prone Reverse Fly", "back", "bodyweight"],
];
const groups = {
  chest: {
    barbell: [
      "Incline Bench Press",
      "Decline Bench Press",
      "Close-Grip Bench Press",
      "Floor Press",
    ],
    dumbbell: [
      "Incline Dumbbell Press",
      "Decline Dumbbell Press",
      "Dumbbell Fly",
      "Incline Dumbbell Fly",
      "Dumbbell Floor Press",
      "Dumbbell Pullover",
    ],
    cable: [
      "Cable Fly",
      "Low Cable Fly",
      "High Cable Fly",
      "Single-Arm Cable Chest Press",
    ],
    machine: [
      "Chest Press Machine",
      "Incline Chest Press Machine",
      "Pec Deck",
      "Smith Machine Bench Press",
    ],
    bodyweight: [
      "Incline Push Up",
      "Decline Push Up",
      "Knee Push Up",
      "Wide Push Up",
      "Diamond Push Up",
    ],
  },
  back: {
    barbell: ["Pendlay Row", "T-Bar Row", "Landmine Row", "Meadows Row"],
    dumbbell: [
      "Chest-Supported Dumbbell Row",
      "Incline Dumbbell Row",
      "Dumbbell Reverse Fly",
    ],
    cable: [
      "Seated Cable Row",
      "Single-Arm Cable Row",
      "Straight-Arm Pulldown",
      "Wide-Grip Cable Row",
    ],
    machine: [
      "Chest-Supported Machine Row",
      "Seated Row Machine",
      "Assisted Pull Up",
      "Close-Grip Lat Pulldown",
      "Wide-Grip Lat Pulldown",
    ],
    "pullup-bar": [
      "Chin Up",
      "Neutral-Grip Pull Up",
      "Wide-Grip Pull Up",
      "Scapular Pull Up",
    ],
  },
  shoulders: {
    barbell: ["Seated Barbell Shoulder Press", "Push Press", "Landmine Press"],
    dumbbell: [
      "Dumbbell Shoulder Press",
      "Arnold Press",
      "Front Raise",
      "Seated Lateral Raise",
      "Rear Delt Fly",
    ],
    cable: [
      "Cable Lateral Raise",
      "Cable Front Raise",
      "Face Pull",
      "Reverse Cable Fly",
    ],
    machine: [
      "Shoulder Press Machine",
      "Lateral Raise Machine",
      "Reverse Pec Deck",
    ],
    bodyweight: ["Shoulder Tap", "Wall Push Up"],
  },
  quads: {
    barbell: ["Front Squat", "Pause Squat", "Zercher Squat", "Barbell Lunge"],
    dumbbell: [
      "Bulgarian Split Squat",
      "Dumbbell Lunge",
      "Dumbbell Step Up",
      "Dumbbell Split Squat",
    ],
    machine: [
      "Hack Squat",
      "Leg Extension",
      "Smith Machine Squat",
      "Single-Leg Press",
    ],
    bodyweight: [
      "Reverse Lunge",
      "Walking Lunge",
      "Split Squat",
      "Step Up",
      "Assisted Pistol Squat",
      "Cossack Squat",
    ],
  },
  hamstrings: {
    barbell: [
      "Romanian Deadlift",
      "Sumo Deadlift",
      "Good Morning",
      "Stiff-Leg Deadlift",
    ],
    dumbbell: ["Single-Leg Romanian Deadlift", "Dumbbell Good Morning"],
    machine: ["Seated Leg Curl", "Lying Leg Curl", "Standing Leg Curl"],
    bodyweight: ["Sliding Leg Curl", "Nordic Curl"],
  },
  glutes: {
    barbell: ["Barbell Hip Thrust", "Barbell Glute Bridge"],
    dumbbell: ["Dumbbell Hip Thrust", "Dumbbell Glute Bridge"],
    cable: ["Cable Glute Kickback", "Cable Pull Through"],
    machine: [
      "Hip Thrust Machine",
      "Hip Abduction Machine",
      "Glute Kickback Machine",
    ],
    bodyweight: [
      "Single-Leg Glute Bridge",
      "Frog Pump",
      "Donkey Kick",
      "Fire Hydrant",
    ],
  },
  biceps: {
    barbell: [
      "Barbell Curl",
      "Reverse Barbell Curl",
      "EZ-Bar Curl",
      "Preacher Curl",
    ],
    dumbbell: [
      "Hammer Curl",
      "Incline Dumbbell Curl",
      "Concentration Curl",
      "Alternating Dumbbell Curl",
      "Spider Curl",
      "Zottman Curl",
    ],
    cable: ["Cable Curl", "Rope Hammer Curl", "Bayesian Cable Curl"],
    machine: ["Bicep Curl Machine"],
  },
  triceps: {
    barbell: ["Skull Crusher", "Close-Grip Floor Press"],
    dumbbell: [
      "Overhead Dumbbell Tricep Extension",
      "Dumbbell Tricep Kickback",
      "Dumbbell Skull Crusher",
    ],
    cable: [
      "Rope Tricep Pushdown",
      "Straight-Bar Tricep Pushdown",
      "Overhead Cable Tricep Extension",
      "Single-Arm Cable Pushdown",
    ],
    machine: ["Tricep Extension Machine", "Assisted Dip"],
    "dip-bars": ["Tricep Dip"],
  },
  calves: {
    dumbbell: ["Dumbbell Calf Raise", "Single-Leg Dumbbell Calf Raise"],
    machine: [
      "Standing Calf Raise Machine",
      "Seated Calf Raise Machine",
      "Leg Press Calf Raise",
    ],
    bodyweight: ["Single-Leg Calf Raise", "Seated Calf Raise"],
  },
  core: {
    cable: ["Cable Crunch", "Cable Woodchop", "Pallof Press"],
    dumbbell: ["Dumbbell Side Bend", "Weighted Crunch", "Russian Twist"],
    machine: ["Ab Crunch Machine"],
    bodyweight: [
      "Reverse Crunch",
      "Bicycle Crunch",
      "Dead Bug",
      "Bird Dog",
      "Lying Leg Raise",
      "Heel Touch",
      "Sit Up",
      "V-Up",
      "Mountain Climber",
    ],
    "pullup-bar": ["Hanging Knee Raise", "Hanging Leg Raise"],
  },
  forearms: {
    barbell: ["Barbell Wrist Curl", "Reverse Wrist Curl"],
    dumbbell: ["Dumbbell Wrist Curl", "Dumbbell Wrist Rotation"],
  },
};
const catalog = base.map(([id, name, muscle, equipment]) => ({
  id,
  name,
  muscle,
  equipment,
}));
for (const [muscle, equipmentGroups] of Object.entries(groups)) {
  for (const [equipment, names] of Object.entries(equipmentGroups)) {
    for (const name of names) {
      const id = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      if (!catalog.some((e) => e.id === id || e.name === name))
        catalog.push({ id, name, muscle, equipment });
    }
  }
}
module.exports = { catalog };
