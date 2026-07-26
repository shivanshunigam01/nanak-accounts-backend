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

function buildRunsForClients(clients, today, overridesByKey = {}) {
  const runs = [];
  let seq = 0;
  const todayD = today instanceof Date ? today : new Date(today);

  for (const c of clients) {
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
          employees: prior.employees,
          by: prior.by,
          on: prior.on,
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
          stp = status === 'Completed' ? ((idNum + pay.getDate()) % 13 === 0 ? 'Not Lodged' : 'Lodged') : 'Not Lodged';
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
          employees: emp,
          by,
          on,
        };
      }
      runs.push(base);
    }
  }
  runs.sort((a, b) => a.pay - b.pay);
  return runs;
}

function previewPayDays(payFirstDate, payrollFreq, count = 4) {
  const first = parseISO(payFirstDate);
  if (!first || !payrollFreq) return [];
  const days = [];
  let pay = new Date(first.getTime());
  for (let i = 0; i < count; i++) {
    if (i > 0) pay = nextPay(pay, payrollFreq);
    const lag = 0;
    const step = stepDays(payrollFreq);
    const pEnd = addDays(pay, -lag);
    const pStart =
      payrollFreq === 'Monthly' ? addDays(prevPay(addDays(pEnd, 1), payrollFreq), 0) : addDays(pEnd, -(step - 1));
    days.push({
      payDate: toISO(pay),
      payStr: dstr(pay),
      payWd: dwd(pay),
      periodStr: `${dshort(pStart)} - ${dshort(pEnd)}`,
    });
  }
  return days;
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

module.exports = {
  buildRunsForClients,
  previewPayDays,
  runWhen,
  runBucket,
  stpBreaches,
};
