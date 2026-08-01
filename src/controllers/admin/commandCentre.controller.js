const CommandCentreStore = require('../../models/CommandCentreStore');
const { asyncHandler } = require('../../middleware/asyncHandler');

async function getOrCreate() {
  let doc = await CommandCentreStore.findOne({ key: 'firm' });
  if (!doc) {
    doc = await CommandCentreStore.create({ key: 'firm', data: null });
  }
  return doc;
}

const getStore = asyncHandler(async (_req, res) => {
  const doc = await getOrCreate();
  res.json({
    success: true,
    data: doc.data && typeof doc.data === 'object' ? doc.data : null,
    updatedAt: doc.updatedAt,
    updatedByName: doc.updatedByName || '',
  });
});

const saveStore = asyncHandler(async (req, res) => {
  const incoming = req.body?.data;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ success: false, message: 'Invalid Command Centre workspace payload' });
  }

  const doc = await CommandCentreStore.findOneAndUpdate(
    { key: 'firm' },
    {
      data: incoming,
      updatedBy: req.user?._id || null,
      updatedByName: req.user?.name || '',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    success: true,
    data: doc.data,
    updatedAt: doc.updatedAt,
    updatedByName: doc.updatedByName || '',
  });
});

module.exports = { getStore, saveStore };
