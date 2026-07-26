const {
  parseISO,
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
  const superDd = dayDiff(superDue, todayD);
  const overdue = superStatus === 'Not Paid' && superDd < 0;
  return {
    ...run,
    super: superStatus,
    superDueDate,
    superDueStr: dstr(superDue),
    superOverdue: overdue,
    superWhen:
      superStatus === 'Paid'
        ? 'paid'
        : overdue
          ? 'overdue'
          : superDd === 0
            ? 'today'
            : superDd > 0 && superDd <= 7
              ? 'week'
              : 'later',
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
    const first = parseISO(c.payFirstDate);
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
        const past = pay < todayD;
        let status;
        let stp;
        let emp = null;
        let by = null;
        let on = null;
        const idNum = Number(String(cid).slice(-4).replace(/\D/g, '') || '1') || 1;
        if (past) {
          const lateOne = (idNum + pay.getDate()) % 11 === 0;
          status = lateOne ? 'Not Started' : 'Completed';
          stp =
            status === 'Completed'
              ? (idNum + pay.getDate()) % 13 === 0
                ? 'Not Lodged'
                : 'Lodged'
              : 'Not Lodged';
          if (status === 'Completed') {
            emp = c.payrollActual || c.payrollBilled;
            by = c.payrollMgr;
            on = dstr(pay);
          }
        } else {
          status = dd <= 3 && (idNum + pay.getDate()) % 4 === 0 ? 'In Progress' : 'Not Started';
          stp = 'Not Lodged';
        }
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
          status,
          stp,
          super: 'Not Paid',
          employees: emp,
          by,
          on,
          amount: (c.payrollActual || c.payrollBilled || 0) * 25,
        };
      }
      runs.push(enrichRunSuper(base, prior, todayD));
    }
  }
  runs.sort((a, b) => a.pay - b.pay);
  return runs;
}

function runWhen(r, todayD) {
  const dd = dayDiff(r.pay, todayD);
  if (r.status === 'Completed') return 'done';
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

function stpBreaches(list) {
  return list.filter((r) => r.status === 'Completed' && r.stp === 'Not Lodged');
}

function superBucket(r) {
  if (r.super === 'Paid') return 'paid';
  if (r.superOverdue) return 'overdue';
  if (r.superWhen === 'today') return 'today';
  if (r.superWhen === 'week') return 'week';
  return 'later';
}

function filterSuperRuns(runs, filter) {
  const f = filter || 'action';
  if (f === 'all') return runs;
  if (f === 'paid') return runs.filter((r) => r.super === 'Paid');
  if (f === 'overdue') return runs.filter((r) => r.superOverdue);
  if (f === 'today') return runs.filter((r) => r.superWhen === 'today' && r.super === 'Not Paid');
  if (f === 'week')
    return runs.filter((r) => (r.superWhen === 'week' || r.superWhen === 'today') && r.super === 'Not Paid');
  // needs action: unpaid, due within 7 days or overdue
  return runs.filter(
    (r) => r.super === 'Not Paid' && (r.superOverdue || r.superWhen === 'today' || r.superWhen === 'week')
  );
}

module.exports = {
  buildRunsForClients,
  runWhen,
  runBucket,
  stpBreaches,
  enrichRunSuper,
  superBucket,
  filterSuperRuns,
};
