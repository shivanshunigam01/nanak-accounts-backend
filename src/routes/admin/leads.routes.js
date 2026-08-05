/**
 * Admin Lead CRM
 */

const express = require("express");
const { protect } = require("../../middleware/auth");
const { requireModule } = require("../../middleware/roles");
const controller = require("../../controllers/leads.controller");

const router = express.Router();

router.use(protect);
router.use(requireModule("lead-crm"));

router.get("/stats", controller.stats);
router.get("/team-stats", controller.teamStats);
router.get("/activity", controller.activity);
router.get("/attribution", controller.attribution);
router.get("/export", controller.exportCsv);
router.get("/settings", controller.getSettings);
router.patch("/settings", controller.updateSettings);

router.get("/", controller.list);
router.post("/", controller.createManual);
router.get("/:id", controller.getById);
router.patch("/:id", controller.update);
router.post("/:id/email", controller.sendEmail);

module.exports = router;
