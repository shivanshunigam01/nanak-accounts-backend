const Submission = require('../../models/Submission');
const { asyncHandler } = require('../../middleware/asyncHandler');

function startOfTodayUTC() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d;
}

const getStats = asyncHandler(async (_req, res) => {
  const today = startOfTodayUTC();

  const [newToday, pendingPayment, inProgress, completed, failedPayments, revenueTodayAgg] = await Promise.all([
    Submission.countDocuments({ createdAt: { $gte: today } }),
    Submission.countDocuments({ paymentStatus: { $in: ['pending', 'pending_payment'] } }),
    Submission.countDocuments({ jobStatus: 'in_progress' }),
    Submission.countDocuments({ jobStatus: 'completed' }),
    Submission.countDocuments({ paymentStatus: { $in: ['failed', 'payment_failed'] } }),
    Submission.aggregate([
      { $match: { createdAt: { $gte: today }, paymentStatus: { $in: ['paid', 'payment_complete'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const revenueToday = revenueTodayAgg?.[0]?.total || 0;

  res.json({
    newToday,
    pendingPayment,
    inProgress,
    completed,
    failedPayments,
    revenueToday,
  });
});

const getRevenueChart = asyncHandler(async (req, res) => {
  const period = String(req.query.period || 'week');
  const now = new Date();
  let from;

  if (period === 'month') {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  const data = await Submission.aggregate([
    { $match: { createdAt: { $gte: from }, paymentStatus: { $in: ['paid', 'payment_complete'] } } },
    {
      $group: {
        _id: {
          y: { $year: '$createdAt' },
          m: { $month: '$createdAt' },
          d: { $dayOfMonth: '$createdAt' },
        },
        revenue: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
  ]);

  const out = data.map((r) => {
    const label = period === 'week'
      ? new Date(Date.UTC(r._id.y, r._id.m - 1, r._id.d)).toLocaleDateString('en-US', { weekday: 'short' })
      : `${String(r._id.d).padStart(2, '0')}/${String(r._id.m).padStart(2, '0')}`;
    return { name: label, revenue: r.revenue };
  });

  res.json(out);
});

const getServiceDistribution = asyncHandler(async (_req, res) => {
  const data = await Submission.aggregate([
    { $group: { _id: '$serviceName', value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $limit: 10 },
    { $project: { _id: 0, name: '$_id', value: 1 } },
  ]);
  res.json(data);
});

const getRecentSubmissions = asyncHandler(async (_req, res) => {
  const data = await Submission.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('_id orderNumber customerName serviceName amount paymentStatus createdAt')
    .lean();

  res.json(data);
});

module.exports = {
  getStats,
  getRevenueChart,
  getServiceDistribution,
  getRecentSubmissions,
};
