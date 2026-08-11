const { body, param, query } = require('express-validator');
const ToolSession = require('../../models/ToolSession');
const { asyncHandler } = require('../../middleware/asyncHandler');
const { isFullAccessRole } = require('../../config/modules');
const { getPagination } = require('../../utils/pagination');

const TOOLS = ['ato-benchmark', 'deduction'];

const listValidators = [query('tool').isIn(TOOLS)];

// List sessions for a tool (payload excluded to keep responses small).
const listSessions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { tool: req.query.tool };
  if (req.query.search) {
    const s = String(req.query.search).trim();
    filter.$or = [
      { title: { $regex: s, $options: 'i' } },
      { createdByName: { $regex: s, $options: 'i' } },
      { 'summary.clientName': { $regex: s, $options: 'i' } },
      { 'summary.occName': { $regex: s, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    ToolSession.find(filter)
      .select('-payload')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ToolSession.countDocuments(filter),
  ]);

  res.json({ success: true, items, total, page, pages: Math.ceil(total / limit) });
});

const getValidators = [param('id').isMongoId()];

const getSession = asyncHandler(async (req, res) => {
  const session = await ToolSession.findById(req.params.id).lean();
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
  res.json({ success: true, session });
});

const createValidators = [
  body('tool').isIn(TOOLS),
  body('title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('payload').exists(),
  body('summary').optional(),
];

const createSession = asyncHandler(async (req, res) => {
  const { tool, title, payload, summary } = req.body;
  const session = await ToolSession.create({
    tool,
    title,
    payload,
    summary: summary || {},
    createdBy: req.user?._id,
    createdByName: req.user?.name || '',
  });
  res.status(201).json({ success: true, session });
});

const deleteValidators = [param('id').isMongoId()];

const deleteSession = asyncHandler(async (req, res) => {
  const session = await ToolSession.findById(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
  // Staff may only delete their own saved sessions; admins can delete any.
  const isOwner = session.createdBy && String(session.createdBy) === String(req.user._id);
  if (!isFullAccessRole(req.user.role) && !isOwner) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  await session.deleteOne();
  res.json({ success: true });
});

module.exports = {
  listSessions,
  getSession,
  createSession,
  deleteSession,
  listValidators,
  getValidators,
  createValidators,
  deleteValidators,
};
