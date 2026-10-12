const crypto = require('crypto');
const { rest, eq } = require('./supabase');

const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const MINIMAL = { Prefer: 'return=minimal' };

function account(row) {
  if (!row) return null;
  return {
    email: row.email,
    personId: row.person_id || '',
    organisationId: row.organisation_id || '',
    operator: Boolean(row.platform_operator),
    salt: row.salt,
    hash: row.password_hash,
    createdAt: row.created_at,
    resetToken: row.reset_token || '',
    resetExpires: Number(row.reset_expires) || 0,
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, account) {
  const next = hashPassword(password, account.salt);
  const left = Buffer.from(next.hash, 'hex');
  const right = Buffer.from(account.hash, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function findByEmail(email) {
  const rows = await rest(`accounts?select=*&email=${eq(email)}`);
  return account(rows?.[0]);
}

async function addAccount(row) {
  await rest('accounts', {
    method: 'POST',
    headers: MINIMAL,
    body: {
      email: row.email,
      person_id: row.personId || null,
      organisation_id: row.organisationId || null,
      platform_operator: Boolean(row.operator),
      salt: row.salt,
      password_hash: row.hash,
      created_at: row.createdAt || new Date().toISOString(),
    },
  });
}

async function createSession(found) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await rest(`sessions?expires_at=lt.${now}`, { method: 'DELETE', headers: MINIMAL });
  await rest('sessions', {
    method: 'POST',
    headers: MINIMAL,
    body: {
      token,
      email: found.email,
      person_id: found.personId || null,
      organisation_id: found.organisationId || null,
      created_at: new Date(now).toISOString(),
      expires_at: now + SESSION_MS,
    },
  });
  return token;
}

// Who a bearer token belongs to: { email, personId, organisationId, operator }.
async function sessionFor(token) {
  if (!token) return null;
  const rows = await rest(`sessions?select=*&token=${eq(token)}&expires_at=gt.${Date.now()}`);
  const session = rows?.[0];
  if (!session) return null;
  const owner = await findByEmail(session.email);
  if (!owner) return null;
  return {
    email: owner.email,
    personId: owner.personId,
    organisationId: owner.organisationId,
    operator: owner.operator,
  };
}

async function destroySession(token) {
  if (!token) return;
  await rest(`sessions?token=${eq(token)}`, { method: 'DELETE', headers: MINIMAL });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function updateAccount(email, fields) {
  await rest(`accounts?email=${eq(email)}`, { method: 'PATCH', headers: MINIMAL, body: fields });
}

async function rememberReset(email) {
  const found = await findByEmail(email);
  if (!found) return '';
  const token = crypto.randomBytes(32).toString('hex');
  await updateAccount(email, { reset_token: hashToken(token), reset_expires: Date.now() + 60 * 60 * 1000 });
  return token;
}

async function accountForReset(token) {
  if (!token) return null;
  const rows = await rest(`accounts?select=*&reset_token=${eq(hashToken(token))}&reset_expires=gt.${Date.now()}`);
  return account(rows?.[0]);
}

async function clearReset(email) {
  await updateAccount(email, { reset_token: '', reset_expires: 0 });
}

async function replacePassword(email, password) {
  const found = await findByEmail(email);
  if (!found) return null;
  const secret = hashPassword(password);
  await updateAccount(email, { salt: secret.salt, password_hash: secret.hash, reset_token: '', reset_expires: 0 });
  await rest(`sessions?email=${eq(email)}`, { method: 'DELETE', headers: MINIMAL });
  return found;
}

module.exports = {
  hashPassword,
  verifyPassword,
  findByEmail,
  addAccount,
  createSession,
  sessionFor,
  destroySession,
  rememberReset,
  accountForReset,
  clearReset,
  replacePassword,
};
