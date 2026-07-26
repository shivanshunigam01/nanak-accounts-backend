const email = process.env.CM_TEST_EMAIL || 'singh.puneet81@gmail.com';
const password = process.env.CM_TEST_PASSWORD || "let'stestthispassword!";

(async () => {
  const login = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  const token = login.token;
  const clients = await fetch('http://localhost:5000/api/admin/client-management/clients?status=Active&limit=1', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const id = (clients.items || [])[0]?._id;
  const detail = await fetch(`http://localhost:5000/api/admin/client-management/clients/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  const years = detail.client?.lodgementYears || [];
  console.log(
    JSON.stringify(
      {
        entity: detail.client?.entity,
        workingFy: detail.meta?.workingFy,
        lodgementYears: years.map((y) => ({
          fy: y.fy,
          bas: (y.bas || []).map((b) => `${b.label}:${b.status}${b.locked ? '[L]' : ''}`),
          annual: y.annual ? `${y.annual.status}${y.annual.locked ? '[L]' : ''}` : null,
        })),
        quarters: (detail.meta?.quarters || []).map((q) => `${q.l} ${q.due}`),
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
