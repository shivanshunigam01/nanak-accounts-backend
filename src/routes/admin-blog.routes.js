/**
 * Admin Blog Routes
 *
 * GET    /api/admin/blogs
 * POST   /api/admin/blogs
 * GET    /api/admin/blogs/quiz-submissions
 * PATCH  /api/admin/blogs/quiz-submissions/:submissionId
 * GET    /api/admin/blogs/:id
 * PUT    /api/admin/blogs/:id
 * DELETE /api/admin/blogs/:id
 * PUT    /api/admin/blogs/:id/assign
 * PATCH  /api/admin/blogs/:id/status
 * GET    /api/admin/blogs/:id/quiz-submissions
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { protect } = require("../middleware/auth");
const { requireModule } = require("../middleware/roles");
const adminBlogController = require("../controllers/admin-blog.controller");

const router = express.Router();

const uploadDir = path.resolve(process.cwd(), "uploads/blogs");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, and WEBP images are allowed"), false);
  },
});

const uploadFields = upload.fields([{ name: "coverImage", maxCount: 1 }]);

router.use(protect);
router.use(requireModule("blogs"));

// Static paths before :id
router.get("/quiz-submissions", adminBlogController.getAllQuizSubmissions);
router.patch(
  "/quiz-submissions/:submissionId",
  adminBlogController.updateQuizSubmission
);

router.get("/", adminBlogController.getAll);
router.post("/", uploadFields, adminBlogController.create);
router.get("/:id", adminBlogController.getById);
router.put("/:id", uploadFields, adminBlogController.update);
router.delete("/:id", adminBlogController.delete);
router.put("/:id/assign", adminBlogController.assign);
router.patch("/:id/status", adminBlogController.updateStatus);
router.get("/:id/quiz-submissions", adminBlogController.getQuizSubmissionsForBlog);

module.exports = router;
