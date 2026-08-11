// Central registry of admin panel modules / tools with four-level access:
// none | view | edit | full

const LEVELS = ['none', 'view', 'edit', 'full'];
const RANK = { none: 0, view: 1, edit: 2, full: 3 };

const CM_SUBMODULES = [
  'cm-dashboard',
  'cm-clients',
  'cm-payments',
  'cm-payroll',
  'cm-super',
  'cm-lodgement',
  'cm-reminders',
  'cm-groups',
  'cm-allocation',
  'cm-import',
  'cm-periods',
];

const MODULE_KEYS = [
  'dashboard',
  'submissions',
  'team',
  'client-management',
  ...CM_SUBMODULES,
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
  'migration-rates',
  'sales-commission',
  'div-7a',
  'aml-compliance',
  'firm-library',
  'command-centre',
];

/** Parent module → sub-modules. */
const MODULE_CHILDREN = {
  'client-management': [...CM_SUBMODULES],
  benchmarks: ['benchmarks-usage'],
  deduction: ['deduction-usage'],
  'quote-pad': ['quote-pad-pricing'],
};

const CHILD_TO_PARENT = Object.fromEntries(
  Object.entries(MODULE_CHILDREN).flatMap(([parent, children]) =>
    children.map((child) => [child, parent])
  )
);

const FULL_ACCESS_ROLES = new Set(['admin', 'owner']);

/** Flag-gated modules (Staff only; Owner/Admin bypass). */
const FLAG_MODULES = {
  amlOfficer: ['aml-compliance'],
  payrollAccess: ['cm-payroll', 'cm-super'],
};

/**
 * Default levels per role (spec §7, CRM module IDs).
 * Admin/Owner are always full on everything via isFullAccessRole.
 */
const ROLE_DEFAULT_LEVELS = {
  admin: Object.fromEntries(MODULE_KEYS.map((k) => [k, 'full'])),
  owner: Object.fromEntries(MODULE_KEYS.map((k) => [k, 'full'])),
  manager: {
    dashboard: 'edit',
    submissions: 'edit',
    'command-centre': 'none',
    team: 'none',
    reports: 'none',
    'client-management': 'edit',
    'cm-dashboard': 'edit',
    'cm-clients': 'edit',
    'cm-payments': 'edit',
    'cm-payroll': 'edit',
    'cm-super': 'edit',
    'cm-lodgement': 'edit',
    'cm-reminders': 'edit',
    'cm-groups': 'edit',
    'cm-allocation': 'edit',
    'cm-import': 'none',
    'cm-periods': 'none',
    'lead-crm': 'edit',
    'website-leads': 'edit',
    newsletter: 'edit',
    'aml-compliance': 'view',
    benchmarks: 'edit',
    'benchmarks-usage': 'none',
    deduction: 'edit',
    'deduction-usage': 'none',
    'div-7a': 'edit',
    'firm-library': 'edit',
    pricing: 'none',
    careers: 'none',
    webinars: 'none',
    blogs: 'none',
    'quote-pad': 'edit',
    'quote-pad-pricing': 'none',
    'migration-rates': 'none',
    'sales-commission': 'edit',
  },
  staff: {
    dashboard: 'view',
    submissions: 'view',
    'command-centre': 'none',
    team: 'none',
    reports: 'none',
    'client-management': 'edit',
    'cm-dashboard': 'view',
    'cm-clients': 'view',
    'cm-payments': 'view',
    'cm-payroll': 'none',
    'cm-super': 'none',
    'cm-lodgement': 'none',
    'cm-reminders': 'edit',
    'cm-groups': 'view',
    'cm-allocation': 'none',
    'cm-import': 'none',
    'cm-periods': 'none',
    'lead-crm': 'edit',
    'website-leads': 'edit',
    newsletter: 'edit',
    'aml-compliance': 'none',
    benchmarks: 'edit',
    'benchmarks-usage': 'none',
    deduction: 'edit',
    'deduction-usage': 'none',
    'div-7a': 'edit',
    'firm-library': 'view',
    pricing: 'none',
    careers: 'none',
    webinars: 'none',
    blogs: 'none',
    'quote-pad': 'edit',
    'quote-pad-pricing': 'none',
    'migration-rates': 'none',
    'sales-commission': 'none',
  },
};

/** Hard ceilings per role (options above this are disabled). */
const ROLE_CEILINGS = {
  admin: Object.fromEntries(MODULE_KEYS.map((k) => [k, 'full'])),
  owner: Object.fromEntries(MODULE_KEYS.map((k) => [k, 'full'])),
  manager: {
    ...Object.fromEntries(MODULE_KEYS.map((k) => [k, 'full'])),
    team: 'none',
    pricing: 'none',
    careers: 'none',
    webinars: 'none',
    blogs: 'none',
    'command-centre': 'none',
    reports: 'none',
    'cm-import': 'none',
    'cm-periods': 'none',
    'benchmarks-usage': 'none',
    'deduction-usage': 'none',
    'quote-pad-pricing': 'none',
    'migration-rates': 'none',
    'aml-compliance': 'view',
  },
  staff: {
    ...Object.fromEntries(MODULE_KEYS.map((k) => [k, 'edit'])),
    dashboard: 'view',
    submissions: 'view',
    'command-centre': 'none',
    team: 'none',
    reports: 'none',
    'cm-clients': 'view',
    'cm-allocation': 'none',
    'cm-import': 'none',
    'cm-periods': 'none',
    'cm-lodgement': 'none',
    'benchmarks-usage': 'none',
    'deduction-usage': 'none',
    pricing: 'none',
    careers: 'none',
    webinars: 'none',
    blogs: 'none',
    'quote-pad-pricing': 'none',
    'migration-rates': 'none',
    'sales-commission': 'none',
    'firm-library': 'view',
    'cm-dashboard': 'view',
    'cm-payments': 'view',
    'cm-groups': 'view',
  },
};

function isFullAccessRole(role) {
  return FULL_ACCESS_ROLES.has(role);
}

function normalizeLevel(level) {
  if (LEVELS.includes(level)) return level;
  return 'none';
}

function minLevel(a, b) {
  return RANK[a] <= RANK[b] ? a : b;
}

function maxLevel(a, b) {
  return RANK[a] >= RANK[b] ? a : b;
}

function defaultLeadScope(role) {
  if (role === 'staff' || role === 'manager') return 'own';
  return 'all';
}

function roleCeiling(role, moduleKey) {
  const map = ROLE_CEILINGS[role] || ROLE_CEILINGS.staff;
  return normalizeLevel(map[moduleKey] ?? 'full');
}

function roleDefaultLevel(role, moduleKey) {
  if (isFullAccessRole(role)) return 'full';
  const map = ROLE_DEFAULT_LEVELS[role] || ROLE_DEFAULT_LEVELS.staff;
  return normalizeLevel(map[moduleKey] ?? 'none');
}

/**
 * Apply parent/child consistency:
 * - child cannot exceed parent
 * - parent none → all children none
 * - raising a child lifts parent to at least that level
 */
function enforceParentChild(access) {
  const next = { ...access };

  // Lift parents to match highest child
  for (const [parent, children] of Object.entries(MODULE_CHILDREN)) {
    let maxChild = 'none';
    for (const child of children) {
      maxChild = maxLevel(maxChild, normalizeLevel(next[child] || 'none'));
    }
    if (RANK[maxChild] > RANK[normalizeLevel(next[parent] || 'none')]) {
      next[parent] = maxChild;
    }
  }

  // Cap children to parent; cascade none
  for (const [parent, children] of Object.entries(MODULE_CHILDREN)) {
    const parentLevel = normalizeLevel(next[parent] || 'none');
    for (const child of children) {
      const childLevel = normalizeLevel(next[child] || 'none');
      if (parentLevel === 'none') {
        next[child] = 'none';
      } else if (RANK[childLevel] > RANK[parentLevel]) {
        next[child] = parentLevel;
      }
    }
  }

  return next;
}

/**
 * Cap every module to the role ceiling.
 */
function applyCeilings(role, access) {
  const next = {};
  for (const key of MODULE_KEYS) {
    const level = normalizeLevel(access[key] || 'none');
    const cap = roleCeiling(role, key);
    next[key] = minLevel(level, cap);
  }
  return next;
}

/**
 * Staff special-access flags. Owner/Admin bypass.
 * Managers get payroll/AML from the role matrix — flags only gate Staff.
 * When flag is false, related modules forced to none.
 * When flag is true and level is none, elevate to edit (default unlock).
 */
function applySpecialFlags(user, access) {
  if (isFullAccessRole(user.role)) return access;
  if (user.role !== 'staff') return access;
  const next = { ...access };
  const aml = !!user.amlOfficer;
  const pay = !!user.payrollAccess;

  for (const key of FLAG_MODULES.amlOfficer) {
    if (!aml) next[key] = 'none';
    else if (normalizeLevel(next[key] || 'none') === 'none') next[key] = 'edit';
  }
  for (const key of FLAG_MODULES.payrollAccess) {
    if (!pay) next[key] = 'none';
    else if (normalizeLevel(next[key] || 'none') === 'none') next[key] = 'edit';
  }
  return next;
}

function emptyAccess() {
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, 'none']));
}

function defaultsForRole(role) {
  const next = emptyAccess();
  for (const key of MODULE_KEYS) {
    next[key] = roleDefaultLevel(role, key);
  }
  return next;
}

/**
 * Sanitize a stored moduleAccess object for a role (ceilings + parent/child).
 * Does not apply flags — caller should pass user into effectiveAccess.
 */
function sanitizeModuleAccess(role, raw) {
  const base = emptyAccess();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const key of MODULE_KEYS) {
      if (raw[key] !== undefined) base[key] = normalizeLevel(raw[key]);
    }
    // Legacy aliases in object form
    if (
      (normalizeLevel(raw['website-leads'] || 'none') !== 'none' ||
        normalizeLevel(raw.newsletter || 'none') !== 'none') &&
      normalizeLevel(base['lead-crm']) === 'none'
    ) {
      base['lead-crm'] = maxLevel(
        normalizeLevel(raw['website-leads'] || 'none'),
        normalizeLevel(raw.newsletter || 'none')
      );
    }
  }
  if (normalizeLevel(base.dashboard) === 'none') base.dashboard = 'view';
  return enforceParentChild(applyCeilings(role || 'staff', base));
}

/**
 * Compact stored form: only non-none entries.
 */
function compactModuleAccess(access) {
  const out = {};
  for (const key of MODULE_KEYS) {
    const level = normalizeLevel(access[key] || 'none');
    if (level !== 'none') out[key] = level;
  }
  return out;
}

/**
 * Resolve effective access map for a user document / lean object.
 */
function effectiveAccess(user) {
  if (!user) return emptyAccess();
  if (isFullAccessRole(user.role)) {
    return Object.fromEntries(MODULE_KEYS.map((k) => [k, 'full']));
  }

  let access;
  const stored = user.moduleAccess;
  const hasStored =
    stored &&
    typeof stored === 'object' &&
    !Array.isArray(stored) &&
    Object.keys(stored).length > 0;

  if (hasStored) {
    access = sanitizeModuleAccess(user.role, stored);
  } else if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    // Legacy array still present pre-migration
    access = migrateLegacyArray(user.role, user.permissions);
  } else {
    access = defaultsForRole(user.role);
  }

  access = applySpecialFlags(user, access);
  access = enforceParentChild(applyCeilings(user.role, access));
  return access;
}

/**
 * Modules with level >= view (sidebar / requireModule compatibility).
 */
function effectiveModules(user) {
  const access = effectiveAccess(user);
  return MODULE_KEYS.filter((k) => RANK[access[k]] >= RANK.view);
}

function getModuleLevel(user, moduleKey) {
  return normalizeLevel(effectiveAccess(user)[moduleKey] || 'none');
}

function hasModuleLevel(user, moduleKey, minLevel = 'view') {
  if (isFullAccessRole(user?.role)) return true;
  const need = normalizeLevel(minLevel);
  return RANK[getModuleLevel(user, moduleKey)] >= RANK[need];
}

/**
 * Migrate old permissions string[] → full access map using role defaults
 * for each present key; absent keys → none.
 */
function migrateLegacyArray(role, permissionsArray) {
  const granted = new Set(
    (permissionsArray || []).filter((k) => typeof k === 'string' && MODULE_KEYS.includes(k))
  );
  if (granted.has('website-leads') || granted.has('newsletter')) granted.add('lead-crm');

  // Legacy: only parent client-management → expand all CM children that role defaults grant
  if (granted.has('client-management')) {
    const hasAnyChild = CM_SUBMODULES.some((c) => granted.has(c));
    if (!hasAnyChild) {
      for (const c of CM_SUBMODULES) {
        if (roleDefaultLevel(role, c) !== 'none') granted.add(c);
      }
    }
  }

  const access = emptyAccess();
  for (const key of MODULE_KEYS) {
    if (granted.has(key)) {
      access[key] = roleDefaultLevel(role, key);
      // If role default is none but it was explicitly granted (custom), give edit
      if (access[key] === 'none') access[key] = 'edit';
    } else {
      access[key] = 'none';
    }
  }
  if (access.dashboard === 'none') access.dashboard = 'view';
  return enforceParentChild(applyCeilings(role || 'staff', access));
}

/**
 * Build sanitized compact moduleAccess from an incoming payload + role + flags.
 */
function normalizeIncomingAccess(role, rawAccess, flags = {}) {
  const userLike = {
    role,
    amlOfficer: !!flags.amlOfficer,
    payrollAccess: !!flags.payrollAccess,
  };

  let access;
  if (rawAccess == null) {
    access = defaultsForRole(role);
  } else if (Array.isArray(rawAccess)) {
    // Back-compat: treat array as legacy granted list
    access = migrateLegacyArray(role, rawAccess);
  } else {
    access = sanitizeModuleAccess(role, rawAccess);
  }

  access = applySpecialFlags(userLike, access);
  access = enforceParentChild(applyCeilings(role, access));
  return compactModuleAccess(access);
}

/** Back-compat: array sanitize used by older callers. */
function sanitizeModulePermissions(keys) {
  if (!Array.isArray(keys)) return [];
  const set = new Set(keys.filter((k) => MODULE_KEYS.includes(k)));
  if (set.has('website-leads') || set.has('newsletter')) set.add('lead-crm');
  for (const [child, parent] of Object.entries(CHILD_TO_PARENT)) {
    if (set.has(child) && !set.has(parent)) set.delete(child);
  }
  if (!set.has('dashboard')) set.add('dashboard');
  return MODULE_KEYS.filter((k) => set.has(k));
}

/** Derived list of keys with non-none default for a role (smoke tests / legacy). */
const ROLE_DEFAULT_MODULES = Object.fromEntries(
  Object.keys(ROLE_DEFAULT_LEVELS).map((role) => [
    role,
    MODULE_KEYS.filter((k) => roleDefaultLevel(role, k) !== 'none'),
  ])
);

function serializeUserAccess(user) {
  const access = effectiveAccess(user);
  return {
    moduleAccess: compactModuleAccess(access),
    modules: MODULE_KEYS.filter((k) => RANK[access[k]] >= RANK.view),
    accessLevels: access,
    leadScope: user.leadScope || defaultLeadScope(user.role),
    amlOfficer: !!user.amlOfficer,
    payrollAccess: !!user.payrollAccess,
  };
}

/** UI roles: legacy `admin` is treated as `owner`. */
function normalizeTeamRole(role) {
  if (role === 'admin' || role === 'owner') return 'owner';
  if (role === 'manager') return 'manager';
  return 'staff';
}

/**
 * Reset one user document to the NANAK Owner / Manager / Staff matrix for their role.
 * Preserves amlOfficer and payrollAccess flags. Migrates legacy admin → owner.
 */
function applyRoleDefaultsToUser(user) {
  const amlOfficer = !!user.amlOfficer;
  const payrollAccess = !!user.payrollAccess;
  user.role = normalizeTeamRole(user.role);

  if (isFullAccessRole(user.role)) {
    user.moduleAccess = null;
    user.permissions = null;
    user.leadScope = 'all';
  } else {
    user.moduleAccess = normalizeIncomingAccess(user.role, null, { amlOfficer, payrollAccess });
    user.permissions = null;
    user.leadScope = defaultLeadScope(user.role);
  }

  user.amlOfficer = amlOfficer;
  user.payrollAccess = payrollAccess;
  return user;
}

module.exports = {
  LEVELS,
  RANK,
  MODULE_KEYS,
  CM_SUBMODULES,
  MODULE_CHILDREN,
  CHILD_TO_PARENT,
  FLAG_MODULES,
  ROLE_DEFAULT_LEVELS,
  ROLE_CEILINGS,
  ROLE_DEFAULT_MODULES,
  FULL_ACCESS_ROLES,
  isFullAccessRole,
  normalizeLevel,
  defaultLeadScope,
  roleCeiling,
  roleDefaultLevel,
  defaultsForRole,
  sanitizeModuleAccess,
  compactModuleAccess,
  effectiveAccess,
  effectiveModules,
  getModuleLevel,
  hasModuleLevel,
  migrateLegacyArray,
  normalizeIncomingAccess,
  sanitizeModulePermissions,
  serializeUserAccess,
  normalizeTeamRole,
  applyRoleDefaultsToUser,
  enforceParentChild,
  applyCeilings,
  applySpecialFlags,
};
