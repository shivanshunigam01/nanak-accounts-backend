require('dotenv').config();
const http = require('http');
const app = require('./app');
const { connectDB } = require('./config/db');
const { log } = require('console');

const PORT = process.env.PORT || 5000;
const paymetWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
console.log(PORT,"port");
console.log(paymetWebhookSecret,"paymetWebhookSecret");
console.log(stripeSecretKey,"stripe");

async function bootstrap() {
  await connectDB();

  try {
    const { runLeadMigration } = require('./services/lead-crm.migrate');
    await runLeadMigration();
  } catch (e) {
    console.error('[lead-migrate] boot error:', e.message);
  }

  try {
    const { startLeadCrmWorker } = require('./services/lead-crm.worker');
    startLeadCrmWorker();
  } catch (e) {
    console.error('[lead-worker] boot error:', e.message);
  }

  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start server', err);
  process.exit(1);
});
