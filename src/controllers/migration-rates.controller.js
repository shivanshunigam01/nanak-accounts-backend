const MigrationRatesConfig = require("../models/MigrationRatesConfig");
const { asyncHandler } = require("../middleware/asyncHandler");
const { defaultMigrationRatesConfig } = require("../data/migrationRatesDefaults");

function mergeDefaults(doc) {
  const defaults = defaultMigrationRatesConfig();
  if (!doc) return defaults;
  const years = { ...defaults.years, ...(doc.years || {}) };
  return {
    key: "default",
    activeYearKey: doc.activeYearKey || defaults.activeYearKey,
    years,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  };
}

async function getOrSeed() {
  let doc = await MigrationRatesConfig.findOne({ key: "default" });
  if (!doc) {
    const seed = defaultMigrationRatesConfig();
    doc = await MigrationRatesConfig.create(seed);
  }
  return doc;
}

exports.getPublic = asyncHandler(async (req, res) => {
  const doc = await getOrSeed();
  const cfg = mergeDefaults(doc.toObject ? doc.toObject() : doc);
  const yearKey = String(req.query.year || cfg.activeYearKey);
  const year = cfg.years[yearKey] || cfg.years[cfg.activeYearKey];
  if (!year) {
    return res.status(404).json({ success: false, message: "Year not found" });
  }
  res.json({
    success: true,
    activeYearKey: cfg.activeYearKey,
    yearKey: cfg.years[yearKey] ? yearKey : cfg.activeYearKey,
    year,
    years: Object.entries(cfg.years).map(([key, y]) => ({
      key,
      label: y.label || key,
      effectiveDate: y.effectiveDate || null,
    })),
  });
});

exports.getAdmin = asyncHandler(async (_req, res) => {
  const doc = await getOrSeed();
  res.json({ success: true, config: mergeDefaults(doc.toObject ? doc.toObject() : doc) });
});

exports.updateAdmin = asyncHandler(async (req, res) => {
  const updates = { updatedBy: req.user._id };
  if (req.body.activeYearKey) updates.activeYearKey = String(req.body.activeYearKey);
  if (req.body.years && typeof req.body.years === "object") updates.years = req.body.years;
  const doc = await MigrationRatesConfig.findOneAndUpdate(
    { key: "default" },
    { $set: updates },
    { new: true, upsert: true }
  );
  res.json({ success: true, config: mergeDefaults(doc.toObject()) });
});

exports.cloneYear = asyncHandler(async (req, res) => {
  const { fromKey, toKey, label } = req.body || {};
  if (!fromKey || !toKey) {
    return res.status(400).json({ success: false, message: "fromKey and toKey are required" });
  }
  const doc = await getOrSeed();
  const cfg = mergeDefaults(doc.toObject());
  const source = cfg.years[fromKey];
  if (!source) {
    return res.status(404).json({ success: false, message: "Source year not found" });
  }
  const clone = JSON.parse(JSON.stringify(source));
  if (label) clone.label = label;
  cfg.years[toKey] = clone;
  doc.years = cfg.years;
  doc.updatedBy = req.user._id;
  await doc.save();
  res.json({ success: true, config: mergeDefaults(doc.toObject()) });
});

exports.setActiveYear = asyncHandler(async (req, res) => {
  const { yearKey } = req.body || {};
  if (!yearKey) {
    return res.status(400).json({ success: false, message: "yearKey is required" });
  }
  const doc = await getOrSeed();
  const cfg = mergeDefaults(doc.toObject());
  if (!cfg.years[yearKey]) {
    return res.status(404).json({ success: false, message: "Year not found" });
  }
  doc.activeYearKey = yearKey;
  doc.updatedBy = req.user._id;
  await doc.save();
  res.json({ success: true, config: mergeDefaults(doc.toObject()) });
});

exports.resetAdmin = asyncHandler(async (req, res) => {
  await MigrationRatesConfig.deleteOne({ key: "default" });
  const doc = await MigrationRatesConfig.create({
    ...defaultMigrationRatesConfig(),
    updatedBy: req.user._id,
  });
  res.json({ success: true, config: mergeDefaults(doc.toObject()) });
});
