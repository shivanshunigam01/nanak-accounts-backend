require('dotenv').config();
const BASE = `http://localhost:${process.env.PORT || 5000}/api`;

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'singh.puneet81@gmail.com', password: "let'stestthispassword!" }),
  }).then((r) => r.json());
  if (!login.token) {
    console.log('login failed', login);
    process.exit(1);
  }
  const token = login.token;
  async function timed(path) {
    const t0 = Date.now();
    const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    const ms = Date.now() - t0;
    const size = JSON.stringify(j).length;
    console.log(`${String(ms).padStart(5)}ms  ${r.status}  ${String(size).padStart(8)}b  ${path}`);
  }
  await timed('/admin/client-management/meta');
  for (const p of [
    '/admin/client-management/meta',
    '/admin/client-management/dashboard',
    '/admin/client-management/clients?status=Active&limit=50',
    '/admin/client-management/payroll?filter=action',
    '/admin/client-management/super?filter=action',
    '/admin/client-management/periods',
    '/admin/client-management/payments?filter=all',
    '/admin/client-management/lodgement',
  ]) {
    await timed(p);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
