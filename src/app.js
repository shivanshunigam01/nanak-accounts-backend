const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const publicRoutes = require('./routes/public.routes');
const webhookRoutes = require('./routes/webhooks.routes');

const dashboardRoutes = require('./routes/admin/dashboard.routes');
const submissionsRoutes = require('./routes/admin/submissions.routes');
const teamRoutes = require('./routes/admin/team.routes');
const reportsRoutes = require('./routes/admin/reports.routes');

const app = express();

// Trust reverse proxy (useful on Vercel/Render/Heroku/Nginx)
app.set('trust proxy', 1);

// Basic security + logging
app.use(helmet());
app.use(morgan('dev'));

// CORS
app.use(
  cors({
    origin: [
      "https://connect.cavaluer.com",
      "https://www.connect.cavaluer.com",
      "http://localhost:3000",
      "http://localhost:8080",
      "http://localhost:8081",
      "http://nanak-admin.vercel.app/"

    ],
    credentials: true,
  })
);


// Rate limiting (simple default)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Stripe webhooks MUST run before express.json (raw body required)
app.use('/api', webhookRoutes);
// JSON parsing (Stripe webhook uses raw body in its router)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (local storage)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nanak-accounts-backend', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
// Aliases for older frontends
app.use('/api', publicRoutes);

app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/submissions', submissionsRoutes);
app.use('/api/admin/team', teamRoutes);
app.use('/api/admin/reports', reportsRoutes);

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

module.exports = app;
