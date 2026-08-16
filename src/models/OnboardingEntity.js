const mongoose = require('mongoose');
const PracticeClient = require('./PracticeClient');

const contactSchema = new mongoose.Schema(
  {
    person: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  { _id: false }
);

const notesSchema = new mongoose.Schema(
  {
    background: { type: String, default: '' },
    atoPosition: { type: String, default: '' },
  },
  { _id: false }
);

const triSchema = new mongoose.Schema(
  {
    asic: { type: Boolean, default: false },
    abr: { type: Boolean, default: false },
    ato: { type: Boolean, default: false },
  },
  { _id: false }
);

const logSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const onboardingEntitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    track: { type: String, enum: ['new', 'renewal'], default: 'new', index: true },
    pkg: {
      type: String,
      enum: PracticeClient.STRUCTURE_TYPES,
      default: 'Company',
    },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    managerName: { type: String, default: '', index: true },
    practiceClientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PracticeClient',
      default: null,
      index: true,
    },
    status: { type: String, enum: ['active', 'complete'], default: 'active', index: true },
    done: { type: [String], default: [] },
    tri: { type: triSchema, default: () => ({ asic: false, abr: false, ato: false }) },
    gateStart: { type: Map, of: Date, default: () => new Map() },
    contact: { type: contactSchema, default: () => ({}) },
    notes: { type: notesSchema, default: () => ({ background: '', atoPosition: '' }) },
    handoverPack: { type: String, default: '' },
    log: { type: [logSchema], default: [] },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'onboarding_entities' }
);

onboardingEntitySchema.index({ status: 1, managerId: 1 });
onboardingEntitySchema.index({ name: 'text' });

module.exports = mongoose.model('OnboardingEntity', onboardingEntitySchema);
