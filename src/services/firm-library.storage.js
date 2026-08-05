/**
 * Private on-disk storage for Firm Library files.
 * Never mount this folder on express.static — serve only via audited API.
 */

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { MAX_FILE_BYTES } = require("./firm-library.constants");

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "firm-library");

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

ensureDir();

function safeName(original) {
  const base = String(original || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
  return base || "file";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${stamp}-${safeName(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
});

function absolutePath(storageKey) {
  if (!storageKey) return null;
  const resolved = path.resolve(UPLOAD_DIR, path.basename(storageKey));
  if (!resolved.startsWith(UPLOAD_DIR)) return null;
  return resolved;
}

function deleteFile(storageKey) {
  const abs = absolutePath(storageKey);
  if (!abs) return;
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (err) {
    console.error("[firm-library] deleteFile:", err.message);
  }
}

function fileMetaFromMulter(file) {
  if (!file) return null;
  return {
    fname: file.originalname,
    size: file.size,
    mime: file.mimetype || "application/octet-stream",
    storageKey: file.filename,
  };
}

module.exports = {
  UPLOAD_DIR,
  upload,
  ensureDir,
  absolutePath,
  deleteFile,
  fileMetaFromMulter,
};
