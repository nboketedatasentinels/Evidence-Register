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

function letter({ title, greeting, paragraphs, note, url, action, footer, logo }) {
  const text = [
    'Data Sentinels',
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
    .map((paragraph) => `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1c2430;">${escapeHtml(paragraph)}</p>`)
    .join('');
  const noteHtml = note
    ? `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1c2430;">${escapeHtml(note)}</p>`
    : '';
  const foot = footer.map((line) => `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7785;">${escapeHtml(line)}</p>`).join('');
  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:36px 20px 48px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
            <tr>
              <td align="center" style="padding:8px 0 28px;">
                <img src="${escapeHtml(logo)}" width="210" alt="Data Sentinels" style="display:block;width:210px;max-width:210px;height:auto;border:0;">
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 12px 28px;">
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1.15;font-weight:700;color:#1B4F9C;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 8px 8px;">
                <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#1c2430;">${escapeHtml(greeting)}</p>
                ${body}
                ${noteHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 8px 12px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td bgcolor="#1860C8" style="background:#1860C8;border-radius:8px;">
                      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;">${escapeHtml(action)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 8px 28px;">
                <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7785;">If the button does not open, copy this address into your browser.</p>
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:#1860C8;text-decoration:underline;">${escapeHtml(url)}</a></p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 8px 0;border-top:1px solid #e6eaf0;">
                ${foot}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { text, html };
}

function organisationName(name) {
  const value = String(name || '').trim();
  return value || 'Data Sentinels';
}

function logoUrl(page) {
  const configured = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (configured) return `${configured}/data-sentinels-logo.png`;
  try {
    return `${new URL(page).origin}/data-sentinels-logo.png`;
  } catch {
    return `${originOf(page)}/data-sentinels-logo.png`;
  }
}

function inviteWork(profile, organisation) {
  if (profile === 'reviewer') {
    return `You will review evidence filed for ${organisation}. You can accept, reject, edit, or ask for more evidence. You make the final decision.`;
  }
  if (profile === 'admin') {
    return `You can set up the people and the requirements for ${organisation}.`;
  }
  return `You can submit evidence for the requirements ${organisation} has already set. After you sign a document, the named reviewer makes the final decision.`;
}

function inviteCopy(invite, url, organisation, origin) {
  const name = invite.name || invite.email;
  const signature = invite.signatureRequired
    ? 'When you open Evidence Register, draw your signature, choose a password, and sign in.'
    : 'When you open Evidence Register, choose a password and sign in. Your name and email are already filled in.';
  return letter({
    title: "You're invited",
    greeting: `Hello ${name},`,
    paragraphs: [
      `${organisation} has invited you to the Evidence Register.`,
      inviteWork(invite.profile, organisation),
    ],
    note: signature,
    url,
    action: 'Open Evidence Register',
    logo: logoUrl(origin),
    footer: [
      `Sent for ${organisation}.`,
      'Evidence Register supports AI governance and evidence management. It does not replace an internal audit or provide ISO/IEC 42001 certification.',
    ],
  });
}

async function sendInvite(invite, origin, name) {
  const url = inviteUrl(invite, origin);
  const organisation = organisationName(name);
  const message = inviteCopy(invite, url, organisation, origin);
  const info = await transport().sendMail({
    from: fromAddress(),
    replyTo: mailbox(),
    to: invite.email,
    subject: `${organisation} has invited you`,
    text: message.text,
    html: message.html,
  });
  const rejected = info.rejected || [];
  if (rejected.length) fail(502, `The mailbox refused ${rejected.join(', ')}.`);
  return url;
}

async function sendReset(reset) {
  const name = reset.name || reset.email;
  const organisation = organisationName(reset.organisation);
  const message = letter({
    title: 'Choose a new password',
    greeting: `Hello ${name},`,
    paragraphs: [
      `${organisation} received a request to choose a new password for your Evidence Register account.`,
    ],
    note: 'This link expires in one hour. If you did not ask for this, you can ignore this message.',
    url: reset.url,
    action: 'Choose a new password',
    logo: logoUrl(reset.url),
    footer: [
      `Sent for ${organisation}.`,
      'Evidence Register supports AI governance and evidence management. It does not replace an internal audit or provide ISO/IEC 42001 certification.',
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
