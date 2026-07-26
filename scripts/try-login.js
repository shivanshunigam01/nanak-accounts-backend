const email = process.argv[2] || 'singh.puneet81@gmail.com';
const password = process.argv[3] || "let'stestthispassword!";
fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
  .then(async (r) => {
    const j = await r.json();
    console.log(JSON.stringify({ status: r.status, email: j.user?.email, success: j.success, message: j.message }, null, 2));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
