const nodemailer = require("nodemailer");

// Sends an email. If SMTP is not configured, prints the message in the
// backend terminal instead (development fallback).
async function sendMail({ to, subject, text }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("\n=== EMAIL (SMTP not configured, printing instead) ===");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log(text);
    console.log("=====================================================\n");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

module.exports = sendMail;