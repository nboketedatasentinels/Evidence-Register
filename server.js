const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data', 'evidence.json');
const RUNS = path.join(__dirname, 'data', 'runs.json');
const SETTINGS = path.join(__dirname, 'data', 'settings.json');
const IMPACT = path.join(__dirname, 'data', 'impact.json');

const STATUSES = ['MET', 'PARTIAL', 'NOT MET', 'NO EVIDENCE'];
const REVIEWS = ['awaiting', 'confirmed', 'overridden'];
const RANK = { 'NO EVIDENCE': 0, 'NOT MET': 1, PARTIAL: 2, MET: 3 };

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get(['/user', '/reviewer', '/admin'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function parseItem(body, existing) {
  const artefact = clean(body.artefact, 160);
  const ref = clean(body.ref, 40);
  const control = clean(body.control, 80);
  if (!artefact || !ref || !control) {
    const error = new Error('Ref, control, and artefact are required.');
    error.status = 400;
    throw error;
  }

  const issued = /^\d{4}-\d{2}-\d{2}$/.test(body.issued) ? body.issued : '';
  const months = Number(body.reviewMonths);
  const feeds = Array.isArray(body.feeds)
    ? body.feeds.map((refId) => clean(refId, 40)).filter(Boolean).slice(0, 12)
    : [];

  return {
    id: existing?.id || crypto.randomBytes(4).toString('hex'),
    ref,
    control,
    artefact,
    status: STATUSES.includes(body.status) ? body.status : 'PARTIAL',
    owner: clean(body.owner, 80) || 'Unassigned',
    role: clean(body.role, 80) || 'Accountable owner',
    issued,
    reviewMonths: Number.isFinite(months) && months > 0 ? Math.min(months, 36) : 0,
    feeds,
    location: clean(body.location, 240),
    citation: clean(body.citation, 500),
    reason: clean(body.reason, 400),
    review: REVIEWS.includes(body.review) ? body.review : 'awaiting',
    reviewBy: clean(body.reviewBy, 80),
    reviewAt: clean(body.reviewAt, 40),
  };
}

function compareRuns(previous, next) {
  const prior = new Map((previous?.items || []).map((item) => [item.ref, item]));
  const improved = [];
  const regressed = [];
  const added = [];
  next.forEach((item) => {
    const old = prior.get(item.ref);
    if (!old) {
      added.push({ ref: item.ref, artefact: item.artefact, to: item.status });
      return;
    }
    if (RANK[item.status] > RANK[old.status]) {
      improved.push({ ref: item.ref, artefact: item.artefact, from: old.status, to: item.status });
    } else if (RANK[item.status] < RANK[old.status]) {
      regressed.push({ ref: item.ref, artefact: item.artefact, from: old.status, to: item.status });
    }
  });
  return { improved, regressed, added };
}

app.get('/api/evidence', (_req, res) => {
  res.json(readJson(DATA, []));
});

app.post('/api/evidence', (req, res) => {
  try {
    const items = readJson(DATA, []);
    const item = parseItem(req.body);
    items.unshift(item);
    writeJson(DATA, items);
    res.status(201).json(item);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.put('/api/evidence', (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      res.status(400).json({ error: 'Send a list of controls.' });
      return;
    }
    const items = req.body.map((row) => parseItem(row));
    writeJson(DATA, items);
    res.json(items);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.patch('/api/evidence/:id', (req, res) => {
  try {
    const items = readJson(DATA, []);
    const index = items.findIndex((item) => item.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: 'Record not found.' });
      return;
    }
    const item = parseItem({ ...items[index], ...req.body }, items[index]);
    items[index] = item;
    writeJson(DATA, items);
    res.json(item);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.delete('/api/evidence/:id', (req, res) => {
  const items = readJson(DATA, []);
  const next = items.filter((item) => item.id !== req.params.id);
  if (next.length === items.length) {
    res.status(404).json({ error: 'Record not found.' });
    return;
  }
  writeJson(DATA, next);
  res.status(204).end();
});

app.get('/api/runs', (_req, res) => {
  res.json(readJson(RUNS, []));
});

app.post('/api/runs', (req, res) => {
  const items = readJson(DATA, []);
  const runs = readJson(RUNS, []);
  const previous = runs[0] || null;
  const counts = { MET: 0, PARTIAL: 0, 'NOT MET': 0, 'NO EVIDENCE': 0 };
  items.forEach((item) => {
    counts[item.status] += 1;
  });
  const run = {
    id: crypto.randomBytes(4).toString('hex'),
    at: new Date().toISOString(),
    operator: clean(req.body.operator, 80) || 'Unnamed',
    evidencePath: clean(req.body.evidencePath, 240),
    counts,
    items: items.map((item) => ({
      ref: item.ref,
      artefact: item.artefact,
      status: item.status,
      owner: item.owner,
      review: item.review,
      reviewBy: item.reviewBy,
    })),
    change: previous ? compareRuns(previous, items) : { improved: [], regressed: [], added: [] },
    first: !previous,
  };
  runs.unshift(run);
  writeJson(RUNS, runs.slice(0, 30));
  res.status(201).json(run);
});

app.get('/api/settings', (_req, res) => {
  res.json(readJson(SETTINGS, { evidencePath: '', operator: '' }));
});

app.put('/api/settings', (req, res) => {
  const settings = {
    evidencePath: clean(req.body.evidencePath, 240),
    operator: clean(req.body.operator, 80),
  };
  writeJson(SETTINGS, settings);
  res.json(settings);
});

app.get('/api/impact', (_req, res) => {
  const impact = readJson(IMPACT, null);
  if (!impact) {
    res.status(404).json({ error: 'Impact assessment not filed.' });
    return;
  }
  res.json(impact);
});

app.patch('/api/impact', (req, res) => {
  const impact = readJson(IMPACT, null);
  if (!impact) {
    res.status(404).json({ error: 'Impact assessment not filed.' });
    return;
  }
  const review = req.body.review === 'read' ? 'read' : 'awaiting';
  impact.status = 'DRAFT';
  impact.review = review;
  impact.reviewBy = review === 'read' ? clean(req.body.reviewBy, 80) || 'Unnamed' : '';
  impact.reviewAt = review === 'read' ? new Date().toISOString() : '';
  writeJson(IMPACT, impact);
  res.json(impact);
});

function evidenceRoot() {
  const folder = clean(readJson(SETTINGS, {}).evidencePath, 240);
  if (!folder) return null;
  try {
    const resolved = fs.realpathSync(folder);
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

app.get('/api/file', (req, res) => {
  const requested = clean(req.query.path, 240).replace(/\\/g, '/');
  if (!requested || requested.includes('..') || path.isAbsolute(requested)) {
    res.status(400).json({ error: 'Give a file inside the evidence folder.' });
    return;
  }
  const root = evidenceRoot();
  if (!root) {
    res.status(400).json({ error: 'Set the evidence folder first.' });
    return;
  }
  const full = path.resolve(root, requested);
  if (full !== root && !full.startsWith(root + path.sep)) {
    res.status(400).json({ error: 'That file is outside the evidence folder.' });
    return;
  }
  if (!fs.existsSync(full)) {
    res.status(404).json({ error: 'That file is not on this machine.' });
    return;
  }
  if (fs.statSync(full).isDirectory()) {
    const readme = path.join(full, 'README.md');
    if (fs.existsSync(readme)) {
      const next = requested.replace(/\/$/, '') + '/README.md';
      res.redirect('/api/file?path=' + encodeURIComponent(next));
      return;
    }
    res.status(400).json({ error: 'That path is a folder.' });
    return;
  }
  res.sendFile(full);
});

app.post('/api/folder', (req, res) => {
  const requested = clean(req.body.path, 240);
  if (!requested) {
    res.status(400).json({ error: 'Give a folder path.' });
    return;
  }
  let resolved;
  try {
    resolved = fs.realpathSync(requested);
  } catch {
    res.status(404).json({ error: 'That folder is not on this machine.' });
    return;
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    res.status(400).json({ error: 'That path is not a folder.' });
    return;
  }
  const files = fs
    .readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .slice(0, 80)
    .map((entry) => {
      const full = path.join(resolved, entry.name);
      const info = fs.statSync(full);
      return { name: entry.name, modified: info.mtime.toISOString().slice(0, 10) };
    });
  res.json({ path: resolved, files });
});

const loop = require('./lib/loop');

function loopResult(res, work) {
  try {
    res.json(work());
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
}

function bearer(req) {
  return String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function actorBody(req) {
  const actorId = loop.personIdForToken(bearer(req));
  if (!actorId) {
    const error = new Error('Sign in to continue.');
    error.status = 401;
    throw error;
  }
  return {
    ...req.body,
    actorId,
    ip: clean(req.ip || '', 80),
    userAgent: clean(req.get('user-agent') || '', 180),
  };
}

app.get('/api/loop', (req, res) => loopResult(res, () => {
  const body = actorBody(req);
  return { workspace: loop.read(), actorId: body.actorId };
}));

app.post('/api/auth/signup', (req, res) => loopResult(res, () => loop.register({
  ...req.body,
  ip: clean(req.ip || '', 80),
  userAgent: clean(req.get('user-agent') || '', 180),
})));
app.get('/api/auth/invite', (req, res) => loopResult(res, () => loop.publicInvite(clean(req.query.token, 80))));
app.post('/api/auth/login', (req, res) => loopResult(res, () => loop.login(req.body)));
app.post('/api/auth/logout', (req, res) => {
  loop.logout(bearer(req));
  res.json({ ok: true });
});

app.post('/api/loop/review', (req, res) => loopResult(res, () => loop.review(actorBody(req))));
app.post('/api/loop/evidence', (req, res) => loopResult(res, () => loop.addEvidence(actorBody(req))));
app.post('/api/loop/controls', (req, res) => loopResult(res, () => loop.addControl(actorBody(req))));
app.post('/api/loop/templates', (req, res) => loopResult(res, () => loop.applyTemplate(actorBody(req))));
app.post('/api/loop/fix', (req, res) => loopResult(res, () => loop.submitFix(actorBody(req))));
app.post('/api/loop/verify', (req, res) => loopResult(res, () => loop.verify(actorBody(req))));
app.post('/api/loop/organisation', (req, res) => loopResult(res, () => loop.setOrganisation(actorBody(req))));
app.post('/api/loop/reminders', (req, res) => loopResult(res, () => loop.setReminders(actorBody(req))));
app.post('/api/loop/people', (req, res) => loopResult(res, () => loop.addPerson(actorBody(req))));
app.post('/api/loop/roles', (req, res) => loopResult(res, () => loop.setRoles(actorBody(req))));
app.post('/api/loop/units', (req, res) => loopResult(res, () => loop.addUnit(actorBody(req))));
app.post('/api/loop/systems', (req, res) => loopResult(res, () => loop.addSystem(actorBody(req))));
app.post('/api/loop/placement', (req, res) => loopResult(res, () => loop.setPlacement(actorBody(req))));
app.post('/api/loop/reviewer', (req, res) => loopResult(res, () => loop.assignReviewer(actorBody(req))));
app.post('/api/loop/invite', (req, res) => loopResult(res, () => loop.invitePerson(actorBody(req))));
app.post('/api/loop/people-import', (req, res) => loopResult(res, () => loop.importPeople(actorBody(req))));
app.post('/api/loop/invite-pen', (req, res) => loopResult(res, () => loop.setInvitePen(actorBody(req))));
app.post('/api/loop/acknowledge', (req, res) => loopResult(res, () => loop.acknowledge(actorBody(req))));

app.listen(PORT, () => {
  console.log(`Evidence Register T4L running at http://localhost:${PORT}`);
});
