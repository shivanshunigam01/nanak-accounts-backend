const mongoose = require('mongoose');

const EXIT_REASONS = [
  'Fees too expensive',
  'Moved to another accountant',
  'Business closed or deregistered',
  'Service or communication issue',
  'Client relocated overseas',
  'No longer requires our services',
  'Deceased',
  'Other',
];

const STRUCTURE_TYPES = ['Sole Trader', 'Company', 'Trust', 'SMSF', 'Partnership'];
const SOFTWARE_OPTIONS = ['Xero', 'QuickBooks', 'MYOB', 'Reckon', ''];

const noteSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['info', 'warning'], default: 'info' },
    text: { type: String, required: true },
    author: { type: String, default: 'System' },
    date: { type: String, default: '' },
  },
  { _id: false }
);

const activitySchema = new mongoose.Schema(
  {
    date: { type: String, default: '' },
    who: { type: String, default: 'System' },
    action: { type: String, required: true },
  },
  { _id: false }
);

const exitSchema = new mongoose.Schema(
  {
    reason: { type: String, enum: EXIT_REASONS, required: true },
    detail: { type: String, default: null },
    date: { type: String, default: '' },
    by: { type: String, default: '' },
    byId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const quarterMap = {
  q1: { type: String, default: 'Not Required' },
  q2: { type: String, default: 'Not Required' },
  q3: { type: String, default: 'Not Required' },
  q4: { type: String, default: 'Not Required' },
};

const practiceClientSchema = new mongoose.Schema(
  {
    entity: { type: String, required: true, index: true },
    abn: { type: String, default: '', index: true },
    type: {
      type: String,
      enum: STRUCTURE_TYPES,
      default: 'Company',
      index: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
      index: true,
    },
    exit: { type: exitSchema, default: null },
    software: {
      type: String,
      enum: SOFTWARE_OPTIONS,
      default: '',
    },
    pkg: { type: String, enum: ['On Package', 'Non Package'], default: 'Non Package' },
    fee: { type: Number, default: null },
    freq: { type: String, enum: ['Monthly', 'Quarterly', 'Annually', null], default: null },
    pay: { type: String, default: null },
    gst: { type: Boolean, default: false },
    payroll: { type: Boolean, default: false },
    qb: {
      type: String,
      enum: ['Connected', 'Not Connected'],
      default: 'Not Connected',
    },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    /** Director wages / fee tracked separately from package fee (owners & managers). */
    directorWages: {
      type: new mongoose.Schema(
        {
          amount: { type: Number, default: null },
          freq: {
            type: String,
            enum: ['Weekly', 'Fortnightly', 'Monthly', null],
            default: null,
          },
          status: {
            type: String,
            enum: ['Active', 'Inactive'],
            default: 'Inactive',
          },
        },
        { _id: false }
      ),
      default: () => ({ amount: null, freq: null, status: 'Inactive' }),
    },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    managerName: { type: String, default: '', index: true },
    payrollMgrId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    payrollMgr: { type: String, default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'PracticeGroup', default: null, index: true },
    relLabel: { type: String, default: null },
    bas: { type: new mongoose.Schema(quarterMap, { _id: false }), default: () => ({}) },
    annual: {
      type: String,
      enum: ['Not Started', 'In Progress', 'Lodged', 'Not Required'],
      default: 'Not Started',
    },
    payq: {
      type: new mongoose.Schema(
        {
          q1: { type: String, default: 'Not Paid' },
          q2: { type: String, default: 'Not Paid' },
          q3: { type: String, default: 'Not Paid' },
          q4: { type: String, default: 'Not Paid' },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    inv: { type: mongoose.Schema.Types.Mixed, default: {} },
    recon: { type: mongoose.Schema.Types.Mixed, default: {} },
    lodged: { type: mongoose.Schema.Types.Mixed, default: {} },
    onTime: { type: mongoose.Schema.Types.Mixed, default: {} },
    feeReview: { type: String, default: null },
    payrollBilled: { type: Number, default: 0 },
    payrollActual: { type: Number, default: 0 },
    payrollFreq: { type: String, enum: ['Weekly', 'Fortnightly', 'Monthly', null], default: null },
    payFirstDate: { type: String, default: null },
    payAnchor: { type: Number, default: 1 },
    payLag: { type: Number, default: 3 },
    notes: { type: [noteSchema], default: [] },
    isNewClient: { type: Boolean, default: false },
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    activity: { type: [activitySchema], default: [] },
    // Legacy soft-delete flag — prefer `status`. Kept for migration/back-compat.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

practiceClientSchema.index({ entity: 'text', abn: 'text', email: 'text' });

module.exports = mongoose.model('PracticeClient', practiceClientSchema);
module.exports.EXIT_REASONS = EXIT_REASONS;
module.exports.STRUCTURE_TYPES = STRUCTURE_TYPES;
module.exports.SOFTWARE_OPTIONS = SOFTWARE_OPTIONS;
