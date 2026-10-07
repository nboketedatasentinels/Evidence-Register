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

function letter({ title, greeting, paragraphs, note, url, action, footer }) {
  const text = [
    'Data Sentinels',
    'Evidence Register',
    '',
    title,
    '',
    greeting,
    '',
    ...paragraphs,
    note ? '' : null,
    note || null,
    '',
    `${action}:`,
    url,
    '',
    ...footer,
  ].filter((line) => line !== null).join('\n');
  const body = paragraphs
    .map((paragraph) => `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#243042;">${escapeHtml(paragraph)}</p>`)
    .join('');
  const noteHtml = note
    ? `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#243042;">${escapeHtml(note)}</p>`
    : '';
  const foot = footer.map((line) => escapeHtml(line)).join('<br>');
  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#e8edf3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8edf3;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d9e1ea;border-radius:12px;overflow:hidden;">
            <tr>
              <td bgcolor="#071E36" style="background:#071E36;padding:28px 36px 26px;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.14em;color:#8FB4E8;">DATA SENTINELS</p>
                <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">Evidence Register</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 8px;">
                <h1 style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.35;font-weight:700;color:#071E36;">${escapeHtml(title)}</h1>
                <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#243042;">${escapeHtml(greeting)}</p>
                ${body}
                ${noteHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td bgcolor="#1860C8" style="background:#1860C8;border-radius:8px;">
                      <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;">${escapeHtml(action)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px 32px;">
                <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7785;">If the button does not open, copy this address into your browser.</p>
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:#1860C8;text-decoration:underline;">${escapeHtml(url)}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 36px 22px;border-top:1px solid #e6eaf0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7785;">
                ${foot}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#8b97a3;">Data Sentinels</p>
        </td>
      </tr>
    </table>
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
    title: 'Your account is ready',
    greeting: `Hello ${name},`,
    paragraphs: [
      `An admin has added you to the Evidence Register with the ${role} role.`,
    ],
    note: signature,
    url,
    action: 'Sign in',
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
    subject: 'Your Data Sentinels account is ready',
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
    title: 'Choose a new password',
    greeting: `Hello ${name},`,
    paragraphs: [
      'A new password was requested for the account an admin added.',
    ],
    note: 'This link expires in one hour.',
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
