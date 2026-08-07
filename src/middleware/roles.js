const {
  effectiveModules,
  hasModuleLevel,
  getModuleLevel,
} = require('../config/modules');

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}

// Grants access when the user's effective level for the module is at least `view`.
function requireModule(moduleKey) {
  return requireModuleLevel(moduleKey, 'view');
}

/**
 * Enforce a minimum permission level for a module.
 * @param {string} moduleKey
 * @param {'view'|'edit'|'full'} minLevel
 */
function requireModuleLevel(moduleKey, minLevel = 'view') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!hasModuleLevel(req.user, moduleKey, minLevel)) {
      const level = getModuleLevel(req.user, moduleKey);
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this module',
        module: moduleKey,
        required: minLevel,
        level,
      });
    }
    next();
  };
}

module.exports = { requireRole, requireModule, requireModuleLevel, effectiveModules };
