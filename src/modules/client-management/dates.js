const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function toISO(dt) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function parseISO(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Local midnight for a Date (drops clock time so dayDiff is calendar-based). */
function startOfDay(dt) {
  if (!dt) return null;
  const d = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Calendar date in Australia/Sydney, as local midnight. */
function todayInAustralia(ref = new Date()) {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref);
  return parseISO(iso) || startOfDay(ref);
}

/** Accept YYYY-MM-DD, ISO datetime, DD/MM/YYYY, or "21 Aug 2026". Returns ISO date string or null. */
function parseFlexibleDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : toISO(v);
  }
  const s = String(v).trim();
  if (!s) return null;
  const isoDay = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDay) {
    const dt = new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
    if (!Number.isNaN(dt.getTime())) return toISO(dt);
  }
  const iso = parseISO(s);
  if (iso) return toISO(iso);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(year, month - 1, day);
    if (Number.isNaN(dt.getTime()) || dt.getDate() !== day || dt.getMonth() !== month - 1) return null;
    return toISO(dt);
  }
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (named) {
    const mo = MONTH_INDEX[named[2].slice(0, 3).toLowerCase()];
    const day = Number(named[1]);
    const year = Number(named[3]);
    if (mo === undefined || day < 1 || day > 31) return null;
    const dt = new Date(year, mo, day);
    if (Number.isNaN(dt.getTime()) || dt.getDate() !== day) return null;
    return toISO(dt);
  }
  return null;
}

function addDays(dt, n) {
  const x = new Date(dt.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function dayDiff(a, b) {
  const da = startOfDay(a);
  const db = startOfDay(b);
  if (!da || !db) return 0;
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

function dstr(dt) {
  return `${dt.getDate()} ${MN[dt.getMonth()]} ${dt.getFullYear()}`;
}

function dshort(dt) {
  return `${dt.getDate()} ${MN[dt.getMonth()]}`;
}

function dwd(dt) {
  return `${WD[dt.getDay()]} ${dt.getDate()} ${MN[dt.getMonth()]}`;
}

function nextPay(dt, freq) {
  if (freq === 'Monthly') {
    const x = new Date(dt.getTime());
    x.setMonth(x.getMonth() + 1);
    return x;
  }
  return addDays(dt, freq === 'Weekly' ? 7 : 14);
}

function prevPay(dt, freq) {
  if (freq === 'Monthly') {
    const x = new Date(dt.getTime());
    x.setMonth(x.getMonth() - 1);
    return x;
  }
  return addDays(dt, freq === 'Weekly' ? -7 : -14);
}

function stepDays(freq) {
  return freq === 'Weekly' ? 7 : freq === 'Fortnightly' ? 14 : 30;
}

function formatLongDate(dt = new Date()) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${days[dt.getDay()]} ${dt.getDate()} ${MN[dt.getMonth()]} ${dt.getFullYear()}`;
}

function greetingPeriod(dt = new Date()) {
  const h = dt.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function monthsSince(dstr, refYear = 2026, refMonth = 6) {
  if (!dstr) return 999;
  const m = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const p = String(dstr).split(' ');
  if (p.length < 3) return 999;
  const y = Number(p[2]);
  const mo = m[p[1]];
  if (Number.isNaN(y) || mo === undefined) return 999;
  return (refYear - y) * 12 + (refMonth - mo);
}

module.exports = {
  MN,
  WD,
  pad2,
  toISO,
  parseISO,
  parseFlexibleDate,
  startOfDay,
  todayInAustralia,
  addDays,
  dayDiff,
  dstr,
  dshort,
  dwd,
  nextPay,
  prevPay,
  stepDays,
  formatLongDate,
  greetingPeriod,
  monthsSince,
};
