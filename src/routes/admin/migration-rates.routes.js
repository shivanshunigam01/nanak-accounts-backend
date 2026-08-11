const router = require("express").Router();
const { protect } = require("../../middleware/auth");
const { requireModule, requireModuleLevel } = require("../../middleware/roles");
const c = require("../../controllers/migration-rates.controller");

router.use(protect);
router.use(requireModule("migration-rates"));

router.get("/", c.getAdmin);
router.put("/", requireModuleLevel("migration-rates", "edit"), c.updateAdmin);
router.post("/years", requireModuleLevel("migration-rates", "edit"), c.cloneYear);
router.put("/active-year", requireModuleLevel("migration-rates", "edit"), c.setActiveYear);
router.post("/reset", requireModuleLevel("migration-rates", "full"), c.resetAdmin);

module.exports = router;
