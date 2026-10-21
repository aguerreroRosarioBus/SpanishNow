// Outgoing email (nodemailer).
//   MAIL_TRANSPORT=log   prints each email to the console and writes it to backend/tmp/mail/*.json instead of sending it
//                        (default outside production). Under Jest it only keeps them in memory (see getOutbox).
//   MAIL_TRANSPORT=smtp  sends through SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS (default in production).
// MAIL_FROM is the sender, e.g. "SpanishNow <no-reply@example.com>".
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const nodemailer = require('nodemailer');

const LOG_DIR = path.join(__dirname, '..', '..', 'tmp', 'mail');
const OUTBOX_LIMIT = 200;
const outbox = [];
let smtpTransport = null;

const isProduction = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);
const transportName = () => (process.env.MAIL_TRANSPORT || (isProduction() ? 'smtp' : 'log')).toLowerCase();
const sender = () => process.env.MAIL_FROM || 'SpanishNow <no-reply@spanishnow.local>';

function getSmtp() {
  if (!smtpTransport) {
    if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST is not set (MAIL_TRANSPORT=smtp)');
    const port = Number(process.env.SMTP_PORT) || 587;
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined
    });
  }
  return smtpTransport;
}

async function logEmail(message) {
  outbox.push(message);
  if (outbox.length > OUTBOX_LIMIT) outbox.shift();
  if (process.env.NODE_ENV === 'test') return;
  console.log(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
  await fs.promises.mkdir(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `${message.sentAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`);
  await fs.promises.writeFile(file, JSON.stringify(message, null, 2));
}

/** Sends { to, subject, text, html }. Rejects when the transport fails: callers decide whether that matters. */
async function sendMail({ to, subject, text, html }) {
  const message = { from: sender(), to, subject, text, html };
  const name = transportName();
  if (name === 'log') return logEmail({ ...message, sentAt: new Date().toISOString() });
  if (name !== 'smtp') throw new Error(`Unknown MAIL_TRANSPORT "${name}" (use log or smtp)`);
  return getSmtp().sendMail(message);
}

/** Emails kept in memory by the log transport (most recent last). Meant for tests. */
const getOutbox = () => outbox;
const clearOutbox = () => { outbox.length = 0; };

module.exports = { sendMail, getOutbox, clearOutbox, LOG_DIR };
