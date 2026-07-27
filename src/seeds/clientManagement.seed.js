const User = require('../models/User');
const PracticeClient = require('../models/PracticeClient');
const PracticeGroup = require('../models/PracticeGroup');
const PracticeSettings = require('../models/PracticeSettings');
const PracticePayrollOverride = require('../models/PracticePayrollOverride');
const PracticePeriod = require('../models/PracticePeriod');
const ClientPeriodStatus = require('../models/ClientPeriodStatus');
const { ensurePeriodMigration } = require('../modules/client-management/periods');

const STATUTORY_QUARTERS = [
  { k: 'q1', l: 'Sep 25', due: '28 Nov 2025' },
  { k: 'q2', l: 'Dec 25', due: '28 Feb 2026' },
  { k: 'q3', l: 'Mar 26', due: '26 May 2026' },
  { k: 'q4', l: 'Jun 26', due: '28 Aug 2026' },
];

const STATUTORY_DUE_DEFAULTS = PracticeSettings.DEFAULT_DUE_DATE_DEFAULTS || {
  q1: { day: 28, month: 11 },
  q2: { day: 28, month: 2 },
  q3: { day: 26, month: 5 },
  q4: { day: 28, month: 8 },
  annual: { day: 15, month: 5 },
};

const STAFF_NAMES = [
  'Yatin',
  'Mahima',
  'Priyanjali',
  'Karan Veer',
  'Aditya Alok',
  'Nishant',
  'Shubham',
  'Rishabh',
  'Aditya',
];
const PAYROLL_STAFF = ['Nishant', 'Rishabh', 'Mahima'];
const OFFICES = [
  'Craigieburn',
  'Tarneit',
  'Cranbourne',
  'Pakenham',
  'Point Cook',
  'Truganina',
  'Officer',
  'Melbourne CBD',
];

const HAND_WRITTEN = [
  ['THE TRUSTEE FOR TEMPLETON FAMILY TRUST', '40 763 064 274', 'Yatin', 'Craigieburn', 'Non Package', null, true, false, 'Not Required', '', '', ['Not Required', 'Not Required', 'Not Required', 'Not Required'], 'In Progress', 'Trust'],
  ['ENMA RISE GROUP PTY LTD', '78 696 958 255', 'Yatin', 'Craigieburn', 'Non Package', null, true, false, 'Not Required', '', '0451 103 881', ['Not Required', 'Not Required', 'Not Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['VERMA CONSTRUCTION PTY LTD', '55 671 490 850', 'Yatin', 'Tarneit', 'On Package', 2220, true, true, 'Connected', '', '', ['Completed', 'Completed', 'Completed', 'In Progress'], 'Not Started', 'Company'],
  ['SUNRISE CIVIL GROUP PTY LTD', '82 604 118 220', 'Yatin', 'Tarneit', 'On Package', 1800, true, true, 'Connected', 'accounts@sunrisecivil.com.au', '0412 887 340', ['Completed', 'Completed', 'Completed', 'Completed'], 'Not Started', 'Company'],
  ['JD TECH SERVICES PTY LTD', '74 695 433 731', 'Mahima', 'Point Cook', 'On Package', 1500, true, false, 'Not Required', 'jayant2610@gmail.com', '0449 626 040', ['Completed', 'Completed', 'Not Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['VALINO PROPERTY MAINTENANCE PTY LTD', '43 694 326 700', 'Mahima', 'Cranbourne', 'Non Package', null, true, false, 'Not Connected', '', '', ['Completed', 'Completed', 'Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['AUSSIE FRESH GROCERIES PTY LTD', '91 620 774 512', 'Mahima', 'Truganina', 'On Package', 1250, true, true, 'Connected', 'info@aussiefresh.com.au', '0433 210 998', ['Completed', 'Completed', 'Completed', 'In Progress'], 'Not Started', 'Company'],
  ['AB CONCRETING & CONSTRUCTIONS PTY LTD', '30 668 497 069', 'Priyanjali', 'Pakenham', 'Non Package', null, true, false, 'Connected', 'abconcreting1@gmail.com', '0470 666 450', ['Completed', 'Completed', 'Not Completed', 'In Progress'], 'Not Started', 'Company'],
  ['SHREEJI GLOBAL VENTURES PTY LTD', '67 689 666 591', 'Priyanjali', 'Melbourne CBD', 'Non Package', null, true, false, 'Not Connected', '', '', ['Not Completed', 'Not Completed', 'Not Completed', 'Not Completed'], 'Not Started', 'Company', true],
  ['KAUR FAMILY DAY CARE PTY LTD', '12 655 908 331', 'Priyanjali', 'Tarneit', 'On Package', 990, true, false, 'Connected', 'kaurfdc@gmail.com', '0401 552 613', ['Completed', 'Completed', 'Completed', 'Completed'], 'Lodged', 'Company'],
  ['WELCOME LOGISTICS PTY LTD', '65 643 556 478', 'Karan Veer', 'Truganina', 'Non Package', null, true, false, 'Not Connected', 'anandharsh89@gmail.com', '0434 184 452', ['In Progress', 'In Progress', 'Not Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['SINGH TRANSPORT SOLUTIONS PTY LTD', '88 671 220 419', 'Karan Veer', 'Truganina', 'On Package', 1650, true, true, 'Connected', 'singhtransport@outlook.com', '0422 660 118', ['Completed', 'Completed', 'Completed', 'In Progress'], 'Not Started', 'Company'],
  ['MELBOURNE TILE STUDIO PTY LTD', '23 640 335 872', 'Karan Veer', 'Officer', 'Non Package', null, true, false, 'Connected', '', '', ['Completed', 'Completed', 'Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['GRANDVIEW BLINDS & INTERIORS PTY LTD', '14 697 318 353', 'Aditya Alok', 'Cranbourne', 'Non Package', null, true, false, 'Connected', '', '', ['Completed', 'Completed', 'Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['PATEL PHARMACY GROUP PTY LTD', '50 618 442 907', 'Aditya Alok', 'Point Cook', 'On Package', 2400, true, true, 'Connected', 'admin@patelpharmacy.com.au', '0398 552 110', ['Completed', 'Completed', 'Completed', 'Completed'], 'In Progress', 'Company'],
  ['URBAN NEST REAL ESTATE PTY LTD', '76 633 902 554', 'Aditya Alok', 'Melbourne CBD', 'On Package', 1950, true, true, 'Connected', '', '0409 118 227', ['Completed', 'In Progress', 'Completed', 'In Progress'], 'Not Started', 'Company'],
  ['INDIAN CHIFFON CLOTHINGZ PTY LTD', '68 685 034 977', 'Nishant', 'Craigieburn', 'Non Package', null, false, false, 'Not Required', '', '', ['Not Required', 'Not Required', 'Not Required', 'Not Required'], 'Not Started', 'Company'],
  ['HORIZON PAINTING GROUP PTY LTD', '34 626 118 750', 'Nishant', 'Pakenham', 'Non Package', null, true, false, 'Connected', '', '0421 774 903', ['Completed', 'Not Completed', 'Not Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['HARI OM ENTERPRISE PTY LTD', '14 606 484 931', 'Shubham', 'Tarneit', 'Non Package', null, true, false, 'Connected', '', '', ['Completed', 'Not Completed', 'Not Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['SAFE HANDS SECURITY SERVICES PTY LTD', '59 611 887 264', 'Shubham', 'Melbourne CBD', 'On Package', 1400, true, true, 'Connected', 'ops@safehandssecurity.com.au', '0430 998 415', ['Completed', 'Completed', 'Completed', 'Completed'], 'Lodged', 'Company'],
  ['FORM & FOLD PILATES PTY LTD', '27 699 280 674', 'Rishabh', 'Melbourne CBD', 'Non Package', null, true, true, 'Connected', '', '', ['Completed', 'Completed', 'In Progress', 'Not Completed'], 'Not Started', 'Company'],
  ['EVERGREEN LANDSCAPING VIC PTY LTD', '45 632 771 089', 'Rishabh', 'Officer', 'On Package', 1100, true, false, 'Connected', 'evergreen.vic@gmail.com', '0417 336 852', ['Completed', 'Completed', 'Completed', 'In Progress'], 'Not Started', 'Company'],
  ['VIRTUE PATH PTY LTD', '31 680 341 164', 'Aditya', 'Point Cook', 'On Package', 1500, true, false, 'Connected', '', '', ['Completed', 'Completed', 'Completed', 'Not Completed'], 'Not Started', 'Company'],
  ['HORIZON TRANSPORT PTY LTD', '11 222 333 444', 'Yatin', 'Pakenham', 'On Package', 1800, true, true, 'Connected', 'ops@horizontransport.com.au', '0411 222 333', ['Completed', 'Completed', 'Completed', 'Completed'], 'Not Started', 'Company'],
  ['RIVER CONSTRUCTIONS PTY LTD', '22 333 444 555', 'Yatin', 'Truganina', 'On Package', 1500, true, true, 'Connected', 'accounts@riverconstructions.com.au', '0422 333 444', ['Completed', 'Completed', 'Completed', 'Completed'], 'Not Started', 'Company'],
  ['GHUMAN TILING PTY LTD', '26 686 703 346', 'Aditya', 'Tarneit', 'On Package', 1500, true, true, 'Connected', '', '', ['Completed', 'In Progress', 'Completed', 'Not Completed'], 'Not Started', 'Company'],
];

const PAY_MIX = {
  'VERMA CONSTRUCTION PTY LTD': ['Paid', 'Paid', 'Paid', 'Paid'],
  'SUNRISE CIVIL GROUP PTY LTD': ['Paid', 'Paid', 'Paid', 'Not Paid'],
  'JD TECH SERVICES PTY LTD': ['Paid', 'Paid', 'Not Paid', 'Not Paid'],
  'AUSSIE FRESH GROCERIES PTY LTD': ['Paid', 'Paid', 'Paid', 'Part Paid'],
  'KAUR FAMILY DAY CARE PTY LTD': ['Paid', 'Paid', 'Paid', 'Paid'],
  'SINGH TRANSPORT SOLUTIONS PTY LTD': ['Paid', 'Part Paid', 'Not Paid', 'Not Paid'],
  'HORIZON TRANSPORT PTY LTD': ['Paid', 'Paid', 'Not Paid', 'Not Paid'],
  'RIVER CONSTRUCTIONS PTY LTD': ['Paid', 'Not Paid', 'Not Paid', 'Not Paid'],
};

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function abn(R) {
  const n = () => Math.floor(R() * 10);
  return `${n()}${n()} ${n()}${n()}${n()} ${n()}${n()}${n()} ${n()}${n()}${n()}`;
}

function basStatuses(R, gst) {
  if (!gst) return ['Not Required', 'Not Required', 'Not Required', 'Not Required'];
  const pick = () => {
    const r = R();
    if (r < 0.41) return 'Completed';
    if (r < 0.55) return 'In Progress';
    return 'Not Completed';
  };
  // earlier quarters more likely completed
  return [
    R() < 0.85 ? 'Completed' : pick(),
    R() < 0.75 ? 'Completed' : pick(),
    R() < 0.55 ? 'Completed' : pick(),
    pick(),
  ];
}

async function ensureStaffUsers() {
  const map = {};
  for (const name of STAFF_NAMES) {
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@nanak.demo`;
    let u = await User.findOne({ $or: [{ name }, { email }] });
    if (!u) {
      u = await User.create({
        name,
        email,
        password: 'Staff123!',
        role: 'staff',
        active: true,
        office: 'Australia',
        permissions: [
          'dashboard',
          'submissions',
          'benchmarks',
          'deduction',
          'quote-pad',
          'sales-commission',
          'client-management',
        ],
      });
    } else {
      const perms = Array.isArray(u.permissions) && u.permissions.length ? [...u.permissions] : null;
      if (perms && !perms.includes('client-management')) {
        perms.push('client-management');
        u.permissions = perms;
        await u.save();
      }
    }
    map[name] = u;
  }
  return map;
}

const SEED_SOFTWARE = ['Xero', 'QuickBooks', 'MYOB', 'Reckon'];

function buildClientDoc(row, staffMap, extras = {}) {
  // row[3] is the legacy office column — retained in the fixtures but no longer persisted.
  const [entity, abnVal, manager, , pkg, fee, gst, payroll, qb, email, phone, bas, itr, type, isNewFlag] = row;
  const structure = type === 'Individual' ? 'Sole Trader' : type || 'Company';
  const mgr = staffMap[manager];
  const payrollMgrName = payroll ? PAYROLL_STAFF[Math.floor(Math.random() * PAYROLL_STAFF.length)] : null;
  const payq = PAY_MIX[entity]
    ? { q1: PAY_MIX[entity][0], q2: PAY_MIX[entity][1], q3: PAY_MIX[entity][2], q4: PAY_MIX[entity][3] }
    : { q1: 'Paid', q2: 'Paid', q3: pkg === 'On Package' ? 'Not Paid' : 'Not Paid', q4: 'Not Paid' };
  const inv = {};
  if (pkg === 'On Package') {
    ['q1', 'q2', 'q3', 'q4'].forEach((k, i) => {
      if (payq[k] !== 'Not Paid') inv[k] = `INV-${22000 + i * 100 + Math.floor(Math.random() * 80)}`;
    });
  }
  const onTime = {};
  const lodged = {};
  ['q1', 'q2', 'q3', 'q4'].forEach((k, i) => {
    if (bas[i] === 'Completed') {
      const ot = Math.random() < 0.89;
      onTime[k] = ot;
      lodged[k] = `${ot ? 'On or before' : 'After'} ${['28 Nov 2025', '28 Feb 2026', '26 May 2026', '28 Aug 2026'][i]}`;
    }
  });
  return {
    entity,
    abn: abnVal,
    type: structure,
    status: 'Active',
    exit: null,
    software: SEED_SOFTWARE[Math.floor(Math.random() * SEED_SOFTWARE.length)],
    pkg,
    fee: pkg === 'On Package' ? fee : null,
    freq: pkg === 'On Package' ? 'Monthly' : null,
    pay: pkg === 'On Package' ? 'Pay Advantage' : null,
    gst: !!gst,
    payroll: !!payroll,
    qb: qb === 'Connected' ? 'Connected' : 'Not Connected',
    email,
    phone,
    managerId: mgr?._id || null,
    managerName: manager,
    payrollMgrId: payrollMgrName ? staffMap[payrollMgrName]?._id : null,
    payrollMgr: payrollMgrName,
    bas: { q1: bas[0], q2: bas[1], q3: bas[2], q4: bas[3] },
    annual: itr,
    payq,
    inv,
    recon: {},
    lodged,
    onTime,
    feeReview: `${1 + Math.floor(Math.random() * 27)} ${['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'][Math.floor(Math.random() * 6)]} ${2023 + Math.floor(Math.random() * 3)}`,
    payrollBilled: payroll ? 1 + Math.floor(Math.random() * 8) : 0,
    payrollActual: payroll ? 2 + Math.floor(Math.random() * 10) : 0,
    payrollFreq: payroll ? (Math.random() < 0.3 ? 'Weekly' : Math.random() < 0.62 ? 'Fortnightly' : 'Monthly') : null,
    payFirstDate: payroll ? '2025-07-01' : null,
    payLag: 3,
    isNewClient: !!isNewFlag,
    notes: extras.notes || [],
    activity: [{ date: '01 Jul 2026', who: 'System', action: 'June 26 quarter opened - BAS status reset for GST-registered clients' }],
    ...extras,
  };
}

async function seedClientManagement({ force = false } = {}) {
  const existing = await PracticeClient.countDocuments();
  if (existing > 0 && !force) {
    return { skipped: true, message: 'Clients already exist', count: existing };
  }
  if (force) {
    await PracticeClient.deleteMany({});
    await PracticeGroup.deleteMany({});
    await PracticePayrollOverride.deleteMany({});
    await PracticePeriod.deleteMany({});
    await ClientPeriodStatus.deleteMany({});
  }

  await PracticeSettings.findOneAndUpdate(
    { singleton: 'default' },
    {
      $set: {
        activeFy: '2025-26',
        workingFy: '2025-26',
        currentQuarter: 'q4',
        offices: OFFICES,
        todayOverride: '23 Jul 2026',
        quarters: STATUTORY_QUARTERS,
        dueDateDefaults: STATUTORY_DUE_DEFAULTS,
      },
    },
    { upsert: true }
  );

  const staffMap = await ensureStaffUsers();
  const verma = await PracticeGroup.create({ name: 'Verma Family Group' });
  const sharma = await PracticeGroup.create({ name: 'Sharma Group' });

  const docs = [];
  for (const row of HAND_WRITTEN) {
    const extras = {};
    if (row[0] === 'VERMA CONSTRUCTION PTY LTD') {
      extras.groupId = verma._id;
      extras.relLabel = 'Trading company';
    }
    if (row[0] === 'JD TECH SERVICES PTY LTD') {
      extras.notes = [
        {
          type: 'info',
          text: 'Prefers contact by email. Director travels overseas Dec-Jan.',
          author: 'Mahima',
          date: '12 Jun 2026',
        },
      ];
    }
    if (row[0] === 'AB CONCRETING & CONSTRUCTIONS PTY LTD') {
      extras.notes = [
        {
          type: 'warning',
          text: 'Slow payer - two invoices settled late last year. Collect payment upfront before lodging.',
          author: 'Puneet',
          date: '3 Feb 2026',
        },
      ];
    }
    if (row[0] === 'WELCOME LOGISTICS PTY LTD') {
      extras.notes = [
        {
          type: 'warning',
          text: 'QuickBooks disconnected since May. Chase bank feeds before starting the June quarter.',
          author: 'Karan Veer',
          date: '30 Jun 2026',
        },
      ];
    }
    if (row[0] === 'HORIZON PAINTING GROUP PTY LTD') {
      extras.notes = [
        {
          type: 'warning',
          text: 'Two quarters behind. Escalated to manager - do not start new work without payment plan.',
          author: 'Puneet',
          date: '15 Jul 2026',
        },
      ];
    }
    if (row[0] === 'HORIZON TRANSPORT PTY LTD' || row[0] === 'RIVER CONSTRUCTIONS PTY LTD') {
      extras.payq = {
        q1: 'Paid',
        q2: row[0].includes('RIVER') ? 'Not Paid' : 'Paid',
        q3: 'Not Paid',
        q4: 'Not Paid',
      };
      extras.inv = {
        q1: 'INV-21001',
        q2: row[0].includes('HORIZON') ? 'INV-23226' : 'INV-28234',
        q3: 'INV-29001',
        q4: 'INV-30001',
      };
      extras.bas = { q1: 'Completed', q2: 'Completed', q3: 'Completed', q4: 'Completed' };
    }
    docs.push(buildClientDoc(row, staffMap, extras));
  }

  // family group individuals
  docs.push(
    buildClientDoc(
      ['RAJINDER VERMA', '', 'Yatin', 'Tarneit', 'Non Package', null, false, false, 'Not Required', 'rajinder.verma@gmail.com', '0413 220 675', ['Not Required', 'Not Required', 'Not Required', 'Not Required'], 'Not Started', 'Individual'],
      staffMap,
      { groupId: verma._id, relLabel: 'Director - Verma Construction' }
    )
  );
  docs.push(
    buildClientDoc(
      ['SUKHPREET VERMA', '', 'Yatin', 'Tarneit', 'Non Package', null, false, false, 'Not Required', '', '0413 902 114', ['Not Required', 'Not Required', 'Not Required', 'Not Required'], 'Not Started', 'Individual'],
      staffMap,
      { groupId: verma._id, relLabel: 'Spouse of Rajinder Verma' }
    )
  );
  docs.push(
    buildClientDoc(
      ['VERMA FAMILY TRUST', '72 640 118 903', 'Yatin', 'Tarneit', 'Non Package', null, false, false, 'Not Required', '', '', ['Not Required', 'Not Required', 'Not Required', 'Not Required'], 'Not Started', 'Trust'],
      staffMap,
      { groupId: verma._id, relLabel: 'Family trust' }
    )
  );
  docs.push(
    buildClientDoc(
      ['ANIL SHARMA', '', 'Mahima', 'Point Cook', 'Non Package', null, false, false, 'Not Required', 'anil.sharma@outlook.com', '0424 118 559', ['Not Required', 'Not Required', 'Not Required', 'Not Required'], 'In Progress', 'Individual'],
      staffMap,
      { groupId: sharma._id, relLabel: 'Director - Sharma Property Investments' }
    )
  );
  docs.push(
    buildClientDoc(
      ['PRIYA SHARMA', '', 'Nishant', 'Point Cook', 'Non Package', null, false, false, 'Not Required', '', '0424 771 902', ['Not Required', 'Not Required', 'Not Required', 'Not Required'], 'Not Started', 'Individual'],
      staffMap,
      { groupId: sharma._id, relLabel: 'Spouse of Anil Sharma' }
    )
  );
  docs.push(
    buildClientDoc(
      ['SHARMA PROPERTY INVESTMENTS PTY LTD', '61 645 990 227', 'Nishant', 'Point Cook', 'On Package', 1350, true, false, 'Connected', '', '', ['Completed', 'Completed', 'In Progress', 'Not Completed'], 'Not Started', 'Company'],
      staffMap,
      { groupId: sharma._id, relLabel: 'Investment company' }
    )
  );
  docs.push(
    buildClientDoc(
      ['SHARMA FAMILY TRUST', '38 622 405 118', 'Mahima', 'Point Cook', 'Non Package', null, false, false, 'Not Required', '', '', ['Not Required', 'Not Required', 'Not Required', 'Not Required'], 'Not Started', 'Trust'],
      staffMap,
      { groupId: sharma._id, relLabel: 'Family trust' }
    )
  );

  // bulk generate to ~500
  const R = mulberry32(42);
  const PREFIX = [
    'APEX', 'SUMMIT', 'PACIFIC', 'GOLDEN', 'UNITY', 'PRIME', 'DELTA', 'NOVA', 'EASTERN', 'WESTERN',
    'METRO', 'COASTAL', 'ALPINE', 'ORBIT', 'VERTEX', 'NEXUS', 'PULSE', 'HARMONY', 'CROWN', 'LEGACY',
  ];
  const SUFFIX = [
    'TRADING', 'SERVICES', 'GROUP', 'HOLDINGS', 'ENTERPRISES', 'SOLUTIONS', 'INDUSTRIES', 'WORKS',
    'LOGISTICS', 'BUILDERS', 'TRANSPORT', 'FOODS', 'CARE', 'PROPERTIES', 'TECH',
  ];
  const target = 500;
  let i = 0;
  while (docs.length < target) {
    i++;
    const manager = STAFF_NAMES[Math.floor(R() * STAFF_NAMES.length)];
    const office = OFFICES[Math.floor(R() * OFFICES.length)];
    const onp = R() < 0.45;
    const gst = R() < 0.82;
    const payroll = onp && R() < 0.35;
    const fee = onp ? 900 + Math.floor(R() * 20) * 50 : null;
    const entity = `${PREFIX[Math.floor(R() * PREFIX.length)]} ${SUFFIX[Math.floor(R() * SUFFIX.length)]} ${1000 + i} PTY LTD`;
    const bas = basStatuses(R, gst);
    docs.push(
      buildClientDoc(
        [
          entity,
          abn(R),
          manager,
          office,
          onp ? 'On Package' : 'Non Package',
          fee,
          gst,
          payroll,
          payroll || R() < 0.5 ? 'Connected' : 'Not Connected',
          R() < 0.6 ? `client${i}@example.com.au` : '',
          R() < 0.5 ? `04${Math.floor(10000000 + R() * 89999999)}` : '',
          bas,
          R() < 0.1 ? 'Lodged' : 'Not Started',
          'Company',
          R() < 0.02,
        ],
        staffMap
      )
    );
  }

  await PracticeClient.insertMany(docs);

  // Sample inactive client for v4 acceptance tests
  const inactiveEntity = docs.find((d) => d.entity === 'SHREEJI GLOBAL VENTURES PTY LTD');
  if (inactiveEntity) {
    await PracticeClient.updateOne(
      { entity: 'SHREEJI GLOBAL VENTURES PTY LTD' },
      {
        $set: {
          status: 'Inactive',
          active: false,
          exit: {
            reason: 'No longer requires our services',
            detail: null,
            date: '15 Jul 2026',
            by: 'System',
            byId: null,
          },
          activity: [
            ...(inactiveEntity.activity || []),
            {
              date: '15 Jul 2026',
              who: 'System',
              action: 'Client marked inactive — No longer requires our services',
            },
          ],
        },
      }
    );
  }

  // Seed a few completed pay-run overrides (pay date before todayOverride 23 Jul 2026)
  const payrollClients = await PracticeClient.find({
    status: 'Active',
    payroll: true,
    payFirstDate: { $ne: null },
  })
    .limit(3)
    .lean();
  for (const pc of payrollClients) {
    await PracticePayrollOverride.findOneAndUpdate(
      { clientId: pc._id, payDate: '2026-07-08' },
      {
        $set: {
          status: 'Completed',
          stp: 'Lodged',
          employees: pc.payrollActual || pc.payrollBilled || 1,
          by: pc.payrollMgr || 'System',
          on: '08 Jul 2026',
        },
        $unset: { super: 1 },
      },
      { upsert: true }
    );
  }

  const settings = await PracticeSettings.findOne({ singleton: 'default' });
  if (settings) await ensurePeriodMigration(settings);

  return { seeded: true, count: docs.length, groups: 2, staff: STAFF_NAMES.length };
}

async function clearClientManagement() {
  const [clients, groups, overrides, periods, statuses] = await Promise.all([
    PracticeClient.deleteMany({}),
    PracticeGroup.deleteMany({}),
    PracticePayrollOverride.deleteMany({}),
    PracticePeriod.deleteMany({}),
    ClientPeriodStatus.deleteMany({}),
  ]);
  // Reset FY settings to defaults (keep singleton doc)
  await PracticeSettings.findOneAndUpdate(
    { singleton: 'default' },
    {
      $set: {
        activeFy: '2025-26',
        workingFy: '2025-26',
        currentQuarter: 'q4',
        todayOverride: null,
        offices: OFFICES,
        quarters: STATUTORY_QUARTERS,
        dueDateDefaults: STATUTORY_DUE_DEFAULTS,
        cmPeriodsReady: false,
      },
    },
    { upsert: true }
  );
  return {
    cleared: true,
    clientsDeleted: clients.deletedCount || 0,
    groupsDeleted: groups.deletedCount || 0,
    payrollOverridesDeleted: overrides.deletedCount || 0,
    periodsDeleted: periods.deletedCount || 0,
    statusesDeleted: statuses.deletedCount || 0,
  };
}

module.exports = { seedClientManagement, clearClientManagement };
