/**
 * Deduction RBAC — mirrors benchmark.permissions.js
 */

const ROLE_ALIASES = {
  admin: 'admin',
  owner: 'admin',
  manager: 'manager',
  staff: 'staff',
  analyst: 'staff',
  viewer: 'staff',
};

const DEFAULT_PERMISSIONS = {
  create: ['admin', 'manager'],
  update: ['admin', 'manager'],
  delete: ['admin'],
  approve: ['admin', 'manager'],
  export: ['admin', 'manager', 'staff'],
  import: ['admin', 'manager'],
  publish: ['admin'],
  view: ['admin', 'manager', 'staff'],
};

function normalizeRole(role) {
  return ROLE_ALIASES[String(role || '').toLowerCase()] || 'staff';
}

function requireDeductionPermission(action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const role = normalizeRole(req.user.role);
    const allowed = DEFAULT_PERMISSIONS[action] || DEFAULT_PERMISSIONS.view;
    if (!allowed.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden — ${action} requires ${allowed.join(' / ')}`,
      });
    }
    next();
  };
}

module.exports = {
  ROLE_ALIASES,
  DEFAULT_PERMISSIONS,
  normalizeRole,
  requireDeductionPermission,
};
