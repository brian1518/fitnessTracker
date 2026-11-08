const router = require("express").Router();
const controller = require("../controllers/exerciseController");
router.get("/", controller.list);
module.exports = router;
