const exercises = require("../models/exerciseModel");
exports.list = (req, res) => res.json(exercises.list());
