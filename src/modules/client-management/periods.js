const PracticeClient = require('../../models/PracticeClient');
const PracticePeriod = require('../../models/PracticePeriod');
const ClientPeriodStatus = require('../../models/ClientPeriodStatus');
const PracticeSettings = require('../../models/PracticeSettings');
const { MN, dayDiff } = require('./dates');

const QKEYS = ['q1', 'q2', 'q3', 'q4'];

/** Calendar year offsets from FY start year for each due template key. */
const DUE_YEAR_OFFSET = { q1: 0, q2: 1, q3: 1, q4: 1, annual: 2 };

const STATUTORY_DEFAULTS = PracticeSettings.DEFAULT_DUE_DATE_DEFAULTS || {
  q1: { day: 28, month: 11 },
  q2: { day: 28, month: 2 },
  q3: { day: 26, month: 5 },
  q4: { day: 28, month: 8 },
  annual: { day: 15, month: 5 },
};

/** Past periods locked at go-live for FY 2025-26 (Sep / Dec / Mar). */
const MIGRATION_LOCK_PERIOD_IDS = ['2025-26|bas|q1', '2025-26|bas|q2', '2025-26|bas|q3'];

function fyStart(fy) {
  const raw = String(fy || '2025-26').split('-')[0];
  const n = Number(raw);
  return n < 100 ? 2000 + n : n;
}

function periodId(fy, kind, quarter = null) {
  return `${fy}|${kind}${quarter ? `|${quarter}` : ''}`;
}

function resolveDueTemplate(settings, key) {
  const fromSettings = settings?.dueDateDefaults?.[key];
  const fallback = STATUTORY_DEFAULTS[key];
  const day = Number(fromSettings?.day) || fallback.day;
  const month = Number(fromSettings?.month) || fallback.month;
  return { day, month };
}

function formatDueDate(fyStartYear, key, settings) {
  const tpl = resolveDueTemplate(settings, key);
  const year = fyStartYear + (DUE_YEAR_OFFSET[key] ?? 0);
  return `${tpl.day} ${MN[tpl.month - 1]} ${year}`;
}

function periodDefinitions(fy, settings = null) {
  const year = fyStart(fy);
  const yy = String(year).slice(-2);
  const next = String(year + 1).slice(-2);
  return [
    {
      periodId: periodId(fy, 'bas', 'q1'),
      financialYear: fy,
      kind: 'bas',
      quarter: 'q1',
      label: `Sep ${yy}`,
      dueDate: formatDueDate(year, 'q1', settings),
    },
    {
      periodId: periodId(fy, 'bas', 'q2'),
      financialYear: fy,
      kind: 'bas',
      quarter: 'q2',
      label: `Dec ${yy}`,
      dueDate: formatDueDate(year, 'q2', settings),
    },
    {
      periodId: periodId(fy, 'bas', 'q3'),
      financialYear: fy,
      kind: 'bas',
      quarter: 'q3',
      label: `Mar ${next}`,
      dueDate: formatDueDate(year, 'q3', settings),
    },
    {
      periodId: periodId(fy, 'bas', 'q4'),
      financialYear: fy,
      kind: 'bas',
      quarter: 'q4',
      label: `Jun ${next}`,
      dueDate: formatDueDate(year, 'q4', settings),
    },
    {
      periodId: periodId(fy, 'annual'),
      financialYear: fy,
      kind: 'annual',
      quarter: null,
      label: `FY ${fy} annual`,
      dueDate: formatDueDate(year, 'annual', settings),
    },
  ];
}

async function loadSettingsDoc(settings) {
  if (settings) return settings;
  return PracticeSettings.findOne({ singleton: 'default' }).lean();
}

const periodYearCache = new Map();

async function ensurePeriodsForYear(fy, settings = null) {
  const settingsDoc = await loadSettingsDoc(settings);
  const cacheKey = `${fy}|${JSON.stringify(settingsDoc?.dueDateDefaults || {})}`;
  if (periodYearCache.has(cacheKey)) return periodYearCache.get(cacheKey);

  const defs = periodDefinitions(fy, settingsDoc);
  await PracticePeriod.bulkWrite(
    defs.map((definition) => ({
      updateOne: {
        filter: { periodId: definition.periodId },
        update: { $setOnInsert: definition },
        upsert: true,
      },
    }))
  );
  const rows = await PracticePeriod.find({ financialYear: fy }).sort({ kind: 1, quarter: 1 }).lean();
  periodYearCache.set(cacheKey, rows);
  return rows;
}

function legacyStatusFor(client, period) {
  if (period.kind === 'annual') return client.annual || 'Not Started';
  return client.bas?.[period.quarter] || (client.gst ? 'Not Completed' : 'Not Required');
}

async function ensureClientPeriodStatuses(clients, fy, settings = null) {
  const rows = Array.isArray(clients) ? clients : [clients];
  if (!rows.length) return;
  const periods = await ensurePeriodsForYear(fy, settings);
  const clientIds = rows.map((client) => client._id);
  const periodIds = periods.map((period) => period.periodId);
  const existing = await ClientPeriodStatus.find({
    clientId: { $in: clientIds },
    periodId: { $in: periodIds },
  })
    .select('clientId periodId')
    .lean();
  const have = new Set(existing.map((row) => `${String(row.clientId)}|${row.periodId}`));

  const operations = [];
  for (const client of rows) {
    for (const period of periods) {
      const key = `${String(client._id)}|${period.periodId}`;
      if (have.has(key)) continue;
      operations.push({
        updateOne: {
          filter: { clientId: client._id, periodId: period.periodId },
          update: {
            $setOnInsert: {
              clientId: client._id,
              periodId: period.periodId,
              status: legacyStatusFor(client, period),
              lodgedOn: period.kind === 'bas' ? client.lodged?.[period.quarter] || null : null,
              onTime: period.kind === 'bas' ? client.onTime?.[period.quarter] ?? null : null,
              feeStatus: period.kind === 'bas' ? client.payq?.[period.quarter] || 'Not Paid' : 'Not Paid',
              invoiceNumber: period.kind === 'bas' ? client.inv?.[period.quarter] || null : null,
              reconciliation: period.kind === 'bas' ? client.recon?.[period.quarter] || null : null,
            },
          },
          upsert: true,
        },
      });
    }
  }
  if (operations.length) await ClientPeriodStatus.bulkWrite(operations, { ordered: false });
}

/**
 * Overlay working-FY period store onto client.bas / payq / annual.
 * @param {{ ensure?: boolean }} opts  ensure=true creates missing period rows (writes/migration only)
 */
async function hydrateClientsForWorkingYear(clients, settings, opts = {}) {
  const rows = Array.isArray(clients) ? clients : [clients];
  if (!rows.length) return rows;
  const fy = settings.workingFy || settings.activeFy;
  if (opts.ensure === true) {
    await ensureClientPeriodStatuses(rows, fy, settings);
  }
  const periodDocs = await PracticePeriod.find({ financialYear: fy }).select('periodId').lean();
  const periodIds = periodDocs.map((period) => period.periodId);
  if (!periodIds.length) {
    for (const client of rows) client.periodStatuses = [];
    return rows;
  }
  const statuses = await ClientPeriodStatus.find({
    clientId: { $in: rows.map((client) => client._id) },
    periodId: { $in: periodIds },
  }).lean();
  const byClient = new Map();
  for (const row of statuses) {
    const key = String(row.clientId);
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key).push(row);
  }
  for (const client of rows) {
    const periodRows = byClient.get(String(client._id)) || [];
    if (!periodRows.length) {
      // Fall back to legacy fields already on the client document.
      client.periodStatuses = [];
      continue;
    }
    const bas = {};
    const payq = {};
    const inv = {};
    const recon = {};
    const lodged = {};
    const onTime = {};
    for (const row of periodRows) {
      const parts = row.periodId.split('|');
      if (parts[1] === 'annual') {
        client.annual = row.status;
        continue;
      }
      const qk = parts[2];
      bas[qk] = row.status;
      payq[qk] = row.feeStatus;
      if (row.invoiceNumber) inv[qk] = row.invoiceNumber;
      if (row.reconciliation) recon[qk] = row.reconciliation;
      if (row.lodgedOn) lodged[qk] = row.lodgedOn;
      if (row.onTime !== null && row.onTime !== undefined) onTime[qk] = row.onTime;
    }
    client.bas = { ...(client.bas?.toObject?.() || client.bas || {}), ...bas };
    client.payq = { ...(client.payq?.toObject?.() || client.payq || {}), ...payq };
    client.inv = { ...(client.inv || {}), ...inv };
    client.recon = { ...(client.recon || {}), ...recon };
    client.lodged = { ...(client.lodged || {}), ...lodged };
    client.onTime = { ...(client.onTime || {}), ...onTime };
    client.periodStatuses = periodRows;
  }
  return rows;
}

/** Attach every FY's period statuses for the client profile Lodgements / previous-years view. */
async function attachLodgementYears(client, settings) {
  const years = await PracticePeriod.distinct('financialYear');
  // Backfill missing rows for this one client only (new clients / newly opened FYs).
  if (years.length) {
    await Promise.all(years.map((fy) => ensureClientPeriodStatuses(client, fy, settings)));
  }
  const [statusRows, periodDocs] = await Promise.all([
    ClientPeriodStatus.find({ clientId: client._id }).lean(),
    PracticePeriod.find({}).lean(),
  ]);
  const byId = new Map(periodDocs.map((period) => [period.periodId, period]));
  const byFy = new Map();
  for (const row of statusRows) {
    const period = byId.get(row.periodId);
    if (!period) continue;
    if (!byFy.has(period.financialYear)) {
      byFy.set(period.financialYear, {
        fy: period.financialYear,
        bas: [],
        annual: null,
      });
    }
    const bucket = byFy.get(period.financialYear);
    if (period.kind === 'annual') {
      bucket.annual = {
        periodId: period.periodId,
        label: period.label,
        status: row.status,
        dueDate: period.dueDate,
        locked: !!period.locked,
      };
    } else {
      bucket.bas.push({
        periodId: period.periodId,
        quarter: period.quarter,
        label: period.label,
        status: row.status,
        dueDate: period.dueDate,
        locked: !!period.locked,
        feeStatus: row.feeStatus,
        invoiceNumber: row.invoiceNumber,
      });
    }
  }
  const qOrder = { q1: 1, q2: 2, q3: 3, q4: 4 };
  client.lodgementYears = [...byFy.values()]
    .map((year) => ({
      ...year,
      bas: year.bas.sort((a, b) => (qOrder[a.quarter] || 9) - (qOrder[b.quarter] || 9)),
    }))
    .sort((a, b) => String(b.fy).localeCompare(String(a.fy)));
  return client;
}

async function lockMigrationPeriods() {
  await PracticePeriod.updateMany(
    { periodId: { $in: MIGRATION_LOCK_PERIOD_IDS }, locked: { $ne: true } },
    {
      $set: {
        locked: true,
        lockedBy: null,
        lockedByName: 'Migration',
        lockedAt: new Date(),
      },
    }
  );
}

async function ensurePeriodMigration(settings) {
  const fy = settings.workingFy || settings.activeFy || '2025-26';
  let dirty = false;
  if (!settings.workingFy) {
    settings.workingFy = fy;
    dirty = true;
  }
  if (!settings.dueDateDefaults || !settings.dueDateDefaults.q1) {
    settings.dueDateDefaults = { ...STATUTORY_DEFAULTS };
    dirty = true;
  }
  if (dirty) await settings.save();

  // After the first successful backfill, skip the heavy path entirely.
  if (settings.cmPeriodsReady) return;

  // Existing DBs (pre-flag) already have statuses — mark ready without re-scanning.
  const [clientCount, statusCount] = await Promise.all([
    PracticeClient.estimatedDocumentCount(),
    ClientPeriodStatus.estimatedDocumentCount(),
  ]);
  if (clientCount > 0 && statusCount >= clientCount * 4) {
    await lockMigrationPeriods();
    settings.cmPeriodsReady = true;
    await settings.save();
    return;
  }

  const clients = await PracticeClient.find({}).select('_id bas annual gst lodged onTime payq inv recon').lean();
  const baseFy = '2025-26';
  await ensureClientPeriodStatuses(clients, baseFy, settings);
  if (fy !== baseFy) {
    await ensureClientPeriodStatuses(clients, fy, settings);
  }
  await lockMigrationPeriods();
  settings.cmPeriodsReady = true;
  await settings.save();
}

async function getPeriodOrThrow(id) {
  const period = await PracticePeriod.findOne({ periodId: id });
  if (!period) {
    const err = new Error('Lodgement period not found');
    err.status = 404;
    throw err;
  }
  return period;
}

async function assertPeriodsWritable(ids) {
  const periodIds = [...new Set(ids.filter(Boolean))];
  if (!periodIds.length) return;
  const locked = await PracticePeriod.findOne({ periodId: { $in: periodIds }, locked: true }).lean();
  if (locked) {
    const err = new Error(`${locked.label} is locked and read-only`);
    err.status = 403;
    throw err;
  }
}

function parseDueLabel(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MN.findIndex((name) => name.toLowerCase() === m[2].toLowerCase());
    if (mo >= 0) {
      const dt = new Date(Number(m[3]), mo, Number(m[1]));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function dueDateValue(value) {
  return parseDueLabel(value);
}

function emptyCounts() {
  return { done: 0, notStarted: 0, inProgress: 0, total: 0 };
}

function lockStatusFor(period, counts) {
  if (period.locked) return 'Locked';
  if ((counts.notStarted || 0) + (counts.inProgress || 0) === 0 && (counts.total || 0) > 0) {
    return 'Ready to lock';
  }
  return 'Open';
}

async function listPeriods(settings = null, opts = {}) {
  const enrich = opts.enrich !== false;
  const settingsDoc = await loadSettingsDoc(settings);
  const workingFy = settingsDoc?.workingFy || settingsDoc?.activeFy || '2025-26';
  const todayRaw = settingsDoc?.todayOverride;
  let today = parseDueLabel(todayRaw);
  if (!today) today = new Date();
  today = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const periods = await PracticePeriod.find({}).lean();
  let byPeriod = new Map();
  if (enrich) {
    const aggregates = await ClientPeriodStatus.aggregate([
      {
        $group: {
          _id: '$periodId',
          total: { $sum: 1 },
          notStarted: {
            $sum: {
              $cond: [{ $in: ['$status', ['Not Started', 'Not Completed']] }, 1, 0],
            },
          },
          inProgress: {
            $sum: {
              $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0],
            },
          },
          done: {
            $sum: {
              $cond: [{ $in: ['$status', ['Completed', 'Lodged', 'Not Required']] }, 1, 0],
            },
          },
        },
      },
    ]);
    byPeriod = new Map(aggregates.map((row) => [row._id, row]));
  }

  const enriched = periods.map((period) => {
    const counts = byPeriod.get(period.periodId) || emptyCounts();
    const due = parseDueLabel(period.dueDate);
    const daysUntilDue = due ? dayDiff(due, today) : null;
    const status = enrich ? lockStatusFor(period, counts) : period.locked ? 'Locked' : 'Open';
    return {
      ...period,
      counts: enrich
        ? {
            done: counts.done || 0,
            notStarted: counts.notStarted || 0,
            inProgress: counts.inProgress || 0,
            total: counts.total || 0,
          }
        : undefined,
      status,
      daysUntilDue,
      dueSort: due ? due.getTime() : Number.MAX_SAFE_INTEGER,
    };
  });

  enriched.sort((a, b) => a.dueSort - b.dueSort || String(a.periodId).localeCompare(String(b.periodId)));

  const open = enriched.filter((p) => !p.locked).length;
  const locked = enriched.filter((p) => p.locked).length;
  const nextToClose = enriched.find((p) => !p.locked) || null;

  return {
    periods: enriched.map(({ dueSort, counts, ...rest }) => (enrich ? { ...rest, counts } : rest)),
    summary: {
      open,
      locked,
      workingYear: workingFy,
      nextToClose: nextToClose
        ? {
            periodId: nextToClose.periodId,
            label: nextToClose.label,
            financialYear: nextToClose.financialYear,
            dueDate: nextToClose.dueDate,
            daysUntilDue: nextToClose.daysUntilDue,
          }
        : null,
    },
  };
}

async function updateClientPeriods({ client, settings, body, today }) {
  const fy = settings.workingFy || settings.activeFy;
  await ensureClientPeriodStatuses(client, fy, settings);
  const touched = [];
  for (const qk of QKEYS) {
    if (body.bas?.[qk] !== undefined || body.payq?.[qk] !== undefined || body.inv?.[qk] !== undefined) {
      touched.push(periodId(fy, 'bas', qk));
    }
  }
  if (body.annual !== undefined) touched.push(periodId(fy, 'annual'));
  await assertPeriodsWritable(touched);

  const periods = await PracticePeriod.find({ periodId: { $in: touched } }).lean();
  const byId = new Map(periods.map((period) => [period.periodId, period]));
  for (const qk of QKEYS) {
    const id = periodId(fy, 'bas', qk);
    if (!touched.includes(id)) continue;
    const update = {};
    if (body.bas?.[qk] !== undefined) {
      update.status = body.bas[qk];
      if (body.bas[qk] === 'Completed') {
        update.lodgedOn = body.lodgedOn?.[qk] || today;
        const due = dueDateValue(byId.get(id)?.dueDate);
        const lodged = dueDateValue(update.lodgedOn);
        update.onTime = due && lodged ? lodged <= due : null;
      } else {
        update.lodgedOn = null;
        update.onTime = null;
      }
    }
    if (body.payq?.[qk] !== undefined) update.feeStatus = body.payq[qk];
    if (body.inv?.[qk] !== undefined) update.invoiceNumber = body.inv[qk] || null;
    await ClientPeriodStatus.updateOne({ clientId: client._id, periodId: id }, { $set: update });
  }
  if (body.annual !== undefined) {
    await ClientPeriodStatus.updateOne(
      { clientId: client._id, periodId: periodId(fy, 'annual') },
      { $set: { status: body.annual, lodgedOn: body.annual === 'Lodged' ? today : null } }
    );
  }
}

async function lockPeriod(user, id, confirm, today) {
  if (user.role !== 'admin') {
    const err = new Error('Admin only');
    err.status = 403;
    throw err;
  }
  const period = await getPeriodOrThrow(id);
  if (period.locked) {
    const err = new Error(`${period.label} is already locked`);
    err.status = 400;
    throw err;
  }
  const rows = await ClientPeriodStatus.find({ periodId: id }).lean();
  const counts = {
    notStarted: rows.filter((row) => ['Not Started', 'Not Completed'].includes(row.status)).length,
    inProgress: rows.filter((row) => row.status === 'In Progress').length,
    done: rows.filter((row) => ['Completed', 'Lodged', 'Not Required'].includes(row.status)).length,
    total: rows.length,
  };
  if (!confirm) {
    const err = new Error('Confirm period lock after reviewing outstanding counts');
    err.status = 409;
    err.details = counts;
    throw err;
  }
  await ClientPeriodStatus.updateMany(
    { periodId: id },
    [
      {
        $set: {
          frozenStatus: '$status',
          frozenFeeStatus: '$feeStatus',
          frozenInvoiceNumber: '$invoiceNumber',
        },
      },
    ]
  );
  period.locked = true;
  period.lockedBy = user._id;
  period.lockedByName = user.name || 'Admin';
  period.lockedAt = new Date();
  await period.save();
  const rowByClient = new Map(rows.map((row) => [String(row.clientId), row]));
  const activityOps = rows.map((row) => ({
    updateOne: {
      filter: { _id: row.clientId },
      update: {
        $push: {
          activity: {
            date: today,
            who: user.name || 'Admin',
            action: `${period.label} locked; status frozen at ${row?.status || 'Not Required'}`,
          },
        },
      },
    },
  }));
  if (activityOps.length) await PracticeClient.bulkWrite(activityOps, { ordered: false });
  return { period: period.toObject(), counts };
}

async function unlockPeriod(user, id, today) {
  if (user.role !== 'admin') {
    const err = new Error('Admin only');
    err.status = 403;
    throw err;
  }
  const period = await getPeriodOrThrow(id);
  period.locked = false;
  period.lockedBy = null;
  period.lockedByName = null;
  period.lockedAt = null;
  await period.save();
  const rows = await ClientPeriodStatus.find({ periodId: id }).lean();
  const activityOps = rows.map((row) => ({
    updateOne: {
      filter: { _id: row.clientId },
      update: {
        $push: {
          activity: {
            date: today,
            who: user.name || 'Admin',
            action: `${period.label} unlocked and reopened for editing`,
          },
        },
      },
    },
  }));
  if (activityOps.length) await PracticeClient.bulkWrite(activityOps, { ordered: false });
  return { period: period.toObject() };
}

module.exports = {
  QKEYS,
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
  parseDueLabel,
  MIGRATION_LOCK_PERIOD_IDS,
};
