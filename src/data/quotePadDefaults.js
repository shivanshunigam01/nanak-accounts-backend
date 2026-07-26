// Default pricing configuration for the Quote Pad module (v3).
// Ported from nanak-quote-pad-v3.html — editable from Admin → Nanak Quotations → Prices.

const B_BANDS = [
  ['0–100k', 1250], ['100–150k', 1450], ['150–200k', 1650], ['200–250k', 1850],
  ['250–300k', 2050], ['300–350k', 2250], ['350–400k', 2450], ['400–500k', 2650],
  ['500–600k', 2850], ['600–700k', 3050], ['700–800k', 3250], ['800–900k', 3450],
  ['900k–1.0m', 3650], ['1.0–1.25m', 4050], ['1.25–1.5m', 4450], ['1.5–1.75m', 4850],
  ['1.75–2.0m', 5250], ['2.0–2.25m', 5650], ['2.25–2.5m', 6050], ['2.5–2.75m', 6450],
  ['2.75–3.0m', 6850], ['3.0–3.5m', 7250], ['3.5–4.0m', 7650], ['4.0–4.5m', 8050],
  ['4.5–5.0m', 8450],
];

const B_BAND_ENTITIES = ['Company', 'Trust', 'Family Trust', 'Partnership'];

function bRound50(x) {
  return Math.round(x / 50) * 50;
}

function defaultFirm() {
  return {
    name: 'Nanak Accountants & Associates',
    abn: '47 648 226 804',
    phone: '1300 626 258',
    email: 'info@nanakaccountants.com.au',
    validDays: 14,
    gst: 0.1,
    maxDiscountPct: 50,
  };
}

function defaultHouseholdConfig() {
  return {
    individualBase: 120,
    rentalSingle: 75,
    rentalCouple: 50,
    shareBrokerReportBase: 50,
    shareBrokerIncludedDisposals: 10,
    shareBrokerExtraDisposal: 5,
    shareAdditionalBroker: 25,
    shareManualPerDisposal: 10,
    shareManualMinimum: 50,
    shareAutomaticLimit: 20,
    shareComplexStartingPrice: 250,
    cfdStandard: 100,
    cfdAdditionalBroker: 50,
    cfdComplexStartingPrice: 250,
    cryptoSummary: 75,
    cryptoReview: 150,
    cryptoComplexStartingPrice: 300,
    koinlyTiers: [
      ['Up to 100 transactions (Newbie)', 79],
      ['Up to 1,000 transactions (Hodler)', 159],
      ['Up to 3,000 transactions (Trader)', 319],
      ['Up to 10,000 transactions (Trader)', 319],
      ['More than 10,000 — custom quote', 0],
    ],
    soleTraderBands: [
      ['$0 – $75k', 160],
      ['$75k – $150k', 250],
      ['$150k – $250k', 350],
      ['$250k – $400k', 500],
      ['More than $400k', 0],
    ],
    cgtProperty: 199,
    foreign: 100,
    basPerLodgement: 100,
    basMinorReconciliation: 50,
    basNilLodgement: 35,
    strategicPlanning: 150,
  };
}

function defaultSetups() {
  return [
    {
      id: 'company_reg',
      code: 'COMPANYSETUP',
      cat: 'Structure',
      name: 'Pty Ltd company + ABN/TFN/GST/PAYG',
      price: 1245,
      gov: true,
      note: 'ASIC company registration, standard company documents, ABN, TFN, GST and PAYG. ASIC registration fee included.',
      includes: [
        'ASIC company registration & ACN',
        'Company constitution',
        'Certificate of registration',
        'Share certificate(s)',
        'Member & officeholder registers',
        'ABN, TFN, GST & PAYG registration',
        'ASIC corporate key & first-meeting minutes',
      ],
    },
    {
      id: 'family_trust',
      code: 'FAMILYTRUSTSET',
      cat: 'Structure',
      name: 'Family trust — corporate trustee',
      price: 1595,
      gov: false,
      sro: true,
      note: 'Trust deed, corporate trustee, ABN/TFN. SRO stamp duty is paid by the client at the rate for their state.',
      includes: [
        'Discretionary (family) trust deed',
        'Appointor, trustee & settlor documentation',
        'Establishment minutes & resolutions',
        'ABN & TFN registration',
        'Stamping guidance (SRO duty paid by client)',
      ],
    },
    {
      id: 'unit_trust',
      code: 'UNITTRUSTESTVI',
      cat: 'Structure',
      name: 'Unit trust — corporate trustee',
      price: 1595,
      gov: false,
      sro: true,
      note: 'Trust deed, unit register, corporate trustee, ABN/TFN. SRO stamp duty is paid by the client at the rate for their state.',
      includes: [
        'Unit trust deed',
        'Unit register & unit certificates',
        'Establishment minutes & resolutions',
        'ABN & TFN registration',
        'Stamping guidance (SRO duty paid by client)',
      ],
    },
    {
      id: 'partnership_setup',
      code: 'PARTNERSHIPSETUPS',
      cat: 'Structure',
      name: 'Partnership setup',
      price: 299,
      gov: false,
      note: 'Partnership registration, ABN/TFN. Government fees excluded.',
      includes: [
        'Partnership agreement referral',
        'ABN & TFN registration',
        'GST registration (if required)',
        'Partnership establishment guidance',
      ],
    },
    {
      id: 'acnc_corp',
      code: 'ACNCCHARITABLETRUSTW1',
      cat: 'Structure',
      name: 'ACNC charitable trust with corporate trustee (Pty Ltd)',
      price: 1800,
      gov: false,
      note: 'Charitable trust with corporate trustee. Government fees excluded.',
      includes: [
        'Charitable trust deed',
        'Corporate trustee (Pty Ltd) with ASIC registration',
        'ACNC charity registration application',
        'ABN & TFN registration',
        'Governing-document & DGR guidance',
      ],
    },
    {
      id: 'acnc_incorp',
      code: 'ACNCCHARITABLETRUSTW2',
      cat: 'Structure',
      name: 'ACNC charitable trust with incorporation',
      price: 1350,
      gov: false,
      note: 'Charitable trust with incorporated association. Government fees excluded.',
      includes: [
        'Charitable trust with incorporated association',
        'ACNC charity registration application',
        'Governing rules / constitution',
        'ABN & TFN registration',
        'DGR guidance',
      ],
    },
    {
      id: 'smsf_corp',
      code: 'SMSFTRUSTWITHCORPORA',
      cat: 'SMSF',
      name: 'SMSF setup — corporate trustee',
      price: 2000,
      gov: true,
      note: 'Full SMSF establishment with special-purpose corporate trustee — ASIC, legal deed, first-year software and setup accounting.',
      components: [
        ['ASIC fee — special-purpose corporate trustee', 636],
        ['Legal fees — SMSF deed', 400],
        ['Class Super software — first-year fee', 250],
        ['Setup accounting — audit file, rollover, ABN/TFN, bank-account file prep', 714],
      ],
      includes: [
        'Special-purpose corporate trustee (ASIC)',
        'SMSF trust deed',
        'Trustee consents & member applications',
        'ABN & TFN registration',
        'Electronic service address (ESA)',
        'Rollover & bank-account setup file',
      ],
    },
    {
      id: 'bare_trust',
      code: 'BARETRUSTWITHCORPORA',
      cat: 'SMSF',
      name: 'Bare trust / LRBA — corporate trustee',
      price: 1645,
      gov: true,
      note: 'Bare trust for limited recourse borrowing, corporate trustee. Includes government charges.',
      includes: [
        'Bare trust deed (LRBA)',
        'Corporate trustee for the bare trust',
        'Holding-trust documentation',
        'Lender-ready limited recourse borrowing pack',
      ],
    },
    {
      id: 'abn_reg',
      code: 'REGISTRATION1',
      cat: 'Registration',
      name: 'ABN application support',
      price: 105,
      gov: true,
      note: 'Australian Business Number application and support.',
    },
    {
      id: 'gst_reg',
      code: 'REGISTRATION2',
      cat: 'Registration',
      name: 'GST registration',
      price: 49,
      gov: true,
      note: 'GST registration with the ATO.',
    },
    {
      id: 'gst_dereg',
      code: 'REGISTRATION3',
      cat: 'Registration',
      name: 'Deregistration of GST',
      price: 49,
      gov: true,
      note: 'Cancellation of GST registration.',
    },
    {
      id: 'tfn_reg',
      code: 'REGISTRATION4',
      cat: 'Registration',
      name: 'TFN registration',
      price: 99,
      gov: true,
      note: 'Tax File Number application.',
    },
    {
      id: 'bn_reg_1yr',
      code: 'REGISTRATION5',
      cat: 'Registration',
      name: 'Business name — 1 year',
      price: 115,
      gov: true,
      note: 'ASIC business name registration for 1 year. ASIC fee included.',
    },
    {
      id: 'bn_reg_3yr',
      code: 'REGISTRATION5B',
      cat: 'Registration',
      name: 'Business name — 3 years',
      price: 215,
      gov: true,
      note: 'ASIC business name registration for 3 years. ASIC fee included.',
    },
    {
      id: 'bn_transfer',
      code: 'REGISTRATION6',
      cat: 'Registration',
      name: 'Business name transfer',
      price: 250,
      gov: false,
      note: 'ASIC fees excluded — payable by client.',
    },
    {
      id: 'asic_address',
      code: 'ADDRESSUPDATES',
      cat: 'ASIC',
      name: 'Address updates',
      price: 0,
      gov: true,
      note: 'No charge.',
    },
    {
      id: 'asic_shareholder',
      code: 'COMPANYSHAREHOLDERCH',
      cat: 'ASIC',
      name: 'Company shareholder changes',
      price: 200,
      gov: false,
      note: 'ASIC lodgement fees excluded.',
    },
    {
      id: 'asic_director',
      code: 'COMPANYDIRECTORSHIPC',
      cat: 'ASIC',
      name: 'Company directorship changes',
      price: 200,
      gov: false,
      note: 'ASIC lodgement fees excluded.',
    },
    {
      id: 'asic_unitholder',
      code: 'UNITHOLDERCHANGES',
      cat: 'ASIC',
      name: 'Unit holder changes',
      price: 200,
      gov: false,
      note: 'Unit register update and documentation.',
    },
    {
      id: 'asic_closure',
      code: 'COMPANYCLOSURE',
      cat: 'ASIC',
      name: 'Company closure / deregistration',
      price: 250,
      gov: false,
      note: 'ASIC deregistration fee excluded.',
    },
    {
      id: 'asic_namechange',
      code: 'COMPANYNAMECHANGE',
      cat: 'ASIC',
      name: 'Company name change',
      price: 250,
      gov: false,
      note: 'ASIC fee excluded.',
    },
    {
      id: 'payroll_setup',
      code: 'ONETIMEPAYROLLSETUP',
      cat: 'Payroll',
      name: 'One-time payroll set up',
      price: 250,
      gov: false,
      note: 'Payroll software setup, STP registration and configuration.',
    },
  ];
}

function defaultBusinessConfig() {
  const factors = { Company: 1.0, Trust: 1.0, 'Family Trust': 1.0, Partnership: 0.72 };
  const existingRates = {};
  const newRates = {};
  B_BAND_ENTITIES.forEach((e) => {
    existingRates[e] = B_BANDS.map((b) => (e === 'Company' ? b[1] : bRound50(b[1] * factors[e])));
    newRates[e] = existingRates[e].slice();
  });

  return {
    bandLabels: B_BANDS.map((b) => b[0]),
    existingRates,
    newRates,
    smsf: {
      existing: [
        ['Basic Fund', 1300],
        ['Complex', 1600],
        ['Very Complex', 2000],
      ],
      neu: [
        ['Basic Fund', 1300],
        ['Complex', 1600],
        ['Very Complex', 2000],
      ],
    },
    nfp: {
      existing: [
        ['Small (< $250k)', 1200],
        ['Medium ($250k–$1m)', 2400],
        ['Large (> $1m)', 3900],
      ],
      neu: [
        ['Small (< $250k)', 1020],
        ['Medium ($250k–$1m)', 2040],
        ['Large (> $1m)', 3315],
      ],
    },
    planning: {
      Company: { name: 'Annual Business Tax Planning', price: 300 },
      Trust: { name: 'Annual Trust Distribution & Tax Planning', price: 300 },
      'Family Trust': { name: 'Annual Family Trust Distribution & Tax Planning', price: 300 },
      Partnership: { name: 'Annual Partnership Tax Planning', price: 300 },
      SMSF: { name: 'Annual SMSF Strategy Review', price: 300 },
      NFP: { name: 'Annual Governance & Compliance Review', price: 300 },
    },
    advisoryUpgrade: 1000,
    payroll: {
      supportFlat: 330,
      perHeadMonth: 10,
      softwarePerHeadMonth: 4,
    },
    monthlyBasUplift: 600,
    propertyIncluded: 1,
    propertyExtra: 250,
    shareLargeFrom: 250,
    smsfNewLoading: 0,
    bundleAccountingPct: 50,
    newClientDiscount: 30,
    basQuarterCredit: 150,
    setups: defaultSetups(),
    addons: [
      { id: 'fbt', name: 'FBT return', price: 880, oneOff: false },
      { id: 'tpar', name: 'TPAR lodgement', price: 330, oneOff: false },
      { id: 'div7a', name: 'Division 7A work', price: 440, oneOff: false },
      { id: 'payroll_tax', name: 'Payroll tax', price: 660, oneOff: false },
      { id: 'workcover', name: 'WorkCover declaration', price: 220, oneOff: false },
      { id: 'cgt', name: 'Capital gains calculation', price: 330, oneOff: false },
      { id: 'hist_bas', name: 'Historical BAS / return', price: 180, oneOff: true },
      { id: 'ato_assist', name: 'ATO audit / payment-plan assistance', price: 1500, oneOff: true },
    ],
    addonsSMSF: [
      { id: 'smsf_actuarial', name: 'Actuarial certificate', price: 150, oneOff: false },
      { id: 'smsf_pension', name: 'Pension commencement documentation', price: 250, oneOff: true },
      { id: 'smsf_member', name: 'Additional fund member', price: 220, oneOff: false },
      { id: 'smsf_lrba', name: 'LRBA / borrowing administration', price: 440, oneOff: false },
      { id: 'smsf_contrib', name: 'Contribution caps & TSB review', price: 180, oneOff: false },
      { id: 'smsf_inhouse', name: 'In-house asset / compliance review', price: 300, oneOff: false },
      { id: 'smsf_software', name: 'Fund software migration / setup', price: 300, oneOff: true },
      { id: 'smsf_classsuper', name: 'Class Super software (annual, per fund)', price: 250, oneOff: false },
      { id: 'smsf_windup', name: 'SMSF wind-up / rollover', price: 900, oneOff: true },
    ],
    addonsNFP: [
      { id: 'nfp_ais', name: 'ACNC Annual Information Statement', price: 330, oneOff: false },
      { id: 'nfp_spfr', name: 'Special purpose financial report', price: 550, oneOff: false },
      { id: 'nfp_audit', name: 'Auditor liaison / audit facilitation', price: 300, oneOff: false },
      { id: 'nfp_grant', name: 'Grant acquittal report', price: 250, oneOff: false },
      { id: 'nfp_dgrrev', name: 'DGR status review', price: 300, oneOff: false },
      { id: 'nfp_fbt', name: 'FBT return (rebatable/exempt review)', price: 660, oneOff: false },
      { id: 'nfp_payroll', name: 'Payroll / STP compliance support', price: 330, oneOff: false },
      { id: 'nfp_giftfund', name: 'Public / gift fund review', price: 300, oneOff: false },
    ],
  };
}

function defaultQuotePadConfig() {
  return {
    firm: defaultFirm(),
    household: defaultHouseholdConfig(),
    business: defaultBusinessConfig(),
  };
}

/** Merge saved business config with v3 defaults (setups/addons by id, payroll fields). */
function mergeBusinessConfig(saved) {
  const c = defaultBusinessConfig();
  if (!saved || typeof saved !== 'object') return c;

  const out = { ...c, ...saved };

  // Prefer saved rate tables when present
  if (saved.existingRates) out.existingRates = saved.existingRates;
  if (saved.newRates) out.newRates = saved.newRates;
  if (saved.bandLabels) out.bandLabels = saved.bandLabels;
  if (saved.smsf) out.smsf = saved.smsf;
  if (saved.nfp) out.nfp = saved.nfp;
  if (saved.planning) out.planning = { ...c.planning, ...saved.planning };

  out.payroll = {
    supportFlat: saved.payroll?.supportFlat != null ? saved.payroll.supportFlat : c.payroll.supportFlat,
    perHeadMonth: saved.payroll?.perHeadMonth != null ? saved.payroll.perHeadMonth : c.payroll.perHeadMonth,
    softwarePerHeadMonth:
      saved.payroll?.softwarePerHeadMonth != null
        ? saved.payroll.softwarePerHeadMonth
        : c.payroll.softwarePerHeadMonth,
  };

  [
    'propertyIncluded',
    'propertyExtra',
    'shareLargeFrom',
    'monthlyBasUplift',
    'advisoryUpgrade',
    'smsfNewLoading',
    'bundleAccountingPct',
    'newClientDiscount',
    'basQuarterCredit',
  ].forEach((k) => {
    if (saved[k] == null) out[k] = c[k];
  });

  // Setups: filter deprecated, keep saved prices, append missing defaults by id
  let setups = Array.isArray(saved.setups) ? saved.setups.filter((x) => x && x.id !== 'asic_annual') : [];
  const byId = new Map(setups.map((s) => [s.id, s]));
  c.setups.forEach((def) => {
    if (!byId.has(def.id)) setups.push(def);
  });
  out.setups = setups.length ? setups : c.setups;

  function mergeAddons(defList, savedList) {
    if (!Array.isArray(savedList)) return defList.slice();
    const merged = savedList.slice();
    defList.forEach((a) => {
      if (!merged.some((x) => x.id === a.id)) merged.push(a);
    });
    return merged;
  }
  out.addons = mergeAddons(c.addons, saved.addons);
  out.addonsSMSF = mergeAddons(c.addonsSMSF, saved.addonsSMSF);
  out.addonsNFP = mergeAddons(c.addonsNFP, saved.addonsNFP);

  return out;
}

function mergeHouseholdConfig(saved) {
  const c = defaultHouseholdConfig();
  if (!saved || typeof saved !== 'object') return c;
  const out = { ...c };
  Object.keys(c).forEach((k) => {
    if (k === 'soleTraderBands') {
      if (Array.isArray(saved.soleTraderBands) && saved.soleTraderBands.length === 5) {
        out.soleTraderBands = saved.soleTraderBands;
      }
    } else if (k === 'koinlyTiers') {
      if (Array.isArray(saved.koinlyTiers) && saved.koinlyTiers.length === 5) {
        out.koinlyTiers = saved.koinlyTiers;
      }
    } else if (saved[k] !== undefined && typeof saved[k] === typeof c[k]) {
      out[k] = saved[k];
    }
  });
  if (saved.basNilLodgement != null) out.basNilLodgement = saved.basNilLodgement;
  return out;
}

module.exports = {
  defaultQuotePadConfig,
  defaultFirm,
  defaultHouseholdConfig,
  defaultBusinessConfig,
  mergeBusinessConfig,
  mergeHouseholdConfig,
};
