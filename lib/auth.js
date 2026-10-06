const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'data', 'accounts.json');
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

function load() {
  if (!fs.existsSync(FILE)) return { accounts: [], sessions: [] };
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
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
  return load().accounts.find((account) => account.email === email) || null;
}

function addAccount(account) {
  const data = load();
  data.accounts.push(account);
  save(data);
}

function createSession(personId) {
  const data = load();
  const token = crypto.randomBytes(32).toString('hex');
  data.sessions.push({ token, personId, createdAt: new Date().toISOString(), expiresAt: Date.now() + SESSION_MS });
  save(data);
  return token;
}

function personIdForToken(token) {
  if (!token) return '';
  const data = load();
  const now = Date.now();
  const sessions = data.sessions.filter((session) => session.expiresAt > now);
  if (sessions.length !== data.sessions.length) {
    data.sessions = sessions;
    save(data);
  }
  return sessions.find((session) => session.token === token)?.personId || '';
}

function destroySession(token) {
  const data = load();
  data.sessions = data.sessions.filter((session) => session.token !== token);
  save(data);
}

module.exports = {
  hashPassword,
  verifyPassword,
  findByEmail,
  addAccount,
  createSession,
  personIdForToken,
  destroySession,
};
