require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./lib/db');
const loop = require('./lib/loop');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get(['/user', '/reviewer', '/admin'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/operator', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'operator.html'));
});

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function loopResult(res, work) {
  Promise.resolve()
    .then(() => work())
    .then((value) => res.json(value))
    .catch((error) => res.status(error.status || 500).json({ error: error.message }));
}

function publicOrigin(req) {
  const configured = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return host ? `${proto}://${host}` : '';
}

function bearer(req) {
  return String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function requestMeta(req) {
  return {
    ip: clean(req.ip || '', 80),
    userAgent: clean(req.get('user-agent') || '', 180),
    origin: publicOrigin(req),
  };
}

// The organisation always comes from the session, never from the request body.
async function actorBody(req) {
  const session = await loop.sessionFor(bearer(req));
  if (!session || session.operator || !session.personId || !session.organisationId) {
    fail(401, 'Sign in to continue.');
  }
  return {
    ...req.body,
    ...requestMeta(req),
    actorId: session.personId,
    organisationId: session.organisationId,
  };
}

async function operatorBody(req) {
  const session = await loop.sessionFor(bearer(req));
  if (!session) fail(401, 'Sign in to continue.');
  if (!session.operator) fail(403, 'Only a platform operator can do this.');
  return { ...req.body, ...requestMeta(req), operatorEmail: session.email };
}

// One step at a time inside an organisation; organisations run side by side.
function action(work) {
  return (req, res) => loopResult(res, async () => {
    const body = await actorBody(req);
    return db.withOrganisation(body.organisationId, () => work(body, req));
  });
}

app.get('/api/loop', (req, res) => loopResult(res, async () => {
  const body = await actorBody(req);
  return { workspace: await loop.read(body.organisationId, body.actorId), actorId: body.actorId };
}));

app.post('/api/auth/signup', (req, res) => loopResult(res, () => loop.register({ ...req.body, ...requestMeta(req) })));
app.get('/api/auth/invite', (req, res) => loopResult(res, () => loop.publicInvite(clean(req.query.token, 80))));
app.post('/api/auth/login', (req, res) => loopResult(res, () => loop.login(req.body)));
app.post('/api/auth/forgot', (req, res) => loopResult(res, () => loop.requestReset({
  email: req.body.email,
  origin: publicOrigin(req),
})));
app.get('/api/auth/reset', (req, res) => loopResult(res, () => loop.publicReset(clean(req.query.token, 80))));
app.post('/api/auth/reset', (req, res) => loopResult(res, () => loop.completeReset(req.body)));
app.post('/api/auth/logout', (req, res) => loopResult(res, async () => {
  await loop.logout(bearer(req));
  return { ok: true };
}));

app.post('/api/loop/review', action((body) => loop.review(body)));
app.post('/api/loop/evidence/file-slot', action((body) => loop.reserveFile(body)));
app.get('/api/loop/evidence/:id/file', action((body, req) => loop.openFile({ ...body, evidenceId: req.params.id })));
app.post('/api/loop/evidence', action((body) => loop.addEvidence(body)));
app.post('/api/loop/sign-evidence', action((body) => loop.signEvidence(body)));
app.post('/api/loop/controls', action((body) => loop.addControl(body)));
app.post('/api/loop/templates', action((body) => loop.applyTemplate(body)));
app.post('/api/loop/fix', action((body) => loop.submitFix(body)));
app.post('/api/loop/verify', action((body) => loop.verify(body)));
app.post('/api/loop/notifications/read', action((body) => loop.readNotification(body)));
app.post('/api/loop/organisation', action((body) => loop.setOrganisation(body)));
app.post('/api/loop/reminders', action((body) => loop.setReminders(body)));
app.post('/api/loop/people', action((body) => loop.addPerson(body)));
app.post('/api/loop/roles', action((body) => loop.setRoles(body)));
app.post('/api/loop/units', action((body) => loop.addUnit(body)));
app.post('/api/loop/systems', action((body) => loop.addSystem(body)));
app.post('/api/loop/placement', action((body) => loop.setPlacement(body)));
app.post('/api/loop/reviewer', action((body) => loop.assignReviewer(body)));
app.post('/api/loop/invite', action((body) => loop.invitePerson(body)));
app.post('/api/loop/invite-email', action((body) => loop.sendInvitationEmail(body)));
app.post('/api/loop/people-import', action((body) => loop.importPeople(body)));
app.post('/api/loop/invite-pen', action((body) => loop.setInvitePen(body)));
app.post('/api/loop/acknowledge', action((body) => loop.acknowledge(body)));

app.post('/api/operator/login', (req, res) => loopResult(res, () => loop.operatorLogin(req.body)));
app.get('/api/operator/organisations', (req, res) => loopResult(res, async () => {
  await operatorBody(req);
  return loop.operatorOrganisations();
}));
app.post('/api/operator/organisations', (req, res) => loopResult(res, async () => loop.createOrganisation(await operatorBody(req))));

function operatorAction(work) {
  return (req, res) => loopResult(res, async () => {
    const body = { ...(await operatorBody(req)), organisationId: clean(req.params.id, 40) };
    return db.withOrganisation(body.organisationId, () => work(body, req));
  });
}

app.get('/api/operator/organisations/:id', operatorAction((body) => loop.operatorOrganisation(body.organisationId)));
app.post('/api/operator/organisations/:id/admins', operatorAction((body) => loop.operatorAddAdmin(body)));
app.post('/api/operator/organisations/:id/invitations/:invitationId/resend', operatorAction((body, req) => loop.operatorResendInvite({
  ...body,
  invitationId: clean(req.params.invitationId, 40),
})));

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`Evidence Register T4L running at http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
