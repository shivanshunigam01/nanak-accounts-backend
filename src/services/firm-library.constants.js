/**
 * Firm Library — shared constants (served via GET /meta)
 */

const CATS = {
  pol: { label: "Policies", ic: "P" },
  sop: { label: "SOPs & Checklists", ic: "S" },
  tpl: { label: "Templates & Tools", ic: "T" },
  prg: { label: "Programs", ic: "G" },
  trn: { label: "Training", ic: "L" },
};

const STATUSES = ["current", "review", "archived"];

const AUDIT_ACTIONS = [
  "opened",
  "downloaded",
  "uploaded",
  "acknowledged",
  "deleted",
  "versioned",
  "suggested",
];

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

module.exports = {
  CATS,
  STATUSES,
  AUDIT_ACTIONS,
  MAX_FILE_BYTES,
};
