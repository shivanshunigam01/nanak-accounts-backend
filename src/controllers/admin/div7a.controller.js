const Div7aStore = require('../../models/Div7aStore');
const { asyncHandler } = require('../../middleware/asyncHandler');

const EMPTY = { v: 4, seq: 1, clients: [] };

async function getOrCreate() {
  let doc = await Div7aStore.findOne({ key: 'firm' });
  if (!doc) {
    doc = await Div7aStore.create({ key: 'firm', data: EMPTY });
  }
  return doc;
}

const getStore = asyncHandler(async (_req, res) => {
  const doc = await getOrCreate();
  res.json({
    success: true,
    data: doc.data && typeof doc.data === 'object' ? doc.data : EMPTY,
    updatedAt: doc.updatedAt,
    updatedByName: doc.updatedByName || '',
  });
});

const saveStore = asyncHandler(async (req, res) => {
  const incoming = req.body?.data;
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.clients)) {
    return res.status(400).json({ success: false, message: 'Invalid Division 7A data payload' });
  }

  const data = {
    v: Number(incoming.v) || 4,
    seq: Math.max(1, Number(incoming.seq) || 1),
    clients: incoming.clients,
  };

  const doc = await Div7aStore.findOneAndUpdate(
    { key: 'firm' },
    {
      data,
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
