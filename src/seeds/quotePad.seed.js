// Seeds test data for the Quote Pad + role-based access modules:
//   node src/seeds/quotePad.seed.js
//
// Creates/updates:
//   1. Test users (one per role + two with custom module permissions)
//   2. The Quote Pad pricing config document (defaults)
//   3. Two sample saved quotes (one household, one company)

require('dotenv').config();
const { connectDB } = require('../config/db');
const User = require('../models/User');
const QuotePadConfig = require('../models/QuotePadConfig');
const QuotePadQuote = require('../models/QuotePadQuote');
const { defaultQuotePadConfig } = require('../data/quotePadDefaults');

const TEST_USERS = [
  {
    name: 'Super Admin',
    email: 'admin@nanak.com',
    password: 'admin123',
    role: 'admin',
    permissions: null, // admins always get every module
  },
  {
    name: 'Test Manager',
    email: 'manager@nanak.com',
    password: 'manager123',
    role: 'manager',
    permissions: null, // role defaults: dashboard, submissions, reports, benchmarks, deduction, quote-pad
  },
  {
    name: 'Test Staff',
    email: 'staff@nanak.com',
    password: 'staff123',
    role: 'staff',
    permissions: null, // role defaults: dashboard, submissions, benchmarks, deduction, quote-pad
  },
  {
    name: 'Quotes Only',
    email: 'quotes.only@nanak.com',
    password: 'quotes123',
    role: 'staff',
    permissions: ['dashboard', 'quote-pad'], // custom: can ONLY use the Quote Pad
  },
  {
    name: 'Pricing Editor',
    email: 'pricing.editor@nanak.com',
    password: 'pricing123',
    role: 'manager',
    permissions: ['dashboard', 'quote-pad', 'quote-pad-pricing'], // custom: can also EDIT Quote Pad prices
  },
];

// Sample household: Raj (individual + joint rental) & Priya (sole trader $75k–$150k,
// GST registered, 2 BAS) + household tax planning.
// Totals: Raj 120+50 = 170 · Priya 250+200+50 = 500 · planning 150 → $820 ex GST
const SAMPLE_HOUSEHOLD = {
  number: 1,
  kind: 'household',
  label: 'Individual & Sole',
  structure: 'household',
  title: 'Sharma Household',
  total: 820,
  data: {
    household: 'Sharma Household',
    contact: 'Raj Sharma',
    phone: '0400 111 222',
    email: 'raj.sharma@example.com',
    preparedBy: 'Test Staff',
    financialYear: '2024-25',
    planning: true,
    discountPct: 0,
    people: [
      {
        name: 'Raj Sharma',
        structure: 'individual',
        st: { band: 0, reviewFee: 0, gstMode: 'no', basCount: 0, basRecords: 'complete' },
        rentals: [{ ownership: 'joint', linkedTo: 1 }],
        shares: { mode: 'none', brokerCount: 1, disposalCount: 0, completeReportSupplied: false, complexReview: false, estimate: 0 },
        cfd: { on: false, brokerCount: 1, annualSummarySupplied: true, foreignCurrency: false, reconstructionRequired: false, highVolumeReview: false, estimate: 0 },
        crypto: { mode: 'none', estimate: 0, koinly: false, koinlyTier: 0 },
        cgtProperty: false,
        foreign: false,
      },
      {
        name: 'Priya Sharma',
        structure: 'soletrader',
        st: { band: 1, reviewFee: 0, gstMode: 'yes', basCount: 2, basRecords: 'complete' },
        rentals: [],
        shares: { mode: 'none', brokerCount: 1, disposalCount: 0, completeReportSupplied: false, complexReview: false, estimate: 0 },
        cfd: { on: false, brokerCount: 1, annualSummarySupplied: true, foreignCurrency: false, reconstructionRequired: false, highVolumeReview: false, estimate: 0 },
        crypto: { mode: 'none', estimate: 0, koinly: false, koinlyTier: 0 },
        cgtProperty: false,
        foreign: false,
      },
    ],
  },
};

// Sample company: existing client, $150–200k turnover → core 1650 + planning 300 = $1,950/yr ex GST
const SAMPLE_COMPANY = {
  number: 2,
  kind: 'entity',
  label: 'Company',
  structure: 'Company',
  title: 'Melbourne Motors Pty Ltd',
  total: 1950,
  data: {
    entity: 'Company',
    clientType: 'Existing',
    band: '150–200k',
    smsfTier: '',
    nfpTier: '',
    gst: 'Registered',
    basFreq: 'Quarterly',
    financialYear: '2024-25',
    midYear: false,
    basRemaining: 3,
    payrollResp: 'No payroll',
    employees: 0,
    recordCondition: 'csv',
    recordReviewFee: 0,
    support: 'planning',
    setupsMulti: [],
    properties: 0,
    shareVol: 'standard',
    shareQuote: 0,
    offerMode: 'standard',
    discountPct: 0,
    bundle: false,
    bundlePct: 50,
    discountReason: '',
    addons: {},
    biz: 'Melbourne Motors Pty Ltd',
    contact: 'Sam Chen',
    phone: '03 9000 1111',
    email: 'sam@melbournemotors.example',
    abn: '12 345 678 901',
    preparedBy: 'Test Staff',
  },
};

async function run() {
  await connectDB();

  // 1. Users
  for (const u of TEST_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      existing.name = u.name;
      existing.role = u.role;
      existing.permissions = u.permissions;
      existing.active = true;
      existing.password = u.password; // pre-save hook re-hashes
      await existing.save();
      console.log(`♻️  Updated user: ${u.email} (${u.role}${u.permissions ? ', custom access' : ''})`);
    } else {
      await User.create({ ...u, active: true });
      console.log(`✅ Created user: ${u.email} (${u.role}${u.permissions ? ', custom access' : ''})`);
    }
  }

  // 2. Quote Pad pricing config
  const defaults = defaultQuotePadConfig();
  await QuotePadConfig.findOneAndUpdate(
    { key: 'default' },
    {
      $set: { 'firm.maxDiscountPct': defaults.firm.maxDiscountPct },
      $setOnInsert: { firm: defaults.firm, household: defaults.household, business: defaults.business },
    },
    { upsert: true }
  );
  console.log('✅ Quote Pad pricing config seeded (defaults, kept if already customised)');

  // 3. Sample quotes
  const admin = await User.findOne({ email: 'admin@nanak.com' });
  for (const q of [SAMPLE_HOUSEHOLD, SAMPLE_COMPANY]) {
    await QuotePadQuote.findOneAndUpdate(
      { number: q.number },
      { $set: { ...q, createdBy: admin?._id || null, createdByName: q.data.preparedBy } },
      { upsert: true }
    );
    console.log(`✅ Sample quote #${q.number}: ${q.title} — $${q.total} ex GST`);
  }

  console.log('\n─── Test credentials ───');
  TEST_USERS.forEach((u) =>
    console.log(
      `  ${u.email.padEnd(28)} / ${u.password.padEnd(12)} → ${u.role}${u.permissions ? ` (custom: ${u.permissions.join(', ')})` : ' (role defaults)'}`
    )
  );
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
