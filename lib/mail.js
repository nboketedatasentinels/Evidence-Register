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

function fromAddress() {
  const raw = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  const email = (raw.match(/<([^>]+)>/) || [])[1] || raw;
  if (!email) fail(500, 'Email is not configured. Set SMTP_USER and SMTP_PASS.');
  return `Data Sentinels <${email}>`;
}

function inviteCopy(invite, url) {
  const name = invite.name || invite.email;
  const role = roleLabel(invite.profile);
  const signature = invite.signatureRequired
    ? 'When you open the link, draw your signature, then sign in.'
    : 'Your details are already on the register. Open the link to sign in.';
  const text = [
    'Data Sentinels',
    'Evidence Register',
    '',
    `Hello ${name},`,
    '',
    `You have been added to the Evidence Register with the ${role} profile.`,
    signature,
    '',
    url,
    '',
    'Use the email address this message was sent to.',
    'This is not an internal audit or a certificate.',
  ].join('\n');
  const safeName = escapeHtml(name);
  const safeRole = escapeHtml(role);
  const safeUrl = escapeHtml(url);
  const signatureHtml = invite.signatureRequired
    ? 'When you open the link, draw your signature, then sign in.'
    : 'Your details are already on the register. Open the link to sign in.';
  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#F4F6F8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #E6EAF0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#071E36;padding:28px 32px;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#9BB0C7;">Data Sentinels</p>
                <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;font-weight:700;color:#ffffff;">Evidence Register</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#121417;">
                <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Hello ${safeName},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3d4654;">You have been added to the Evidence Register with the <strong style="color:#121417;">${safeRole}</strong> profile. ${escapeHtml(signatureHtml)}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;background:#F4F6F8;border:1px solid #E6EAF0;border-radius:12px;">
                  <tr>
                    <td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5c6775;">Profile</td>
                    <td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#071E36;">${safeRole}</td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#1860C8;border-radius:8px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Sign in</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#5c6775;">If the button does not open, copy this address into your browser:</p>
                <p style="margin:8px 0 0;font-size:13px;line-height:1.6;"><a href="${safeUrl}" style="color:#1860C8;word-break:break-all;">${safeUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 24px;border-top:1px solid #E6EAF0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">
                Use the email address this message was sent to.<br>This is not an internal audit or a certificate.
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

async function sendInvite(invite, origin) {
  const url = inviteUrl(invite, origin);
  const from = fromAddress();
  const message = inviteCopy(invite, url);
  const info = await transport().sendMail({
    from,
    to: invite.email,
    subject: 'Invitation to the Evidence Register',
    text: message.text,
    html: message.html,
  });
  const rejected = info.rejected || [];
  if (rejected.length) fail(502, `The mailbox refused ${rejected.join(', ')}.`);
  return url;
}

async function sendReset(reset) {
  const from = fromAddress();
  const name = reset.name || reset.email;
  const url = reset.url;
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  await transport().sendMail({
    from,
    to: reset.email,
    subject: 'Reset your Evidence Register password',
    text: [
      'Data Sentinels',
      'Evidence Register',
      '',
      `Hello ${name},`,
      '',
      'A new password was requested for the account an admin added.',
      'Open this link to choose a new password. It expires in one hour:',
      url,
      '',
      'If you did not ask for this, you can ignore this message.',
    ].join('\n'),
    html: `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#F4F6F8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #E6EAF0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#071E36;padding:28px 32px;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#9BB0C7;">Data Sentinels</p>
                <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;font-weight:700;color:#ffffff;">Evidence Register</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#121417;">
                <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Hello ${safeName},</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d4654;">A new password was requested for the account an admin added. This link expires in one hour.</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#1860C8;border-radius:8px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Choose a new password</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#5c6775;">If the button does not open, copy this address into your browser:</p>
                <p style="margin:8px 0 0;font-size:13px;line-height:1.6;"><a href="${safeUrl}" style="color:#1860C8;word-break:break-all;">${safeUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 24px;border-top:1px solid #E6EAF0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">
                If you did not ask for this, you can ignore this message.<br>This is not an internal audit or a certificate.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { sendInvite, sendReset, inviteUrl };
