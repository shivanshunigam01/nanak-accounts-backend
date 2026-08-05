const router = require("express").Router();
const { protect } = require("../../middleware/auth");
const { requireModule } = require("../../middleware/roles");
const c = require("../../controllers/admin/aml-compliance.controller");

router.use(protect);
router.use(requireModule("aml-compliance"));

router.get("/meta", c.getMeta);
router.get("/dashboard", c.getDashboard);

router.get("/matters/export", c.exportMatters);
router.get("/matters", c.listMatters);
router.post("/matters", c.createMatter);
router.get("/matters/:id/cdd-pack", c.exportCddPack);
router.get("/matters/:id", c.getMatter);
router.patch("/matters/:id", c.updateMatter);

router.get("/smrs", c.listSmrs);
router.post("/smrs", c.createSmr);
router.patch("/smrs/:id", c.updateSmr);

router.get("/training", c.listTraining);
router.post("/training", c.createTraining);
router.patch("/training/:id", c.updateTraining);

router.get("/firm", c.getFirm);
router.patch("/firm", c.updateFirm);

module.exports = router;
