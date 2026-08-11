const PracticeClient = require('../../models/PracticeClient');
const PracticeGroup = require('../../models/PracticeGroup');
const PracticeSettings = require('../../models/PracticeSettings');
const PracticePayrollOverride = require('../../models/PracticePayrollOverride');
const PracticePeriod = require('../../models/PracticePeriod');
const ClientPeriodStatus = require('../../models/ClientPeriodStatus');
const User = require('../../models/User');
const { isFullAccessRole } = require('../../config/modules');
const { formatLongDate, greetingPeriod, monthsSince, dstr, toISO, parseFlexibleDate } = require('./dates');
const {
  buildRunsForClients,
  runBucket,
  runWhen,
  stpBreaches,
  filterSuperRuns,
  superBucket,
} = require('./payroll');
const { addDays, dayDiff, dshort, WD } = require('./dates');
const { migrateClientManagementV4 } = require('./migrateV4');
const {
  periodId,
  periodDefinitions,
  ensurePeriodsForYear,
  ensureClientPeriodStatuses,
  ensurePeriodMigration,
  hydrateClientsForWorkingYear,
  attachLodgementYears,
  updateClientPeriods,
  assertPeriodsWritable,
  listPeriods,
  lockPeriod,
  unlockPeriod,
} = require('./periods');

const QKEYS = ['q1', 'q2', 'q3', 'q4'];

/** Clients are only "live" when status is Active — the legacy `active` flag is no longer authoritative. */
const ACTIVE = { status: 'Active' };

const EXIT_REASONS = PracticeClient.EXIT_REASONS || [];

const REL_LABELS = [
  'Spouse',
  'Director',
  'Shareholder',
  'Trustee',
  'Beneficiary',
  'Family trust',
  'Trading company',
  'Investment company',
  'Related entity',
];

function isPersonStructure(type) {
  return type === 'Sole Trader' || type === 'Individual';
}

function typeCountLabel(ms) {
  const counts = {};
  for (const m of ms) {
    const t = m.type || 'Company';
    counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([t, n]) => {
      const lower = t.toLowerCase();
      if (n === 1) return `1 ${lower}`;
      if (t === 'Company') return `${n} companies`;
      if (t === 'Sole Trader') return `${n} sole traders`;
      return `${n} ${lower}s`;
    })
    .join(' · ');
}

function suggestGroupName(host) {
  const entity = String(host.entity || 'Family').trim();
  const parts = entity.split(/\s+/).filter(Boolean);
  let base;
  if (isPersonStructure(host.type) && parts.length) {
    base = parts[parts.length - 1];
  } else {
    base = parts[0] || 'Family';
  }
  const titled = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  return `${titled} Group`;
}

function normalizeRelLabel(v) {
  const s = String(v || '').trim();
  if (REL_LABELS.includes(s)) return s;
  return s || 'Related entity';
}

/** Runs the v4 backfill at most once per process; callers never wait on it twice. */
let migrationPromise = null;
function ensureV4Migration() {
  if (!migrationPromise) {
    migrationPromise = migrateClientManagementV4()
      .then(async () => ensurePeriodMigration(await getSettings()))
      .catch((e) => {
        migrationPromise = null;
        throw e;
      });
  }
  return migrationPromise;
}

function isFirmRole(user) {
  return user.role === 'admin' || user.role === 'owner' || user.role === 'manager';
}

function isFullAccessUser(user) {
  return user && (user.role === 'admin' || user.role === 'owner');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameMatchRegex(name) {
  return new RegExp(`^${escapeRegex(String(name || '').trim())}$`, 'i');
}

/** Shared CSV columns for export ↔ import round-trip (fill genuine data, then re-import). */
const CLIENT_CSV_HEADERS = [
  'entity',
  'abn',
  'type',
  'manager',
  'package',
  'fee',
  'gst',
  'payroll',
  'payCycle',
  'firstPayDate',
  'employees',
  'payrollManager',
  'software',
  'quickbooks',
  'email',
  'phone',
];

function normalizePersonKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function personTokens(name) {
  return normalizePersonKey(name).split(' ').filter(Boolean);
}

function isDemoEmail(email) {
  return /@nanak\.demo$/i.test(String(email || ''));
}

/** Prefer admin/owner, then manager, non-demo email, then more complete (longer) display name. */
function teamMemberScore(u) {
  let s = 0;
  if (u.role === 'admin' || u.role === 'owner') s += 120;
  else if (u.role === 'manager') s += 100;
  else if (u.role === 'staff') s += 50;
  if (!isDemoEmail(u.email)) s += 40;
  s += Math.min(String(u.name || '').trim().length, 80);
  return s;
}

/**
 * Team members available as client managers — same people as Team (all roles),
 * deduped so "Aditya" / "Aditya Alok" / "ADITYA ALOK" collapse to one canonical user.
 */
async function listAssignableTeamMembers() {
  const users = await User.find({
    role: { $in: ['admin', 'owner', 'manager', 'staff'] },
    active: true,
  })
    .select('name email role')
    .lean();
  const hasReal = users.some((u) => !isDemoEmail(u.email));
  const pool = hasReal
    ? users.filter((u) => !isDemoEmail(u.email) || u.role === 'admin' || u.role === 'owner')
    : users;

  // Exact-name dedupe (case/whitespace insensitive)
  const byExact = new Map();
  for (const u of pool) {
    const key = normalizePersonKey(u.name);
    if (!key) continue;
    const prev = byExact.get(key);
    if (!prev || teamMemberScore(u) > teamMemberScore(prev)) byExact.set(key, u);
  }
  let list = [...byExact.values()];

  // Drop truncated variants when a longer name extends the same tokens
  // e.g. drop "Aditya" when "Aditya Alok" exists; drop "Karan Veer" when "Karan Veer Sharma" exists.
  list = list.filter((u) => {
    const ut = personTokens(u.name);
    if (!ut.length) return false;
    return !list.some((other) => {
      if (String(other._id) === String(u._id)) return false;
      const ot = personTokens(other.name);
      if (ot.length <= ut.length) return false;
      return ut.every((t, i) => t === ot[i]);
    });
  });

  return list
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }))
    .map((s) => ({ _id: String(s._id), name: s.name, role: s.role, email: s.email }));
}

function pickBestUser(candidates) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => teamMemberScore(b) - teamMemberScore(a))[0];
}

/** Admin/owner can edit any client; staff/manager can edit only clients assigned to them. */
function canEditClient(user, c) {
  if (!user || !c) return false;
  if (isFullAccessUser(user)) return true;
  if (c.managerId && String(c.managerId) === String(user._id)) return true;
  if (user.name && c.managerName && nameMatchRegex(user.name).test(String(c.managerName).trim())) {
    return true;
  }
  return false;
}

/**
 * Resolve client manager to a Team User. Always stores that user's canonical name.
 * Matches exact name (case-insensitive), then unique token-prefix (e.g. "Aditya" → "Aditya Alok").
 */
async function resolveManager(managerId, managerName) {
  let id = managerId || null;
  let name = String(managerName || '').trim();

  if (id) {
    const u = await User.findById(id).select('_id name email role').lean();
    if (u) {
      return { managerId: u._id, managerName: u.name };
    }
  }

  if (!name) {
    return { managerId: id || null, managerName: name };
  }

  const users = await User.find({
    role: { $in: ['admin', 'owner', 'manager', 'staff'] },
    active: true,
  })
    .select('_id name email role')
    .lean();

  const hasReal = users.some((u) => !isDemoEmail(u.email));
  const pool = hasReal
    ? users.filter((u) => !isDemoEmail(u.email) || u.role === 'admin' || u.role === 'owner')
    : users;

  const key = normalizePersonKey(name);
  const exact = pool.filter((u) => normalizePersonKey(u.name) === key);
  let best = pickBestUser(exact);

  if (!best) {
    const qTokens = personTokens(name);
    if (qTokens.length) {
      const fuzzy = pool.filter((u) => {
        const ut = personTokens(u.name);
        if (ut.length < qTokens.length) return false;
        return qTokens.every((t, i) => t === ut[i]);
      });
      // Only accept when a single preferred identity remains after scoring ties on same person key
      const uniqueKeys = new Set(fuzzy.map((u) => normalizePersonKey(u.name)));
      if (uniqueKeys.size === 1) {
        best = pickBestUser(fuzzy);
      } else if (fuzzy.length === 1) {
        best = fuzzy[0];
      }
    }
  }

  if (best) {
    return { managerId: best._id, managerName: best.name };
  }

  return { managerId: id || null, managerName: name };
}

/** Staff "My Clients" matches by managerId, with name fallback for mis-linked rows. */
function staffAllocationFilter(user) {
  const or = [{ managerId: user._id }];
  if (user.name) {
    or.push({ managerName: nameMatchRegex(user.name) });
  }
  return { $or: or };
}

function actorName(user) {
  return user?.name || 'System';
}

function firstName(user) {
  return String(user?.name || 'there').split(/\s+/)[0];
}

function qIndex(key) {
  return QKEYS.indexOf(key);
}

const ANNUAL_TYPE_BY_STRUCTURE = {
  'Sole Trader': 'ITR',
  Individual: 'ITR', // legacy rows not yet migrated
  Company: 'CTR',
  Trust: 'TTR',
  Partnership: 'PTR',
  SMSF: 'SAR',
};

function annualType(c) {
  const t = typeof c === 'string' ? c : c?.type;
  return ANNUAL_TYPE_BY_STRUCTURE[t] || 'CTR';
}

function normalizeStructure(v) {
  const list = PracticeClient.STRUCTURE_TYPES || [];
  if (v === 'Individual') return 'Sole Trader';
  return list.includes(v) ? v : 'Company';
}

function normalizeSoftware(v) {
  const list = PracticeClient.SOFTWARE_OPTIONS || [];
  return list.includes(v) ? v : '';
}

function normalizeQb(v) {
  return v === 'Connected' ? 'Connected' : 'Not Connected';
}

/**
 * Re-derives the BAS grid when GST is switched.
 * Off: every quarter that isn't already lodged becomes Not Required.
 * On: the current quarter and everything after it becomes Not Completed.
 */
function basForGst(existing, gst, curQ) {
  const base = { q1: 'Not Required', q2: 'Not Required', q3: 'Not Required', q4: 'Not Required' };
  const out = { ...base, ...(existing || {}) };
  const ci = Math.max(0, qIndex(curQ));
  for (let i = 0; i < QKEYS.length; i++) {
    const qk = QKEYS[i];
    if (!gst) {
      if (out[qk] !== 'Completed') out[qk] = 'Not Required';
    } else if (i >= ci && out[qk] === 'Not Required') {
      out[qk] = 'Not Completed';
    }
  }
  return out;
}

function payTrack(c) {
  return c.pkg === 'On Package' && c.fee;
}

function monthlyFee(c) {
  if (!c.fee) return 0;
  if (c.freq === 'Monthly') return c.fee || 0;
  if (c.freq === 'Quarterly') return Math.round((c.fee || 0) / 3);
  if (c.freq === 'Annually') return Math.round((c.fee || 0) / 12);
  return c.fee || 0;
}

function payExpected(c) {
  if (!payTrack(c)) return 0;
  if (c.freq === 'Monthly') return Math.round((c.fee || 0) * 3);
  if (c.freq === 'Annually') return Math.round((c.fee || 0) / 4);
  return c.fee || 0;
}

function normHeader(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseXeroCsvText(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return [];
  return lines.map((line) => {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

function payStatus(c, qKey) {
  if (!payTrack(c)) return 'N/A';
  return c.payq?.[qKey] || 'Not Paid';
}

function payOwing(c, curQ) {
  if (!payTrack(c)) return 0;
  const ci = qIndex(curQ);
  let owe = 0;
  for (let i = 0; i <= ci; i++) {
    const st = c.payq?.[QKEYS[i]];
    if (st === 'Not Paid') owe += payExpected(c);
    else if (st === 'Part Paid') owe += Math.round(payExpected(c) / 2);
  }
  return owe;
}

function hasWarn(c) {
  return (c.notes || []).some((n) => n.type === 'warning');
}

function payrollGap(c) {
  if (!c.payroll) return 0;
  return Math.max(0, (c.payrollActual || 0) - (c.payrollBilled || 0));
}

function payrollUnderBilled(c, rate) {
  return payrollGap(c) * rate;
}

function exposure(list, curQ) {
  const out = [];
  for (const c of list) {
    if (!payTrack(c)) continue;
    const ci = qIndex(curQ);
    for (let i = 0; i <= ci; i++) {
      const qk = QKEYS[i];
      const st = c.bas?.[qk];
      const pay = c.payq?.[qk];
      if (st === 'Completed' && pay && pay !== 'Paid') {
        const amt = pay === 'Part Paid' ? Math.round(payExpected(c) / 2) : payExpected(c);
        out.push({
          clientId: String(c._id),
          entity: c.entity,
          managerName: c.managerName,
          quarter: qk,
          amt,
          inv: (c.inv && c.inv[qk]) || null,
          feeStatus: pay,
        });
      }
    }
  }
  return out;
}

const INVOICE_REQUIRED_MESSAGE = 'Not saved - an invoice number is required for every payment';
const PAID_STATUSES = ['Paid', 'Part Paid'];

function normalizeInvoice(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

/** A quarter can only be marked Paid / Part Paid once an invoice number exists for it. */
function assertInvoiceForPayment(payStatusValue, invoiceNo) {
  if (!PAID_STATUSES.includes(payStatusValue)) return;
  if (normalizeInvoice(invoiceNo)) return;
  const err = new Error(INVOICE_REQUIRED_MESSAGE);
  err.status = 400;
  throw err;
}

/** Applies an Active <-> Inactive transition from `body.status` / `body.exit`. Admin only. */
function applyLifecycleChange(user, c, body, today, who) {
  if (body.status === undefined) return;
  const next = body.status === 'Inactive' ? 'Inactive' : 'Active';
  const current = c.status || 'Active';
  if (next === current) return;

  if (!isFullAccessRole(user.role)) {
    const err = new Error('Only admin can make a client inactive or reactivate them');
    err.status = 403;
    throw err;
  }

  if (next === 'Inactive') {
    const exit = body.exit || {};
    const reason = exit.reason || body.exitReason;
    if (!EXIT_REASONS.includes(reason)) {
      const err = new Error('Not saved - please choose a valid exit reason');
      err.status = 400;
      throw err;
    }
    const detail = String(exit.detail ?? body.exitDetail ?? '').trim();
    if (reason === 'Other' && !detail) {
      const err = new Error('Not saved - please describe the reason when choosing Other');
      err.status = 400;
      throw err;
    }
    c.status = 'Inactive';
    c.active = false;
    c.exit = {
      reason,
      detail: detail || null,
      date: exit.date || today,
      by: who,
      byId: user._id || null,
    };
    c.activity.push({
      date: today,
      who,
      action: `Client made inactive - ${reason}${detail ? `: ${detail}` : ''}`,
    });
    return;
  }

  const prevReason = c.exit?.reason;
  c.status = 'Active';
  c.active = true;
  c.exit = null;
  c.activity.push({
    date: today,
    who,
    action: `Client reactivated${prevReason ? ` (previously inactive - ${prevReason})` : ''}`,
  });
}

/** Short TTL so hot CM routes don't re-hit PracticeSettings on every nested call. */
let settingsCache = { at: 0, doc: null };
const SETTINGS_TTL_MS = 5_000;

async function getSettings({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && settingsCache.doc && now - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.doc;
  }
  let s = await PracticeSettings.findOne({ singleton: 'default' });
  if (!s) s = await PracticeSettings.create({ singleton: 'default' });
  settingsCache = { at: now, doc: s };
  return s;
}

function invalidateSettingsCache() {
  settingsCache = { at: 0, doc: null };
}

function todayFromSettings(settings) {
  if (settings.todayOverride) {
    const m = String(settings.todayOverride).match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
    if (m) {
      const months = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      };
      const dt = new Date(Number(m[3]), months[m[2]], Number(m[1]));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }
  return new Date();
}

function curLabel(settings) {
  const q = (settings.quarters || []).find((x) => x.k === settings.currentQuarter);
  return q?.l || settings.currentQuarter;
}

function curDue(settings) {
  const q = (settings.quarters || []).find((x) => x.k === settings.currentQuarter);
  return q?.due || '';
}

/** Strip heavy arrays from list/dashboard payloads (profile still loads full docs). */
const CLIENT_LEAN_SELECT = '-activity -history -notes';

/** Short TTL cache for Active client lean lists (dashboard/payments/lodgement share this). */
const scopeCache = new Map();
const SCOPE_CACHE_TTL_MS = 30_000;

function scopeCacheKey(user, extra, select) {
  const uid = isFirmRole(user) ? 'firm' : String(user._id || user.id || '');
  return `${uid}|${select}|${JSON.stringify(extra || {})}`;
}

/** Every operational view (dashboard, payroll, super, lodgement, fees) is Active-only. */
async function scopeClients(user, extra = {}, opts = {}) {
  const filter = { ...ACTIVE, ...extra };
  if (!isFirmRole(user)) Object.assign(filter, staffAllocationFilter(user));
  const select = opts.select || CLIENT_LEAN_SELECT;
  const key = scopeCacheKey(user, extra, select);
  const now = Date.now();
  const hit = scopeCache.get(key);
  if (!opts.hydrate && hit && now - hit.at < SCOPE_CACHE_TTL_MS) {
    return hit.clients;
  }
  const [settings, clients] = await Promise.all([
    getSettings(),
    PracticeClient.find(filter).select(select).lean(),
  ]);
  // Denormalized bas/payq/onTime on the client doc are kept in sync on writes;
  // skip period-store hydrate on bulk reads unless explicitly requested.
  if (opts.hydrate === true) {
    return hydrateClientsForWorkingYear(clients, settings);
  }
  scopeCache.set(key, { at: now, clients });
  return clients;
}

function invalidateScopeCache() {
  scopeCache.clear();
}

const BAS_STATUSES = ['Completed', 'In Progress', 'Not Completed', 'Not Required'];

/** `status` means Active/Inactive/All; legacy callers passing a BAS status still work. */
function splitStatusQuery(query = {}) {
  const raw = query.status;
  if (BAS_STATUSES.includes(raw)) return { lifecycle: 'Active', bas: raw };
  const bas = BAS_STATUSES.includes(query.bas) ? query.bas : null;
  if (raw === 'All' || raw === 'Inactive' || raw === 'Active') return { lifecycle: raw, bas };
  return { lifecycle: 'Active', bas };
}

async function clientFilterQuery(user, query = {}) {
  // Everyone with module access can SEE all clients; editing is gated separately.
  const { lifecycle } = splitStatusQuery(query);
  const filter = {};
  if (lifecycle !== 'All') filter.status = lifecycle;
  if (query.pkg && query.pkg !== 'All') filter.pkg = query.pkg;
  if (query.type && query.type !== 'All') filter.type = query.type;
  if (query.software && query.software !== 'All') filter.software = query.software;

  const and = [];

  if (query.managerId && query.managerId !== 'All') {
    filter.managerId = query.managerId;
  } else if (query.manager && query.manager !== 'All') {
    if (query.manager === 'mine' && user?._id) {
      filter.managerId = user._id;
    } else {
      const resolved = await resolveManager(null, query.manager);
      const targetName = resolved.managerName || query.manager;
      const allUsers = await User.find({
        role: { $in: ['admin', 'owner', 'manager', 'staff'] },
        active: true,
      })
        .select('_id name')
        .lean();
      const matchIds = allUsers
        .filter((u) => {
          const a = personTokens(u.name);
          const b = personTokens(targetName);
          if (!a.length || !b.length) return false;
          if (normalizePersonKey(u.name) === normalizePersonKey(targetName)) return true;
          const [short, long] = a.length <= b.length ? [a, b] : [b, a];
          return short.every((t, i) => t === long[i]);
        })
        .map((u) => u._id);

      if (matchIds.length) {
        and.push({
          $or: [
            { managerId: { $in: matchIds } },
            { managerName: nameMatchRegex(targetName) },
            { managerName: nameMatchRegex(query.manager) },
          ],
        });
      } else {
        filter.managerName = nameMatchRegex(query.manager);
      }
    }
  }

  if (query.q) {
    const q = String(query.q).trim();
    const digits = q.replace(/\D/g, '');
    const digitOnly = digits.length >= 3 && !/[a-zA-Z]/.test(q);
    if (digitOnly) {
      and.push({
        $or: [
          { phone: new RegExp(digits.split('').join('\\s*'), 'i') },
          { abn: new RegExp(digits.split('').join('\\s*'), 'i') },
        ],
      });
    } else {
      const rx = new RegExp(escapeRegex(q), 'i');
      and.push({
        $or: [{ entity: rx }, { abn: rx }, { phone: rx }, { email: rx }],
      });
    }
  }

  if (and.length === 1) Object.assign(filter, and[0]);
  else if (and.length > 1) filter.$and = and;
  return filter;
}

/** Backfill missing managerId from managerName so staff lists stay correct. */
async function repairMissingManagerIds() {
  const orphans = await PracticeClient.find({
    ...ACTIVE,
    managerName: { $nin: [null, ''] },
    $or: [{ managerId: null }, { managerId: { $exists: false } }],
  }).select('_id managerName managerId');

  if (!orphans.length) return 0;

  let fixed = 0;
  for (const c of orphans) {
    const resolved = await resolveManager(null, c.managerName);
    if (!resolved.managerId) continue;
    c.managerId = resolved.managerId;
    c.managerName = resolved.managerName;
    await c.save();
    fixed++;
  }
  return fixed;
}

/** Keep managerName in sync with the Team user pointed to by managerId. */
async function syncManagerNamesFromTeam() {
  const linked = await PracticeClient.find({ managerId: { $ne: null } })
    .select('_id managerId managerName')
    .lean();
  if (!linked.length) return 0;

  const ids = [...new Set(linked.map((c) => String(c.managerId)))];
  const users = await User.find({ _id: { $in: ids } }).select('_id name').lean();
  const byId = new Map(users.map((u) => [String(u._id), u.name]));

  const ops = [];
  for (const c of linked) {
    const canonical = byId.get(String(c.managerId));
    if (!canonical || String(c.managerName || '') === canonical) continue;
    ops.push({
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { managerName: canonical } },
      },
    });
  }
  if (ops.length) await PracticeClient.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/** Repair/sync at most once per TTL — not on every clients list request. */
let managerHealAt = 0;
const MANAGER_HEAL_TTL_MS = 60_000;
async function maybeHealManagers() {
  const now = Date.now();
  if (now - managerHealAt < MANAGER_HEAL_TTL_MS) return;
  managerHealAt = now;
  await Promise.all([repairMissingManagerIds(), syncManagerNamesFromTeam()]);
}

function lodgementStats(list, settings) {
  const cur = settings.currentQuarter;
  let onT = 0;
  let late = 0;
  let pend = 0;
  for (const c of list) {
    if (!c.gst) continue;
    for (let i = 0; i < QKEYS.length; i++) {
      const qk = QKEYS[i];
      const st = c.bas?.[qk];
      if (st === 'Completed') {
        if (c.onTime?.[qk] === false) late++;
        else onT++;
      } else if (st !== 'Not Required' && i <= qIndex(cur)) {
        pend++;
      }
    }
  }
  const done = onT + late;
  return {
    onTime: onT,
    late,
    pending: pend,
    done,
    pct: done ? Math.round((onT / done) * 1000) / 10 : 100,
  };
}

async function loadRuns(clients, settings) {
  const today = todayFromSettings(settings);
  const overrides = await PracticePayrollOverride.find({
    clientId: { $in: clients.map((c) => c._id) },
  }).lean();
  const map = {};
  for (const o of overrides) map[`${o.clientId}|${o.payDate}`] = o;
  return { runs: buildRunsForClients(clients, today, map), today };
}

function serializeClient(c) {
  const { office, ...rest } = c;
  const status = c.status || 'Active';
  return {
    ...rest,
    id: String(c._id),
    _id: String(c._id),
    status,
    exit: status === 'Inactive' ? c.exit || null : null,
    software: c.software || '',
    qb: c.qb === 'Connected' ? 'Connected' : 'Not Connected',
    annualType: annualType(c),
    managerId: c.managerId ? String(c.managerId) : null,
    payrollMgrId: c.payrollMgrId ? String(c.payrollMgrId) : null,
    groupId: c.groupId ? String(c.groupId) : null,
    isNew: !!c.isNewClient,
  };
}

async function getMeta(user) {
  await ensureV4Migration();
  const settings = await getSettings();
  // Light periods for nav/layout — skip ClientPeriodStatus aggregate (Fy page uses /periods).
  const [{ periods, summary: periodSummary }, staff] = await Promise.all([
    listPeriods(settings, { enrich: false }),
    listAssignableTeamMembers(),
  ]);
  return {
    activeFy: settings.workingFy || settings.activeFy,
    workingFy: settings.workingFy || settings.activeFy,
    currentQuarter: settings.currentQuarter,
    currentQuarterLabel: curLabel(settings),
    currentDue: curDue(settings),
    quarters: settings.quarters,
    dueDateDefaults: settings.dueDateDefaults,
    periods,
    periodSummary,
    structures: PracticeClient.STRUCTURE_TYPES || [],
    softwareOptions: (PracticeClient.SOFTWARE_OPTIONS || []).filter(Boolean),
    exitReasons: EXIT_REASONS,
    statuses: ['Active', 'Inactive'],
    reminderTemplate: settings.reminderTemplate,
    remindersEnabled: settings.remindersEnabled !== false,
    onTimeThreshold: settings.onTimeThreshold,
    payrollRate: settings.payrollRate,
    feeReviewMonths: settings.feeReviewMonths,
    isFirm: isFirmRole(user),
    staff: staff.map((s) => ({ _id: s._id, name: s.name, role: s.role })),
    csvHeaders: CLIENT_CSV_HEADERS,
    relationshipLabels: REL_LABELS,
    today: dstr(todayFromSettings(settings)),
  };
}

async function getDashboard(user) {
  const settings = await getSettings();
  const curQ = settings.currentQuarter;
  const curQL = curLabel(settings);
  const clients = await scopeClients(user);
  const groups = await PracticeGroup.find({ active: true }).select('_id name').lean();
  const rate = settings.payrollRate;
  const threshold = settings.onTimeThreshold;
  const today = todayFromSettings(settings);
  // Only generate pay runs for payroll clients (big CPU win vs all active clients).
  const { runs } = await loadRuns(
    clients.filter((c) => c.payroll && c.payrollFreq),
    settings
  );

  const gst = clients.filter((c) => c.gst);
  let done = 0;
  let prog = 0;
  let notdone = 0;
  for (const c of gst) {
    const st = c.bas?.[curQ];
    if (st === 'Completed') done++;
    else if (st === 'In Progress') prog++;
    else if (st === 'Not Completed') notdone++;
  }
  const appl = done + prog + notdone;
  const pct = appl ? Math.round((done / appl) * 100) : 0;
  const onPkg = clients.filter((c) => c.pkg === 'On Package');
  const mrr = onPkg.reduce((s, c) => s + (c.fee || 0), 0);
  const newCount = clients.filter((c) => c.isNewClient).length;
  const attention = clients.filter((c) => (c.gst && c.bas?.[curQ] === 'Not Completed') || hasWarn(c));
  const odRuns = runs.filter((r) => runBucket(r, today) === 'overdue');
  const stpB = stpBreaches(runs);
  const inactiveClients = await PracticeClient.countDocuments(
    isFirmRole(user) ? { status: 'Inactive' } : { status: 'Inactive', ...staffAllocationFilter(user) }
  );
  const basDue = clients.filter((c) => c.gst && c.bas?.[curQ] === 'Not Completed').length;
  const ex = exposure(clients, curQ);
  const exVal = ex.reduce((t, x) => t + x.amt, 0);
  const pgap = clients.filter((c) => payrollGap(c) > 0);
  const pgapVal = pgap.reduce((t, c) => t + payrollUnderBilled(c, rate), 0);
  const ls = lodgementStats(clients, settings);

  // group conflicts
  const groupMap = {};
  for (const g of groups) groupMap[String(g._id)] = { ...g, managers: new Set(), members: [] };
  for (const c of clients) {
    if (!c.groupId) continue;
    const g = groupMap[String(c.groupId)];
    if (!g) continue;
    g.members.push(c);
    if (c.managerName) g.managers.add(c.managerName);
  }
  const splitGroups = Object.values(groupMap)
    .filter((g) => g.managers.size > 1)
    .map((g) => ({
      id: String(g._id),
      name: g.name,
      managers: [...g.managers],
    }));

  let directorSplits = 0;
  for (const g of Object.values(groupMap)) {
    const ents = g.members.filter((m) => !isPersonStructure(m.type));
    const inds = g.members.filter((m) => isPersonStructure(m.type));
    for (const e of ents) {
      for (const i of inds) {
        if (e.managerName !== i.managerName) directorSplits++;
      }
    }
  }

  const pb = clients.filter(payTrack);
  let feesOutstanding = 0;
  let owingCount = 0;
  for (const c of pb) {
    const o = payOwing(c, curQ);
    if (o) {
      feesOutstanding += o;
      owingCount++;
    }
  }
  const notReconciled = pb.filter((c) => !c.recon?.[curQ]).length;
  const feeStale = clients.filter(
    (c) => c.pkg === 'On Package' && c.fee && monthsSince(c.feeReview) >= settings.feeReviewMonths
  );

  const greeting = `Good ${greetingPeriod(new Date())}, ${firstName(user)}`;
  const dateLine = formatLongDate(today);

  if (isFirmRole(user)) {
    // staff stacked bars
    const byManager = {};
    for (const c of clients) {
      if (!c.gst || !c.managerName) continue;
      if (!byManager[c.managerName]) byManager[c.managerName] = { name: c.managerName, d: 0, p: 0, n: 0 };
      const st = c.bas?.[curQ];
      if (st === 'Completed') byManager[c.managerName].d++;
      else if (st === 'In Progress') byManager[c.managerName].p++;
      else if (st === 'Not Completed') byManager[c.managerName].n++;
    }
    const bars = Object.values(byManager)
      .map((r) => ({ ...r, t: r.d + r.p + r.n, short: r.name.split(' ')[0] }))
      .filter((r) => r.t > 0);

    return {
      mode: 'admin',
      greeting,
      dateLine,
      subtitle: `firm-wide view · ${clients.length} active clients`,
      urgent: [
        odRuns.length ? `${odRuns.length} pay runs overdue` : null,
        basDue ? `${basDue} BAS outstanding` : null,
        exVal ? `$${exVal.toLocaleString()} billed work unpaid` : null,
      ].filter(Boolean),
      tiles: {
        payRunsOverdue: odRuns.length,
        basOutstanding: basDue,
        workUnpaid: exVal,
        underBilled: pgapVal,
        stpNotLodged: stpB.length,
        onTimePct: ls.pct,
        familyConflicts: directorSplits,
        newClients: newCount,
      },
      kpis: {
        activeClients: clients.length,
        inactiveClients,
        newThisMonth: newCount,
        packageRevenue: mrr,
        onPackageCount: onPkg.length,
        basCompletedPct: pct,
        basDone: done,
        basAppl: appl,
        needsAttention: attention.length,
        feesOutstanding,
        owingCount,
        notReconciled,
        onTimePct: ls.pct,
        onTimeThreshold: threshold,
        lateCount: ls.late,
        payrollUnderBilled: pgapVal,
        payrollGapClients: pgap.length,
        feesNotReviewed: feeStale.length,
      },
      progress: { done, prog, notdone, appl, pct, label: curQL, fy: settings.activeFy, due: curDue(settings) },
      bars,
      packageSplit: { onPackage: onPkg.length, nonPackage: clients.length - onPkg.length },
      splitGroups,
      attention: attention.slice(0, 12).map((c) => ({
        id: String(c._id),
        entity: c.entity,
        managerName: c.managerName,
        reasons: [
          c.gst && c.bas?.[curQ] === 'Not Completed' ? `BAS ${curQL} not completed` : null,
          hasWarn(c) ? 'flagged note' : null,
        ].filter(Boolean),
        basStatus: c.bas?.[curQ],
        hasWarn: hasWarn(c),
      })),
      attentionTotal: attention.length,
      exposure: ex.slice(0, 20),
      currentQuarter: curQ,
      currentQuarterLabel: curQL,
    };
  }

  // staff dashboard
  const myEx = exposure(clients, curQ);
  const myExVal = myEx.reduce((t, x) => t + x.amt, 0);
  const dueList = gst.filter((c) => c.bas?.[curQ] === 'Not Completed');
  const progList = gst.filter((c) => c.bas?.[curQ] === 'In Progress');

  return {
    mode: 'staff',
    greeting,
    dateLine,
    subtitle: `${clients.length} active clients`,
    urgent: [
      dueList.length ? `${dueList.length} BAS to start` : null,
      myExVal ? `$${myExVal.toLocaleString()} unpaid on work you finished` : null,
      odRuns.length ? `${odRuns.length} pay runs overdue` : null,
    ].filter(Boolean),
    tiles: {
      basNotStarted: dueList.length,
      basInProgress: progList.length,
      workUnpaid: myExVal,
      underBilled: pgapVal,
      newClients: newCount,
      payRunsOverdue: odRuns.length,
      payingTodayTomorrow: runs.filter((r) => {
        const when = runWhen(r, today);
        return when === 'today' || when === 'tomorrow';
      }).length,
      stpNotLodged: stpB.length,
    },
    kpis: {
      myClients: clients.length,
      activeClients: clients.length,
      inactiveClients,
      newAllocations: newCount,
      basDonePct: pct,
      basDone: done,
      basAppl: appl,
      notCompleted: dueList.length,
      inProgress: progList.length,
      workUnpaid: myExVal,
    },
    worklist: [...dueList, ...progList].slice(0, 15).map((c) => ({
      id: String(c._id),
      entity: c.entity,
      pkg: c.pkg,
      qb: c.qb,
      software: c.software || '',
      basStatus: c.bas?.[curQ],
      hasWarn: hasWarn(c),
    })),
    payrollQueue: odRuns
      .concat(runs.filter((r) => {
        const when = runWhen(r, today);
        return when === 'today' || when === 'tomorrow';
      }))
      .slice(0, 12)
      .map((r) => ({
        clientId: r.clientId,
        entity: r.entity,
        payDate: r.payDate,
        payWd: r.payWd,
        periodStr: r.periodStr,
        status: r.status,
        stp: r.stp,
        employees: r.employees,
        canEdit: r.canEdit,
        when: runWhen(r, today),
      })),
    exposure: myEx.slice(0, 20),
    currentQuarter: curQ,
    currentQuarterLabel: curQL,
  };
}

/** Rank type-ahead matches: name-start → word-start → anywhere → phone/ABN. Lower is better. */
function rankClientSearch(c, qRaw) {
  const q = String(qRaw || '').trim().toLowerCase();
  if (!q) return { score: 999, field: null };
  const digits = q.replace(/\D/g, '');
  const digitOnly = digits.length >= 3 && !/[a-z]/.test(q);
  const entity = String(c.entity || '').toLowerCase();
  const phoneDigits = String(c.phone || '').replace(/\D/g, '');
  const abnDigits = String(c.abn || '').replace(/\D/g, '');

  if (digitOnly) {
    if (phoneDigits.includes(digits)) return { score: 40, field: 'phone' };
    if (abnDigits.includes(digits)) return { score: 41, field: 'abn' };
    return { score: 900, field: null };
  }

  if (entity.startsWith(q)) return { score: 10, field: 'entity' };
  const words = entity.split(/[\s\-_/]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return { score: 20, field: 'entity' };
  if (entity.includes(q)) return { score: 30, field: 'entity' };
  if (digits.length >= 3) {
    if (phoneDigits.includes(digits)) return { score: 40, field: 'phone' };
    if (abnDigits.includes(digits)) return { score: 41, field: 'abn' };
  }
  if (String(c.email || '')
    .toLowerCase()
    .includes(q)) {
    return { score: 50, field: 'email' };
  }
  return { score: 900, field: null };
}

async function listClients(user, query = {}) {
  await ensureV4Migration();
  // Heal manager links occasionally — not on every page load.
  await maybeHealManagers();
  const settings = await getSettings();
  const { lifecycle, bas } = splitStatusQuery(query);
  const filter = await clientFilterQuery(user, query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const q = query.q ? String(query.q).trim() : '';
  // Search ranking + BAS filter need the full set; plain list uses DB pagination.
  const needsFullScan = Boolean(bas || q);

  let list;
  let total;
  if (needsFullScan) {
    list = await PracticeClient.find(filter).select(CLIENT_LEAN_SELECT).sort({ entity: 1 }).lean();
    // BAS filter uses denormalized client.bas (kept in sync on writes).
    if (bas) {
      const curQ = settings.currentQuarter;
      list = list.filter((c) => c.bas?.[curQ] === bas);
    }
    if (q) {
      list = list
        .map((c) => ({ c, rank: rankClientSearch(c, q) }))
        .filter((x) => x.rank.score < 900)
        .sort((a, b) => a.rank.score - b.rank.score || String(a.c.entity).localeCompare(String(b.c.entity)))
        .map((x) => x.c);
    }
    total = list.length;
    list = list.slice((page - 1) * limit, page * limit);
  } else {
    const [rows, count] = await Promise.all([
      PracticeClient.find(filter)
        .select(CLIENT_LEAN_SELECT)
        .sort({ entity: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PracticeClient.countDocuments(filter),
    ]);
    list = rows;
    total = count;
  }

  const items = list.map((c) => ({
    ...serializeClient(c),
    canEdit: canEditClient(user, c),
    isMine: canEditClient(user, c) && !isFullAccessUser(user),
    searchMatch: q ? rankClientSearch(c, q) : undefined,
  }));
  const [activeCount, inactiveCount] = await Promise.all([
    PracticeClient.countDocuments({ status: 'Active' }),
    PracticeClient.countDocuments({ status: 'Inactive' }),
  ]);
  return {
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    status: lifecycle,
    counts: { active: activeCount, inactive: inactiveCount, all: activeCount + inactiveCount },
    currentQuarter: settings.currentQuarter,
    currentQuarterLabel: curLabel(settings),
  };
}

async function getClient(user, id) {
  const c = await PracticeClient.findById(id).lean();
  if (!c) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  // All roles can view any client (including Inactive); editing is gated by canEdit.
  const settings = await getSettings();
  await hydrateClientsForWorkingYear([c], settings);
  await attachLodgementYears(c, settings);
  let group = null;
  let members = [];
  if (c.groupId) {
    group = await PracticeGroup.findById(c.groupId).lean();
    members = await PracticeClient.find({ groupId: c.groupId, ...ACTIVE }).lean();
    await hydrateClientsForWorkingYear(members, settings);
  }
  const [{ runs }, periodsPayload] = await Promise.all([
    loadRuns([c], settings),
    listPeriods(settings, { enrich: false }),
  ]);
  const canEdit = canEditClient(user, c);
  const canEditPayroll = canManagePayrollClient(user, c);
  const memberSerialized = members.map(serializeClient);
  const managers = [...new Set(memberSerialized.map((m) => m.managerName).filter(Boolean))];
  return {
    client: { ...serializeClient(c), canEdit },
    group: group
      ? {
          id: String(group._id),
          name: group.name,
          clients: memberSerialized.length,
          managers,
          split: managers.length > 1,
        }
      : null,
    members: memberSerialized,
    runs: runs.slice(0, 12).map((run) => ({ ...run, canEdit: canEditPayroll })),
    meta: {
      workingFy: settings.workingFy || settings.activeFy,
      currentQuarter: settings.currentQuarter,
      currentQuarterLabel: curLabel(settings),
      quarters: settings.quarters,
      periods: periodsPayload.periods,
      annualType: annualType(c),
      exitReasons: EXIT_REASONS,
      relationshipLabels: REL_LABELS,
      feeOverdue: c.pkg === 'On Package' && monthsSince(c.feeReview) >= settings.feeReviewMonths,
      payrollGap: payrollGap(c),
      payrollUnderBilled: payrollUnderBilled(c, settings.payrollRate),
      owing: payOwing(c, settings.currentQuarter),
      canEdit,
      canEditPayroll,
    },
  };
}

async function createClient(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Only admin/owner can add clients and assign them to staff/managers');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const curQ = settings.currentQuarter;
  const today = dstr(todayFromSettings(settings));
  const resolved = await resolveManager(body.managerId, body.managerName);
  const managerId = resolved.managerId;
  const managerName = resolved.managerName;
  if (!managerId) {
    const err = new Error(
      managerName
        ? `Manager "${managerName}" does not match a Team member — use a name from Team (Client managers = Team members)`
        : 'Client manager is required — pick a team member'
    );
    err.status = 400;
    throw err;
  }
  const gst = !!body.gst;
  const type = normalizeStructure(body.type);
  const bas = basForGst(null, gst, curQ);
  const payroll = !!body.payroll;
  const payFirstDate = payroll
    ? parseFlexibleDate(body.payFirstDate || body.firstPayDate) || null
    : null;
  const payrollFreq = payroll
    ? String(body.payrollFreq || body.payCycle || 'Fortnightly').trim() || 'Fortnightly'
    : null;
  const employees = payroll
    ? Number(body.payrollBilled ?? body.employees) || 0
    : 0;
  let payrollMgrId = payroll ? body.payrollMgrId || null : null;
  let payrollMgr = payroll ? body.payrollMgr || null : null;
  if (payroll && (body.payrollManager || body.payrollMgrName) && !payrollMgrId) {
    const payResolved = await resolveManager(null, body.payrollManager || body.payrollMgrName);
    if (payResolved.managerId) {
      payrollMgrId = payResolved.managerId;
      payrollMgr = payResolved.managerName;
    }
  }
  if (payroll && !payrollMgrId) {
    payrollMgrId = managerId;
    payrollMgr = managerName;
  }
  const doc = await PracticeClient.create({
    entity: String(body.entity || '').trim().toUpperCase(),
    abn: body.abn || '',
    type,
    status: 'Active',
    exit: null,
    software: normalizeSoftware(body.software),
    pkg: body.pkg || 'Non Package',
    fee: body.pkg === 'On Package' ? Number(body.fee) || 0 : null,
    freq: body.pkg === 'On Package' ? body.freq || 'Monthly' : null,
    pay: body.pkg === 'On Package' ? 'Pay Advantage' : null,
    gst,
    payroll,
    qb: normalizeQb(body.qb),
    email: body.email || '',
    phone: body.phone || '',
    managerId,
    managerName,
    payrollMgrId,
    payrollMgr,
    groupId: body.groupId || null,
    bas,
    annual: 'Not Started',
    payq: { q1: 'Not Paid', q2: 'Not Paid', q3: 'Not Paid', q4: 'Not Paid' },
    feeReview: today,
    payrollBilled: employees,
    payrollActual: payroll ? Number(body.payrollActual) || employees : 0,
    payrollFreq,
    payFirstDate,
    payLag: body.payLag ?? 3,
    isNewClient: true,
    notes: body.note
      ? [{ type: 'info', text: body.note, author: actorName(user), date: today }]
      : [],
    activity: [
      {
        date: today,
        who: actorName(user),
        action: `Client added as ${type} (${annualType({ type })}) and allocated to ${managerName || 'unassigned'}`,
      },
    ],
  });
  await ensureClientPeriodStatuses(doc.toObject(), settings.workingFy || settings.activeFy);
  invalidateScopeCache();
  return serializeClient(doc.toObject());
}

async function updateClient(user, id, body) {
  const c = await PracticeClient.findById(id);
  if (!c) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  if (!canEditClient(user, c)) {
    const err = new Error('You can view this client but only edit clients assigned to you');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const curQ = settings.currentQuarter;
  const today = dstr(todayFromSettings(settings));
  const who = actorName(user);
  await ensureClientPeriodStatuses(c.toObject(), settings.workingFy || settings.activeFy);
  const workingFy = settings.workingFy || settings.activeFy;
  const touchedPeriodIds = [];
  for (const qk of QKEYS) {
    if (body.bas?.[qk] !== undefined || body.payq?.[qk] !== undefined || body.inv?.[qk] !== undefined) {
      touchedPeriodIds.push(periodId(workingFy, 'bas', qk));
    }
  }
  if (body.annual !== undefined) touchedPeriodIds.push(periodId(workingFy, 'annual'));
  await assertPeriodsWritable(touchedPeriodIds);

  const prevGst = !!c.gst;
  const prevPayroll = !!c.payroll;
  const prevType = c.type;
  const prevFeeReview = c.feeReview || null;
  const prevPayrollMgr = c.payrollMgr || null;
  const prevPayrollMgrId = c.payrollMgrId ? String(c.payrollMgrId) : null;

  const allowed = [
    'entity', 'abn', 'pkg', 'fee', 'freq', 'gst', 'payroll',
    'email', 'phone', 'feeReview', 'payrollBilled', 'payrollActual',
    'payrollFreq', 'payFirstDate', 'payLag', 'relLabel', 'isNewClient',
  ];
  for (const k of allowed) {
    if (body[k] !== undefined) c[k] = body[k];
  }
  if (body.payFirstDate !== undefined) {
    c.payFirstDate = body.payFirstDate ? parseFlexibleDate(body.payFirstDate) || null : null;
  }
  if (body.type !== undefined) c.type = normalizeStructure(body.type);
  if (body.software !== undefined) c.software = normalizeSoftware(body.software);
  if (body.qb !== undefined) c.qb = normalizeQb(body.qb);

  applyLifecycleChange(user, c, body, today, who);

  if (body.gst !== undefined && !!c.gst !== prevGst) {
    c.bas = basForGst(c.bas ? c.bas.toObject?.() || c.bas : null, !!c.gst, curQ);
    c.markModified('bas');
    c.activity.push({
      date: today,
      who,
      action: c.gst
        ? 'GST registered - BAS created for the remaining quarters'
        : 'GST deregistered - outstanding BAS set to Not Required',
    });
  }

  if (body.payroll !== undefined && !!c.payroll !== prevPayroll) {
    if (c.payroll) {
      if (!c.payrollFreq) c.payrollFreq = body.payrollFreq || 'Fortnightly';
      if (body.payrollMgrId || body.payrollMgr) {
        const payMgr = await resolveManager(body.payrollMgrId, body.payrollMgr);
        c.payrollMgrId = payMgr.managerId || c.managerId || null;
        c.payrollMgr = payMgr.managerName || c.managerName || null;
      } else if (!c.payrollMgr) {
        c.payrollMgr = c.managerName || null;
        c.payrollMgrId = c.managerId || null;
      }
      c.activity.push({
        date: today,
        who,
        action: `Payroll service turned on (${c.payrollFreq}, ${c.payrollMgr || 'unassigned'})`,
      });
    } else {
      c.activity.push({ date: today, who, action: 'Payroll service turned off' });
    }
  }

  // Payroll manager assignment (Team members) — editable any time payroll is on
  if (
    c.payroll &&
    (body.payrollMgrId !== undefined || body.payrollMgr !== undefined) &&
    !(body.payroll !== undefined && !!c.payroll !== prevPayroll) &&
    !(typeof body.activitySummary === 'string' && body.activitySummary.trim())
  ) {
    const payMgr = await resolveManager(
      body.payrollMgrId !== undefined ? body.payrollMgrId : c.payrollMgrId,
      body.payrollMgr !== undefined ? body.payrollMgr : c.payrollMgr
    );
    if (payMgr.managerId) {
      c.payrollMgrId = payMgr.managerId;
      c.payrollMgr = payMgr.managerName;
      if (
        String(prevPayrollMgrId || '') !== String(payMgr.managerId) ||
        String(prevPayrollMgr || '') !== String(payMgr.managerName)
      ) {
        c.activity.push({ date: today, who, action: `Payroll manager set to ${c.payrollMgr}` });
      }
    }
  } else if (
    c.payroll &&
    (body.payrollMgrId !== undefined || body.payrollMgr !== undefined) &&
    !(body.payroll !== undefined && !!c.payroll !== prevPayroll)
  ) {
    const payMgr = await resolveManager(
      body.payrollMgrId !== undefined ? body.payrollMgrId : c.payrollMgrId,
      body.payrollMgr !== undefined ? body.payrollMgr : c.payrollMgr
    );
    if (payMgr.managerId) {
      c.payrollMgrId = payMgr.managerId;
      c.payrollMgr = payMgr.managerName;
    }
  }

  if (body.type !== undefined && c.type !== prevType) {
    c.activity.push({
      date: today,
      who,
      action: `Structure changed from ${prevType} to ${c.type} - annual return is now ${annualType(c)}`,
    });
  }

  if ((body.managerId !== undefined || body.managerName !== undefined) && isFullAccessUser(user)) {
    const resolved = await resolveManager(
      body.managerId !== undefined ? body.managerId : c.managerId,
      body.managerName !== undefined ? body.managerName : c.managerName
    );
    if (!resolved.managerId) {
      const err = new Error('Client manager is required — pick a team member');
      err.status = 400;
      throw err;
    }
    const prev = c.managerName || 'unassigned';
    c.managerId = resolved.managerId;
    c.managerName = resolved.managerName;
    if (String(prev) !== String(c.managerName) || body.managerId !== undefined) {
      c.activity.push({ date: today, who, action: `Reallocated to ${c.managerName}` });
    }
  } else if ((body.managerId !== undefined || body.managerName !== undefined) && !isFullAccessUser(user)) {
    const err = new Error('Only admin/owner can assign clients to staff/managers');
    err.status = 403;
    throw err;
  }
  if (body.bas && typeof body.bas === 'object') {
    for (const qk of QKEYS) {
      if (body.bas[qk] !== undefined) {
        c.bas[qk] = body.bas[qk];
        c.markModified('bas');
        c.activity.push({ date: today, who, action: `BAS ${qk} set to ${body.bas[qk]}` });
      }
    }
  }
  // Invoice numbers are applied first so a payment + its invoice can arrive in one request.
  const mergedInv = { ...(c.inv || {}) };
  if (body.inv && typeof body.inv === 'object') {
    for (const qk of QKEYS) {
      if (body.inv[qk] !== undefined) mergedInv[qk] = normalizeInvoice(body.inv[qk]);
    }
  }
  if (body.payq && typeof body.payq === 'object') {
    for (const qk of QKEYS) {
      if (body.payq[qk] !== undefined) assertInvoiceForPayment(body.payq[qk], mergedInv[qk]);
    }
  }
  if (body.inv && typeof body.inv === 'object') {
    c.inv = mergedInv;
    c.markModified('inv');
  }
  if (body.payq && typeof body.payq === 'object') {
    for (const qk of QKEYS) {
      if (body.payq[qk] !== undefined) {
        c.payq[qk] = body.payq[qk];
        c.markModified('payq');
        const invRef = mergedInv[qk] ? ` (invoice ${mergedInv[qk]})` : '';
        c.activity.push({ date: today, who, action: `Payment ${qk} set to ${body.payq[qk]}${invRef}` });
      }
    }
  }
  if (body.feeReview !== undefined && String(body.feeReview) !== String(prevFeeReview || '')) {
    c.activity.push({
      date: today,
      who,
      action: `Package fee marked reviewed (${body.feeReview})`,
    });
  }
  if (body.note) {
    c.notes.push({
      type: body.noteType === 'warning' ? 'warning' : 'info',
      text: body.note,
      author: who,
      date: today,
    });
  }
  if (body.groupId !== undefined && isFullAccessUser(user)) {
    c.groupId = body.groupId || null;
  }
  if (typeof body.activitySummary === 'string' && body.activitySummary.trim()) {
    c.activity.push({
      date: today,
      who,
      action: body.activitySummary.trim(),
    });
  }
  await updateClientPeriods({ client: c, settings, body, today });
  await c.save();
  invalidateScopeCache();
  return { ...serializeClient(c.toObject()), canEdit: true };
}

async function getAllocation(user) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const curQ = settings.currentQuarter;
  const clients = await scopeClients(user);
  const by = {};
  for (const c of clients) {
    const key = c.managerName || 'Unassigned';
    if (!by[key]) by[key] = { managerName: key, managerId: c.managerId ? String(c.managerId) : null, clients: 0, onPackage: 0, fees: 0, basOutstanding: 0 };
    by[key].clients++;
    if (c.pkg === 'On Package') {
      by[key].onPackage++;
      by[key].fees += c.fee || 0;
    }
    if (c.gst && c.bas?.[curQ] === 'Not Completed') by[key].basOutstanding++;
  }
  return { rows: Object.values(by).sort((a, b) => b.clients - a.clients), currentQuarterLabel: curLabel(settings) };
}

async function listGroups(user) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const groups = await PracticeGroup.find({ active: true }).lean();
  const clients = await PracticeClient.find({ ...ACTIVE, groupId: { $ne: null } })
    .select(CLIENT_LEAN_SELECT)
    .lean();
  // Groups only need bas/annual from denormalized client fields.
  const directorConflicts = [];

  const rows = groups.map((g) => {
    const ms = clients.filter((c) => String(c.groupId) === String(g._id));
    const managers = [...new Set(ms.map((m) => m.managerName).filter(Boolean))];
    const fees = ms.filter((m) => m.pkg === 'On Package').reduce((s, m) => s + (m.fee || 0), 0);
    const basOut = ms.filter((m) => m.gst && m.bas?.[settings.currentQuarter] === 'Not Completed').length;
    const gaps = [];
    const ents = ms.filter((m) => !isPersonStructure(m.type));
    const inds = ms.filter((m) => isPersonStructure(m.type));
    if (inds.length === 0) gaps.push('No individual returns');
    else if (inds.filter((i) => i.annual !== 'Not Required').length === 0) gaps.push('Individual returns not with us');
    if (ents.filter((e) => e.pkg === 'On Package').length === 0 && ents.length) gaps.push('No entity on a package');
    if (ents.filter((e) => e.payroll).length === 0 && ents.length) gaps.push('No payroll service');
    if (ms.filter((m) => m.type === 'Trust').length === 0) gaps.push('No trust structure');

    for (const e of ents) {
      for (const i of inds) {
        if (String(e.managerName || '') !== String(i.managerName || '')) {
          directorConflicts.push({
            groupId: String(g._id),
            groupName: g.name,
            entity: {
              id: String(e._id),
              entity: e.entity,
              managerName: e.managerName || 'unassigned',
              managerId: e.managerId ? String(e.managerId) : null,
            },
            person: {
              id: String(i._id),
              entity: i.entity,
              managerName: i.managerName || 'unassigned',
              managerId: i.managerId ? String(i.managerId) : null,
              relLabel: i.relLabel || null,
            },
          });
        }
      }
    }

    return {
      id: String(g._id),
      name: g.name,
      clients: ms.length,
      types: [...new Set(ms.map((m) => m.type))],
      typeLabel: typeCountLabel(ms),
      managers,
      split: managers.length > 1,
      gaps,
      fees,
      basOutstanding: basOut,
      members: ms.map(serializeClient),
    };
  });

  const withMembers = rows.filter((r) => r.clients > 0);
  return {
    rows: withMembers,
    directorConflicts,
    summary: {
      groupCount: withMembers.length,
      splitCount: withMembers.filter((r) => r.split).length,
      conflictCount: directorConflicts.length,
    },
    currentQuarter: settings.currentQuarter,
    currentQuarterLabel: curLabel(settings),
  };
}

async function createGroup(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const g = await PracticeGroup.create({ name: String(body.name || '').trim() });
  return { id: String(g._id), name: g.name };
}

/** Admin / owner / manager: rename an existing group. */
async function renameGroup(user, groupId, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Only admin or manager can rename groups');
    err.status = 403;
    throw err;
  }
  const name = String(body?.name || '').trim();
  if (!name) {
    const err = new Error('Group name is required');
    err.status = 400;
    throw err;
  }
  if (name.length > 120) {
    const err = new Error('Group name is too long');
    err.status = 400;
    throw err;
  }
  const g = await PracticeGroup.findById(groupId);
  if (!g || g.active === false) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }
  const prev = g.name;
  g.name = name;
  await g.save();
  return { id: String(g._id), name: g.name, previousName: prev };
}

/** Admin: link related clients into a group (creates group if host has none). */
async function linkGroup(user, body) {
  if (!isFullAccessRole(user.role)) {
    const err = new Error('Only admin can manage relationships');
    err.status = 403;
    throw err;
  }
  const hostId = body.hostId;
  const targetId = body.targetId;
  if (!hostId || !targetId) {
    const err = new Error('hostId and targetId are required');
    err.status = 400;
    throw err;
  }
  if (String(hostId) === String(targetId)) {
    const err = new Error('Cannot link a client to itself');
    err.status = 400;
    throw err;
  }

  const host = await PracticeClient.findById(hostId);
  const target = await PracticeClient.findById(targetId);
  if (!host || !target) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  if ((host.status || 'Active') !== 'Active' || (target.status || 'Active') !== 'Active') {
    const err = new Error('Only active clients can be linked');
    err.status = 400;
    throw err;
  }

  const settings = await getSettings();
  const today = dstr(todayFromSettings(settings));
  const who = actorName(user);
  const relLabel = normalizeRelLabel(body.relLabel);
  let group;

  if (!host.groupId) {
    group = await PracticeGroup.create({ name: suggestGroupName(host) });
    host.groupId = group._id;
    if (!host.relLabel) {
      host.relLabel = isPersonStructure(host.type) ? 'Primary contact' : 'Primary entity';
    }
  } else {
    group = await PracticeGroup.findById(host.groupId);
    if (!group) {
      group = await PracticeGroup.create({ name: suggestGroupName(host) });
      host.groupId = group._id;
    }
  }

  if (target.groupId && String(target.groupId) !== String(host.groupId)) {
    const err = new Error(`${target.entity} is already in another group — unlink them first`);
    err.status = 400;
    throw err;
  }

  target.groupId = host.groupId;
  target.relLabel = relLabel;

  host.activity.push({
    date: today,
    who,
    action: `${target.entity} linked to this group as ${relLabel}`,
  });
  target.activity.push({
    date: today,
    who,
    action: `Linked to ${group.name} as ${relLabel}`,
  });

  await host.save();
  await target.save();

  const members = await PracticeClient.find({ groupId: host.groupId, ...ACTIVE }).lean();
  return {
    group: { id: String(group._id), name: group.name },
    host: serializeClient(host.toObject ? host.toObject() : host),
    target: serializeClient(target.toObject ? target.toObject() : target),
    members: members.map(serializeClient),
  };
}

/**
 * Admin: consolidate related clients under one Team member as client manager.
 * Body: { entityId, personId } moves person to entity's manager,
 * or { groupId, managerId } reassigns the whole group.
 */
async function consolidateGroup(user, body) {
  if (!isFullAccessRole(user.role)) {
    const err = new Error('Only admin can consolidate group managers');
    err.status = 403;
    throw err;
  }

  const settings = await getSettings();
  const today = dstr(todayFromSettings(settings));
  const who = actorName(user);
  let targets = [];
  let resolved;

  if (body.groupId && (body.managerId || body.managerName)) {
    resolved = await resolveManager(body.managerId, body.managerName);
    if (!resolved.managerId) {
      const err = new Error('Target manager must be a Team member');
      err.status = 400;
      throw err;
    }
    targets = await PracticeClient.find({ groupId: body.groupId, ...ACTIVE });
  } else if (body.entityId && body.personId) {
    const entity = await PracticeClient.findById(body.entityId);
    const person = await PracticeClient.findById(body.personId);
    if (!entity || !person) {
      const err = new Error('Client not found');
      err.status = 404;
      throw err;
    }
    resolved = await resolveManager(entity.managerId, entity.managerName);
    if (!resolved.managerId) {
      const err = new Error('Entity client manager must be a Team member');
      err.status = 400;
      throw err;
    }
    targets = [entity, person];
  } else {
    const err = new Error('Provide entityId+personId or groupId+managerId');
    err.status = 400;
    throw err;
  }

  for (const c of targets) {
    const prev = c.managerName || 'unassigned';
    if (String(c.managerId || '') === String(resolved.managerId)) continue;
    c.managerId = resolved.managerId;
    c.managerName = resolved.managerName;
    c.activity.push({
      date: today,
      who,
      action: `Reallocated from ${prev} to ${resolved.managerName} to consolidate the family group`,
    });
    await c.save();
  }

  const groupId = body.groupId || targets[0]?.groupId;
  if (groupId) {
    const fakeUser = { role: 'manager', _id: user._id, name: user.name };
    const data = await listGroups(fakeUser);
    const row = (data.rows || []).find((r) => r.id === String(groupId));
    return {
      managerName: resolved.managerName,
      managerId: String(resolved.managerId),
      updated: targets.length,
      group: row || null,
      directorConflicts: data.directorConflicts || [],
      summary: data.summary,
    };
  }

  return {
    managerName: resolved.managerName,
    managerId: String(resolved.managerId),
    updated: targets.length,
  };
}

async function getPayments(user, query = {}) {
  const settings = await getSettings();
  const curQ = settings.currentQuarter;
  const ci = qIndex(curQ);
  const allScoped = await scopeClients(user);
  const book = allScoped.filter(payTrack);
  const f = query.filter || 'all';
  const exposureRows = exposure(allScoped, curQ);
  const lodgedUnpaidIds = new Set(exposureRows.map((r) => r.clientId));
  const lodgedUnpaidTotal = exposureRows.reduce((t, r) => t + (r.amt || 0), 0);

  let expected = 0;
  let collected = 0;
  let dueNow = 0;
  let overdueTotal = 0;
  const overdueIds = new Set();
  for (const c of book) {
    const exp = payExpected(c);
    expected += exp;
    const st = payStatus(c, curQ);
    if (st === 'Paid') collected += exp;
    else if (st === 'Part Paid') {
      collected += Math.round(exp / 2);
      dueNow += Math.round(exp / 2);
    } else if (st === 'Not Paid' || st === 'Due') {
      dueNow += exp;
    }
    for (let i = 0; i < ci; i++) {
      const pst = c.payq?.[QKEYS[i]];
      if (pst !== 'Paid') {
        overdueIds.add(String(c._id));
        overdueTotal += pst === 'Part Paid' ? Math.round(exp / 2) : exp;
      }
    }
  }

  let clients = book.filter((c) => {
    if (f === 'unpaid') return payStatus(c, curQ) !== 'Paid';
    if (f === 'due') return payStatus(c, curQ) === 'Due' || payStatus(c, curQ) === 'Not Paid';
    if (f === 'overdue') return overdueIds.has(String(c._id));
    if (f === 'unreconciled') return !c.recon?.[curQ];
    if (f === 'lodged-unpaid') return lodgedUnpaidIds.has(String(c._id));
    return true;
  });

  const feeStale = allScoped
    .filter((c) => c.pkg === 'On Package' && c.fee && monthsSince(c.feeReview) >= settings.feeReviewMonths)
    .sort((a, b) => monthsSince(b.feeReview) - monthsSince(a.feeReview));

  const packageMonthly = book.reduce((t, c) => t + monthlyFee(c), 0);
  const staleMonthly = feeStale.reduce((t, c) => t + monthlyFee(c), 0);

  const gaps = allScoped
    .filter((c) => payrollGap(c) > 0)
    .sort((a, b) => payrollGap(b) - payrollGap(a));
  const gapsMonthly = gaps.reduce((t, c) => t + payrollUnderBilled(c, settings.payrollRate), 0);

  return {
    isFirm: isFirmRole(user),
    currentQuarter: curQ,
    currentQuarterLabel: curLabel(settings),
    quarters: settings.quarters,
    filter: f,
    feeReviewMonths: settings.feeReviewMonths,
    payrollRate: settings.payrollRate,
    kpis: {
      collected,
      expected,
      outstanding: expected - collected,
      dueNow,
      overdueTotal,
      overdueClients: overdueIds.size,
      unreconciled: book.filter((c) => !c.recon?.[curQ]).length,
      staleFees: feeStale.length,
      staleFeeTotal: staleMonthly,
      packageMonthly,
      packageCount: book.length,
      lodgedUnpaidCount: lodgedUnpaidIds.size,
      lodgedUnpaidQuarters: exposureRows.length,
      lodgedUnpaidTotal,
    },
    items: clients.slice(0, 80).map((c) => ({
      ...serializeClient(c),
      owing: payOwing(c, curQ),
      expectedQ: payExpected(c),
      payStatuses: Object.fromEntries(QKEYS.map((k) => [k, payStatus(c, k)])),
      payRaw: Object.fromEntries(QKEYS.map((k) => [k, c.payq?.[k] || 'Not Paid'])),
      invoices: Object.fromEntries(QKEYS.map((k) => [k, (c.inv && c.inv[k]) || null])),
      invoice: (c.inv && c.inv[curQ]) || null,
      lastRecon: c.recon?.[curQ] || null,
      feeOverdue: monthsSince(c.feeReview) >= settings.feeReviewMonths,
      monthsSinceReview: monthsSince(c.feeReview),
      monthlyFee: monthlyFee(c),
    })),
    modeller: {
      packageCount: book.length,
      currentMonthly: packageMonthly,
      staleCount: feeStale.length,
      staleMonthly,
      stale: feeStale.slice(0, 40).map((c) => ({
        ...serializeClient(c),
        monthlyFee: monthlyFee(c),
        monthsSinceReview: monthsSince(c.feeReview),
      })),
    },
    billingGaps: {
      monthly: gapsMonthly,
      annual: gapsMonthly * 12,
      count: gaps.length,
      rate: settings.payrollRate,
      items: gaps.slice(0, 40).map((c) => ({
        ...serializeClient(c),
        gap: payrollGap(c),
        underBilled: payrollUnderBilled(c, settings.payrollRate),
      })),
    },
    stale: feeStale.slice(0, 40).map(serializeClient),
    exposure: exposureRows.slice(0, 40),
  };
}

function matchXeroRows(book, rows) {
  if (!rows.length) return { items: [], matched: 0, unmatched: 0 };
  const first = rows[0] || [];
  const looksLikeHeader = first.some((c) => /contact|abn|amount|customer|name|entity/i.test(String(c || '')));
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  const H = (looksLikeHeader ? first : ['Contact', 'ABN', 'Amount']).map(normHeader);
  const col = (names) => {
    for (let i = 0; i < H.length; i++) {
      if (names.includes(H[i])) return i;
    }
    return -1;
  };
  const iName = col(['contact', 'customer', 'contactname', 'client', 'entityname', 'name', 'entity']);
  const iAbn = col(['abn']);
  const iAmt = col(['amount', 'amountpaid', 'total', 'paid', 'payment']);
  const iInv = col(['invoice', 'invoicenumber', 'invoiceno', 'reference', 'ref']);

  const byAbn = {};
  const byName = {};
  for (const c of book) {
    if (c.abn) byAbn[String(c.abn).replace(/\s/g, '')] = c;
    byName[String(c.entity || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')] = c;
  }

  const acc = {};
  for (const row of dataRows) {
    if (!row) continue;
    const cells = Array.isArray(row)
      ? row
      : [row.contact || row.entity || '', row.abn || '', row.amount, row.invoice || row.invoiceNo || ''];
    const nm = iName > -1 ? String(cells[iName] || '').trim() : String(row.contact || row.entity || '').trim();
    const ab = iAbn > -1
      ? String(cells[iAbn] || '').replace(/\s/g, '')
      : String(row.abn || '').replace(/\s/g, '');
    const amtRaw = iAmt > -1 ? cells[iAmt] : row.amount;
    const amt = Number(String(amtRaw ?? '').replace(/[^0-9.\-]/g, '')) || 0;
    const invoice = normalizeInvoice(
      iInv > -1 ? cells[iInv] : row.invoice || row.invoiceNo || row.invoiceNumber || ''
    );
    if (!nm && !ab) continue;
    const c = (ab && byAbn[ab]) || byName[nm.toUpperCase().replace(/[^A-Z0-9]/g, '')] || null;
    const key = c ? `c${c._id}` : `u:${nm || ab}`;
    if (!acc[key]) acc[key] = { client: c, name: nm || ab, amount: 0, rows: 0, invoice: '' };
    acc[key].amount += amt;
    acc[key].rows++;
    if (invoice) acc[key].invoice = invoice;
  }

  const items = [];
  let matched = 0;
  let unmatched = 0;
  for (const a of Object.values(acc)) {
    if (a.client) {
      const exp = payExpected(a.client);
      a.expected = exp;
      a.result = a.amount >= exp * 0.99 ? 'Paid' : a.amount > 0 ? 'Part Paid' : 'Not Paid';
      a.clientId = String(a.client._id);
      a.entity = a.client.entity;
      matched++;
    } else {
      a.result = 'No matching client';
      a.expected = null;
      a.clientId = null;
      a.entity = a.name;
      unmatched++;
    }
    items.push({
      clientId: a.clientId,
      entity: a.entity,
      name: a.name,
      amount: a.amount,
      expected: a.expected,
      result: a.result,
      invoice: a.invoice || null,
      rows: a.rows,
      matched: !!a.client,
    });
  }
  items.sort((x, y) => Number(y.matched) - Number(x.matched));
  return { items, matched, unmatched };
}

async function previewXero(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const book = (await scopeClients(user)).filter(payTrack);
  let rows = body.rows || [];
  if (body.csvText) rows = parseXeroCsvText(body.csvText);
  const preview = matchXeroRows(book, rows);
  return {
    ...preview,
    currentQuarter: settings.currentQuarter,
    currentQuarterLabel: curLabel(settings),
  };
}

async function exportPaymentsCsv(user) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const curQ = settings.currentQuarter;
  const book = (await scopeClients(user)).filter(payTrack);
  const head = [
    'Entity Name',
    'ABN',
    'Client Manager',
    'Fee',
    'Frequency',
    'Expected per quarter',
    ...settings.quarters.map((q) => `Fee ${q.l}`),
    ...settings.quarters.map((q) => `Invoice ${q.l}`),
    'Owing',
    'Last reconciled',
  ];
  const lines = [head.join(',')];
  for (const c of book) {
    const lr = c.recon?.[curQ];
    lines.push(
      [
        c.entity,
        c.abn,
        c.managerName || '',
        c.fee || '',
        c.freq || '',
        payExpected(c),
        ...QKEYS.map((k) => c.payq?.[k] || ''),
        ...QKEYS.map((k) => (c.inv && c.inv[k]) || ''),
        payOwing(c, curQ),
        lr ? `${lr.src || 'Xero'} ${lr.date || ''}` : 'Never',
      ]
        .map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
  }
  return {
    csv: lines.join('\n'),
    filename: `nanak-payment-status-${curLabel(settings).replace(/\s/g, '')}.csv`,
    count: book.length,
  };
}

async function exportBillingGapsCsv(user) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const gaps = (await scopeClients(user))
    .filter((c) => payrollGap(c) > 0)
    .sort((a, b) => payrollGap(b) - payrollGap(a));
  const head = ['Entity Name', 'Manager', 'Billed for', 'Actually processing', 'Gap', 'Under-billed / mo'];
  const lines = [head.join(',')];
  for (const c of gaps) {
    lines.push(
      [
        c.entity,
        c.managerName || '',
        c.payrollBilled || 0,
        c.payrollActual || 0,
        payrollGap(c),
        payrollUnderBilled(c, settings.payrollRate),
      ]
        .map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
  }
  return {
    csv: lines.join('\n'),
    filename: 'nanak-payroll-billing-gaps.csv',
    count: gaps.length,
  };
}

async function updateCmSettings(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  if (body.reminderTemplate !== undefined) {
    settings.reminderTemplate = String(body.reminderTemplate || '').trim() || settings.reminderTemplate;
  }
  if (body.remindersEnabled !== undefined) {
    settings.remindersEnabled = Boolean(body.remindersEnabled);
  }
  if (body.feeReviewMonths !== undefined && isFullAccessUser(user)) {
    settings.feeReviewMonths = Number(body.feeReviewMonths) || settings.feeReviewMonths;
  }
  if (body.payrollRate !== undefined && isFullAccessUser(user)) {
    settings.payrollRate = Number(body.payrollRate) || settings.payrollRate;
  }
  if (body.onTimeThreshold !== undefined && isFullAccessUser(user)) {
    settings.onTimeThreshold = Number(body.onTimeThreshold) || settings.onTimeThreshold;
  }
  if (body.dueDateDefaults !== undefined && isFullAccessUser(user)) {
    const incoming = body.dueDateDefaults || {};
    const next = { ...(settings.dueDateDefaults?.toObject?.() || settings.dueDateDefaults || {}) };
    for (const key of ['q1', 'q2', 'q3', 'q4', 'annual']) {
      if (incoming[key]) {
        next[key] = {
          day: Number(incoming[key].day) || next[key]?.day,
          month: Number(incoming[key].month) || next[key]?.month,
        };
      }
    }
    settings.dueDateDefaults = next;
  }
  await settings.save();
  invalidateSettingsCache();
  return getMeta(user);
}

/** Pay runs are only generated for Active clients that actually have payroll switched on. */
function canManagePayrollClient(user, client) {
  if (isFirmRole(user)) return true;
  if (client.payrollMgrId && String(client.payrollMgrId) === String(user._id)) return true;
  return Boolean(
    client.payrollMgr &&
      user.name &&
      nameMatchRegex(user.name).test(String(client.payrollMgr).trim())
  );
}

async function loadPayrollRuns(user) {
  const settings = await getSettings();
  // Payroll is firm-visible. Ordinary staff can inspect every client's runs,
  // while mutation permissions are calculated per run below.
  const clients = await PracticeClient.find({ ...ACTIVE, payroll: true }).lean();
  const { runs, today } = await loadRuns(clients, settings);
  const clientById = new Map(clients.map((c) => [String(c._id), c]));
  const visibleRuns = runs.map((run) => ({
    ...run,
    canEdit: canManagePayrollClient(user, clientById.get(String(run.clientId)) || {}),
  }));
  return { settings, clients, runs: visibleRuns, today };
}

async function getPayroll(user, query = {}) {
  const { runs: list, today, clients, settings } = await loadPayrollRuns(user);
  const todayD = today instanceof Date ? today : new Date(today);
  const clientById = new Map(clients.map((c) => [String(c._id), c]));
  const enriched = list.map((r) => {
    const c = clientById.get(String(r.clientId)) || {};
    const wn = runWhen(r, todayD);
    const billed = c.payrollBilled || 0;
    const processed = r.employees;
    const over =
      processed !== null && processed !== undefined && Number(processed) > Number(billed);
    return {
      ...r,
      when: wn,
      payrollBilled: billed,
      payrollActual: c.payrollActual || 0,
      billingFlag: over,
      billingGap: over ? Number(processed) - Number(billed) : 0,
    };
  });

  const od = enriched.filter((r) => r.when === 'overdue');
  const td = enriched.filter((r) => r.when === 'today');
  const tm = enriched.filter((r) => r.when === 'tomorrow');
  const wk = enriched.filter((r) => r.when === 'week' || r.when === 'today' || r.when === 'tomorrow');
  const later = enriched.filter((r) => r.when === 'later');
  const flags = enriched.filter((r) => r.billingFlag);
  const stpB = stpBreaches(enriched);
  const superAction = filterSuperRuns(enriched, 'action');
  const superOd = enriched.filter((r) => r.superOverdue);
  const seen = {};
  let flagVal = 0;
  for (const r of flags) {
    const cid = String(r.clientId);
    if (!seen[cid]) {
      seen[cid] = 1;
      flagVal += (r.billingGap || 0) * (settings.payrollRate || 25);
    }
  }

  const f = query.filter || 'action';
  const sets = {
    action: [...od, ...td, ...tm, ...enriched.filter((r) => r.when === 'week')],
    overdue: od,
    today: td,
    tomorrow: tm,
    week: wk,
    stp: stpB,
    super: superAction,
    flags,
    later,
    upcoming: later,
    done: enriched.filter((r) => r.when === 'done'),
    all: enriched,
  };
  const filtered = sets[f] || sets.action;

  const weekStrip = [];
  for (let i = 0; i < 8; i++) {
    const day = addDays(todayD, i);
    const onDay = enriched.filter(
      (r) => r.status !== 'Completed' && dayDiff(r.pay, day) === 0
    );
    weekStrip.push({
      offset: i,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : WD[day.getDay()],
      date: dshort(day),
      count: onDay.length,
      filter: i === 0 ? 'today' : i === 1 ? 'tomorrow' : 'week',
    });
  }

  return {
    isFirm: isFirmRole(user),
    today: dstr(todayD),
    filter: f,
    payrollRate: settings.payrollRate,
    counts: {
      action: od.length + td.length + tm.length + enriched.filter((r) => r.when === 'week').length,
      overdue: od.length,
      today: td.length,
      tomorrow: tm.length,
      week: wk.length,
      upcoming: later.length,
      done: enriched.filter((r) => r.when === 'done').length,
      stp: stpB.length,
      super: superAction.length,
      flags: flags.length,
      all: enriched.length,
    },
    kpis: {
      overdue: od.length,
      todayTomorrow: td.length + tm.length,
      today: td.length,
      tomorrow: tm.length,
      stp: stpB.length,
      super: superOd.length,
      superDueSoon: superAction.length,
      billingFlagsMonthly: flagVal,
      billingFlagClients: Object.keys(seen).length,
    },
    weekStrip,
    items: filtered.slice(0, 80),
  };
}

/** Payday Super view: one row per pay run with its super deadline (pay date + 7 days). */
async function getSuper(user, query = {}) {
  const { runs, today } = await loadPayrollRuns(user);
  const f = query.filter || 'action';
  const items = filterSuperRuns(runs, f);
  const unpaid = runs.filter((r) => r.super !== 'Paid');
  const overdue = runs.filter((r) => r.superOverdue);
  const dueToday = unpaid.filter((r) => r.superWhen === 'today');
  const dueWeek = unpaid.filter((r) => r.superWhen === 'week');
  const paid = runs.filter((r) => r.super === 'Paid');
  return {
    isFirm: isFirmRole(user),
    today: dstr(today),
    filter: f,
    counts: {
      action: overdue.length + dueToday.length + dueWeek.length,
      overdue: overdue.length,
      today: dueToday.length,
      week: dueWeek.length,
      paid: paid.length,
      all: runs.length,
    },
    kpis: {
      totalRuns: runs.length,
      superPaid: paid.length,
      superUnpaid: unpaid.length,
      pastDeadline: overdue.length,
      dueToday: dueToday.length,
      dueThisWeek: dueWeek.length,
      clientsAtRisk: new Set(overdue.map((r) => r.clientId)).size,
      onTimePct: runs.length
        ? Math.round(((runs.length - overdue.length) / runs.length) * 1000) / 10
        : 100,
    },
    items: items.slice(0, 80).map((r) => ({ ...r, bucket: superBucket(r) })),
  };
}

async function updatePayrollRun(user, body) {
  const { clientId, payDate, status, stp } = body;
  const c = await PracticeClient.findById(clientId);
  if (!c) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const can = canManagePayrollClient(user, c);
  if (!can) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const today = dstr(todayFromSettings(settings));
  const existing = await PracticePayrollOverride.findOne({ clientId, payDate }).lean();
  const superOnly = body.super !== undefined && status === undefined && stp === undefined;
  const superStatus =
    body.super === 'Paid' ? 'Paid' : body.super === 'Not Paid' ? 'Not Paid' : existing?.super || 'Not Paid';
  const update = {
    status: status !== undefined ? status : existing?.status || (superOnly ? 'Not Started' : 'Completed'),
    stp: stp !== undefined ? stp : existing?.stp || (superOnly ? 'Not Lodged' : 'Lodged'),
    super: superStatus,
    employees:
      body.employees !== undefined
        ? Number(body.employees)
        : existing?.employees ?? (c.payrollActual || c.payrollBilled),
    by: actorName(user),
    on: today,
  };
  await PracticePayrollOverride.findOneAndUpdate(
    { clientId, payDate },
    { $set: update },
    { upsert: true, new: true }
  );
  c.activity.push({
    date: today,
    who: actorName(user),
    action: superOnly
      ? `Super for pay run ${payDate} marked ${update.super}`
      : `Payroll run ${payDate} marked ${update.status} / STP ${update.stp} / Super ${update.super}`,
  });
  await c.save();
  return { ok: true };
}

async function getLodgement(user) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const threshold = settings.onTimeThreshold;
  const clients = await scopeClients(user);
  // Lodgement stats use denormalized bas/onTime kept in sync on writes.
  const ls = lodgementStats(clients, settings);

  const managerNames = [...new Set(clients.map((c) => c.managerName || 'Unassigned'))];
  const byManager = managerNames
    .map((name) => {
      const list = clients.filter((c) => (c.managerName || 'Unassigned') === name);
      const stats = lodgementStats(list, settings);
      return {
        managerName: name,
        managerId: list.find((c) => c.managerId)?.managerId
          ? String(list.find((c) => c.managerId).managerId)
          : null,
        ...stats,
        clients: list.length,
        belowThreshold: stats.done > 0 && stats.pct < threshold,
      };
    })
    .sort((a, b) => a.pct - b.pct);

  const late = [];
  for (const c of clients) {
    for (const q of settings.quarters || []) {
      if (c.bas?.[q.k] === 'Completed' && c.onTime?.[q.k] === false) {
        late.push({
          clientId: String(c._id),
          entity: c.entity,
          managerName: c.managerName,
          quarter: q.l,
          lodged: c.lodged?.[q.k] || '-',
        });
      }
    }
  }
  return {
    stats: { ...ls, belowThreshold: ls.done > 0 && ls.pct < threshold },
    threshold,
    byManager,
    flagged: byManager.filter((m) => m.belowThreshold),
    late: late.slice(0, 50),
    currentQuarterLabel: curLabel(settings),
  };
}

async function getReminders(user, query = {}) {
  const settings = await getSettings();
  const curQ = settings.currentQuarter;
  const curQL = curLabel(settings);
  const remindersEnabled = settings.remindersEnabled !== false;
  const mode = query.mode === 'all' ? 'all' : 'due-gst';
  let clients = [];
  if (remindersEnabled) {
    const scoped = await scopeClients(user);
    clients =
      mode === 'all'
        ? scoped
        : scoped.filter((c) => c.gst && c.bas?.[curQ] === 'Not Completed');
  }
  return {
    currentQuarterLabel: curQL,
    template: settings.reminderTemplate,
    remindersEnabled,
    mode,
    isFirm: isFirmRole(user),
    items: clients.map((c) => ({
      ...serializeClient(c),
      message: settings.reminderTemplate
        .split('{name}')
        .join(c.entity)
        .split('{quarter}')
        .join(curQL),
    })),
  };
}

async function exportReminders(user, body) {
  const settings = await getSettings();
  if (settings.remindersEnabled === false) {
    const err = new Error('Reminders are turned off');
    err.status = 403;
    throw err;
  }
  const curQL = curLabel(settings);
  const today = dstr(todayFromSettings(settings));
  const ids = body.ids || [];
  const kind = body.kind === 'email' ? 'email' : 'sms';
  const clients = await PracticeClient.find({ _id: { $in: ids }, ...ACTIVE }).lean();
  const scoped = clients.filter((c) => isFirmRole(user) || String(c.managerId) === String(user._id));
  const rows = [];
  for (const c of scoped) {
    const msg = (body.template || settings.reminderTemplate)
      .split('{name}')
      .join(c.entity)
      .split('{quarter}')
      .join(curQL);
    if (kind === 'sms') rows.push([c.phone.replace(/\s/g, ''), c.entity, msg]);
    else rows.push([c.email, c.entity, msg]);
    await PracticeClient.updateOne(
      { _id: c._id },
      {
        $push: {
          activity: {
            date: today,
            who: actorName(user),
            action: `Included in BAS ${curQL} ${kind === 'sms' ? 'SMS' : 'email'} reminder export`,
          },
        },
      }
    );
  }
  const header = kind === 'sms' ? 'phone,name,message' : 'email,name,message';
  const csv = [header, ...rows.map((r) => r.map((x) => `"${String(x || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  return { csv, filename: `nanak-bas-reminders-${kind}-${curQL.replace(/\s/g, '')}.csv`, count: rows.length };
}

async function startFY(user, body) {
  if (!isFirmRole(user) || !isFullAccessRole(user.role)) {
    const err = new Error('Admin only');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const nextFy = body.fy || (() => {
    const [a] = String(settings.workingFy || settings.activeFy).split('-').map((x) => Number(x.length === 2 ? `20${x}` : x) || Number(x));
    const start = a < 100 ? 2000 + a : a;
    return `${String(start + 1).slice(-2)}-${String(start + 2).slice(-2)}`;
  })();
  const clients = await PracticeClient.find({}).lean();
  await ensurePeriodsForYear(nextFy, settings);
  await ensureClientPeriodStatuses(clients, nextFy, settings);
  return getMeta(user);
}

async function advanceQuarter(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const qKey = body.quarter || settings.currentQuarter;
  settings.currentQuarter = QKEYS.includes(qKey) ? qKey : settings.currentQuarter;
  await settings.save();
  invalidateSettingsCache();
  return getMeta(user);
}

async function setWorkingYear(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const fy = String(body.fy || '').trim();
  if (!(await PracticePeriod.exists({ financialYear: fy }))) {
    const err = new Error('Open this financial year before setting it as the working year');
    err.status = 400;
    throw err;
  }
  settings.workingFy = fy;
  settings.activeFy = fy;
  settings.quarters = periodDefinitions(fy, settings)
    .filter((period) => period.kind === 'bas')
    .map((period) => ({ k: period.quarter, l: period.label, due: period.dueDate }));
  if (body.quarter && QKEYS.includes(body.quarter)) settings.currentQuarter = body.quarter;
  await settings.save();
  invalidateSettingsCache();
  return getMeta(user);
}

async function getPeriods(user) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  return listPeriods(settings);
}

async function lockCmPeriod(user, id, body) {
  const settings = await getSettings();
  return lockPeriod(user, id, body.confirm === true, dstr(todayFromSettings(settings)));
}

async function unlockCmPeriod(user, id) {
  const settings = await getSettings();
  return unlockPeriod(user, id, dstr(todayFromSettings(settings)));
}

async function updateCmPeriod(user, id, body) {
  if (!isFullAccessRole(user.role)) {
    const err = new Error('Admin only');
    err.status = 403;
    throw err;
  }
  const period = await PracticePeriod.findOne({ periodId: id });
  if (!period) {
    const err = new Error('Lodgement period not found');
    err.status = 404;
    throw err;
  }
  if (period.locked) {
    const err = new Error('Unlock the period before changing its due date');
    err.status = 403;
    throw err;
  }
  if (body.dueDate !== undefined) period.dueDate = String(body.dueDate || '').trim();
  await period.save();
  return { period: period.toObject() };
}

async function importClients(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Only admin/owner can import clients');
    err.status = 403;
    throw err;
  }
  const rows = body.rows || [];
  const created = [];
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const entity = String(row.entity || '').trim() || `(row ${i + 1})`;
    try {
      if (!String(row.managerName || row.managerId || '').trim()) {
        throw Object.assign(new Error('manager is required and must match a Team member'), { status: 400 });
      }
      const c = await createClient(user, row);
      created.push(c);
    } catch (e) {
      errors.push({
        row: i + 1,
        entity,
        reason: e?.message || 'Import failed',
      });
    }
  }
  return {
    created: created.length,
    failed: errors.length,
    errors,
    items: created,
    headers: CLIENT_CSV_HEADERS,
  };
}

async function exportClients(user) {
  const clients = await scopeClients(user);
  const ids = [...new Set(clients.map((c) => c.managerId).filter(Boolean).map(String))];
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select('_id name').lean()
    : [];
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  const lines = [CLIENT_CSV_HEADERS.join(',')];
  for (const c of clients) {
    const manager =
      (c.managerId && nameById.get(String(c.managerId))) || c.managerName || '';
    lines.push(
      [
        c.entity,
        c.abn,
        c.type,
        manager,
        c.pkg,
        c.fee || '',
        c.gst,
        c.payroll,
        c.payrollFreq || '',
        c.payFirstDate ? String(c.payFirstDate).slice(0, 10) : '',
        c.payrollBilled || '',
        c.payrollMgr || '',
        c.software || '',
        c.qb,
        c.email,
        c.phone,
      ]
        .map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
  }
  return {
    csv: lines.join('\n'),
    filename: 'nanak-clients-export.csv',
    count: clients.length,
    headers: CLIENT_CSV_HEADERS,
  };
}

async function applyFeeUplift(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const pct = Number(body.pct) || 5;
  const onlyStale = !!body.onlyStale;
  const settings = await getSettings();
  const today = dstr(todayFromSettings(settings));
  let clients = await PracticeClient.find({ ...ACTIVE, pkg: 'On Package' });
  if (onlyStale) {
    clients = clients.filter((c) => monthsSince(c.feeReview) >= settings.feeReviewMonths);
  }
  let n = 0;
  for (const c of clients) {
    c.fee = Math.round((c.fee || 0) * (1 + pct / 100));
    c.feeReview = today;
    c.activity.push({ date: today, who: actorName(user), action: `Fee uplifted by ${pct}% to $${c.fee}` });
    await c.save();
    n++;
  }
  return { updated: n };
}

async function reconcileXero(user, body) {
  if (!isFirmRole(user)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  const settings = await getSettings();
  const curQ = settings.currentQuarter;
  const currentPeriodId = periodId(settings.workingFy || settings.activeFy, 'bas', curQ);
  await assertPeriodsWritable([currentPeriodId]);
  const today = dstr(todayFromSettings(settings));

  // Prefer applying a reviewed preview payload (clientId + amount + result).
  let applyItems = Array.isArray(body.items) ? body.items.filter((i) => i && i.clientId) : null;
  if (!applyItems) {
    const book = (await scopeClients(user)).filter(payTrack);
    let rows = body.rows || [];
    if (body.csvText) rows = parseXeroCsvText(body.csvText);
    const preview = matchXeroRows(book, rows);
    applyItems = preview.items.filter((i) => i.matched);
  }

  let n = 0;
  const skipped = [];
  for (const row of applyItems) {
    const c = await PracticeClient.findById(row.clientId);
    if (!c || c.status === 'Inactive') continue;
    const amount = Number(row.amount) || 0;
    const expected = payExpected(c);
    let result = row.result;
    if (!result) {
      result = amount >= expected * 0.99 ? 'Paid' : amount > 0 ? 'Part Paid' : 'Not Paid';
    }
    const invoice =
      normalizeInvoice(row.invoice || row.invoiceNo || row.invoiceNumber) ||
      normalizeInvoice(c.inv?.[curQ]);
    if (PAID_STATUSES.includes(result) && !invoice) {
      skipped.push({ entity: c.entity, reason: INVOICE_REQUIRED_MESSAGE });
      continue;
    }
    c.payq[curQ] = result;
    if (invoice) {
      c.inv = { ...(c.inv || {}), [curQ]: invoice };
      c.markModified('inv');
    }
    c.recon[curQ] = {
      date: today,
      by: actorName(user),
      amount,
      invoice: invoice || null,
      src: 'Xero',
    };
    c.markModified('payq');
    c.markModified('recon');
    c.activity.push({
      date: today,
      who: actorName(user),
      action: `Payment reconciled against Xero for ${curLabel(settings)}: ${result} ($${amount} received)${
        invoice ? ` against invoice ${invoice}` : ''
      }`,
    });
    await ensureClientPeriodStatuses(c.toObject(), settings.workingFy || settings.activeFy);
    await ClientPeriodStatus.updateOne(
      { clientId: c._id, periodId: currentPeriodId },
      {
        $set: {
          feeStatus: result,
          invoiceNumber: invoice || null,
          reconciliation: {
            date: today,
            by: actorName(user),
            amount,
            invoice: invoice || null,
            src: 'Xero',
          },
        },
      }
    );
    await c.save();
    n++;
  }
  return { reconciled: n, skipped };
}

module.exports = {
  getMeta,
  getDashboard,
  listClients,
  getClient,
  createClient,
  updateClient,
  getAllocation,
  listGroups,
  createGroup,
  renameGroup,
  linkGroup,
  consolidateGroup,
  getPayments,
  getPayroll,
  getSuper,
  updatePayrollRun,
  getLodgement,
  getReminders,
  exportReminders,
  getPeriods,
  updateCmPeriod,
  lockCmPeriod,
  unlockCmPeriod,
  startFY,
  setWorkingYear,
  advanceQuarter,
  importClients,
  exportClients,
  applyFeeUplift,
  reconcileXero,
  previewXero,
  exportPaymentsCsv,
  exportBillingGapsCsv,
  updateCmSettings,
  getSettings,
  isFirmRole,
  canEditClient,
  serializeClient,
  scopeClients,
  payExpected,
  payOwing,
  monthlyFee,
  exposure,
  lodgementStats,
  curLabel,
  todayFromSettings,
  actorName,
  annualType,
  basForGst,
  normalizeStructure,
  normalizeSoftware,
  normalizeQb,
  assertInvoiceForPayment,
  ensureV4Migration,
  ACTIVE,
  INVOICE_REQUIRED_MESSAGE,
  EXIT_REASONS,
};
