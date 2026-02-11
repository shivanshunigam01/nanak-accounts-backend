require('dotenv').config();
const { connectDB } = require('../config/db');
const User = require('../models/User');

async function run() {
  await connectDB();

  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@nanak.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const name = process.env.SEED_ADMIN_NAME || 'Harpreet Singh';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log('✅ Admin already exists:', email);
    process.exit(0);
  }

  await User.create({ name, email, password, role: 'admin', active: true });
  console.log('✅ Seeded admin:', email);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
