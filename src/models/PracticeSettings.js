const mongoose = require('mongoose');

const quarterSchema = new mongoose.Schema(
  {
    k: { type: String, required: true },
    l: { type: String, required: true },
    due: { type: String, required: true },
  },
  { _id: false }
);

/** Day/month templates for statutory due dates (Australian tax-agent program). Year is derived from FY. */
const dueDayMonthSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true, min: 1, max: 31 },
    month: { type: Number, required: true, min: 1, max: 12 },
  },
  { _id: false }
);

const DEFAULT_DUE_DATE_DEFAULTS = {
  q1: { day: 28, month: 11 },
  q2: { day: 28, month: 2 },
  q3: { day: 26, month: 5 },
  q4: { day: 28, month: 8 },
  annual: { day: 15, month: 5 },
};

const practiceSettingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'default', unique: true },
    activeFy: { type: String, default: '2025-26' },
    workingFy: { type: String, default: '2025-26', index: true },
    currentQuarter: { type: String, enum: ['q1', 'q2', 'q3', 'q4'], default: 'q4' },
    quarters: {
      type: [quarterSchema],
      default: () => [
        { k: 'q1', l: 'Sep 25', due: '28 Nov 2025' },
        { k: 'q2', l: 'Dec 25', due: '28 Feb 2026' },
        { k: 'q3', l: 'Mar 26', due: '26 May 2026' },
        { k: 'q4', l: 'Jun 26', due: '28 Aug 2026' },
      ],
    },
    /** Firm-editable statutory due day/month. Applied when opening periods for a FY. */
    dueDateDefaults: {
      type: new mongoose.Schema(
        {
          q1: { type: dueDayMonthSchema, default: () => ({ ...DEFAULT_DUE_DATE_DEFAULTS.q1 }) },
          q2: { type: dueDayMonthSchema, default: () => ({ ...DEFAULT_DUE_DATE_DEFAULTS.q2 }) },
          q3: { type: dueDayMonthSchema, default: () => ({ ...DEFAULT_DUE_DATE_DEFAULTS.q3 }) },
          q4: { type: dueDayMonthSchema, default: () => ({ ...DEFAULT_DUE_DATE_DEFAULTS.q4 }) },
          annual: { type: dueDayMonthSchema, default: () => ({ ...DEFAULT_DUE_DATE_DEFAULTS.annual }) },
        },
        { _id: false }
      ),
      default: () => ({ ...DEFAULT_DUE_DATE_DEFAULTS }),
    },
    // Legacy — no longer used in CM v4 UI (office removed). Kept so old docs still load.
    offices: { type: [String], default: () => [] },
    reminderTemplate: {
      type: String,
      default:
        'Hi {name}, a friendly reminder from Nanak Accountants: your BAS for the {quarter} quarter is now due. Please send through your documents so we can lodge on time. Reply here or call your client manager.',
    },
    remindersEnabled: { type: Boolean, default: true },
    onTimeThreshold: { type: Number, default: 85 },
    payrollRate: { type: Number, default: 25 },
    feeReviewMonths: { type: Number, default: 24 },
    todayOverride: { type: String, default: null },
    /** Set after go-live period backfill so request paths skip full ensure. */
    cmPeriodsReady: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PracticeSettings', practiceSettingsSchema);
module.exports.DEFAULT_DUE_DATE_DEFAULTS = DEFAULT_DUE_DATE_DEFAULTS;
