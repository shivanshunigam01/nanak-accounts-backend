const { body, param } = require('express-validator');
const QuotePadConfig = require('../models/QuotePadConfig');
const QuotePadQuote = require('../models/QuotePadQuote');
const { asyncHandler } = require('../middleware/asyncHandler');
const {
  defaultQuotePadConfig,
  mergeHouseholdConfig,
  mergeBusinessConfig,
} = require('../data/quotePadDefaults');
const {
  buildPriceBookRows,
  applyPriceBookRows,
  rowsToXlsxBuffer,
  bufferToRows,
} = require('../utils/quotePadPriceBook');

// Deep-merge saved firm config over defaults so newly added keys always exist.
function mergeDeep(base, saved) {
  if (Array.isArray(base)) return Array.isArray(saved) ? saved : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      Object.keys(saved).forEach((k) => {
        out[k] = k in base ? mergeDeep(base[k], saved[k]) : saved[k];
      });
    }
    return out;
  }
  return saved === undefined || saved === null ? base : saved;
}

function mergedConfig(doc) {
  const defaults = defaultQuotePadConfig();
  if (!doc) return defaults;
  const firm = mergeDeep(defaults.firm, doc.firm || {});
  // Promote legacy staff-discount caps (30 / 40) to the new 50% product default.
  if (firm.maxDiscountPct === 30 || firm.maxDiscountPct === 40) {
    firm.maxDiscountPct = defaults.firm.maxDiscountPct;
  }
  return {
    firm,
    household: mergeHouseholdConfig(doc.household || {}),
    business: mergeBusinessConfig(doc.business || {}),
  };
}

// ─── Config ───

const getConfig = asyncHandler(async (_req, res) => {
  const doc = await QuotePadConfig.findOne({ key: 'default' }).lean();
  res.json({ success: true, config: mergedConfig(doc) });
});

const updateConfigValidators = [
  body('firm').optional().isObject(),
  body('household').optional().isObject(),
  body('business').optional().isObject(),
];

const updateConfig = asyncHandler(async (req, res) => {
  const updates = { updatedBy: req.user._id };
  ['firm', 'household', 'business'].forEach((k) => {
    if (req.body[k] && typeof req.body[k] === 'object') updates[k] = req.body[k];
  });
  const doc = await QuotePadConfig.findOneAndUpdate(
    { key: 'default' },
    { $set: updates },
    { new: true, upsert: true }
  ).lean();
  res.json({ success: true, config: mergedConfig(doc) });
});

const resetConfig = asyncHandler(async (req, res) => {
  await QuotePadConfig.deleteOne({ key: 'default' });
  res.json({ success: true, config: defaultQuotePadConfig() });
});

function sendPriceBookXlsx(res, rows, filename) {
  const buf = rowsToXlsxBuffer(rows);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

/** GET — export live merged business prices as .xlsx */
const exportPriceBook = asyncHandler(async (_req, res) => {
  const doc = await QuotePadConfig.findOne({ key: 'default' }).lean();
  const config = mergedConfig(doc);
  const rows = buildPriceBookRows(config.business);
  const stamp = new Date().toISOString().slice(0, 10);
  sendPriceBookXlsx(res, rows, `nanak-price-book-${stamp}.xlsx`);
});

/** GET — demo template with headers + sample rows from defaults */
const downloadPriceBookDemo = asyncHandler(async (_req, res) => {
  const defaults = defaultQuotePadConfig();
  const rows = buildPriceBookRows(defaults.business);
  sendPriceBookXlsx(res, rows, 'nanak-price-book-demo.xlsx');
});

/** POST multipart — import .xlsx, update business prices, persist */
const importPriceBook = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ success: false, message: 'Excel file is required (field: file)' });
  }
  const name = String(req.file.originalname || '').toLowerCase();
  if (!/\.(xlsx|xls)$/.test(name) && !String(req.file.mimetype || '').includes('sheet')) {
    // Still try to parse — multer may set generic mime; only hard-fail empty
  }

  let rows;
  try {
    rows = bufferToRows(req.file.buffer);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ success: false, message: err.message || 'Invalid Excel file' });
  }

  const doc = await QuotePadConfig.findOne({ key: 'default' }).lean();
  const current = mergedConfig(doc);
  const { updated, skipped, business } = applyPriceBookRows(current.business, rows);

  const saved = await QuotePadConfig.findOneAndUpdate(
    { key: 'default' },
    {
      $set: {
        business,
        firm: current.firm,
        household: current.household,
        updatedBy: req.user._id,
      },
    },
    { new: true, upsert: true }
  ).lean();

  res.json({
    success: true,
    updated,
    skipped,
    config: mergedConfig(saved),
  });
});

// ─── Saved quotes ───

const listQuotes = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 500));
  const filter = {};

  if (q) {
    const digits = q.replace(/\D/g, '');
    const or = [
      { title: new RegExp(escapeRegex(q), 'i') },
      { label: new RegExp(escapeRegex(q), 'i') },
      { 'data.contact': new RegExp(escapeRegex(q), 'i') },
      { 'data.biz': new RegExp(escapeRegex(q), 'i') },
      { 'data.household': new RegExp(escapeRegex(q), 'i') },
      { 'data.entity': new RegExp(escapeRegex(q), 'i') },
      { 'data.email': new RegExp(escapeRegex(q), 'i') },
      { 'data.phone': new RegExp(escapeRegex(q), 'i') },
    ];
    if (digits) {
      const asNum = Number(digits);
      if (!Number.isNaN(asNum)) or.push({ number: asNum });
    }
    filter.$or = or;
  }

  const quotes = await QuotePadQuote.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
  res.json({ success: true, quotes });
});

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const getQuote = asyncHandler(async (req, res) => {
  const quote = await QuotePadQuote.findById(req.params.id).lean();
  if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });
  res.json({ success: true, quote });
});

const quoteValidators = [
  body('kind').isIn(['household', 'entity', 'registrations']),
  body('title').isString().notEmpty(),
  body('data').isObject(),
  body('total').optional().isNumeric(),
  body('label').optional().isString(),
  body('structure').optional().isString(),
];

const createQuote = asyncHandler(async (req, res) => {
  const last = await QuotePadQuote.findOne().sort({ number: -1 }).select('number').lean();
  const number = (last ? last.number : 0) + 1;
  const quote = await QuotePadQuote.create({
    number,
    kind: req.body.kind,
    label: req.body.label || '',
    structure: req.body.structure || (req.body.kind === 'household' ? 'household' : req.body.kind === 'registrations' ? 'registrations' : 'entity'),
    title: req.body.title,
    total: Number(req.body.total) || 0,
    data: req.body.data,
    createdBy: req.user._id,
    createdByName: req.user.name,
  });
  res.status(201).json({ success: true, quote });
});

const updateQuoteValidators = [
  param('id').isString().notEmpty(),
  body('title').optional().isString(),
  body('data').optional().isObject(),
  body('total').optional().isNumeric(),
  body('label').optional().isString(),
  body('structure').optional().isString(),
];

const updateQuote = asyncHandler(async (req, res) => {
  const quote = await QuotePadQuote.findById(req.params.id);
  if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });
  ['title', 'data', 'label', 'structure'].forEach((k) => {
    if (req.body[k] !== undefined) quote[k] = req.body[k];
  });
  if (req.body.total !== undefined) quote.total = Number(req.body.total) || 0;
  await quote.save();
  res.json({ success: true, quote });
});

const deleteQuote = asyncHandler(async (req, res) => {
  const quote = await QuotePadQuote.findById(req.params.id);
  if (!quote) return res.status(404).json({ success: false, message: 'Quote not found' });
  await QuotePadQuote.deleteOne({ _id: quote._id });
  res.json({ success: true, message: 'Quote deleted' });
});

module.exports = {
  getConfig,
  updateConfig,
  updateConfigValidators,
  resetConfig,
  exportPriceBook,
  downloadPriceBookDemo,
  importPriceBook,
  listQuotes,
  getQuote,
  createQuote,
  quoteValidators,
  updateQuote,
  updateQuoteValidators,
  deleteQuote,
};
