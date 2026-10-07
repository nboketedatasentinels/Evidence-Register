const nodemailer = require('nodemailer');

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function invitePath(profile) {
  if (profile === 'reviewer') return '/reviewer';
  if (profile === 'admin') return '/admin';
  return '/user';
}

function roleLabel(profile) {
  if (profile === 'reviewer') return 'Reviewer';
  if (profile === 'admin') return 'Admin';
  return 'User';
}

function originOf(origin) {
  const configured = String(process.env.PUBLIC_URL || origin || '').trim().replace(/\/$/, '');
  if (!configured) fail(500, 'Set PUBLIC_URL to the address people can open.');
  return configured;
}

function inviteUrl(invite, origin) {
  return `${originOf(origin)}${invitePath(invite.profile)}?invite=${encodeURIComponent(invite.token)}`;
}

function transport() {
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
  if (!user || !pass) fail(500, 'Email is not configured. Set SMTP_USER and SMTP_PASS.');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false',
    auth: { user, pass },
  });
}

function mailbox() {
  const raw = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  const email = (raw.match(/<([^>]+)>/) || [])[1] || raw;
  if (!email) fail(500, 'Email is not configured. Set SMTP_USER and SMTP_PASS.');
  return email;
}

function fromAddress() {
  return { name: 'Data Sentinels', address: mailbox() };
}

function letter({ greeting, paragraphs, url, action, footer }) {
  const text = [
    greeting,
    '',
    ...paragraphs,
    '',
    `${action}:`,
    url,
    '',
    ...footer,
    '',
    'Data Sentinels',
    'Evidence Register',
  ].join('\n');
  const body = paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2933;">${escapeHtml(paragraph)}</p>`)
    .join('');
  const foot = footer
    .map((line) => escapeHtml(line))
    .join('<br>');
  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#ffffff;">
    <div style="max-width:560px;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
      ${body}
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;"><a href="${escapeHtml(url)}" style="color:#1860C8;">${escapeHtml(action)}</a></p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#52606d;word-break:break-all;">${escapeHtml(url)}</p>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#52606d;">${foot}</p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#52606d;">Data Sentinels<br>Evidence Register</p>
    </div>
  </body>
</html>`;
  return { text, html };
}

function inviteCopy(invite, url) {
  const name = invite.name || invite.email;
  const role = roleLabel(invite.profile);
  const signature = invite.signatureRequired
    ? 'When you open the link, draw your signature, then sign in.'
    : 'Your details are already filled in. Choose a password and sign in.';
  return letter({
    greeting: `Hello ${name},`,
    paragraphs: [
      `An admin added you to the Evidence Register as ${role}.`,
      signature,
    ],
    url,
    action: 'Open your sign-in page',
    footer: [
      'Sign in with the email address this message was sent to.',
      'This is not an internal audit or a certificate.',
    ],
  });
}

async function sendInvite(invite, origin) {
  const url = inviteUrl(invite, origin);
  const message = inviteCopy(invite, url);
  const info = await transport().sendMail({
    from: fromAddress(),
    replyTo: mailbox(),
    to: invite.email,
    subject: `${invite.name || 'Your'} Evidence Register sign-in`,
    text: message.text,
    html: message.html,
  });
  const rejected = info.rejected || [];
  if (rejected.length) fail(502, `The mailbox refused ${rejected.join(', ')}.`);
  return url;
}

async function sendReset(reset) {
  const name = reset.name || reset.email;
  const message = letter({
    greeting: `Hello ${name},`,
    paragraphs: [
      'A new password was requested for the account an admin added.',
      'This link expires in one hour.',
    ],
    url: reset.url,
    action: 'Choose a new password',
    footer: [
      'If you did not ask for this, you can ignore this message.',
      'This is not an internal audit or a certificate.',
    ],
  });
  const info = await transport().sendMail({
    from: fromAddress(),
    replyTo: mailbox(),
    to: reset.email,
    subject: 'Evidence Register password reset',
    text: message.text,
    html: message.html,
  });
  const rejected = info.rejected || [];
  if (rejected.length) fail(502, `The mailbox refused ${rejected.join(', ')}.`);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendInvite, sendReset, inviteUrl };
