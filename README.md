# Nanak Accounts Backend (Node + Express + MongoDB)

This is a **ready-to-run** backend matching your API documentation:
- Node.js + Express
- MongoDB (Mongoose)
- JWT Auth (admin / manager / staff)
- Stripe Webhook
- Nodemailer notifications

## 1) Setup

```bash
cd nanak-accounts-backend
npm install
cp .env.example .env
# edit .env
npm run seed
npm run dev
```

Health check:
- `GET /health`

Uploads are stored locally:
- `GET /uploads/<file>`

## 2) API Endpoints

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout` (Bearer token)
- `GET /api/auth/me` (Bearer token)

### Dashboard (Bearer token)
- `GET /api/admin/dashboard/stats`
- `GET /api/admin/dashboard/revenue-chart?period=week|month`
- `GET /api/admin/dashboard/service-distribution`
- `GET /api/admin/dashboard/recent-submissions`

### Submissions (Bearer token)
- `GET /api/admin/submissions` (supports filters: search, paymentStatus, serviceKey, jobStatus, page, limit, sortBy, sortOrder)
- `GET /api/admin/submissions/:id`
- `PUT /api/admin/submissions/:id/assign` (admin/manager)
- `PUT /api/admin/submissions/:id/status`
- `POST /api/admin/submissions/:id/notes`
- `POST /api/admin/submissions/:id/request-document`
- `POST /api/admin/submissions/:id/email-to-staff` (admin/manager)

### Team (admin/manager)
- `GET /api/admin/team`
- `POST /api/admin/team`
- `PUT /api/admin/team/:id`
- `DELETE /api/admin/team/:id`

### Reports (admin/manager)
- `GET /api/admin/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/admin/reports/conversion-funnel?period=week|month`
- `GET /api/admin/reports/staff-workload`
- `GET /api/admin/reports/service-popularity`

### Public (no auth)
- `POST /api/public/submit-form`

### Checkout (no auth)
These are included to match your `API_DOCUMENTATION.md` version too:
- `POST /api/public/checkout/submit` (multipart: `payload` JSON + files)
- `POST /api/public/create-checkout-session`

### Stripe Webhook
- `POST /api/webhooks/stripe` (raw body)
- alias: `POST /api/stripe-webhook`

## 3) Notes
- **JWT logout is stateless** (frontend deletes token).
- Stripe webhook updates `paymentStatus` to `paid/failed/refunded`.
- On status change to `completed`, customer completion email is sent (best-effort).

