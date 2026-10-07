const crypto = require('crypto');
const db = require('./db');

const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

function state() {
  const data = db.authState();
  if (!data) {
    const error = new Error('The register is still opening the database.');
    error.status = 500;
    throw error;
  }
  if (!Array.isArray(data.accounts)) data.accounts = [];
  if (!Array.isArray(data.sessions)) data.sessions = [];
  return data;
}

async function persist() {
  await db.saveAuth(state());
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

function findByEmail(email) {
  return state().accounts.find((account) => account.email === email) || null;
}

async function addAccount(account) {
  state().accounts.push(account);
  await persist();
}

async function createSession(personId) {
  const data = state();
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions.push({ token, personId, createdAt: new Date().toISOString(), expiresAt: Date.now() + SESSION_MS });
  await persist();
  return token;
}

async function personIdForToken(token) {
  if (!token) return '';
  const data = state();
  const now = Date.now();
  const sessions = data.sessions.filter((session) => session.expiresAt > now);
  if (sessions.length !== data.sessions.length) {
    data.sessions = sessions;
    await persist();
  }
  return sessions.find((session) => session.token === token)?.personId || '';
}

async function destroySession(token) {
  const data = state();
  data.sessions = data.sessions.filter((session) => session.token !== token);
  await persist();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function rememberReset(email) {
  const account = findByEmail(email);
  if (!account) return '';
  const token = crypto.randomBytes(32).toString('hex');
  account.resetToken = hashToken(token);
  account.resetExpires = Date.now() + 60 * 60 * 1000;
  await persist();
  return token;
}

function accountForReset(token) {
  const hash = hashToken(token);
  const now = Date.now();
  return state().accounts.find((account) => account.resetToken && account.resetToken === hash && Number(account.resetExpires) > now) || null;
}

async function clearReset(email) {
  const account = findByEmail(email);
  if (!account) return;
  account.resetToken = '';
  account.resetExpires = 0;
  await persist();
}

async function replacePassword(email, password) {
  const account = findByEmail(email);
  if (!account) return null;
  const secret = hashPassword(password);
  account.salt = secret.salt;
  account.hash = secret.hash;
  account.resetToken = '';
  account.resetExpires = 0;
  state().sessions = state().sessions.filter((session) => session.personId !== account.personId);
  await persist();
  return account;
}

module.exports = {
  hashPassword,
  verifyPassword,
  findByEmail,
  addAccount,
  createSession,
  personIdForToken,
  destroySession,
  rememberReset,
  accountForReset,
  clearReset,
  replacePassword,
};
