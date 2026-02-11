const Submission = require('../../models/Submission');
const User = require('../../models/User');
const { asyncHandler } = require('../../middleware/asyncHandler');

function parseRange(query) {
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const match = {};
  if (from) match.$gte = from;
  if (to) match.$lte = to;
  return { from, to, match };
}

const summary = asyncHandler(async (req, res) => {
  const { match } = parseRange(req.query);
  const createdAtFilter = Object.keys(match).length ? { createdAt: match } : {};

  const totalSubmissions = await Submission.countDocuments(createdAtFilter);
  const paidAgg = await Submission.aggregate([
    { $match: { ...createdAtFilter, paymentStatus: { $in: ['paid', 'payment_complete'] } } },
    { $group: { _id: null, totalRevenue: { $sum: '$amount' }, paidCount: { $sum: 1 } } },
  ]);

  const totalRevenue = paidAgg?.[0]?.totalRevenue || 0;
  const paidCount = paidAgg?.[0]?.paidCount || 0;
  const avgOrderValue = paidCount ? Math.round(totalRevenue / paidCount) : 0;
  const conversionRate = totalSubmissions ? Math.round((paidCount / totalSubmissions) * 1000) / 10 : 0;

  res.json({ totalRevenue, avgOrderValue, conversionRate, totalSubmissions });
});

const conversionFunnel = asyncHandler(async (req, res) => {
  const period = String(req.query.period || 'week');
  const now = new Date();
  const from = period === 'month' ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const data = await Submission.aggregate([
    { $match: { createdAt: { $gte: from } } },
    {
      $group: {
        _id: {
          y: { $year: '$createdAt' },
          m: { $month: '$createdAt' },
          d: { $dayOfMonth: '$createdAt' },
        },
        submissions: { $sum: 1 },
        paid: {
          $sum: {
            $cond: [{ $in: ['$paymentStatus', ['paid', 'payment_complete']] }, 1, 0],
          },
        },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
  ]);

  const out = data.map((r) => {
    const date = new Date(Date.UTC(r._id.y, r._id.m - 1, r._id.d));
    const name = period === 'week'
      ? date.toLocaleDateString('en-US', { weekday: 'short' })
      : `${String(r._id.d).padStart(2, '0')}/${String(r._id.m).padStart(2, '0')}`;
    return { name, submissions: r.submissions, paid: r.paid };
  });

  res.json(out);
});

const staffWorkload = asyncHandler(async (_req, res) => {
  const data = await Submission.aggregate([
    { $match: { assignedTo: { $ne: null } } },
    { $group: { _id: '$assignedTo', assigned: { $sum: 1 } } },
    { $sort: { assigned: -1 } },
  ]);

  const users = await User.find({ _id: { $in: data.map((d) => d._id) } }).select('name').lean();
  const nameMap = new Map(users.map((u) => [String(u._id), u.name]));

  res.json(data.map((d) => ({ name: nameMap.get(String(d._id)) || 'Unknown', assigned: d.assigned })));
});

const servicePopularity = asyncHandler(async (_req, res) => {
  const data = await Submission.aggregate([
    { $group: { _id: '$serviceName', value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $project: { _id: 0, name: '$_id', value: 1 } },
  ]);
  res.json(data);
});

module.exports = { summary, conversionFunnel, staffWorkload, servicePopularity };
