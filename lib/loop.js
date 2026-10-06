const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SEED = path.join(__dirname, '..', 'data', 'loop.seed.json');
const LOOP = path.join(__dirname, '..', 'data', 'loop.json');
const STATUSES = ['MET', 'PARTIAL', 'NOT MET', 'NO EVIDENCE'];
const OPEN_TICKET = ['assigned', 'in_progress', 'reopened', 'verification'];

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function load() {
  if (!fs.existsSync(LOOP)) fs.copyFileSync(SEED, LOOP);
  return JSON.parse(fs.readFileSync(LOOP, 'utf8'));
}

function save(ws) {
  fs.writeFileSync(LOOP, JSON.stringify(ws, null, 2) + '\n');
}

const ROLE_IDS = ['uploader', 'reviewer', 'admin'];

function rolesOf(who) {
  if (!who) return [];
  if (Array.isArray(who.roles) && who.roles.length) {
    return [...new Set(who.roles.filter((role) => ROLE_IDS.includes(role)))];
  }
  const roles = ['uploader'];
  if (who.canReview !== false) roles.push('reviewer');
  return roles;
}

function holds(who, role) {
  return rolesOf(who).includes(role);
}

function person(ws, id) {
  return ws.people.find((row) => row.id === id) || null;
}

function assertRole(who, role, message) {
  if (!holds(who, role)) fail(403, message);
}

function personName(ws, id) {
  if (id === 'system') return 'Register';
  return person(ws, id)?.name || 'Unknown person';
}

function fingerprint(name, version, note) {
  return crypto.createHash('sha256').update([name, version, note].join('|')).digest('hex');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function log(ws, actorId, text) {
  ws.history.push({ at: new Date().toISOString(), actorId, text });
}

function linkedEvidence(ws, controlId) {
  return ws.evidence.filter((item) => !item.rejected && item.controlIds.includes(controlId));
}

function latestEvidence(items) {
  return [...items].sort((a, b) => b.version - a.version || String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0] || null;
}

function judge(control, evidence, day) {
  const latest = latestEvidence(evidence);
  if (!latest) {
    return {
      status: 'NO EVIDENCE',
      quality: 'Insufficient',
      reason: 'No file is linked to this control. The register will not infer one.',
      recommendation: `File the ${control.expected.toLowerCase()}.`,
      sources: [],
    };
  }
  if (!latest.readable) {
    return {
      status: 'NOT MET',
      quality: 'Insufficient',
      reason: `${latest.name} is on record and could not be read.`,
      recommendation: 'Replace the file with a readable version.',
      sources: [sourceOf(latest)],
    };
  }
  if (!latest.hasReview) {
    return {
      status: 'PARTIAL',
      quality: 'Moderate',
      reason: latest.note,
      recommendation: `File the missing review for ${control.id}. The current file is not enough on its own.`,
      sources: [sourceOf(latest)],
    };
  }
  if (latest.reviewDue && latest.reviewDue < day) {
    return {
      status: 'NOT MET',
      quality: 'Weak',
      reason: latest.note,
      recommendation: 'File a review that sits inside the current interval.',
      sources: [sourceOf(latest)],
    };
  }
  return {
    status: 'MET',
    quality: 'Strong',
    reason: latest.note,
    recommendation: '',
    sources: [sourceOf(latest)],
  };
}

function sourceOf(item) {
  return {
    evidenceId: item.id,
    name: item.name,
    version: item.version,
    section: item.section || 'Not marked',
    hash: item.hash,
    uploadedBy: item.uploadedBy,
  };
}

function decisionFor(ws, controlId) {
  return (
    ws.decisions.find((row) => row.controlId === controlId) || {
      controlId,
      review: 'awaiting',
      reviewBy: '',
      reviewAt: '',
      comment: '',
      reviewedStatus: '',
    }
  );
}

function agreedStatus(decision, judgement) {
  if (decision.reviewedStatus && decision.review === 'awaiting') return decision.reviewedStatus;
  if (decision.reviewedStatus && (decision.review === 'confirmed' || decision.review === 'overridden' || decision.review === 'requested')) {
    return decision.reviewedStatus;
  }
  return judgement.status;
}

function present(ws) {
  const day = today();
  const controls = ws.controls.map((control) => {
    const evidence = linkedEvidence(ws, control.id);
    const judgement = judge(control, evidence, day);
    const decision = decisionFor(ws, control.id);
    const filer = latestEvidence(evidence);
    return {
      ...control,
      judgement,
      decision,
      agreed: agreedStatus(decision, judgement),
      filerId: filer?.uploadedBy || '',
      evidenceIds: evidence.map((item) => item.id),
    };
  });
  return {
    organisation: ws.organisation,
    people: ws.people.map((row) => ({ ...row, roles: rolesOf(row) })),
    controls,
    evidence: ws.evidence,
    tickets: ws.tickets,
    history: [...ws.history].sort((a, b) => String(b.at).localeCompare(String(a.at))),
    today: day,
  };
}

function actor(ws, id) {
  const row = person(ws, id);
  if (!row) fail(400, 'Choose a person on this organisation.');
  return row;
}

function openTicketFor(ws, controlId) {
  return ws.tickets.find((ticket) => ticket.controlId === controlId && ticket.status !== 'resolved') || null;
}

function ensureDecision(ws, controlId) {
  let decision = ws.decisions.find((row) => row.controlId === controlId);
  if (!decision) {
    decision = { controlId, review: 'awaiting', reviewBy: '', reviewAt: '', comment: '', reviewedStatus: '' };
    ws.decisions.push(decision);
  }
  return decision;
}

function rememberReview(decision, who, review, status, comment) {
  decision.review = review;
  decision.reviewBy = who.id;
  decision.reviewAt = new Date().toISOString();
  decision.reviewedStatus = status;
  decision.comment = comment;
}

function createTicket(ws, control, judgement, ownerId) {
  if (openTicketFor(ws, control.id)) return openTicketFor(ws, control.id);
  const numbers = ws.tickets.map((ticket) => Number(ticket.id.replace(/\D/g, '')) || 0);
  let next = Math.max(0, ...numbers) + 1;
  if (control.id === 'CTRL-0012' && !ws.tickets.some((ticket) => ticket.id === 'T-0037')) next = 37;
  const ticket = {
    id: `T-${String(next).padStart(4, '0')}`,
    controlId: control.id,
    title: judgement.status === 'NO EVIDENCE' ? `File the ${control.expected.toLowerCase()}` : `Close the gap on ${control.id}`,
    problem: judgement.reason,
    action: judgement.recommendation,
    ownerId,
    priority: judgement.status === 'NO EVIDENCE' ? 'High' : 'Medium',
    status: 'assigned',
    due: '2026-10-30',
    createdAt: new Date().toISOString(),
    fixEvidenceId: '',
    submittedBy: '',
  };
  if (control.id === 'CTRL-0012') {
    ticket.title = 'Complete the AI risk review record';
    ticket.priority = 'High';
    ticket.ownerId = 'syntiche';
  }
  ws.tickets.unshift(ticket);
  log(ws, 'system', `Opened ticket ${ticket.id} for ${control.id} and assigned it to ${personName(ws, ticket.ownerId)}.`);
  return ticket;
}

function assertCanReview(ws, who, control) {
  assertRole(who, 'reviewer', `${who.name} does not have the reviewer permission.`);
  const evidence = linkedEvidence(ws, control.id);
  const filer = latestEvidence(evidence);
  if (filer && filer.uploadedBy === who.id) {
    fail(403, `${who.name} filed ${filer.name}. Reviewer permission does not allow a decision on that submission.`);
  }
}

function review(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  const control = ws.controls.find((row) => row.id === body.controlId);
  if (!control) fail(404, 'That control is not on this organisation.');
  const kind = body.decision;
  if (!['agree', 'disagree', 'edit', 'request'].includes(kind)) fail(400, 'Choose agree, disagree, edit, or request more evidence.');
  assertCanReview(ws, who, control);
  const comment = clean(body.comment, 400);
  if ((kind === 'disagree' || kind === 'edit' || kind === 'request') && comment.length < 3) {
    fail(400, 'Write a short reason. The history keeps it.');
  }
  if (kind === 'request') {
    const judgement = judge(control, linkedEvidence(ws, control.id), today());
    const decision = ensureDecision(ws, control.id);
    rememberReview(decision, who, 'requested', judgement.status, comment);
    const filer = latestEvidence(linkedEvidence(ws, control.id));
    const ticket = createTicket(ws, control, { ...judgement, recommendation: comment, reason: comment }, filer?.uploadedBy || control.ownerId);
    if (ticket && ticket.status !== 'resolved') {
      ticket.status = ticket.status === 'verification' ? 'reopened' : ticket.status;
      ticket.action = comment;
      ticket.problem = comment;
      if (filer) ticket.ownerId = filer.uploadedBy;
    }
    log(ws, who.id, `Asked ${personName(ws, ticket.ownerId)} for more evidence on ${control.id}. ${comment}`);
    save(ws);
    return {
      workspace: present(ws),
      flash: `${who.name} asked for more evidence on ${control.id}. Ticket ${ticket.id} is with ${personName(ws, ticket.ownerId)}.`,
      open: { page: 'tickets', ticketId: ticket.id },
    };
  }
  const judgement = judge(control, linkedEvidence(ws, control.id), today());
  let status = judgement.status;
  if (kind === 'edit') {
    status = body.status;
    if (!STATUSES.includes(status)) fail(400, 'Choose a status the register uses.');
    const owner = person(ws, body.ownerId);
    if (!owner) fail(400, 'Choose an owner who is on this organisation.');
    if (owner.id !== control.ownerId) {
      log(ws, who.id, `Changed the owner of ${control.id} from ${personName(ws, control.ownerId)} to ${owner.name}.`);
      control.ownerId = owner.id;
    }
  }
  const decision = ensureDecision(ws, control.id);
  rememberReview(decision, who, kind === 'agree' ? 'confirmed' : 'overridden', status, comment);
  const verb = kind === 'agree' ? 'Agreed' : kind === 'disagree' ? 'Disagreed with' : 'Edited';
  const source = judgement.sources[0];
  const cited = source ? ` Source: ${source.name}, version ${source.version}, ${source.section}.` : ' No file was cited.';
  log(ws, who.id, `${verb} ${control.id} as ${labelStatus(status)}.${comment ? ` ${comment}` : ''}${cited}`);
  let ticket = null;
  if (status !== 'MET') {
    const ownerId = kind === 'edit' ? control.ownerId : control.ownerId;
    ticket = createTicket(ws, control, { ...judgement, status, reason: comment || judgement.reason, recommendation: judgement.recommendation }, ownerId);
  }
  save(ws);
  return {
    workspace: present(ws),
    flash: ticket
      ? `${who.name} recorded ${labelStatus(status)} on ${control.id}. Ticket ${ticket.id} is with ${personName(ws, ticket.ownerId)}.`
      : `${who.name} recorded ${labelStatus(status)} on ${control.id}.`,
    open: ticket ? { page: 'tickets', ticketId: ticket.id } : { page: 'review', ticketId: '' },
  };
}

function labelStatus(status) {
  if (status === 'MET') return 'Met';
  if (status === 'PARTIAL') return 'Partially met';
  if (status === 'NOT MET') return 'Not met';
  return 'No evidence';
}

function addEvidence(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  assertRole(who, 'uploader', `${who.name} does not have the uploader permission.`);
  const control = ws.controls.find((row) => row.id === body.controlId);
  if (!control) fail(404, 'Choose a control on this organisation.');
  const name = clean(body.name, 160);
  const note = clean(body.note, 500);
  if (!name || !note) fail(400, 'Give the file a name and a sentence about what it shows.');
  const version = linkedEvidence(ws, control.id).filter((item) => item.name === name).reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const hash = fingerprint(name, String(version), note);
  const duplicate = ws.evidence.find((item) => item.hash === hash);
  const numbers = ws.evidence.map((item) => Number(item.id.replace(/\D/g, '')) || 0);
  const item = {
    id: `EV-${String(Math.max(0, ...numbers) + 1).padStart(6, '0')}`,
    name,
    version,
    uploadedBy: who.id,
    uploadedAt: new Date().toISOString(),
    source: 'Manual upload',
    hash,
    controlIds: [control.id],
    note,
    section: clean(body.section, 120) || 'Uploaded note',
    hasReview: false,
    readable: true,
    reviewDue: '',
    rejected: false,
  };
  ws.evidence.unshift(item);
  const decision = ensureDecision(ws, control.id);
  decision.review = 'awaiting';
  decision.reviewBy = '';
  decision.reviewAt = '';
  decision.comment = '';
  log(ws, who.id, `Uploaded ${name}, version ${version}, for ${control.id}. Fingerprint ${hash.slice(0, 12)}.${duplicate ? ` Same fingerprint as ${duplicate.id}.` : ''}`);
  save(ws);
  return {
    workspace: present(ws),
    flash: duplicate
      ? `${item.id} matches the fingerprint of ${duplicate.id}. The file is on record as a new version label, and a reviewer still has to read it.`
      : `${who.name} filed ${item.id}. A different person reviews it.`,
    open: { page: 'evidence', ticketId: '' },
  };
}

function addControl(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const requirement = clean(body.requirement, 240);
  const owner = person(ws, body.ownerId);
  if (!requirement || !owner) fail(400, 'Write the control and choose an owner on this organisation.');
  const numbers = ws.controls.map((row) => Number(row.id.replace(/\D/g, '')) || 0);
  const control = {
    id: `CTRL-${String(Math.max(0, ...numbers) + 1).padStart(4, '0')}`,
    requirement,
    expected: clean(body.expected, 120) || 'Supporting document',
    frequency: clean(body.frequency, 80) || 'Organisation-defined',
    ownerId: owner.id,
    reviewerId: who.id === owner.id ? ws.people.find((row) => row.id !== owner.id)?.id || who.id : who.id,
  };
  ws.controls.push(control);
  log(ws, who.id, `Added ${control.id} for this organisation. It is not copied from the text of ISO/IEC 42001.`);
  save(ws);
  return {
    workspace: present(ws),
    flash: `${control.id} is on the control set. No evidence is linked yet.`,
    open: { page: 'controls', ticketId: '' },
  };
}

function submitFix(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  assertRole(who, 'uploader', `${who.name} does not have the uploader permission.`);
  const ticket = ws.tickets.find((row) => row.id === body.ticketId);
  if (!ticket) fail(404, 'That ticket is not on this organisation.');
  if (!['assigned', 'in_progress', 'reopened'].includes(ticket.status)) {
    fail(400, 'This ticket is not waiting for a file.');
  }
  if (ticket.ownerId !== who.id) {
    fail(403, `${personName(ws, ticket.ownerId)} is assigned to file this. ${who.name} reviews it after the file is in.`);
  }
  const control = ws.controls.find((row) => row.id === ticket.controlId);
  if (!control) fail(404, 'The control on this ticket is missing.');
  const name = control.id === 'CTRL-0012' ? 'AI_Risk_Review_2026-10.pdf' : `${control.expected.replace(/\s+/g, '_')}_fix.pdf`;
  const note =
    control.id === 'CTRL-0012'
      ? 'Review of the AI risk assessment recorded on 5 October 2026. The review sits inside the six-month interval.'
      : `Updated ${control.expected.toLowerCase()} filed on ${today()}. The review date sits inside the current interval.`;
  const version = ws.evidence.filter((item) => item.controlIds.includes(control.id)).reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const hash = fingerprint(name, String(version), note);
  const previous = latestEvidence(linkedEvidence(ws, control.id));
  const numbers = ws.evidence.map((item) => Number(item.id.replace(/\D/g, '')) || 0);
  const item = {
    id: `EV-${String(Math.max(0, ...numbers) + 1).padStart(6, '0')}`,
    name,
    version,
    uploadedBy: who.id,
    uploadedAt: new Date().toISOString(),
    source: 'Manual upload',
    hash,
    controlIds: [control.id],
    note,
    section: 'Review record',
    hasReview: true,
    readable: true,
    reviewDue: '2027-04-05',
    rejected: false,
  };
  ws.evidence.unshift(item);
  ticket.status = 'verification';
  ticket.fixEvidenceId = item.id;
  ticket.submittedBy = who.id;
  const decision = ensureDecision(ws, control.id);
  decision.review = 'awaiting';
  decision.reviewBy = '';
  decision.reviewAt = '';
  decision.comment = '';
  const changed = previous && previous.hash !== hash;
  log(ws, who.id, `Filed ${item.id} (${name}, version ${version}) against ticket ${ticket.id}. Fingerprint ${hash.slice(0, 12)}.${changed ? ' The fingerprint differs from the previous file.' : ''}`);
  log(ws, 'system', `${control.id} now reads Met from ${name}, version ${version}. ${personName(ws, control.reviewerId)} still has to verify ticket ${ticket.id}.`);
  save(ws);
  return {
    workspace: present(ws),
    flash: `${item.id} is on file. The reading is Met. ${personName(ws, control.reviewerId)} has to verify it before the ticket closes.`,
    open: { page: 'tickets', ticketId: ticket.id },
  };
}

function verify(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  const ticket = ws.tickets.find((row) => row.id === body.ticketId);
  if (!ticket) fail(404, 'That ticket is not on this organisation.');
  if (ticket.status !== 'verification') fail(400, 'This ticket is not waiting for verification.');
  assertRole(who, 'reviewer', `${who.name} does not have the reviewer permission.`);
  if (ticket.submittedBy === who.id) {
    fail(403, `${who.name} filed the fix, so this account cannot verify it.`);
  }
  const control = ws.controls.find((row) => row.id === ticket.controlId);
  const comment = clean(body.comment, 400);
  const decision = ensureDecision(ws, control.id);
  if (body.decision === 'accept') {
    const judgement = judge(control, linkedEvidence(ws, control.id), today());
    ticket.status = 'resolved';
    rememberReview(decision, who, 'confirmed', judgement.status, comment || 'The new file closes the gap.');
    log(ws, who.id, `Verified ticket ${ticket.id}. ${control.id} is now ${labelStatus(judgement.status)}.${comment ? ` ${comment}` : ''}`);
    save(ws);
    return {
      workspace: present(ws),
      flash: `${ticket.id} is resolved. ${control.id} stands at ${labelStatus(judgement.status)}.`,
      open: { page: 'history', ticketId: ticket.id },
    };
  }
  if (body.decision !== 'reject') fail(400, 'Verify or send the fix back.');
  if (comment.length < 3) fail(400, 'Write why the fix does not close the gap.');
  const fix = ws.evidence.find((item) => item.id === ticket.fixEvidenceId);
  if (fix) fix.rejected = true;
  ticket.status = 'reopened';
  ticket.fixEvidenceId = '';
  ticket.submittedBy = '';
  const judgement = judge(control, linkedEvidence(ws, control.id), today());
  rememberReview(decision, who, 'overridden', judgement.status, comment);
  log(ws, who.id, `Sent ticket ${ticket.id} back. ${comment}`);
  save(ws);
  return {
    workspace: present(ws),
    flash: `${ticket.id} is open again. The rejected file stays in the history and is not used for the current reading.`,
    open: { page: 'tickets', ticketId: ticket.id },
  };
}

function setReminders(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const on = Boolean(body.reminders);
  ws.organisation.reminders = on;
  log(ws, who.id, on ? 'Turned reminders on for this organisation.' : 'Turned reminders off for this organisation.');
  save(ws);
  return {
    workspace: present(ws),
    flash: on
      ? 'Reminders are on. This demo does not send email. The choice is stored.'
      : 'Reminders are off. No reminder will be raised from this setting.',
    open: { page: 'organisation', ticketId: '' },
  };
}

function addPerson(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const name = clean(body.name, 80);
  const unit = clean(body.unit, 80);
  if (!name || !unit) fail(400, 'Give the person a name and a department.');
  if (!ws.organisation.units.includes(unit)) ws.organisation.units.push(unit);
  const roles = Array.isArray(body.roles) ? body.roles.filter((role) => ROLE_IDS.includes(role)) : ['uploader'];
  if (!roles.length) fail(400, 'Choose at least one profile: uploader, reviewer, or admin.');
  let id = name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 24) || 'person';
  if (person(ws, id)) id = `${id}${ws.people.length + 1}`;
  ws.people.push({
    id,
    name,
    role: clean(body.job, 80) || 'Staff',
    title: clean(body.job, 80) || 'Staff',
    unit,
    roles,
  });
  log(ws, who.id, `Added ${name} in ${unit}, with ${roles.join(', ')}.`);
  save(ws);
  return {
    workspace: present(ws),
    flash: `${name} is on the organisation. Profiles are permissions, so this person can hold more than one.`,
    open: { page: 'people', ticketId: '' },
  };
}

function setRoles(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const target = person(ws, body.personId);
  if (!target) fail(404, 'That person is not on this organisation.');
  const roles = Array.isArray(body.roles) ? [...new Set(body.roles.filter((role) => ROLE_IDS.includes(role)))] : [];
  if (!roles.length) fail(400, 'A person needs at least one profile.');
  const admins = ws.people.filter((row) => row.id !== target.id && holds(row, 'admin'));
  if (!roles.includes('admin') && !admins.length) fail(400, 'The organisation needs one admin.');
  target.roles = roles;
  delete target.canReview;
  log(ws, who.id, `Set ${target.name} to ${roles.join(', ')}.`);
  save(ws);
  return {
    workspace: present(ws),
    flash: `${target.name} now has ${roles.join(', ')}.`,
    open: { page: 'people', ticketId: '' },
  };
}

function addUnit(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const name = clean(body.name, 80);
  if (!name) fail(400, 'Name the department.');
  if (!ws.organisation.units.includes(name)) {
    ws.organisation.units.push(name);
    log(ws, who.id, `Added the ${name} department.`);
  }
  save(ws);
  return {
    workspace: present(ws),
    flash: `${name} is a department on ${ws.organisation.name}.`,
    open: { page: 'organisation', ticketId: '' },
  };
}

function assignReviewer(body) {
  const ws = load();
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const control = ws.controls.find((row) => row.id === body.controlId);
  const reviewer = person(ws, body.reviewerId);
  if (!control || !reviewer) fail(404, 'Choose a control and a person on this organisation.');
  assertRole(reviewer, 'reviewer', `${reviewer.name} does not have the reviewer permission.`);
  const filer = latestEvidence(linkedEvidence(ws, control.id));
  if (filer && filer.uploadedBy === reviewer.id) {
    fail(400, `${reviewer.name} filed the current evidence on ${control.id}, so they cannot be the reviewer for it.`);
  }
  control.reviewerId = reviewer.id;
  log(ws, who.id, `Assigned ${reviewer.name} as reviewer for ${control.id}.`);
  save(ws);
  return {
    workspace: present(ws),
    flash: `${reviewer.name} reviews ${control.id}, unless they are the person who filed that evidence.`,
    open: { page: 'controls', ticketId: '' },
  };
}

function reset() {
  fs.copyFileSync(SEED, LOOP);
  const ws = load();
  return {
    workspace: present(ws),
    flash: 'The demo records are back to the morning of 5 October 2026. CTRL-0012 is waiting for a reviewer.',
    open: { page: 'dashboard', ticketId: '' },
  };
}

module.exports = {
  present,
  read: () => present(load()),
  review,
  addEvidence,
  addControl,
  submitFix,
  verify,
  setReminders,
  addPerson,
  setRoles,
  addUnit,
  assignReviewer,
  reset,
};
