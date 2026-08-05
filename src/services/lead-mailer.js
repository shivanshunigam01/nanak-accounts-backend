/**
 * Lead CRM outbound mail — uses same transporter pattern as mailer.js.
 */

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "mail.premium.exchange",
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const FOCUS = {
  individual_tax: "deductions and super contributions",
  business_tax: "structure and business expenses",
  business_advisory: "structure and cost optimisation",
  property_tax: "loans, depreciation and CGT position",
  smsf: "fund structure and compliance",
};

const SVC_LABEL = {
  individual_tax: "Individual tax",
  business_tax: "Business tax",
  business_advisory: "Business advisory",
  property_tax: "Property & CGT",
  smsf: "SMSF",
};

function fromAddress() {
  return `"Nanak Accountants" <${process.env.MAIL_USER || "noreply@nanakaccountants.com.au"}>`;
}

function brandShell(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:28px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
<tr><td style="background:linear-gradient(135deg,#1B2A4A,#24548f);padding:28px;text-align:center;">
<img src="https://nanak-accounts-backend.onrender.com/assets/logo-nanak.webp" alt="Nanak Accountants" width="140" style="margin-bottom:12px;"/>
<h1 style="color:#fff;font-size:20px;margin:0;">${title}</h1>
</td></tr>
<tr><td style="padding:28px 32px;color:#23262B;font-size:15px;line-height:1.55;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#6B7280;">
Nanak Accountants · <a href="https://nanakaccountants.com.au" style="color:#F26B21;">nanakaccountants.com.au</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendMail({ to, subject, html, text }) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.warn("[lead-mailer] MAIL_USER/MAIL_PASS missing — skipping send to", to);
    return { skipped: true };
  }
  return transporter.sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
    text: text || undefined,
  });
}

async function sendCaseStudy(lead) {
  const svc = lead.serviceInterest || "individual_tax";
  const focus = FOCUS[svc] || FOCUS.individual_tax;
  const label = SVC_LABEL[svc] || "tax";
  const name = lead.name || "there";
  const html = brandShell(
    `Your ${label} case study`,
    `<p>Hi ${escapeHtml(name)},</p>
     <p>Thanks for reaching out to Nanak Accountants. Based on your interest in <strong>${escapeHtml(label)}</strong>, we've put together a short case study focused on <strong>${escapeHtml(focus)}</strong>.</p>
     <p>Many clients in a similar position save time and tax when they get a clear plan early — especially around the areas above.</p>
     <p style="margin:24px 0;"><a href="https://calendly.com/nanakaccountants/15min" style="display:inline-block;background:#F26B21;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">Book a free 15-minute call</a></p>
     <p>If you have questions before then, just reply to this email.</p>
     <p>— The Nanak team</p>`
  );
  return sendMail({
    to: lead.email,
    subject: `Your ${label} case study from Nanak Accountants`,
    html,
  });
}

async function sendNurture(lead, step) {
  const name = lead.name || "there";
  const subjects = {
    1: "Did you get a chance to read it?",
    2: "Another angle that often helps",
    3: "Want that free 15 minutes?",
  };
  const bodies = {
    1: `<p>Hi ${escapeHtml(name)},</p><p>Just checking you received the case study we sent. One quick question — is tax planning something you're looking at this year, or later?</p><p>Reply anytime, or <a href="https://calendly.com/nanakaccountants/15min">book 15 minutes here</a>.</p>`,
    2: `<p>Hi ${escapeHtml(name)},</p><p>Sharing a second angle that often helps people in a similar spot: clarity on structure and timing usually unlocks more than chasing every deduction alone.</p><p><a href="https://calendly.com/nanakaccountants/15min">Book a free call</a> if you'd like us to walk through your numbers.</p>`,
    3: `<p>Hi ${escapeHtml(name)},</p><p>Want that free 15 minutes with a Nanak accountant? No pressure — just a clear next step if it helps.</p><p style="margin:24px 0;"><a href="https://calendly.com/nanakaccountants/15min" style="display:inline-block;background:#F26B21;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">Book my free 15 minutes</a></p>`,
  };
  const html = brandShell(subjects[step] || "From Nanak Accountants", bodies[step] || bodies[1]);
  return sendMail({
    to: lead.email,
    subject: subjects[step] || "From Nanak Accountants",
    html,
  });
}

async function sendWinback(lead) {
  const name = lead.name || "there";
  const html = brandShell(
    "Still with the same accountant?",
    `<p>Hi ${escapeHtml(name)},</p>
     <p>It's been a little while since we last spoke. If you're still with the same accountant — or wondering whether a fresh look would help — we're happy to offer a free 15-minute chat.</p>
     <p><a href="https://calendly.com/nanakaccountants/15min" style="display:inline-block;background:#F26B21;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">Book a time</a></p>
     <p>If you'd rather not hear from us, reply "unsubscribe" and we'll take you off this list.</p>`
  );
  return sendMail({
    to: lead.email,
    subject: "Still with the same accountant?",
    html,
  });
}

async function sendCustomEmail(lead, { subject, message }) {
  const html = brandShell(
    escapeHtml(subject || "Message from Nanak Accountants"),
    `<p>${escapeHtml(message || "").replace(/\n/g, "<br/>")}</p>`
  );
  return sendMail({
    to: lead.email,
    subject: subject || "Message from Nanak Accountants",
    html,
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  sendMail,
  sendCaseStudy,
  sendNurture,
  sendWinback,
  sendCustomEmail,
  FOCUS,
  SVC_LABEL,
};
