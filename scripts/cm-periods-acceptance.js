/**
 * Acceptance smoke for CM Periods & Locking (A13, A17, A18, A35, A36).
 * Run with: node scripts/cm-periods-acceptance.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5000}/api`;
const EMAIL = process.env.CM_TEST_EMAIL || process.env.SEED_ADMIN_EMAIL || 'admin@nanak.com';
const PASSWORD = process.env.CM_TEST_PASSWORD || (process.env.SEED_ADMIN_PASSWORD || 'admin123').split(/\s/)[0];
// Prefer explicit smoke credentials when provided via env.

const results = [];

function pass(id, msg) {
  results.push({ id, ok: true, msg });
  console.log(`PASS ${id}: ${msg}`);
}
function fail(id, msg) {
  results.push({ id, ok: false, msg });
  console.error(`FAIL ${id}: ${msg}`);
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  console.log(`API base: ${BASE}`);
  console.log(`Login as: ${EMAIL}`);

  const login = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (login.status !== 200 || !login.json.token) {
    fail('SETUP', `Login failed (${login.status}): ${login.json.message || JSON.stringify(login.json)}`);
    process.exit(1);
  }
  const token = login.json.token;

  // Ensure CM seed + migration
  const seed = await req('POST', '/admin/client-management/seed', { token, body: { force: true } });
  if (seed.status !== 200) {
    fail('SETUP', `Seed failed (${seed.status}): ${seed.json.message || JSON.stringify(seed.json)}`);
    process.exit(1);
  }
  console.log('Seeded CM data');

  const meta0 = await req('GET', '/admin/client-management/meta', { token });
  const periods0 = await req('GET', '/admin/client-management/periods', { token });
  const periods = periods0.json.periods || [];
  const summary = periods0.json.summary || meta0.json.meta?.periodSummary;

  // Migration locks
  const q1 = periods.find((p) => p.periodId === '2025-26|bas|q1');
  const q2 = periods.find((p) => p.periodId === '2025-26|bas|q2');
  const q3 = periods.find((p) => p.periodId === '2025-26|bas|q3');
  const q4 = periods.find((p) => p.periodId === '2025-26|bas|q4');
  const annual = periods.find((p) => p.periodId === '2025-26|annual');
  if (q1?.locked && q2?.locked && q3?.locked && q4 && !q4.locked && annual && !annual.locked) {
    pass('MIG', 'Sep/Dec/Mar locked; Jun + annual open');
  } else {
    fail(
      'MIG',
      `Unexpected locks q1=${q1?.locked} q2=${q2?.locked} q3=${q3?.locked} q4=${q4?.locked} annual=${annual?.locked}`
    );
  }

  if (summary && typeof summary.open === 'number' && typeof summary.locked === 'number' && summary.workingYear) {
    pass('UX-API', `Summary open=${summary.open} locked=${summary.locked} working=${summary.workingYear}`);
  } else {
    fail('UX-API', `Missing summary: ${JSON.stringify(summary)}`);
  }

  // Sorted by due date
  const sorts = periods.map((p) => p.dueDate);
  const sortedOk = periods.every((p, i) => i === 0 || (p.daysUntilDue ?? 9999) >= (periods[i - 1].daysUntilDue ?? -9999) || true);
  // Prefer check dueSort order by comparing consecutive due dates via daysUntilDue ascending for unlocked+locked mix
  let dueOrdered = true;
  for (let i = 1; i < periods.length; i++) {
    const a = periods[i - 1].daysUntilDue;
    const b = periods[i].daysUntilDue;
    if (a != null && b != null && b < a) {
      // still ok if same calendar order - daysUntilDue should be ascending when sorted by due
      dueOrdered = false;
      break;
    }
  }
  if (dueOrdered && periods.length >= 5) {
    pass('UX-SORT', `Periods sorted by due (${periods.length} rows): ${sorts.join(' → ')}`);
  } else {
    fail('UX-SORT', `Not due-sorted: ${sorts.join(' → ')}`);
  }

  // Clients list for write tests
  const clientsRes = await req('GET', '/admin/client-management/clients?status=Active&limit=5', { token });
  const clients = clientsRes.json.clients || clientsRes.json.items || [];
  const client = clients.find((c) => c.gst) || clients[0];
  if (!client?._id) {
    fail('SETUP', 'No client found for write tests');
    process.exit(1);
  }
  const clientId = client._id;

  // ---- A35: lock preview without confirm ----
  const preview = await req('POST', `/admin/client-management/periods/${encodeURIComponent(q4.periodId)}/lock`, {
    token,
    body: { confirm: false },
  });
  if (preview.status === 409 && preview.json.details && typeof preview.json.details.notStarted === 'number') {
    pass('A35-preview', `409 with counts notStarted=${preview.json.details.notStarted} inProgress=${preview.json.details.inProgress}`);
  } else {
    fail('A35-preview', `Expected 409+details, got ${preview.status} ${JSON.stringify(preview.json)}`);
  }

  // Snapshot a client status row before lock
  const beforeClient = await req('GET', `/admin/client-management/clients/${clientId}`, { token });
  const beforeAnnual = beforeClient.json.client?.annual || beforeClient.json.annual;
  const beforeQ4 = beforeClient.json.client?.bas?.q4 || beforeClient.json.bas?.q4;

  // Confirm lock Jun 26
  const lock = await req('POST', `/admin/client-management/periods/${encodeURIComponent(q4.periodId)}/lock`, {
    token,
    body: { confirm: true },
  });
  if (lock.status === 200 && lock.json.period?.locked) {
    pass('A35-lock', `Locked ${q4.label}; counts=${JSON.stringify(lock.json.counts)}`);
  } else {
    fail('A35-lock', `Lock failed ${lock.status} ${JSON.stringify(lock.json)}`);
  }

  // Write to locked q4 → 403
  const writeLocked = await req('PATCH', `/admin/client-management/clients/${clientId}`, {
    token,
    body: { bas: { q4: 'In Progress' } },
  });
  if (writeLocked.status === 403) {
    pass('A35-403', 'Locked period write returns 403');
  } else {
    fail('A35-403', `Expected 403, got ${writeLocked.status} ${JSON.stringify(writeLocked.json)}`);
  }

  // Activity entry naming freeze
  const afterLockClient = await req('GET', `/admin/client-management/clients/${clientId}`, { token });
  const activity = afterLockClient.json.client?.activity || afterLockClient.json.activity || [];
  const freezeHit = activity.some((a) => String(a.action || '').includes('locked') && String(a.action || '').includes('frozen'));
  if (freezeHit) {
    pass('A35-activity', `Activity has freeze entry: ${activity.find((a) => String(a.action || '').includes('locked'))?.action}`);
  } else {
    fail('A35-activity', `No freeze activity. Last: ${JSON.stringify(activity.slice(-3))}`);
  }

  // ---- A13: period independence ----
  const writeAnnual = await req('PATCH', `/admin/client-management/clients/${clientId}`, {
    token,
    body: { annual: beforeAnnual === 'In Progress' ? 'Not Started' : 'In Progress' },
  });
  if (writeAnnual.status === 200) {
    pass('A13-annual', 'Annual remains editable after locking BAS Jun 26');
  } else {
    fail('A13-annual', `Annual write failed ${writeAnnual.status} ${JSON.stringify(writeAnnual.json)}`);
  }

  const periodsAfterLock = await req('GET', '/admin/client-management/periods', { token });
  const ann = (periodsAfterLock.json.periods || []).find((p) => p.periodId === '2025-26|annual');
  const jun = (periodsAfterLock.json.periods || []).find((p) => p.periodId === '2025-26|bas|q4');
  if (jun?.locked && ann && !ann.locked) {
    pass('A13-visible', 'Both Jun and annual still listed; only Jun locked');
  } else {
    fail('A13-visible', `jun.locked=${jun?.locked} annual.locked=${ann?.locked}`);
  }

  // Restore annual if needed
  await req('PATCH', `/admin/client-management/clients/${clientId}`, {
    token,
    body: { annual: beforeAnnual },
  });

  // ---- A17: open next FY ----
  const beforeIds = new Set((periodsAfterLock.json.periods || []).map((p) => p.periodId));
  const statusSnap = await req('GET', `/admin/client-management/clients/${clientId}`, { token });
  const basSnap = JSON.stringify(statusSnap.json.client?.bas || statusSnap.json.bas);

  const start = await req('POST', '/admin/client-management/fy/start', { token, body: {} });
  if (start.status !== 200) {
    fail('A17', `startFY failed ${start.status} ${JSON.stringify(start.json)}`);
  } else {
    const afterStart = await req('GET', '/admin/client-management/periods', { token });
    const all = afterStart.json.periods || [];
    const fy27 = all.filter((p) => p.financialYear === '2026-27' || p.financialYear === '26-27');
    // startFY computes next from working year 2025-26 → 2026-27 (or 26-27 style?)
    const newOnes = all.filter((p) => !beforeIds.has(p.periodId));
    const oldIntact = ['2025-26|bas|q1', '2025-26|bas|q2', '2025-26|bas|q3', '2025-26|bas|q4', '2025-26|annual'].every((id) =>
      all.some((p) => p.periodId === id)
    );
    const afterStatus = await req('GET', `/admin/client-management/clients/${clientId}`, { token });
    const basAfter = JSON.stringify(afterStatus.json.client?.bas || afterStatus.json.bas);
    if (newOnes.length >= 5 && oldIntact && basAfter === basSnap) {
      pass('A17', `Opened next FY (+${newOnes.length} periods); 2025-26 intact; client BAS unchanged`);
    } else {
      fail(
        'A17',
        `new=${newOnes.length} oldIntact=${oldIntact} basSame=${basAfter === basSnap} sampleNew=${newOnes.map((p) => p.periodId).join(',')}`
      );
    }
  }

  // ---- A18: working year ----
  const locksBefore = (await req('GET', '/admin/client-management/periods', { token })).json.periods.map((p) => [
    p.periodId,
    !!p.locked,
  ]);
  const work = await req('POST', '/admin/client-management/fy/working', {
    token,
    body: { fy: '2026-27' },
  });
  // FY format might be 26-27 from startFY - detect from periods
  let workFy = '2026-27';
  const allP = (await req('GET', '/admin/client-management/periods', { token })).json.periods || [];
  const newer = [...new Set(allP.map((p) => p.financialYear))].sort().reverse()[0];
  if (work.status !== 200) {
    const work2 = await req('POST', '/admin/client-management/fy/working', { token, body: { fy: newer } });
    if (work2.status === 200) {
      workFy = newer;
      const metaW = await req('GET', '/admin/client-management/meta', { token });
      const locksAfter = (await req('GET', '/admin/client-management/periods', { token })).json.periods.map((p) => [
        p.periodId,
        !!p.locked,
      ]);
      const locksSame = JSON.stringify(locksBefore) === JSON.stringify(locksAfter);
      if ((metaW.json.meta?.workingFy || metaW.json.meta?.activeFy) === workFy && locksSame) {
        pass('A18', `Working year → ${workFy}; lock flags unchanged`);
      } else {
        fail('A18', `working=${metaW.json.meta?.workingFy} locksSame=${locksSame}`);
      }
    } else {
      fail('A18', `setWorkingYear failed ${work.status}/${work2.status} ${JSON.stringify(work.json)} / ${JSON.stringify(work2.json)}`);
    }
  } else {
    workFy = '2026-27';
    const metaW = await req('GET', '/admin/client-management/meta', { token });
    const locksAfter = (await req('GET', '/admin/client-management/periods', { token })).json.periods.map((p) => [
      p.periodId,
      !!p.locked,
    ]);
    const locksSame = JSON.stringify(locksBefore) === JSON.stringify(locksAfter);
    if ((metaW.json.meta?.workingFy || metaW.json.meta?.activeFy) === workFy && locksSame) {
      pass('A18', `Working year → ${workFy}; lock flags unchanged`);
    } else {
      fail('A18', `working=${metaW.json.meta?.workingFy} locksSame=${locksSame}`);
    }
  }

  // Switch back to 2025-26 for unlock test on q4
  await req('POST', '/admin/client-management/fy/working', { token, body: { fy: '2025-26' } });

  // ---- A36: unlock + audit; stale write still 403 while locked then writable after ----
  // Re-lock if somehow unlocked, then unlock
  const junNow = ((await req('GET', '/admin/client-management/periods', { token })).json.periods || []).find(
    (p) => p.periodId === '2025-26|bas|q4'
  );
  if (!junNow?.locked) {
    await req('POST', `/admin/client-management/periods/${encodeURIComponent('2025-26|bas|q4')}/lock`, {
      token,
      body: { confirm: true },
    });
  }

  // Stale write while locked
  const stale = await req('PATCH', `/admin/client-management/clients/${clientId}`, {
    token,
    body: { bas: { q4: beforeQ4 || 'Completed' } },
  });
  if (stale.status === 403) {
    pass('A36-stale', 'Stale write to locked period returns 403');
  } else {
    fail('A36-stale', `Expected 403, got ${stale.status}`);
  }

  const unlock = await req('POST', `/admin/client-management/periods/${encodeURIComponent('2025-26|bas|q4')}/unlock`, {
    token,
  });
  if (unlock.status !== 200 || unlock.json.period?.locked) {
    fail('A36-unlock', `Unlock failed ${unlock.status} ${JSON.stringify(unlock.json)}`);
  } else {
    const unlockedClient = await req('GET', `/admin/client-management/clients/${clientId}`, { token });
    const act = unlockedClient.json.client?.activity || unlockedClient.json.activity || [];
    const unlockHit = act.some((a) => String(a.action || '').toLowerCase().includes('unlocked'));
    const writeOpen = await req('PATCH', `/admin/client-management/clients/${clientId}`, {
      token,
      body: { bas: { q4: beforeQ4 || 'Completed' } },
    });
    if (unlockHit && writeOpen.status === 200) {
      pass('A36', 'Unlock writes activity and reopens editing');
    } else {
      fail('A36', `unlockHit=${unlockHit} writeOpen=${writeOpen.status}`);
    }
  }

  console.log('\n--- Summary ---');
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log(`Passed: ${passed.length} / ${results.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.id}: ${f.msg}`));
    process.exit(1);
  }
  console.log('All acceptance checks passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
