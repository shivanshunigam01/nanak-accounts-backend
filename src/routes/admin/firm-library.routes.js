const router = require("express").Router();
const { protect } = require("../../middleware/auth");
const { requireModule, requireModuleLevel, requireRole } = require("../../middleware/roles");
const c = require("../../controllers/admin/firm-library.controller");
const { upload } = require("../../services/firm-library.storage");

router.use(protect);
router.use(requireModule("firm-library"));

router.get("/meta", c.getMeta);
router.get("/stats", c.getStats);

router.get("/audit/export", requireRole("admin", "owner"), c.exportAudit);
router.get("/audit", requireRole("admin", "owner"), c.listAudit);

router.get("/docs", c.listDocs);
router.post("/docs", requireModuleLevel("firm-library", "edit"), upload.single("file"), c.createDoc);
router.get("/docs/:id/file", c.streamFile);
router.post(
  "/docs/:id/versions",
  requireModuleLevel("firm-library", "edit"),
  upload.single("file"),
  c.addVersion
);
router.post("/docs/:id/ack", c.acknowledge);
router.post("/docs/:id/suggest", c.suggest);
router.get("/docs/:id", c.getDoc);
router.patch("/docs/:id", requireModuleLevel("firm-library", "edit"), c.updateDoc);
router.delete("/docs/:id", requireModuleLevel("firm-library", "full"), c.deleteDoc);

module.exports = router;
