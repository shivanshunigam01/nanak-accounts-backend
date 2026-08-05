// Central registry of admin panel modules / tools.
// A user's effective access = role defaults, unless a custom
// `permissions` array has been saved on the user (admins always get everything).

const MODULE_KEYS = [
  'dashboard',
  'submissions',
  'team',
  'client-management',
  'reports',
  'pricing',
  'careers',
  'webinars',
  'blogs',
  'lead-crm',
  'website-leads',
  'newsletter',
  'benchmarks',
  'benchmarks-usage',
  'deduction',
  'deduction-usage',
  'quote-pad',
  'quote-pad-pricing',
  'sales-commission',
  'div-7a',
  'aml-compliance',
  'firm-library',
  'income-tax-calculator',
  'pay-calculator',
  'command-centre',
];

/** Parent module → sub-modules that require the parent to be assigned. */
const MODULE_CHILDREN = {
  benchmarks: ['benchmarks-usage'],
  deduction: ['deduction-usage'],
  'quote-pad': ['quote-pad-pricing'],
};

const CHILD_TO_PARENT = Object.fromEntries(
  Object.entries(MODULE_CHILDREN).flatMap(([parent, children]) =>
    children.map((child) => [child, parent])
  )
);

/** Drop orphan sub-modules whose parent is not in the list. */
function sanitizeModulePermissions(keys) {
  if (!Array.isArray(keys)) return [];
  const set = new Set(keys.filter((k) => MODULE_KEYS.includes(k)));
  // Legacy website-leads / newsletter grants → lead-crm
  if (set.has('website-leads') || set.has('newsletter')) set.add('lead-crm');
  for (const [child, parent] of Object.entries(CHILD_TO_PARENT)) {
    if (set.has(child) && !set.has(parent)) set.delete(child);
  }
  if (!set.has('dashboard')) set.add('dashboard');
  return MODULE_KEYS.filter((k) => set.has(k));
}

const FULL_ACCESS_ROLES = new Set(['admin', 'owner']);

const ROLE_DEFAULT_MODULES = {
  admin: [...MODULE_KEYS],
  owner: [...MODULE_KEYS],
  manager: [
    'dashboard',
    'submissions',
    'client-management',
    'reports',
    'blogs',
    'lead-crm',
    'website-leads',
    'newsletter',
    'benchmarks',
    'benchmarks-usage',
    'deduction',
    'deduction-usage',
    'quote-pad',
    'sales-commission',
    'div-7a',
    'aml-compliance',
    'income-tax-calculator',
    'pay-calculator',
  ],
  staff: [
    'dashboard',
    'submissions',
    'client-management',
    'blogs',
    'lead-crm',
    'website-leads',
    'newsletter',
    'benchmarks',
    'deduction',
    'quote-pad',
    'sales-commission',
    'div-7a',
    'aml-compliance',
    'income-tax-calculator',
    'pay-calculator',
  ],
};

function isFullAccessRole(role) {
  return FULL_ACCESS_ROLES.has(role);
}

function effectiveModules(user) {
  if (!user) return [];
  if (isFullAccessRole(user.role)) return [...MODULE_KEYS];
  let keys;
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    keys = sanitizeModulePermissions(user.permissions);
  } else {
    keys = [...(ROLE_DEFAULT_MODULES[user.role] || ROLE_DEFAULT_MODULES.staff)];
  }
  // Alias: anyone with legacy lead inboxes gets lead-crm
  if (keys.includes('website-leads') || keys.includes('newsletter')) {
    if (!keys.includes('lead-crm')) keys = [...keys, 'lead-crm'];
  }
  return keys;
}

module.exports = {
  MODULE_KEYS,
  MODULE_CHILDREN,
  ROLE_DEFAULT_MODULES,
  FULL_ACCESS_ROLES,
  isFullAccessRole,
  sanitizeModulePermissions,
  effectiveModules,
};
