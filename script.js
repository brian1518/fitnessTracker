const addBtn = document.getElementById("addBtn");
const workoutList = document.getElementById("workoutList");

addBtn.addEventListener("click", () => {
  const exercise = document.getElementById("exercise").value;
  const weight = document.getElementById("weight").value;
  const reps = document.getElementById("reps").value;

  if (!exercise || !weight || !reps) {
    alert("Please fill all fields");
    return;
  }

  const li = document.createElement("li");
  li.textContent = `${exercise} - ${weight}kg x ${reps}`;
  workoutList.appendChild(li);

  // Clear inputs
  document.getElementById("exercise").value = "";
  document.getElementById("weight").value = "";
  document.getElementById("reps").value = "";
});