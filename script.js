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

const exerciseInput = document.getElementById("exercise");
const exerciseList = document.getElementById("exerciseList");

exercises.forEach(ex => {
  const option = document.createElement("option");
  option.value = ex;
  exerciseList.appendChild(option);
});


const addBtn = document.getElementById("addBtn");
const workoutList = document.getElementById("workoutList");


let workouts = JSON.parse(localStorage.getItem("workouts")) || [];

function renderWorkouts() {
  workoutList.innerHTML = "";
  workouts.forEach((w, index) => {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex justify-content-between align-items-center";
    li.textContent = `${w.exercise} - ${w.weight}kg x ${w.reps}`;
    

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-danger";
    delBtn.textContent = "❌";
    delBtn.addEventListener("click", () => {
      workouts.splice(index, 1);
      localStorage.setItem("workouts", JSON.stringify(workouts));
      renderWorkouts();
    });
    
    li.appendChild(delBtn);
    workoutList.appendChild(li);
  });
}

renderWorkouts(); 


addBtn.addEventListener("click", () => {
  const exercise = exerciseInput.value.trim();
  const weight = Number(document.getElementById("weight").value);
  const reps = Number(document.getElementById("reps").value);


  if (!exercise || !weight || !reps) {
    alert("Please fill all fields");
    return;
  }


  if (weight <= 0 || reps <= 0) {
    alert("Weight and reps must be positive numbers");
    return;
  }


  workouts.push({ exercise, weight, reps });
  localStorage.setItem("workouts", JSON.stringify(workouts));


  renderWorkouts();


  exerciseInput.value = "";
  document.getElementById("weight").value = "";
  document.getElementById("reps").value = "";
});