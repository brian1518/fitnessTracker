const router = require("express").Router();
const exerciseRoutes = require("./exerciseRoutes");
router.use("/exercises", exerciseRoutes);
module.exports = router;
