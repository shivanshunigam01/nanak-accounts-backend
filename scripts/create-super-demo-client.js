/**
 * Create a demo payroll client with Super data visible on Payroll + Super pages.
 * Usage: node scripts/create-super-demo-client.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5000}/api`;
const EMAIL = process.env.CM_TEST_EMAIL || 'singh.puneet81@gmail.com';
const PASSWORD = process.env.CM_TEST_PASSWORD || "let'stestthispassword!";

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
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.json = json;
    throw err;
  }
  return json;
}

async function main() {
  const login = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.token;

  // Align practice "today" so demo pay/super dates land in the current window
  await req('PATCH', '/admin/client-management/settings', {
    token,
    body: { todayOverride: '26 Jul 2026' },
  }).catch(async () => {
    // settings may not accept todayOverride via API — set via meta path if needed
  });

  // Force todayOverride directly if settings endpoint ignores it
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const PracticeSettings = require('../src/models/PracticeSettings');
  await PracticeSettings.findOneAndUpdate(
    { singleton: 'default' },
    { $set: { todayOverride: '26 Jul 2026' } },
    { upsert: true }
  );

  const meta = await req('GET', '/admin/client-management/meta', { token });
  const staff = meta.meta?.staff || [];
  const manager = staff[0] || { _id: login.user._id, name: login.user.name };

  const created = await req('POST', '/admin/client-management/clients', {
    token,
    body: {
      entity: 'DEMO SUPER PAYROLL PTY LTD',
      abn: '12 345 678 901',
      type: 'Company',
      pkg: 'On Package',
      fee: 350,
      freq: 'Monthly',
      gst: true,
      software: 'Xero',
      email: 'demo.super@example.com',
      phone: '0400 111 222',
      managerId: manager._id,
      managerName: manager.name,
      payroll: true,
      payrollFreq: 'Fortnightly',
      payFirstDate: '2026-06-12',
      payLag: 3,
      payrollBilled: 4,
      payrollActual: 4,
      payrollMgrId: manager._id,
      payrollMgr: manager.name,
    },
  });

  const clientId = created._id || created.id || created.client?._id;
  console.log('Created client:', created.entity || 'DEMO SUPER PAYROLL PTY LTD', clientId);

  // Seed a couple of explicit overrides with Super Not Paid so overdue / due-soon is obvious
  const PracticePayrollOverride = require('../src/models/PracticePayrollOverride');
  await PracticePayrollOverride.findOneAndUpdate(
    { clientId, payDate: '2026-07-10' },
    {
      $set: {
        status: 'Completed',
        stp: 'Lodged',
        super: 'Not Paid',
        employees: 4,
        by: manager.name,
        on: '10 Jul 2026',
      },
    },
    { upsert: true }
  );
  await PracticePayrollOverride.findOneAndUpdate(
    { clientId, payDate: '2026-07-24' },
    {
      $set: {
        status: 'Completed',
        stp: 'Not Lodged',
        super: 'Not Paid',
        employees: 4,
        by: manager.name,
        on: '24 Jul 2026',
      },
    },
    { upsert: true }
  );

  const payroll = await req('GET', '/admin/client-management/payroll?filter=all', { token });
  const mine = (payroll.items || []).filter((r) => String(r.clientId) === String(clientId));
  const superView = await req('GET', '/admin/client-management/super?filter=action', { token });
  const superMine = (superView.items || []).filter((r) => String(r.clientId) === String(clientId));

  console.log(
    JSON.stringify(
      {
        clientId,
        entity: 'DEMO SUPER PAYROLL PTY LTD',
        payrollRuns: mine.length,
        sample: mine.slice(0, 3).map((r) => ({
          payDate: r.payDate,
          status: r.status,
          stp: r.stp,
          super: r.super,
          superDueStr: r.superDueStr,
          superOverdue: r.superOverdue,
        })),
        superOutstanding: superMine.length,
        payrollKpis: payroll.kpis,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message || e);
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState) await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
