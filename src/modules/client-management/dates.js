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

/** Accept YYYY-MM-DD or DD/MM/YYYY (and D/M/YYYY). Returns ISO date string or null. */
function parseFlexibleDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const iso = parseISO(s);
  if (iso) return toISO(iso);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (Number.isNaN(dt.getTime()) || dt.getDate() !== day || dt.getMonth() !== month - 1) return null;
  return toISO(dt);
}

function addDays(dt, n) {
  const x = new Date(dt.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function dayDiff(a, b) {
  return Math.round((a - b) / 86400000);
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
