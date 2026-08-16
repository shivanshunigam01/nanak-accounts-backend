/** Gate board definitions — mirrored on frontend for display labels. */

const NEW_GATES = [
  {
    id: 'g1',
    num: 1,
    name: 'Engagement locked',
    owner: 'Sales',
    sla: 1,
    items: [
      { id: 'g1a', label: 'Ignition proposal accepted — package confirmed' },
      { id: 'g1b', label: 'Payment method captured' },
      {
        id: 'g1d',
        label: 'Shell CRM record created by admin — name, ABN, package, allocated CM',
      },
    ],
  },
  {
    id: 'g2',
    num: 2,
    name: 'Compliance',
    owner: 'Admin — Shweta',
    sla: 2,
    items: [
      { id: 'g2a', label: 'Directors + beneficial owners (25%+) ID-verified, docs on file' },
      { id: 'g2b', label: 'Sanctions / PEP screening completed' },
      { id: 'g2c', label: 'Risk rating recorded in AML/CTF register' },
      { id: 'g2d', label: 'Ethical clearance letter sent to previous accountant' },
    ],
  },
  {
    id: 'g3',
    num: 3,
    name: 'Linking & data integrity',
    owner: 'Admin',
    sla: 3,
    items: [
      { id: 'g3a', label: 'Client completed agent nomination in Online Services for Business' },
      { id: 'g3b', label: 'Client added in OSfA — income tax, activity statements, super roles' },
      { id: 'g3c', label: 'ASIC agent appointment lodged (Form 362)' },
      { id: 'g3d', label: 'Three-way address check', triCheck: true },
      { id: 'g3e', label: 'Contact details, ANZSIC, GST / PAYG registrations verified' },
      { id: 'g3f', label: 'ATO account pulled — lodgements, debts, payment plans saved to file' },
    ],
  },
  {
    id: 'g4',
    num: 4,
    name: 'Systems & knowledge',
    owner: 'Admin + Accountant',
    sla: 4,
    notesHere: true,
    items: [
      { id: 'g4a', label: 'Xero adviser access granted / subscription transferred' },
      { id: 'g4b', label: 'LodgeiT profile created and linked' },
      { id: 'g4c', label: 'CRM record enriched — directors added as relationships, all fields verified' },
      { id: 'g4d', label: 'TFN / ABN / ACN captured and verified' },
      { id: 'g4e', label: 'Document vault: deed or constitution, 2 yrs returns, schedules, Div 7A' },
      {
        id: 'g4f',
        label: 'Background note written below — industry, revenue, GST cycle, why they left',
        noteField: 'background',
      },
    ],
  },
  {
    id: 'g5',
    num: 5,
    name: 'CRM notes & handover',
    owner: 'Admin',
    sla: 1,
    handoverGate: true,
    items: [
      { id: 'g5a', label: 'Handover pack saved into CRM client notes' },
      { id: 'g5b', label: 'Welcome email sent by admin — CM introduced, first deliverable date confirmed' },
      { id: 'g5c', label: 'CM notified — client is now live under their name' },
    ],
  },
];

const RENEWAL_GATES = [
  {
    id: 'r1',
    num: 1,
    name: 'Renewal locked',
    owner: 'Sales',
    sla: 1,
    items: [
      { id: 'r1a', label: 'Ignition renewal accepted — package / scope confirmed' },
      { id: 'r1b', label: 'Payment method still valid' },
    ],
  },
  {
    id: 'r2',
    num: 2,
    name: 'Annual re-verification',
    owner: 'Admin — Shweta',
    sla: 2,
    notesHere: true,
    items: [
      { id: 'r2a', label: 'Director / beneficial owner changes checked against current ASIC extract' },
      { id: 'r2b', label: 'Sanctions / PEP re-screen — risk rating reviewed in AML register' },
      { id: 'r2c', label: 'Three-way address re-check', triCheck: true },
      { id: 'r2d', label: 'GST / PAYG registrations and contact details still correct' },
      { id: 'r2e', label: 'ATO position refreshed — note updated below', noteField: 'atoPosition' },
      { id: 'r2f', label: 'Xero + LodgeiT access confirmed working' },
    ],
  },
  {
    id: 'r3',
    num: 3,
    name: 'CRM notes & continuity',
    owner: 'Admin',
    sla: 1,
    handoverGate: true,
    items: [
      { id: 'r3a', label: 'Re-verification pack saved into CRM client notes' },
      { id: 'r3b', label: 'Renewal confirmation email sent by admin — scope and year plan confirmed' },
      { id: 'r3c', label: 'First deliverable date logged — CM notified' },
    ],
  },
];

const PACKAGES = ['Company', 'Trust', 'SMSF', 'Partnership', 'Sole Trader'];
const DAY_MS = 86400000;

function gatesFor(entity) {
  return entity.track === 'renewal' ? RENEWAL_GATES : NEW_GATES;
}

function totalSlaFor(entity) {
  return gatesFor(entity).reduce((s, g) => s + g.sla, 0);
}

function findGate(entity, gateId) {
  return gatesFor(entity).find((g) => g.id === gateId);
}

function findItem(entity, itemId) {
  for (const g of gatesFor(entity)) {
    const it = g.items.find((i) => i.id === itemId);
    if (it) return { gate: g, item: it };
  }
  return null;
}

module.exports = {
  NEW_GATES,
  RENEWAL_GATES,
  PACKAGES,
  DAY_MS,
  gatesFor,
  totalSlaFor,
  findGate,
  findItem,
};
