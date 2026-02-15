// const { createTransporter } = require('../config/mailer');

// function getStaffEmails() {
//   // Comma separated in env
//   const list = (process.env.STAFF_NOTIFICATION_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
//   return list.length ? list : null;
// }

// function baseLayout(innerHtml) {
//   return `
//     <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
//       ${innerHtml}
//     </div>
//   `;
// }

// function formDataTable(formData) {
//   if (!formData || typeof formData !== 'object') return '';
//   const rows = Object.entries(formData)
//     .map(([k, v]) => {
//       const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
//       return `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">${k}</td><td style="padding:8px;border:1px solid #ddd;">${val}</td></tr>`;
//     })
//     .join('');
//   return `<table style="width:100%;border-collapse:collapse;">${rows}</table>`;
// }

// async function notifyStaffNewSubmission(submission) {
//   const transporter = createTransporter();
//   const staffEmails = getStaffEmails();
//   if (!staffEmails) return;

//   const adminUrl = process.env.ADMIN_URL || '';
//   const subject = `🆕 New Submission — ${submission.serviceName} — ${submission.orderNumber}`;

//   const html = baseLayout(`
//     <div style="background:#1a1a2e;color:white;padding:20px;border-radius:8px 8px 0 0;">
//       <h2 style="margin:0;">New Customer Submission</h2>
//       <p style="margin:5px 0 0;opacity:0.8;">${submission.orderNumber}</p>
//     </div>
//     <div style="padding:20px;border:1px solid #e0e0e0;border-top:0;border-radius:0 0 8px 8px;">
//       <h3 style="color:#333;">Customer Details</h3>
//       <table style="width:100%;border-collapse:collapse;">
//         <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Name</td><td style="padding:8px;border:1px solid #ddd;">${submission.customerName}</td></tr>
//         <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Email</td><td style="padding:8px;border:1px solid #ddd;">${submission.email}</td></tr>
//         <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Phone</td><td style="padding:8px;border:1px solid #ddd;">${submission.phone}</td></tr>
//         <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Service</td><td style="padding:8px;border:1px solid #ddd;">${submission.serviceName}</td></tr>
//         <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Package</td><td style="padding:8px;border:1px solid #ddd;">${submission.packageType}</td></tr>
//         <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Amount</td><td style="padding:8px;border:1px solid #ddd;">$${submission.amount}</td></tr>
//       </table>

//       <h3 style="color:#333;margin-top:20px;">Form Data</h3>
//       ${formDataTable(submission.formData)}

//       ${adminUrl ? `
//         <div style="margin-top:20px;text-align:center;">
//           <a href="${adminUrl}/admin/submissions/${submission._id}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">View in Admin Panel</a>
//         </div>
//       ` : ''}
//     </div>
//   `);

//   await transporter.sendMail({
//     from: `"Nanak Accounts" <${process.env.SMTP_EMAIL}>`,
//     to: staffEmails.join(', '),
//     subject,
//     html,
//   });
// }

// async function notifyStaffAssigned(submission, staffMemberEmail, staffMemberName, assignedBy) {
//   const transporter = createTransporter();
//   if (!staffMemberEmail) return;

//   const adminUrl = process.env.ADMIN_URL || '';
//   const subject = `📋 New Assignment — ${submission.serviceName} — ${submission.orderNumber}`;
//   const html = baseLayout(`
//     <h2>You\'ve been assigned a new job</h2>
//     <p><strong>Assigned by:</strong> ${assignedBy}</p>
//     <p><strong>Assigned to:</strong> ${staffMemberName}</p>
//     <table style="width:100%;border-collapse:collapse;margin:15px 0;">
//       <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Order</td><td style="padding:8px;border:1px solid #ddd;">${submission.orderNumber}</td></tr>
//       <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Customer</td><td style="padding:8px;border:1px solid #ddd;">${submission.customerName}</td></tr>
//       <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Service</td><td style="padding:8px;border:1px solid #ddd;">${submission.serviceName}</td></tr>
//       <tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">Amount</td><td style="padding:8px;border:1px solid #ddd;">$${submission.amount}</td></tr>
//     </table>
//     ${adminUrl ? `<a href="${adminUrl}/admin/submissions/${submission._id}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">View Submission</a>` : ''}
//   `);

//   await transporter.sendMail({
//     from: `"Nanak Accounts" <${process.env.SMTP_EMAIL}>`,
//     to: staffMemberEmail,
//     subject,
//     html,
//   });
// }

// async function notifyCustomerCompleted(submission) {
//   const transporter = createTransporter();
//   const subject = `✅ Your ${submission.serviceName} is Complete — ${submission.orderNumber}`;
//   const html = baseLayout(`
//     <h2>Good news, ${submission.customerName}!</h2>
//     <p>Your <strong>${submission.serviceName}</strong> (Order: ${submission.orderNumber}) has been completed.</p>
//     <p>Our team will send you the relevant documents shortly. If you have any questions, please reply to this email.</p>
//     <p>Thank you for choosing Nanak Accounts!</p>
//   `);

//   await transporter.sendMail({
//     from: `"Nanak Accounts" <${process.env.SMTP_EMAIL}>`,
//     to: submission.email,
//     subject,
//     html,
//   });
// }

// async function requestDocumentFromCustomer(submission, documentType, message) {
//   const transporter = createTransporter();
//   const subject = `📎 Document Required — ${submission.orderNumber}`;
//   const html = baseLayout(`
//     <h2>Hi ${submission.customerName},</h2>
//     <p>We need the following document to proceed with your <strong>${submission.serviceName}</strong>:</p>
//     <div style="background:#f5f5f5;padding:15px;border-radius:6px;margin:15px 0;">
//       <strong>${documentType}</strong>
//       <p style="margin:8px 0 0;">${message}</p>
//     </div>
//     <p>Please reply to this email with the required document attached.</p>
//     <p>Thank you,<br/>Nanak Accounts Team</p>
//   `);

//   await transporter.sendMail({
//     from: `"Nanak Accounts" <${process.env.SMTP_EMAIL}>`,
//     to: submission.email,
//     subject,
//     html,
//   });
// }

// async function emailSubmissionToStaff(submission, staffEmail, staffName, customMessage) {
//   const transporter = createTransporter();
//   const subject = `📨 Submission Data — ${submission.orderNumber} — ${submission.serviceName}`;
//   const adminUrl = process.env.ADMIN_URL || '';

//   const html = baseLayout(`
//     <h2>Submission: ${submission.orderNumber}</h2>
//     ${customMessage ? `<p style="background:#fff3cd;padding:10px;border-radius:4px;"><strong>Note:</strong> ${customMessage}</p>` : ''}
//     <h3>Customer</h3>
//     <p>${submission.customerName} — ${submission.email} — ${submission.phone}</p>
//     <h3>Service: ${submission.serviceName} (${submission.packageType})</h3>
//     ${formDataTable(submission.formData)}
//     ${adminUrl ? `<p style="margin-top:15px;"><a href="${adminUrl}/admin/submissions/${submission._id}">Open in Admin Panel</a></p>` : ''}
//   `);

//   await transporter.sendMail({
//     from: `"Nanak Accounts" <${process.env.SMTP_EMAIL}>`,
//     to: staffEmail,
//     subject,
//     html,
//   });
// }

// module.exports = {
//   notifyStaffNewSubmission,
//   notifyStaffAssigned,
//   notifyCustomerCompleted,
//   requestDocumentFromCustomer,
//   emailSubmissionToStaff,
// };


const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // 587 = false
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// 🔥 Verify SMTP connection on server start
transporter.verify(function (error, success) {
  if (error) {
    console.error('❌ SMTP Connection Failed:', error);
  } else {
    console.log('✅ SMTP Server is ready to send emails');
  }
});

exports.notifyStaffNewSubmission = async (submission) => {
  try {
    console.log('📨 Attempting to send email...');

    const adminEmails = [
      'Info@nanakaccountants.com.au',
      'shivanshunigam8@gmail.com',
    ];

  const htmlTemplate = `
  <div style="font-family: Arial, sans-serif; background:#f4f6f9; padding:20px;">
    <div style="max-width:700px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 3px 10px rgba(0,0,0,0.1);">

      <div style="background:#1e3a8a; color:#ffffff; padding:20px;">
        <h2 style="margin:0;">🚀 New Service Registration</h2>
        <p style="margin:5px 0 0;">A new submission has been received.</p>
      </div>

      <div style="padding:20px;">

        <h3 style="margin-bottom:10px;">📌 Order Details</h3>

        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
          <tr style="background:#f9fafb;">
            <td><strong>Order Number</strong></td>
            <td>${submission.orderNumber}</td>
          </tr>
          <tr>
            <td><strong>Service</strong></td>
            <td>${submission.serviceName}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td><strong>Package</strong></td>
            <td>${submission.packageType}</td>
          </tr>
          <tr>
            <td><strong>Amount</strong></td>
            <td>$${submission.amount}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td><strong>Payment Status</strong></td>
            <td>${submission.paymentStatus}</td>
          </tr>
        </table>

        <h3 style="margin-top:30px; margin-bottom:10px;">👤 Customer Details</h3>

        <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
          <tr style="background:#f9fafb;">
            <td><strong>Name</strong></td>
            <td>${submission.customerName}</td>
          </tr>
          <tr>
            <td><strong>Email</strong></td>
            <td>${submission.email}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td><strong>Phone</strong></td>
            <td>${submission.phone}</td>
          </tr>
        </table>

        <h3 style="margin-top:30px;">📎 Additional Details</h3>
        <pre style="background:#f3f4f6; padding:15px; border-radius:5px; font-size:13px; overflow:auto;">
${JSON.stringify(submission.formData, null, 2)}
        </pre>

      </div>

      <div style="background:#f9fafb; padding:15px; text-align:center; font-size:12px; color:#6b7280;">
        Nanak Accountants Admin System <br/>
        This is an automated notification.
      </div>

    </div>
  </div>
  `;

  await transporter.sendMail({
    from: `"Nanak Accountants" <${process.env.SMTP_USER}>`,
    to: adminEmails.join(','),
    subject: `New Submission - ${submission.serviceName} (${submission.orderNumber})`,
    html: htmlTemplate,
  });
} catch (err) {
    console.error('❌ Failed to send email:', err);
  }
}
