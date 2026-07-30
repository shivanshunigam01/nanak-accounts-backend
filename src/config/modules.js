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
  'benchmarks',
  'benchmarks-usage',
  'deduction',
  'deduction-usage',
  'quote-pad',
  'quote-pad-pricing',
  'sales-commission',
  'div-7a',
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
  for (const [child, parent] of Object.entries(CHILD_TO_PARENT)) {
    if (set.has(child) && !set.has(parent)) set.delete(child);
  }
  if (!set.has('dashboard')) set.add('dashboard');
  return MODULE_KEYS.filter((k) => set.has(k));
}

const ROLE_DEFAULT_MODULES = {
  admin: [...MODULE_KEYS],
  manager: [
    'dashboard',
    'submissions',
    'client-management',
    'reports',
    'benchmarks',
    'benchmarks-usage',
    'deduction',
    'deduction-usage',
    'quote-pad',
    'sales-commission',
    'div-7a',
  ],
  staff: [
    'dashboard',
    'submissions',
    'client-management',
    'benchmarks',
    'deduction',
    'quote-pad',
    'sales-commission',
    'div-7a',
  ],
};

function effectiveModules(user) {
  if (!user) return [];
  if (user.role === 'admin') return [...MODULE_KEYS];
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    const custom = sanitizeModulePermissions(user.permissions);
    return custom;
  }
  return [...(ROLE_DEFAULT_MODULES[user.role] || ROLE_DEFAULT_MODULES.staff)];
}

module.exports = {
  MODULE_KEYS,
  MODULE_CHILDREN,
  ROLE_DEFAULT_MODULES,
  sanitizeModulePermissions,
  effectiveModules,
};
