const {
  parseISO,
  parseFlexibleDate,
  toISO,
  addDays,
  dayDiff,
  dstr,
  dshort,
  dwd,
  nextPay,
  prevPay,
  stepDays,
} = require('./dates');

function enrichRunSuper(run, prior, todayD) {
  const superStatus = prior?.super || run.super || 'Not Paid';
  const superDueDate = toISO(addDays(run.pay, 7));
  const superDue = addDays(run.pay, 7);
  const payDd = dayDiff(run.pay, todayD);
  const superDd = dayDiff(superDue, todayD);
  const overdue = superStatus === 'Not Paid' && payDd <= 0 && superDd < 0;
  let superWhen = 'later';
  if (superStatus === 'Paid') {
    superWhen = 'paid';
  } else if (payDd > 0) {
    // Wages not paid yet — super guarantee clock has not started.
    superWhen = 'upcoming';
  } else if (overdue) {
    superWhen = 'overdue';
  } else if (superDd === 0) {
    superWhen = 'today';
  } else if (superDd === 1) {
    superWhen = 'tomorrow';
  } else if (superDd > 1 && superDd <= 7) {
    superWhen = 'week';
  }
  return {
    ...run,
    super: superStatus,
    superDueDate,
    superDueStr: dstr(superDue),
    superOverdue: overdue,
    superWhen,
  };
}

function buildRunsForClients(clients, today, overridesByKey = {}) {
  const runs = [];
  let seq = 0;
  const todayD = today instanceof Date ? today : new Date(today);

  for (const c of clients) {
    // Payday Super / payroll only for Active clients with payroll enabled
    if (c.status === 'Inactive') continue;
    if (!c.payroll || !c.payrollFreq) continue;
    const firstIso = parseFlexibleDate(c.payFirstDate);
    const first = firstIso ? parseISO(firstIso) : null;
    if (!first) continue;
    const freq = c.payrollFreq;
    const step = stepDays(freq);
    const lag = typeof c.payLag === 'number' ? c.payLag : 0;
    let pay = new Date(first.getTime());
    let guard = 0;
    while (dayDiff(pay, todayD) > -45 && guard++ < 400) pay = prevPay(pay, freq);
    guard = 0;
    while (guard++ < 400) {
      pay = nextPay(pay, freq);
      const dd = dayDiff(pay, todayD);
      if (dd > 70) break;
      if (dd < -40) continue;
      if (pay < first) continue;
      const pEnd = addDays(pay, -lag);
      const pStart =
        freq === 'Monthly' ? addDays(prevPay(addDays(pEnd, 1), freq), 0) : addDays(pEnd, -(step - 1));
      const payDate = toISO(pay);
      const cid = String(c._id || c.id);
      const key = `${cid}|${payDate}`;
      const prior = overridesByKey[key];
      let base;
      if (prior) {
        base = {
          id: ++seq,
          clientId: cid,
          entity: c.entity,
          software: c.software || '',
          managerName: c.managerName,
          payrollMgr: c.payrollMgr,
          payrollMgrId: c.payrollMgrId ? String(c.payrollMgrId) : null,
          freq,
          periodStart: pStart,
          periodEnd: pEnd,
          periodStr: `${dshort(pStart)} - ${dshort(pEnd)}`,
          pay: new Date(pay.getTime()),
          payDate,
          payStr: dstr(pay),
          payWd: dwd(pay),
          status: prior.status,
          stp: prior.stp,
          super: prior.super || 'Not Paid',
          employees: prior.employees,
          by: prior.by,
          on: prior.on,
          amount: (c.payrollActual || c.payrollBilled || 0) * 25,
        };
      } else {
        // No saved override: treat as unfinished so filters (Needs action / Overdue / STP)
        // reflect real work. Staff mark runs done via overrides.
        base = {
          id: ++seq,
          clientId: cid,
          entity: c.entity,
          software: c.software || '',
          managerName: c.managerName,
          payrollMgr: c.payrollMgr,
          payrollMgrId: c.payrollMgrId ? String(c.payrollMgrId) : null,
          freq,
          periodStart: pStart,
          periodEnd: pEnd,
          periodStr: `${dshort(pStart)} - ${dshort(pEnd)}`,
          pay: new Date(pay.getTime()),
          payDate,
          payStr: dstr(pay),
          payWd: dwd(pay),
          status: 'Not Started',
          stp: 'Not Lodged',
          super: 'Not Paid',
          employees: null,
          by: null,
          on: null,
          amount: (c.payrollActual || c.payrollBilled || 0) * 25,
        };
      }
      runs.push(enrichRunSuper(base, prior, todayD));
    }
  }
  runs.sort((a, b) => a.pay - b.pay);
  return runs;
}

function normalizeStp(stp) {
  return stp === 'Lodged' ? 'Lodged' : 'Not Lodged';
}

/** Run still needs work (not completed, or completed but STP not lodged). */
function isPayrollRunOpen(r) {
  return r.status !== 'Completed' || normalizeStp(r.stp) === 'Not Lodged';
}

function isStpOutstanding(r) {
  return r.status === 'Completed' && normalizeStp(r.stp) === 'Not Lodged';
}

/** STP breach counts once the pay day has arrived (today or past). */
function isStpDue(r, todayD) {
  if (!isStpOutstanding(r)) return false;
  if (!todayD) return true;
  return dayDiff(r.pay, todayD) <= 0;
}

function runWhen(r, todayD) {
  const dd = dayDiff(r.pay, todayD);
  if (!isPayrollRunOpen(r)) return 'done';
  if (dd < 0) return 'overdue';
  if (dd === 0) return 'today';
  if (dd === 1) return 'tomorrow';
  if (dd <= 7) return 'week';
  return 'later';
}

function runBucket(r, todayD) {
  const wn = runWhen(r, todayD);
  if (wn === 'overdue') return 'overdue';
  if (wn === 'done') return 'done';
  if (wn === 'later') return 'upcoming';
  return 'week';
}

function stpBreaches(list, todayD) {
  return list.filter((r) => isStpDue(r, todayD));
}

function stpOutstandingAll(list) {
  return list.filter(isStpOutstanding);
}

function superBucket(r) {
  if (r.super === 'Paid') return 'paid';
  if (r.superWhen === 'upcoming') return 'upcoming';
  if (r.superOverdue) return 'overdue';
  if (r.superWhen === 'today') return 'today';
  if (r.superWhen === 'tomorrow') return 'tomorrow';
  if (r.superWhen === 'week') return 'week';
  return 'later';
}

function isSuperUnpaid(r) {
  return r.super !== 'Paid';
}

/** Super obligation starts once pay day is reached (wages paid or due). */
function isSuperClockStarted(r, todayD) {
  if (!isSuperUnpaid(r)) return false;
  if (!todayD || !r.pay) return true;
  const pay = r.pay instanceof Date ? r.pay : new Date(r.pay);
  if (Number.isNaN(pay.getTime())) return false;
  return dayDiff(pay, todayD) <= 0;
}

/**
 * Super list filters — buckets use **super due date** (= pay day + 7 calendar days).
 * @param {Date} [todayD] used for needs-action / outstanding (pay day reached).
 */
function filterSuperRuns(runs, filter, todayD) {
  const f = filter || 'action';
  const unpaid = isSuperUnpaid;
  if (f === 'all') return runs;
  if (f === 'paid') return runs.filter((r) => r.super === 'Paid');
  if (f === 'upcoming') return runs.filter((r) => unpaid(r) && r.superWhen === 'upcoming');
  if (f === 'outstanding') {
    return runs.filter((r) => unpaid(r) && isSuperClockStarted(r, todayD));
  }
  if (f === 'overdue') return runs.filter((r) => r.superOverdue);
  if (f === 'today') return runs.filter((r) => unpaid(r) && r.superWhen === 'today');
  if (f === 'tomorrow') return runs.filter((r) => unpaid(r) && r.superWhen === 'tomorrow');
  if (f === 'week') {
    return runs.filter(
      (r) =>
        unpaid(r) &&
        (r.superWhen === 'week' || r.superWhen === 'today' || r.superWhen === 'tomorrow')
    );
  }
  // Needs action: unpaid, pay day reached, and super due within 7 days or already past.
  return runs.filter((r) => {
    if (!unpaid(r) || r.superWhen === 'upcoming') return false;
    if (!isSuperClockStarted(r, todayD)) return false;
    return (
      r.superOverdue ||
      r.superWhen === 'today' ||
      r.superWhen === 'tomorrow' ||
      r.superWhen === 'week'
    );
  });
}

function sortSuperRuns(runs) {
  const rank = { overdue: 0, today: 1, tomorrow: 2, week: 3, later: 4, upcoming: 5, paid: 6 };
  return [...runs].sort((a, b) => {
    const ra = rank[superBucket(a)] ?? 9;
    const rb = rank[superBucket(b)] ?? 9;
    if (ra !== rb) return ra - rb;
    const da = a.pay instanceof Date ? a.pay.getTime() : 0;
    const db = b.pay instanceof Date ? b.pay.getTime() : 0;
    return da - db;
  });
}

module.exports = {
  buildRunsForClients,
  runWhen,
  runBucket,
  stpBreaches,
  stpOutstandingAll,
  isPayrollRunOpen,
  isStpOutstanding,
  isStpDue,
  normalizeStp,
  isSuperUnpaid,
  isSuperClockStarted,
  enrichRunSuper,
  superBucket,
  filterSuperRuns,
  sortSuperRuns,
};
