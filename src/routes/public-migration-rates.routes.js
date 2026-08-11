const router = require("express").Router();
const c = require("../controllers/migration-rates.controller");

router.get("/", c.getPublic);

module.exports = router;
