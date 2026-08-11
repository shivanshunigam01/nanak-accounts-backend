const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require("fs");

const { notFound } = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const publicRoutes = require('./routes/public.routes');
const webhookRoutes = require('./routes/webhooks.routes');
const pricingRoutes = require('./routes/admin/pricing.routes');


const dashboardRoutes = require('./routes/admin/dashboard.routes');
const toolSessionsRoutes = require('./routes/admin/tool-sessions.routes');
const submissionsRoutes = require('./routes/admin/submissions.routes');
const teamRoutes = require('./routes/admin/team.routes');
const quotePadRoutes = require('./routes/admin/quote-pad.routes');
const salesCommissionRoutes = require('./routes/admin/sales-commission.routes');
const clientManagementRoutes = require('./routes/admin/client-management.routes');
const reportsRoutes = require('./routes/admin/reports.routes');
const accountingPricing = require('./routes/accounting-pricing.routes');
const solensmsf = require('./routes/sole-trader-pricing.routes');
const smsf = require('./routes/smsf-pricing.routes');
const paymentSuccessEmailRoutes = require("./routes/payment-success-email.routes");
const careersRoutes = require("./routes/careers.routes.js");
const jobApplicationRoutes = require("./routes/job-applications.routes.js");
const bookkeepingRoutes = require("./routes/bookkeepingPricingRoutes");
const payrollRoutes = require("./routes/payrollPricingRoutes");
const webinarUploadsDir = path.join(__dirname, "uploads", "webinars");
const blogUploadsDir = path.join(__dirname, "uploads", "blogs");


if (!fs.existsSync(webinarUploadsDir)) {
  fs.mkdirSync(webinarUploadsDir, { recursive: true });
}
if (!fs.existsSync(blogUploadsDir)) {
  fs.mkdirSync(blogUploadsDir, { recursive: true });
}

// Import routes
const webinarRoutes = require("./routes/webinar.routes");
const adminWebinarRoutes = require("./routes/admin-webinar.routes");
const adminWebinarRegRoutes = require("./routes/admin-webinar-registration.routes.js");
const blogRoutes = require("./routes/blog.routes");
const adminBlogRoutes = require("./routes/admin-blog.routes");
const taxCheckLeadsRoutes = require("./routes/tax-check-leads.routes");
const adminTaxCheckLeadsRoutes = require("./routes/admin/tax-check-leads.routes");
const newsletterSubscribersRoutes = require("./routes/newsletter-subscribers.routes");
const adminNewsletterSubscribersRoutes = require("./routes/admin/newsletter-subscribers.routes");
const leadsRoutes = require("./routes/leads.routes");
const adminLeadsRoutes = require("./routes/admin/leads.routes");
const benchmarkModuleRoutes = require("./modules/benchmark/benchmark.routes");









const app = express();

// Trust reverse proxy (useful on Vercel/Render/Heroku/Nginx)
app.set('trust proxy', 1);

// Basic security + logging
// frameguard disabled so /embeds can set frame-ancestors for marketing-site iframes
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  frameguard: false,
}));
app.use(morgan('dev'));

// CORS
app.use(
  cors({
    origin: [
      "https://connect.cavaluer.com",
      "https://www.connect.cavaluer.com",
      "http://connect.cavaluer.com",
      "http://www.connect.cavaluer.com",
      "https://nanak-admin.vercel.app",
      "http://localhost:3000",
      "http://localhost:8080",
      "https://c3472b4c-f660-4c54-81bb-f6069508b290.lovableproject.com",
      ".loveable.app",
      "https://loveable.app",
      "https://www.loveable.app",
      "http://localhost:8081",
      "http://localhost:5173",
      "http://localhost:5174",
      "https://loveable.com","loveableproject.com","https://loveableproject.com","https://www.loveableproject.com",".loveableproject.com",
      "https://online.nanakaccountants.com.au",
      "http://online.nanakaccountants.com.au",
      "https://admin.nanakaccountants.com.au",
      "http://admin.nanakaccountants.com.au",
      "https://nanakaccountants.com.au",
      "https://www.nanakaccountants.com.au",
      "http://nanakaccountants.com.au",
      "http://www.nanakaccountants.com.au",
      "https://nanakmigration.com.au",
      "https://www.nanakmigration.com.au",
      "http://nanakmigration.com.au",
      "http://www.nanakmigration.com.au",
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files (local storage)
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// const uploadsPath = express.static(path.join(__dirname, 'uploads'));
// app.use('/uploads', uploadsPath);
// app.use('/api/uploads', uploadsPath);


const applicationsPath = express.static(
  path.join(__dirname, "../uploads/applications")
);

app.use("/api/uploads/applications", applicationsPath);
const uploadsPath = express.static(path.join(__dirname, 'uploads'));
app.use('/uploads', uploadsPath);
app.use('/api/uploads', uploadsPath);
// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nanak-accounts-backend', timestamp: new Date().toISOString() });
});

app.use('/api/admin/pricing', pricingRoutes);
// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
// Aliases for older frontends
app.use('/api', publicRoutes);

app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/admin/tool-sessions', toolSessionsRoutes);
app.use('/api/admin/div7a', require('./routes/admin/div7a.routes'));
app.use('/api/admin/aml-compliance', require('./routes/admin/aml-compliance.routes'));
app.use('/api/admin/firm-library', require('./routes/admin/firm-library.routes'));
app.use('/api/admin/command-centre', require('./routes/admin/commandCentre.routes'));

app.use('/api/admin/submissions', submissionsRoutes);
app.use('/api/admin/team', teamRoutes);
app.use('/api/admin/quote-pad', quotePadRoutes);
app.use('/api/admin/migration-rates', require('./routes/admin/migration-rates.routes'));
app.use('/api/public/migration-rates', require('./routes/public-migration-rates.routes'));
app.use('/api/admin/sales-commission', salesCommissionRoutes);
app.use('/api/admin/client-management', clientManagementRoutes);
app.use('/api/admin/reports', reportsRoutes);
app.use('/api/admin/accounting-pricing', accountingPricing);

app.use('/api/admin/smsf-pricing', smsf);
app.use('/api/admin/sole-trader-pricing', solensmsf);
app.use("/api/checkout", paymentSuccessEmailRoutes);
app.use("/api/careers", careersRoutes);
app.use("/api/job-applications", jobApplicationRoutes);
app.use('/api/admin/bookkeeping-pricing',bookkeepingRoutes);
app.use('/api/admin/payroll-pricing',payrollRoutes);


// Mount public routes (no auth)
app.use("/api/webinars", webinarRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/tax-check-leads", taxCheckLeadsRoutes);
app.use("/api/newsletter-subscribers", newsletterSubscribersRoutes);
app.use("/api/leads", leadsRoutes);

// Mount admin routes (auth required)
app.use("/api/admin/webinars", adminWebinarRoutes);
app.use("/api/admin/webinar-registrations", adminWebinarRegRoutes);
app.use("/api/admin/blogs", adminBlogRoutes);
app.use("/api/admin/tax-check-leads", adminTaxCheckLeadsRoutes);
app.use("/api/admin/newsletter-subscribers", adminNewsletterSubscribersRoutes);
app.use("/api/admin/leads", adminLeadsRoutes);

// Footer embeds (iframe-ready: tax-check + newsletter)
const embedsDir = path.join(__dirname, "../public/embeds");
app.use(
  "/embeds",
  (req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      [
        "frame-ancestors",
        "'self'",
        "https://nanakaccountants.com.au",
        "https://www.nanakaccountants.com.au",
        "http://nanakaccountants.com.au",
        "http://www.nanakaccountants.com.au",
        "https://online.nanakaccountants.com.au",
        "http://online.nanakaccountants.com.au",
        "https://admin.nanakaccountants.com.au",
        "http://admin.nanakaccountants.com.au",
        "https://*.nanakaccountants.com.au",
        "http://*.nanakaccountants.com.au",
        "https://connect.cavaluer.com",
        "https://www.connect.cavaluer.com",
        "http://connect.cavaluer.com",
        "http://www.connect.cavaluer.com",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:5173",
      ].join(" ")
    );
    next();
  },
  express.static(embedsDir)
);

// Benchmark Intelligence Module
app.use("/api/benchmark", benchmarkModuleRoutes);
// Backward-compatible alias for existing admin UI clients
app.use("/api/admin/benchmarks", benchmarkModuleRoutes);

// Serve uploaded webinar images statically
app.use("/uploads/webinars", express.static(path.resolve(process.cwd(), "uploads/webinars")));
app.use("/uploads/blogs", express.static(path.resolve(process.cwd(), "uploads/blogs")));




// 404 + error handler
app.use(notFound);
app.use(errorHandler);

module.exports = app;
