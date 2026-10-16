const crypto = require('crypto');
const XLSX = require('xlsx');
const auth = require('./auth');
const templates = require('./templates');
const mail = require('./mail');
const db = require('./db');
const files = require('./files');
const extract = require('./extract');
const gemini = require('./gemini');
const policy = require('./policy');
const report = require('./report');

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

async function load(organisationId) {
  const ws = await db.load(organisationId);
  if (!ws) fail(404, 'That organisation is not on the register.');
  shapeOrganisation(ws);
  return ws;
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'unit';
}

function shapeOrganisation(ws) {
  const org = ws.organisation;
  org.locations = Array.isArray(org.locations) ? org.locations : [];
  org.units = Array.isArray(org.units) ? org.units : [];
  if (!Array.isArray(org.departments)) org.departments = [];
  org.units.forEach((name) => {
    if (!org.departments.some((row) => row.name === name)) {
      let id = slug(name);
      if (org.departments.some((row) => row.id === id)) id = `${id}${org.departments.length + 1}`;
      org.departments.push({ id, name, parentId: '' });
    }
  });
  org.website = org.website || '';
  org.size = org.size || '';
  org.description = org.description || '';
  org.contactName = org.contactName || '';
  org.emailDomain = org.emailDomain || '';
  org.createdAt = org.createdAt || '';
  org.reviewDays = Number(org.reviewDays) > 0 ? Number(org.reviewDays) : 5;
  org.ticketDays = Number(org.ticketDays) > 0 ? Number(org.ticketDays) : 28;
  if (!org.scope || !Array.isArray(org.scope.systems)) org.scope = { systems: [] };
  ws.people.forEach((row) => {
    row.employmentType = row.employmentType === 'contractor' ? 'contractor' : 'employee';
    row.managerId = row.managerId || '';
  });
  if (!Array.isArray(ws.invitations)) ws.invitations = [];
  if (!Array.isArray(ws.acknowledgements)) ws.acknowledgements = [];
  if (!Array.isArray(ws.reviews)) ws.reviews = [];
  if (!Array.isArray(ws.newReviews)) ws.newReviews = [];
  ws.invitations.forEach((row) => {
    row.name = row.name || '';
    row.ageRange = row.ageRange || '';
    row.signatureRequired = Boolean(row.signatureRequired);
    row.token = row.token || '';
    row.unit = row.unit || '';
  });
  return ws;
}

function ensureUnit(ws, name, parentId = '') {
  shapeOrganisation(ws);
  if (!name) return;
  if (!ws.organisation.units.includes(name)) ws.organisation.units.push(name);
  if (ws.organisation.departments.some((row) => row.name === name)) return;
  let id = slug(name);
  if (ws.organisation.departments.some((row) => row.id === id)) id = `${id}${ws.organisation.departments.length + 1}`;
  ws.organisation.departments.push({ id, name, parentId });
}

async function save(ws) {
  shapeOrganisation(ws);
  await db.save(ws);
}

const ROLE_IDS = ['uploader', 'reviewer', 'admin'];
const EVIDENCE_SOURCES = [
  { id: 'computer', name: 'This computer', connected: true },
  { id: 'drive', name: 'Google Drive', connected: false },
  { id: 'sharepoint', name: 'Microsoft SharePoint', connected: false },
  { id: 'onedrive', name: 'OneDrive', connected: false },
  { id: 'dms', name: 'Document management system', connected: false },
  { id: 'server', name: 'Internal server', connected: false },
  { id: 'network', name: 'Network repository', connected: false },
  { id: 'customer', name: 'Customer cloud', connected: false },
  { id: 'other', name: 'Other approved repository', connected: false },
];

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

function addDays(from, days) {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

// A date an admin typed, or '' when they left it empty.
function cleanDay(value) {
  const day = clean(value, 10);
  if (!day) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) fail(400, 'Use a date for when the evidence is due.');
  return day;
}

// What each requirement is waiting for and by when: evidence by the date the
// admin set, a reviewer decision within the organisation's review days, and a
// new version once the latest one passes its review date.
function deadlinesFor(ws, control, day = today()) {
  const sent = linkedEvidence(ws, control.id).filter((item) => submitted(ws, item));
  const latest = latestEvidence(sent);
  const decision = ws.decisions.find((row) => row.controlId === control.id);
  const awaiting = Boolean(latest) && (decision?.review || 'awaiting') === 'awaiting';
  const reviewBy = awaiting ? addDays(submittedAt(ws, latest), ws.organisation.reviewDays || 5) : '';
  return {
    latest,
    evidenceIn: Boolean(latest),
    evidenceDue: control.evidenceDue || '',
    evidenceLate: Boolean(!latest && control.evidenceDue && control.evidenceDue < day),
    reviewBy,
    reviewLate: Boolean(reviewBy && reviewBy < day),
    renewSince: latest?.reviewDue && latest.reviewDue < day ? latest.reviewDue : '',
  };
}

function reviewDateFromFrequency(frequency, from = new Date()) {
  const match = String(frequency || '').match(/every\s+(\d+)\s+(day|week|month|year)s?/i);
  if (!match) return '';
  const count = Number(match[1]);
  const unit = match[2].toLowerCase();
  const next = new Date(from);
  if (unit.startsWith('day')) next.setUTCDate(next.getUTCDate() + count);
  else if (unit.startsWith('week')) next.setUTCDate(next.getUTCDate() + count * 7);
  else if (unit.startsWith('month')) next.setUTCMonth(next.getUTCMonth() + count);
  else next.setUTCFullYear(next.getUTCFullYear() + count);
  return next.toISOString().slice(0, 10);
}

function log(ws, actorId, text) {
  ws.history.push({ at: new Date().toISOString(), actorId, text });
}

function handoff(ws, actorId, directs, text, refs = {}) {
  if (!Array.isArray(ws.notifications)) ws.notifications = [];
  const chosen = new Map();
  directs.forEach((row) => {
    if (!row?.id || row.id === actorId || !person(ws, row.id)) return;
    chosen.set(row.id, row.page || 'dashboard');
  });
  ws.people.filter((row) => holds(row, 'admin')).forEach((admin) => {
    if (admin.id !== actorId && !chosen.has(admin.id)) chosen.set(admin.id, refs.adminPage || 'dashboard');
  });
  chosen.forEach((page, recipientId) => notify(ws, recipientId, actorId, text, page, refs));
}

function notify(ws, recipientId, actorId, text, page, refs = {}) {
  if (!Array.isArray(ws.notifications)) ws.notifications = [];
  const numbers = ws.notifications.map((row) => Number(String(row.id).replace(/\D/g, '')) || 0);
  ws.notifications.unshift({
    id: `N-${String(Math.max(0, ...numbers) + 1).padStart(4, '0')}`,
    at: new Date().toISOString(),
    recipientId,
    actorId: actorId || 'system',
    text: clean(text, 400),
    page,
    controlId: refs.controlId || '',
    ticketId: refs.ticketId || '',
    readAt: '',
  });
  ws.notifications = ws.notifications.slice(0, 200);
}

function linkedEvidence(ws, controlId) {
  return ws.evidence.filter((item) => !item.rejected && item.controlIds.includes(controlId));
}

function latestEvidence(items) {
  return [...items].sort((a, b) => b.version - a.version || String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0] || null;
}

function parseSuggestion(text, controlId, evidenceId) {
  const match = String(text || '').match(/^Suggested (Met|Partially met|Not met) for (CTRL-\d+) on (EV-\d+)\. ([\s\S]*)$/);
  if (!match || match[2] !== controlId || match[3] !== evidenceId) return null;
  const parts = match[4].split(' Suggested action: ');
  const status = match[1] === 'Met' ? 'MET' : match[1] === 'Not met' ? 'NOT MET' : 'PARTIAL';
  return { status, reason: parts[0].trim(), recommendation: (parts[1] || '').trim() };
}

function readingFor(ws, controlId, evidenceId) {
  const rows = ws.history || [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const reading = parseSuggestion(rows[index].text, controlId, evidenceId);
    if (reading) return reading;
  }
  return null;
}

function judgeControl(ws, control) {
  const evidence = linkedEvidence(ws, control.id);
  const latest = latestEvidence(evidence);
  const reading = latest ? readingFor(ws, control.id, latest.id) : null;
  return judge(control, evidence, today(), reading);
}

function acceptedMark(ws, decision) {
  const rows = ws.history || [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const text = String(rows[index].text || '');
    const graded = text.match(new RegExp(`^Accepted ${decision.controlId} as (Met|Partially met|Not met)\\.`));
    if (graded) return graded[1] === 'Met' ? 'MET' : graded[1] === 'Not met' ? 'NOT MET' : 'PARTIAL';
    if (text.startsWith(`Accepted ${decision.controlId}.`) || text.includes(`Agreed ${decision.controlId}`)) return 'MET';
  }
  return decision.reviewedStatus === 'PARTIAL' || decision.reviewedStatus === 'NOT MET' || decision.reviewedStatus === 'MET' ? decision.reviewedStatus : 'MET';
}

function judge(control, evidence, day, reading) {
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
  if (!latest.hasReview && reading) {
    return {
      status: reading.status,
      quality: reading.status === 'MET' ? 'Strong' : reading.status === 'NOT MET' ? 'Weak' : 'Moderate',
      reason: reading.reason,
      recommendation: reading.recommendation,
      sources: [sourceOf(latest)],
      graded: true,
    };
  }
  if (!latest.hasReview) {
    return {
      status: 'PARTIAL',
      quality: 'Moderate',
      reason: `${latest.name} is on record for review.`,
      recommendation: `Read the document and decide for ${control.id}.`,
      sources: [sourceOf(latest)],
    };
  }
  if (latest.reviewDue && latest.reviewDue < day) {
    return {
      status: 'NOT MET',
      quality: 'Weak',
      reason: `${latest.name} is past its review date.`,
      recommendation: 'File a review that sits inside the current interval.',
      sources: [sourceOf(latest)],
    };
  }
  return {
    status: 'MET',
    quality: 'Strong',
    reason: `${latest.name} is the document on record.`,
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
    repository: item.source || '',
    location: item.location || '',
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

function agreedStatus(ws, decision, judgement) {
  if (decision.review === 'confirmed') return acceptedMark(ws, decision);
  if (decision.review === 'awaiting' && judgement.graded) return 'PARTIAL';
  if (decision.review === 'rejected') return 'NOT MET';
  if (decision.review === 'overridden') {
    const rows = ws.history || [];
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const text = String(rows[index].text || '');
      if (text.includes(`Edited ${decision.controlId}`)) return decision.reviewedStatus || judgement.status;
      if (text.includes(`Disagreed with ${decision.controlId}`) || text.includes(`Rejected ${decision.controlId}`)) return 'NOT MET';
    }
    return decision.reviewedStatus || judgement.status;
  }
  if (decision.reviewedStatus && (decision.review === 'awaiting' || decision.review === 'requested')) return decision.reviewedStatus;
  return judgement.status;
}

// Accepted evidence lapses on its review date. The requirement then shows
// Expired until a newer file is filed and accepted.
function expiredMark(agreed, filer) {
  if (agreed === 'MET' && filer?.reviewDue && filer.reviewDue < today()) return 'EXPIRED';
  return agreed;
}

function present(ws, actorId) {
  const controls = ws.controls.map((control) => {
    const evidence = linkedEvidence(ws, control.id);
    const judgement = judgeControl(ws, control);
    const decision = decisionFor(ws, control.id);
    const filer = latestEvidence(evidence);
    const due = deadlinesFor(ws, control);
    delete due.latest;
    return {
      ...control,
      ...due,
      family: templates.findTemplate(control.templateId)?.family || control.framework || 'Internal policy',
      ref: templates.findTemplate(control.templateId)?.ref || '',
      judgement,
      decision,
      agreed: expiredMark(agreedStatus(ws, decision, judgement), filer),
      reviewDue: filer?.reviewDue || '',
      filerId: filer?.uploadedBy || '',
      evidenceIds: evidence.map((item) => item.id),
    };
  });
  return {
    organisation: ws.organisation,
    people: ws.people.map((row) => ({ ...row, roles: rolesOf(row), signatureStatus: signatureStatus(ws, row.id) })),
    controls,
    evidence: ws.evidence,
    tickets: ws.tickets,
    history: [...ws.history].sort((a, b) => String(b.at).localeCompare(String(a.at))),
    templates: templates.listTemplates(ws.controls, ws.organisation.framework),
    frameworks: templates.FRAMEWORKS,
    invitations: ws.invitations || [],
    acknowledgements: ws.acknowledgements || [],
    reviews: reviewsFor(ws, actorId),
    notifications: (ws.notifications || [])
      .filter((row) => row.recipientId === actorId)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, 40),
    evidenceSources: EVIDENCE_SOURCES,
    today: today(),
  };
}

// Admins and reviewers see every decision. Everyone else sees decisions on
// documents they filed, requirements they own, and tickets they hold.
function reviewsFor(ws, actorId) {
  const who = person(ws, actorId);
  const all = [...(ws.reviews || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (holds(who, 'admin') || holds(who, 'reviewer')) return all;
  const owned = new Set(ws.controls.filter((row) => row.ownerId === actorId).map((row) => row.id));
  const held = new Set(ws.tickets.filter((row) => row.ownerId === actorId).map((row) => row.id));
  return all.filter((row) => row.filerId === actorId || owned.has(row.controlId) || (row.ticketId && held.has(row.ticketId)));
}

function signatureStatus(ws, personId) {
  const rows = (ws.acknowledgements || []).filter((row) => row.personId === personId && row.status !== 'withdrawn');
  if (rows.some((row) => row.status === 'required')) return 'Signature required';
  if (rows.some((row) => row.status === 'signed')) return 'Signed';
  const who = person(ws, personId);
  if (who?.drawnSignature) return 'Signed';
  return 'Not signed';
}

function nextAckId(ws) {
  const numbers = (ws.acknowledgements || []).map((row) => Number(String(row.id).replace(/\D/g, '')) || 0);
  return `ACK-${String(Math.max(0, ...numbers) + 1).padStart(4, '0')}`;
}

function requestResponsibility(ws, owner, control) {
  if (!Array.isArray(ws.acknowledgements)) ws.acknowledgements = [];
  if (!control.responsibilityVersion) control.responsibilityVersion = 1;
  ws.acknowledgements.forEach((row) => {
    if (row.kind === 'responsibility' && row.controlId === control.id && row.status === 'required' && row.personId !== owner.id) {
      row.status = 'withdrawn';
    }
  });
  const pending = ws.acknowledgements.find((row) => row.kind === 'responsibility' && row.controlId === control.id && row.personId === owner.id && row.status === 'required');
  if (pending) return pending;
  const signed = ws.acknowledgements.find((row) => row.kind === 'responsibility' && row.controlId === control.id && row.personId === owner.id && row.status === 'signed' && row.itemVersion === control.responsibilityVersion);
  if (signed) return signed;
  const ack = {
    id: nextAckId(ws),
    personId: owner.id,
    organisationId: ws.organisation.id,
    kind: 'responsibility',
    controlId: control.id,
    statement: `You are the evidence owner for ${control.id}. Please review and acknowledge this responsibility.`,
    itemVersion: control.responsibilityVersion,
    status: 'required',
    signature: '',
    signedAt: '',
    userAgent: '',
    ip: '',
  };
  ws.acknowledgements.push(ack);
  log(ws, 'system', `${owner.name} is the evidence owner for ${control.id}. Acknowledgement is pending.`);
  return ack;
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
  const next = Math.max(0, ...numbers) + 1;
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + (ws.organisation.ticketDays || 28));
  const ticket = {
    id: `T-${String(next).padStart(4, '0')}`,
    controlId: control.id,
    title: judgement.status === 'NO EVIDENCE' ? `File the ${control.expected.toLowerCase()}` : `Close the gap on ${control.id}`,
    problem: judgement.reason,
    action: judgement.recommendation,
    ownerId,
    priority: judgement.status === 'NO EVIDENCE' ? 'High' : 'Medium',
    status: 'assigned',
    due: due.toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    fixEvidenceId: '',
    submittedBy: '',
  };
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

// One reviewer decision, kept as its own record. Records are only added.
function recordReview(ws, fields) {
  const numbers = ws.reviews.map((row) => Number(String(row.id).replace(/\D/g, '')) || 0);
  const row = {
    id: `R-${String(Math.max(0, ...numbers) + 1).padStart(5, '0')}`,
    controlId: fields.control.id,
    evidenceId: fields.evidence?.id || '',
    evidenceName: fields.evidence?.name || '',
    evidenceVersion: fields.evidence?.version || 0,
    filerId: fields.evidence?.uploadedBy || '',
    reviewerId: fields.reviewer.id,
    decision: fields.decision,
    status: fields.status || '',
    comment: fields.comment || '',
    ticketId: fields.ticket?.id || '',
    at: new Date().toISOString(),
  };
  ws.reviews.push(row);
  ws.newReviews.push(row);
  return row;
}

const DECISION_WORDS = {
  accepted: 'accepted',
  rejected: 'rejected',
  edited: 'changed the result of',
  requested: 'asked for more evidence on',
  verified: 'verified the fix for',
  'sent-back': 'sent back the fix for',
};

function decisionNotice(ws, who, row) {
  const doc = row.evidenceName ? ` (${row.evidenceName}, version ${row.evidenceVersion})` : '';
  const result = row.status && ['accepted', 'edited', 'verified'].includes(row.decision) ? ` Result: ${labelStatus(row.status)}.` : '';
  const reason = row.comment ? ` Reason: ${row.comment}` : '';
  return `${who.name} ${DECISION_WORDS[row.decision]} ${row.controlId}${doc}.${result}${reason}`;
}

async function review(body) {
  const ws = await load(body.organisationId);
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
    const judgement = judgeControl(ws, control);
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
    const row = recordReview(ws, { control, evidence: filer, reviewer: who, decision: 'requested', status: judgement.status, comment, ticket });
    const directs = [{ id: ticket.ownerId, page: 'tickets' }];
    if (filer?.uploadedBy && filer.uploadedBy !== ticket.ownerId) directs.push({ id: filer.uploadedBy, page: 'feedback' });
    handoff(ws, who.id, directs, `${decisionNotice(ws, who, row)} Ticket ${ticket.id} is with ${personName(ws, ticket.ownerId)}.`, { controlId: control.id, ticketId: ticket.id, adminPage: 'feedback' });
    await save(ws);
    return {
      workspace: present(ws, body.actorId),
      flash: `${who.name} asked for more evidence on ${control.id}. Ticket ${ticket.id} is with ${personName(ws, ticket.ownerId)}.`,
      open: { page: 'tickets', ticketId: ticket.id },
    };
  }
  const judgement = judgeControl(ws, control);
  let status = judgement.status;
  if (kind === 'agree') status = judgement.status === 'NO EVIDENCE' ? 'NOT MET' : judgement.status;
  if (kind === 'disagree') status = 'NOT MET';
  if (kind === 'edit') {
    status = body.status;
    if (!STATUSES.includes(status)) fail(400, 'Choose a status the register uses.');
    const owner = person(ws, body.ownerId);
    if (!owner) fail(400, 'Choose an owner who is on this organisation.');
    if (owner.id !== control.ownerId) {
      log(ws, who.id, `Changed the owner of ${control.id} from ${personName(ws, control.ownerId)} to ${owner.name}.`);
      control.responsibilityVersion = (control.responsibilityVersion || 1) + 1;
      control.ownerId = owner.id;
      requestResponsibility(ws, owner, control);
    }
  }
  const decision = ensureDecision(ws, control.id);
  const reviewName = kind === 'agree' ? 'confirmed' : kind === 'disagree' ? 'rejected' : 'overridden';
  rememberReview(decision, who, reviewName, status, comment);
  const source = judgement.sources[0];
  const cited = source ? ` Source: ${source.name}, version ${source.version}, ${source.section}.` : ' No file was cited.';
  const verb = kind === 'agree'
    ? `Accepted ${control.id} as ${labelStatus(status)}`
    : kind === 'disagree'
      ? `Rejected ${control.id}`
      : `Edited ${control.id} to ${labelStatus(status)}`;
  log(ws, who.id, `${verb}.${comment ? ` ${comment}` : ''}${cited}`);
  let ticket = null;
  if (kind === 'disagree' || (kind === 'edit' && status !== 'MET')) {
    ticket = createTicket(ws, control, { ...judgement, status, reason: comment || judgement.reason, recommendation: judgement.recommendation }, control.ownerId);
  }
  const filer = latestEvidence(linkedEvidence(ws, control.id));
  const decided = kind === 'agree' ? 'accepted' : kind === 'disagree' ? 'rejected' : 'edited';
  const row = recordReview(ws, { control, evidence: filer, reviewer: who, decision: decided, status, comment, ticket });
  const directs = [];
  if (filer?.uploadedBy) directs.push({ id: filer.uploadedBy, page: 'feedback' });
  if (ticket?.ownerId) directs.push({ id: ticket.ownerId, page: 'tickets' });
  if (control.ownerId) directs.push({ id: control.ownerId, page: 'feedback' });
  const notice = `${decisionNotice(ws, who, row)}${ticket ? ` Ticket ${ticket.id} is with ${personName(ws, ticket.ownerId)}.` : ''}`;
  handoff(ws, who.id, directs, notice, { controlId: control.id, ticketId: ticket?.id || '', adminPage: 'feedback' });
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: notice,
    open: ticket ? { page: 'tickets', ticketId: ticket.id } : { page: 'review', ticketId: '' },
  };
}

function labelStatus(status) {
  if (status === 'MET') return 'Met';
  if (status === 'PARTIAL') return 'Partially met';
  if (status === 'NOT MET') return 'Not met';
  return 'No evidence';
}

async function loadStored(item) {
  const location = String(item.location || '');
  if (!location.startsWith('storage:')) return null;
  try {
    return await files.download(location.slice('storage:'.length));
  } catch {
    return null;
  }
}

async function rememberDocument(item) {
  const buffer = await loadStored(item);
  if (!buffer) return null;
  if (String(item.note || '').trim().length < 20) {
    const text = extract.extractText(buffer, item.name);
    if (text.trim().length >= 20) item.note = text;
  }
  if (String(item.note || '').trim().length >= 20) return null;
  return extract.attachment(item.name, buffer);
}

function evidenceSource(id) {
  return EVIDENCE_SOURCES.find((row) => row.id === id) || null;
}

async function addEvidence(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'uploader', `${who.name} does not have the uploader permission.`);
  const source = evidenceSource(clean(body.sourceId, 40));
  if (!source) fail(400, 'Choose where the document lives.');
  const primary = ws.controls.find((row) => row.id === body.controlId);
  if (!primary) fail(404, 'Choose a control on this organisation.');
  const extra = Array.isArray(body.controlIds) ? body.controlIds : [];
  const controlIds = [...new Set([primary.id, ...extra.map((id) => clean(id, 40))])]
    .filter((id) => ws.controls.some((row) => row.id === id));
  const name = clean(body.name, 160);
  const note = clean(body.documentText || body.note, 12000);
  if (!name) fail(400, 'Give the file a name.');
  const location = clean(body.location, 300);
  let stored = '';
  if (source.connected) {
    stored = clean(body.storagePath, 300);
    const prefix = `storage:${ws.organisation.id}/${who.id}/`;
    if (!stored.startsWith(prefix) || stored.includes('..')) fail(400, 'Upload the document again.');
    const ready = await files.exists(stored.slice('storage:'.length));
    if (!ready) fail(400, 'The document did not upload. Choose the file again.');
  }
  const reviewDueInput = clean(body.reviewDue, 10);
  if (reviewDueInput && !/^\d{4}-\d{2}-\d{2}$/.test(reviewDueInput)) fail(400, 'Use a review date.');
  const reviewDue = reviewDueInput || reviewDateFromFrequency(primary.frequency);
  let hash = '';
  let section = 'Uploaded note';
  if (source.connected) {
    hash = clean(body.fileHash, 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) fail(400, 'Choose a file from this computer.');
    section = 'File from this computer';
  } else {
    if (!location) fail(400, `Say where the document lives in ${source.name}. That place is not connected, so the register keeps the link or path you record.`);
    hash = crypto.createHash('sha256').update([source.id, location, name].join('|')).digest('hex');
    section = 'Location recorded';
  }
  const version = ws.evidence
    .filter((item) => item.name === name && item.controlIds.some((id) => controlIds.includes(id)))
    .reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const duplicate = ws.evidence.find((item) => item.hash === hash && !item.rejected);
  const previous = [...ws.evidence].find((item) => item.name === name && !item.rejected && item.hash !== hash);
  const checks = [];
  if (duplicate) checks.push(`Same fingerprint as ${duplicate.id}`);
  if (previous) checks.push(`Fingerprint differs from ${previous.id}`);
  if (reviewDue && reviewDue < today()) checks.push(`Review date ${reviewDue} is already past`);
  if (!source.connected) checks.push(`${source.name} is not connected. The place was recorded and the file was not read`);
  const numbers = ws.evidence.map((item) => Number(item.id.replace(/\D/g, '')) || 0);
  const item = {
    id: `EV-${String(Math.max(0, ...numbers) + 1).padStart(6, '0')}`,
    name,
    version,
    uploadedBy: who.id,
    uploadedAt: new Date().toISOString(),
    source: source.name,
    location: source.connected ? stored : location,
    hash,
    controlIds,
    note,
    section,
    hasReview: false,
    readable: true,
    reviewDue,
    rejected: false,
  };
  await rememberDocument(item);
  ws.evidence.unshift(item);
  controlIds.forEach((id) => {
    const decision = ensureDecision(ws, id);
    decision.review = 'awaiting';
    decision.reviewBy = '';
    decision.reviewAt = '';
    decision.comment = '';
  });
  const listed = controlIds.join(', ');
  log(ws, who.id, `Recorded ${name}, version ${version}, from ${source.name} for ${listed}. Fingerprint ${hash.slice(0, 12)}.${checks.length ? ` ${checks.join('. ')}.` : ''}`);
  const reviewerName = personName(ws, primary.reviewerId);
  const reviewers = controlIds.map((id) => {
    const row = ws.controls.find((control) => control.id === id);
    return { id: row?.reviewerId, page: 'review' };
  });
  if (body.release) {
    handoff(ws, who.id, reviewers, `${who.name} submitted ${name} for ${listed}. Please review it.`, { controlId: primary.id });
    await save(ws);
    return {
      workspace: present(ws, body.actorId),
      evidenceId: item.id,
      flash: `Evidence submitted. ${reviewerName} has been notified and will review it.`,
      open: { page: 'evidence', ticketId: '' },
    };
  }
  if (!Array.isArray(ws.acknowledgements)) ws.acknowledgements = [];
  ws.acknowledgements.push({
    id: nextAckId(ws),
    personId: who.id,
    organisationId: ws.organisation.id,
    kind: 'submission',
    controlId: primary.id,
    statement: `evidence:${item.id}\nSign to send this evidence to ${reviewerName}.`,
    itemVersion: version,
    status: 'required',
    signature: '',
    signedAt: '',
    userAgent: '',
    ip: '',
  });
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    evidenceId: item.id,
    flash: `Evidence recorded. Sign it to notify ${reviewerName}.`,
    open: { page: 'upload', ticketId: '' },
  };
}

async function signEvidence(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  const item = ws.evidence.find((row) => row.id === body.evidenceId);
  if (!item) fail(404, 'That evidence is not on this organisation.');
  if (item.uploadedBy !== who.id) fail(403, `${who.name} can sign evidence they filed.`);
  const ack = (ws.acknowledgements || []).find((row) => row.kind === 'submission' && String(row.statement || '').startsWith(`evidence:${item.id}`) && row.personId === who.id);
  if (!ack) fail(404, 'This evidence is not waiting for a signature.');
  if (ack.status === 'signed') fail(400, 'This evidence is already signed.');
  const drawing = cleanDrawn(body.signature);
  if (!drawing) fail(400, 'Draw your signature in the box.');
  ack.status = 'signed';
  ack.signature = drawing;
  ack.signedAt = new Date().toISOString();
  ack.userAgent = clean(body.userAgent, 180);
  ack.ip = clean(body.ip, 80);
  who.drawnSignature = drawing;
  who.drawnAt = ack.signedAt;
  const file = await rememberDocument(item);
  const reviewers = item.controlIds.map((id) => {
    const row = ws.controls.find((control) => control.id === id);
    return { id: row?.reviewerId, page: 'review' };
  });
  for (const controlId of item.controlIds) {
    const control = ws.controls.find((row) => row.id === controlId);
    if (!control) continue;
    // A requirement copied from a standard the organisation bought is never sent to an AI service.
    if (control.origin === 'standard-document') continue;
    try {
      const reading = await gemini.grade(control, item.name, item.note, file);
      if (!reading) continue;
      const action = reading.recommendation ? ` Suggested action: ${reading.recommendation}` : '';
      log(ws, 'system', `Suggested ${labelStatus(reading.status)} for ${control.id} on ${item.id}. ${reading.reason}${action}`);
    } catch {
      // The signature still stands when a reading cannot be prepared.
    }
  }
  const listed = item.controlIds.join(', ');
  handoff(ws, who.id, reviewers, `${who.name} signed ${item.name} for ${listed}. Please review it.`, { controlId: item.controlIds[0] || '' });
  log(ws, who.id, `${who.name} signed ${item.id}. The reviewer has been notified.`);
  await save(ws);
  const reviewerName = personName(ws, ws.controls.find((row) => row.id === item.controlIds[0])?.reviewerId);
  return {
    workspace: present(ws, body.actorId),
    evidenceId: item.id,
    flash: `${reviewerName} has been notified.`,
    open: { page: 'upload', ticketId: '' },
  };
}

async function addControl(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const listed = Array.isArray(body.requirements) ? body.requirements : [body.requirement];
  const requirements = [...new Set(listed.map((text) => clean(text, 400)).filter(Boolean))].slice(0, 60);
  const owner = person(ws, body.ownerId);
  if (!requirements.length || !owner) fail(400, 'Write the requirement, or choose at least one line from the policy, and choose an owner on this organisation.');
  const sourceName = clean(body.sourceName, 160);
  const sourceHash = clean(body.sourceHash, 64).toLowerCase();
  if (sourceHash && !/^[a-f0-9]{64}$/.test(sourceHash)) fail(400, 'The policy document fingerprint is not valid. Choose the file again.');
  const reviewerId = reviewerFor(ws, owner.id, body.reviewerId);
  const evidenceDue = cleanDay(body.evidenceDue);
  if (evidenceDue) await assertDeadlines();
  // A standard the organisation holds (for example a purchased ISO copy) is
  // filed under its own framework. Its text stays in this organisation only.
  const standard = body.kind === 'standard';
  const framework = standard ? templates.frameworkName(body.framework) : '';
  if (standard && !framework) fail(400, 'Name the standard these requirements come from.');
  if (standard && !sourceName) fail(400, 'Choose the document of the standard.');
  if (framework && !templates.parseFrameworks(ws.organisation.framework).includes(framework)) {
    ws.organisation.framework = templates.frameworkLine([...templates.parseFrameworks(ws.organisation.framework), framework]);
  }
  const kindLabel = framework ? `a requirement of ${framework}` : 'an internal policy';
  const added = requirements.map((requirement) => {
    const numbers = ws.controls.map((row) => Number(row.id.replace(/\D/g, '')) || 0);
    const control = {
      id: `CTRL-${String(Math.max(0, ...numbers) + 1).padStart(4, '0')}`,
      requirement,
      expected: clean(body.expected, 120) || 'Supporting document',
      frequency: clean(body.frequency, 80) || 'Organisation-defined',
      ownerId: owner.id,
      reviewerId,
      templateId: '',
      origin: standard ? 'standard-document' : (sourceName ? 'policy-document' : 'custom'),
      framework,
      sourceName,
      sourceHash: sourceName ? sourceHash : '',
      evidenceDue,
    };
    ws.controls.push(control);
    requestResponsibility(ws, owner, control);
    log(ws, who.id, sourceName
      ? `Added ${control.id} as ${kindLabel}, taken from ${sourceName}${sourceHash ? ` (fingerprint ${sourceHash.slice(0, 12)})` : ''}.`
      : `Added ${control.id} as an internal policy of this organisation.`);
    if (evidenceDue) log(ws, who.id, `Evidence for ${control.id} is due by ${evidenceDue}.`);
    return control;
  });
  const ids = added.map((control) => control.id);
  const named = ids.length === 1 ? ids[0] : `${ids.length} requirements (${ids[0]} to ${ids[ids.length - 1]})`;
  handoff(
    ws,
    who.id,
    [{ id: owner.id, page: 'dashboard' }, { id: reviewerId, page: 'review' }],
    `${who.name} added ${named} as ${framework || 'internal policy'}${sourceName ? ` from ${sourceName}` : ''}. ${owner.name} owns it. ${personName(ws, reviewerId)} checks documents filed against it.`,
    { controlId: ids[0] },
  );
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${named} ${ids.length === 1 ? 'is' : 'are'} on the control set. ${owner.name} owns the evidence. Saving this does not approve a requirement or create evidence.`,
    open: { page: 'controls', ticketId: '' },
  };
}

// Reads a policy document and lists the lines that set an obligation. Nothing
// is saved here: the admin chooses which lines become requirements.
async function readPolicy(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const name = clean(body.filename, 160);
  if (!name) fail(400, 'Choose a policy document.');
  let text = '';
  let hash = clean(body.fileHash, 64).toLowerCase();
  const file = String(body.file || '').replace(/^data:.*base64,/, '');
  if (file) {
    const buffer = Buffer.from(file, 'base64');
    if (!buffer.length || buffer.length > 2_500_000) fail(400, 'Use a policy document under 2.5 MB.');
    hash = crypto.createHash('sha256').update(buffer).digest('hex');
    text = extract.extractText(buffer, name);
  } else {
    text = String(body.text || '').slice(0, 60000);
  }
  if (!/^[a-f0-9]{64}$/.test(hash)) hash = '';
  if (text.replace(/\s/g, '').length < 20) {
    fail(400, `No text could be read from ${name}. Use a Word, PDF, or text file with selectable text, or write the requirement instead.`);
  }
  return { name, hash, lines: policy.findObligations(text) };
}

async function submitFix(body) {
  const ws = await load(body.organisationId);
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
  const name = `${control.expected.replace(/\s+/g, '_')}_fix.pdf`;
  const note = `Updated ${control.expected.toLowerCase()} filed on ${today()}. The review date sits inside the current interval.`;
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
    location: '',
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
  handoff(
    ws,
    who.id,
    [{ id: control.reviewerId, page: 'tickets' }],
    `${who.name} filed ${name} for ${control.id}. The register reads Met. ${personName(ws, control.reviewerId)} needs to verify ticket ${ticket.id}.`,
    { controlId: control.id, ticketId: ticket.id },
  );
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${item.id} is on file. The reading is Met. ${personName(ws, control.reviewerId)} has to verify it before the ticket closes.`,
    open: { page: 'tickets', ticketId: ticket.id },
  };
}

async function verify(body) {
  const ws = await load(body.organisationId);
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
    const judgement = judgeControl(ws, control);
    ticket.status = 'resolved';
    rememberReview(decision, who, 'confirmed', judgement.status, comment || 'The new file closes the gap.');
    log(ws, who.id, `Verified ticket ${ticket.id}. ${control.id} is now ${labelStatus(judgement.status)}.${comment ? ` ${comment}` : ''}`);
    const fixed = ws.evidence.find((item) => item.id === ticket.fixEvidenceId);
    const row = recordReview(ws, { control, evidence: fixed, reviewer: who, decision: 'verified', status: judgement.status, comment, ticket });
    handoff(ws, who.id, [{ id: ticket.ownerId, page: 'feedback' }], `${decisionNotice(ws, who, row)} Ticket ${ticket.id} is resolved.`, { controlId: control.id, ticketId: ticket.id, adminPage: 'feedback' });
    await save(ws);
    return {
      workspace: present(ws, body.actorId),
      flash: `${ticket.id} is resolved. ${control.id} stands at ${labelStatus(judgement.status)}.`,
      open: { page: 'history', ticketId: ticket.id },
    };
  }
  if (body.decision !== 'reject') fail(400, 'Verify or send the fix back.');
  if (comment.length < 3) fail(400, 'Write why the fix does not close the gap.');
  const fix = ws.evidence.find((item) => item.id === ticket.fixEvidenceId);
  if (fix) fix.rejected = true;
  const sentBack = recordReview(ws, { control, evidence: fix, reviewer: who, decision: 'sent-back', status: 'NOT MET', comment, ticket });
  ticket.status = 'reopened';
  ticket.fixEvidenceId = '';
  ticket.submittedBy = '';
  const judgement = judgeControl(ws, control);
  rememberReview(decision, who, 'overridden', judgement.status, comment);
  log(ws, who.id, `Sent ticket ${ticket.id} back. ${comment}`);
  handoff(ws, who.id, [{ id: ticket.ownerId, page: 'tickets' }], `${decisionNotice(ws, who, sentBack)} Ticket ${ticket.id} is open again with ${personName(ws, ticket.ownerId)}.`, { controlId: control.id, ticketId: ticket.id, adminPage: 'feedback' });
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${ticket.id} is open again. The rejected file stays in the history and is not used for the current reading.`,
    open: { page: 'tickets', ticketId: ticket.id },
  };
}

async function setOrganisation(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const name = clean(body.name, 120);
  const legalName = clean(body.legalName, 120);
  const country = clean(body.country, 80);
  if (!name || !legalName || !country) fail(400, 'Give the operating name, the legal name, and the country.');
  const locations = String(body.locations || '')
    .split(',')
    .map((item) => clean(item, 80))
    .filter(Boolean);
  ws.organisation.name = name;
  ws.organisation.legalName = legalName;
  ws.organisation.industry = clean(body.industry, 80);
  ws.organisation.country = country;
  ws.organisation.locations = locations;
  ws.organisation.website = clean(body.website, 160);
  ws.organisation.size = clean(body.size, 40);
  ws.organisation.description = clean(body.description, 400);
  ws.organisation.contactName = clean(body.contactName, 80);
  ws.organisation.emailDomain = clean(body.emailDomain, 80).replace(/^@/, '');
  if (!ws.organisation.createdAt) ws.organisation.createdAt = new Date().toISOString();
  const before = templates.parseFrameworks(ws.organisation.framework);
  if (body.frameworks !== undefined) ws.organisation.framework = templates.frameworkLine(body.frameworks);
  log(ws, who.id, `Saved the organisation identity for ${name}.`);
  // A framework ticked for the first time puts its built-in requirements on
  // the register. The admin owns them until they are reassigned.
  const fresh = templates.parseFrameworks(ws.organisation.framework)
    .filter((family) => !before.includes(family) && templates.hasTemplates(family) && unusedTemplates(ws, family).length);
  const loaded = [];
  let waiting = '';
  if (fresh.length) {
    let reviewerId = '';
    try {
      reviewerId = reviewerFor(ws, who.id);
    } catch {
      waiting = ` ${fresh.join(' and ')} ${fresh.length === 1 ? 'is' : 'are'} chosen. Give someone the reviewer profile, then use Add all on the Requirements page.`;
    }
    if (reviewerId) fresh.forEach((family) => loaded.push(addTemplates(ws, who, unusedTemplates(ws, family), who, reviewerId)));
  }
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: loaded.length
      ? `${name} is saved. ${loaded.join(' and ')} ${loaded.length === 1 && !loaded[0].includes('requirements') ? 'is' : 'are'} now on the Requirements page, owned by ${who.name} until you reassign them.`
      : `${name} is established on this register. Add departments, then assign who owns and reviews each requirement.${waiting}`,
    open: { page: loaded.length ? 'controls' : 'dashboard', ticketId: '' },
  };
}

async function setReminders(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const on = Boolean(body.reminders);
  ws.organisation.reminders = on;
  log(ws, who.id, on ? 'Turned reminders on for this organisation.' : 'Turned reminders off for this organisation.');
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: on
      ? 'Reminders are on. Once a day, in the app and by email, owners are reminded of requirements with no evidence, and reviewers of evidence waiting for their decision.'
      : 'Reminders are off. No reminder will be sent.',
    open: { page: 'organisation', ticketId: '' },
  };
}

async function assertDeadlines() {
  if (!(await db.supportsDeadlines())) fail(500, 'Deadlines cannot be saved yet. Run supabase/deadlines.sql in the Supabase SQL editor.');
}

function dayCount(value, max, label) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > max) fail(400, `${label} must be a whole number of days from 1 to ${max}.`);
  return count;
}

async function setDeadlines(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const reviewDays = dayCount(body.reviewDays, 90, 'Time to review');
  const ticketDays = dayCount(body.ticketDays, 365, 'Time to fix a ticket');
  await assertDeadlines();
  ws.organisation.reviewDays = reviewDays;
  ws.organisation.ticketDays = ticketDays;
  log(ws, who.id, `Set deadlines: reviewers decide within ${reviewDays} ${reviewDays === 1 ? 'day' : 'days'} of a submission, and a fix ticket is due ${ticketDays} ${ticketDays === 1 ? 'day' : 'days'} after it opens.`);
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `Deadlines saved. Reviewers have ${reviewDays} ${reviewDays === 1 ? 'day' : 'days'} to decide, and new tickets are due in ${ticketDays} ${ticketDays === 1 ? 'day' : 'days'}.`,
    open: { page: 'organisation', ticketId: '' },
  };
}

async function setEvidenceDue(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const control = ws.controls.find((row) => row.id === body.controlId);
  if (!control) fail(404, 'That requirement is not on this organisation.');
  const evidenceDue = cleanDay(body.evidenceDue);
  await assertDeadlines();
  if ((control.evidenceDue || '') === evidenceDue) return { workspace: present(ws, body.actorId), flash: '' };
  control.evidenceDue = evidenceDue;
  log(ws, who.id, evidenceDue ? `Evidence for ${control.id} is due by ${evidenceDue}.` : `Removed the evidence due date from ${control.id}.`);
  if (evidenceDue) {
    handoff(ws, who.id, [{ id: control.ownerId, page: 'dashboard' }], `${who.name} set a due date for ${control.id}: evidence is due by ${evidenceDue}.`, { controlId: control.id });
  }
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: evidenceDue ? `Evidence for ${control.id} is due by ${evidenceDue}. ${personName(ws, control.ownerId)} has been notified.` : `${control.id} no longer has a due date.`,
    open: { page: 'controls', ticketId: '' },
  };
}

// The compliance report, as an Excel file. Admins and reviewers can take it.
async function complianceReport(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  if (!holds(who, 'admin') && !holds(who, 'reviewer')) fail(403, `${who.name} needs the admin or reviewer profile to download the report.`);
  const day = today();
  const buffer = report.build(present(ws, who.id), who, day);
  log(ws, who.id, `${who.name} downloaded the compliance report.`);
  await save(ws);
  const name = slug(ws.organisation.name || ws.organisation.id);
  return { buffer, filename: `compliance-report-${name}-${day}.xlsx` };
}

// The check runs every hour. A run can start a little earlier in the hour
// than the day before, so a reminder counts as a day old after 23h45m.
const REMIND_AFTER = (23 * 60 + 45) * 60 * 1000;

// Evidence counts as submitted once it is filed and signed (or released
// without a signature), and the reviewer has not rejected it.
function submitted(ws, item) {
  if (item.rejected) return false;
  return !(ws.acknowledgements || []).some((row) => row.kind === 'submission'
    && row.status === 'required'
    && String(row.statement || '').startsWith(`evidence:${item.id}\n`));
}

function historyTime(ws, matches) {
  const times = ws.history.filter(matches).map((row) => Date.parse(row.at)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : 0;
}

function addedAt(ws, controlId) {
  return historyTime(ws, (row) => String(row.text || '').startsWith(`Added ${controlId} `));
}

// The time the filer sent the evidence: when they signed it, or when they
// filed it if it went to the reviewer without a signature.
function submittedAt(ws, item) {
  const ack = (ws.acknowledgements || []).find((row) => row.kind === 'submission'
    && String(row.statement || '').startsWith(`evidence:${item.id}\n`));
  return Date.parse(ack?.signedAt || item.uploadedAt) || 0;
}

// `task` is the verb in the history line: "submit" for owners, "review" for reviewers.
function lastReminder(ws, personId, task) {
  return historyTime(ws, (row) => row.actorId === 'system'
    && String(row.text || '').startsWith('Reminded ')
    && String(row.text).includes(`(${personId}) to ${task} evidence for `));
}

const REMINDERS = {
  submit: {
    page: 'upload',
    notice: (listed) => `Reminder: evidence is still needed for ${listed}. Submit it so the reviewer can check it.`,
  },
  review: {
    page: 'review',
    notice: (listed) => `Reminder: evidence for ${listed} is waiting for your review.`,
  },
  chase: {
    page: 'controls',
    notice: (listed) => `Overdue: a deadline has passed on ${listed}. Follow up with the people named.`,
  },
};

// Once a day:
// - each owner is reminded of every requirement set at least a day ago that
//   still has no submitted evidence, and of evidence past its review date;
// - each reviewer of every submission that has waited at least a day;
// - each admin of everything past a deadline: evidence due dates, review
//   days, and fix tickets.
// A reminder stops once its cause is gone.
async function remindOrganisation(organisationId, origin, now = Date.now()) {
  const ws = await load(organisationId);
  if (!ws.organisation.reminders) return 0;
  const day = new Date(now).toISOString().slice(0, 10);
  const due = new Map();
  const add = (task, who, row) => {
    if (!who) return;
    const key = `${task}:${who.id}`;
    if (!due.has(key)) due.set(key, { task, who, rows: [] });
    due.get(key).rows.push(row);
  };
  const late = [];
  ws.controls.forEach((control) => {
    const owner = person(ws, control.ownerId);
    const deadline = deadlinesFor(ws, control, day);
    const item = deadline.latest;
    if (deadline.evidenceLate) late.push({ id: control.id, requirement: control.requirement, detail: `Evidence was due on ${deadline.evidenceDue}. Owner: ${personName(ws, control.ownerId)}` });
    if (deadline.reviewLate) late.push({ id: control.id, requirement: control.requirement, detail: `A decision was due on ${deadline.reviewBy}. Reviewer: ${personName(ws, control.reviewerId)}` });
    if (!item) {
      const added = addedAt(ws, control.id);
      if (added && now - added < REMIND_AFTER) return;
      const when = deadline.evidenceDue ? `${deadline.evidenceLate ? 'was due on' : 'due by'} ${deadline.evidenceDue}` : '';
      add('submit', owner, { id: control.id, requirement: control.requirement, detail: [control.expected, when].filter(Boolean).join(', ') });
      return;
    }
    if (deadline.renewSince) {
      add('submit', owner, { id: control.id, requirement: control.requirement, detail: `${item.name} passed its review date on ${deadline.renewSince}. Submit a current version` });
    }
    if (!deadline.reviewBy) return;
    const reviewer = person(ws, control.reviewerId);
    if (!reviewer || !holds(reviewer, 'reviewer') || item.uploadedBy === reviewer.id) return;
    if (now - submittedAt(ws, item) < REMIND_AFTER) return;
    const when = `${deadline.reviewLate ? 'decision was due on' : 'decide by'} ${deadline.reviewBy}`;
    add('review', reviewer, { id: control.id, requirement: control.requirement, detail: `${item.name}, sent by ${personName(ws, item.uploadedBy)}, ${when}` });
  });
  ws.tickets.filter((ticket) => OPEN_TICKET.includes(ticket.status) && ticket.due && ticket.due < day).forEach((ticket) => {
    late.push({ id: ticket.controlId, requirement: ticket.title, detail: `Ticket ${ticket.id} was due on ${ticket.due}. With ${personName(ws, ticket.ownerId)}` });
  });
  if (late.length) ws.people.filter((row) => holds(row, 'admin')).forEach((admin) => late.forEach((row) => add('chase', admin, row)));
  const organisation = ws.organisation.name || ws.organisation.legalName || '';
  const letters = [];
  let reminded = 0;
  for (const { task, who, rows } of due.values()) {
    const last = lastReminder(ws, who.id, task);
    if (last && now - last < REMIND_AFTER) continue;
    const ids = [...new Set(rows.map((row) => row.id))];
    const listed = ids.length <= 3 ? ids.join(', ') : `${ids.length} requirements (${ids.slice(0, 3).join(', ')} and more)`;
    notify(ws, who.id, 'system', REMINDERS[task].notice(listed), REMINDERS[task].page, { controlId: ids[0] });
    const email = validEmail(who.email) ? who.email : '';
    log(ws, 'system', `Reminded ${who.name} (${who.id}) to ${task} evidence for ${ids.join(', ')}${email ? `, in the app and by email to ${email}` : ' in the app. No email is on file'}.`);
    if (email) letters.push({ task, name: who.name, email, organisation, rows });
    reminded += 1;
  }
  if (!reminded) return 0;
  // Saving first claims today's reminders. A run that overlaps on another
  // server then fails its save on the version check and sends nothing twice.
  await save(ws);
  const results = await Promise.allSettled(letters.map((letter) => mail.sendReminder(letter, origin)));
  const failures = results
    .map((result, index) => (result.status === 'rejected'
      ? `The reminder email to ${letters[index].email} did not send. ${clean(result.reason?.message, 140)}`
      : ''))
    .filter(Boolean);
  if (failures.length) await noteFailures(organisationId, failures);
  return reminded;
}

// Best effort: a person who changes the register at the same moment wins.
async function noteFailures(organisationId, lines) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const ws = await load(organisationId);
      lines.forEach((text) => log(ws, 'system', text));
      await save(ws);
      return;
    } catch (error) {
      if (error.status !== 409) return;
    }
  }
}

// Organisations are checked a few at a time. A run stops starting new ones
// before the hosting time limit; the next hourly run picks up the rest,
// since nobody is reminded twice within a day.
const REMIND_PARALLEL = 4;
const REMIND_BUDGET = 240 * 1000;

async function remindAll(origin, started = Date.now()) {
  const queue = await db.listReminderOrganisations();
  const total = queue.length;
  let checked = 0;
  let reminded = 0;
  const failed = [];
  async function worker() {
    while (queue.length && Date.now() - started < REMIND_BUDGET) {
      const id = queue.shift();
      try {
        const count = await db.withOrganisation(id, () => remindOrganisation(id, origin));
        reminded += count;
      } catch (error) {
        failed.push({ organisationId: id, error: clean(error.message, 160) });
      }
      checked += 1;
    }
  }
  await Promise.all(Array.from({ length: REMIND_PARALLEL }, worker));
  return { organisations: total, checked, remaining: queue.length, reminded, failed };
}

async function addPerson(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const name = clean(body.name, 80);
  const unit = clean(body.unit, 80);
  if (!name || !unit) fail(400, 'Give the person a name and a department.');
  ensureUnit(ws, unit);
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
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${name} is on the organisation. Profiles are permissions, so this person can hold more than one.`,
    open: { page: 'people', ticketId: '' },
  };
}

async function setRoles(body) {
  const ws = await load(body.organisationId);
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
  await save(ws);
  const page = body.page === 'dashboard' || body.page === 'people' ? body.page : 'people';
  return {
    workspace: present(ws, body.actorId),
    flash: `${target.name} now has ${roles.join(', ')}.`,
    open: { page, ticketId: '' },
  };
}

async function addUnit(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const name = clean(body.name, 80);
  if (!name) fail(400, 'Name the department.');
  const parentId = clean(body.parentId, 40);
  shapeOrganisation(ws);
  if (parentId && !ws.organisation.departments.some((row) => row.id === parentId)) {
    fail(400, 'Choose a parent department that already exists.');
  }
  if (ws.organisation.departments.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
    fail(400, `${name} is already a department.`);
  }
  ensureUnit(ws, name, parentId);
  const created = ws.organisation.departments.find((row) => row.name === name);
  if (created && parentId) created.parentId = parentId;
  log(ws, who.id, parentId ? `Added the ${name} department under ${ws.organisation.departments.find((row) => row.id === parentId)?.name || 'its parent'}.` : `Added the ${name} department.`);
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${name} is part of the structure of ${ws.organisation.name || 'this organisation'}.`,
    open: { page: 'dashboard', ticketId: '' },
  };
}

async function addSystem(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const name = clean(body.name, 120);
  if (!name) fail(400, 'Name the AI system that is in scope.');
  shapeOrganisation(ws);
  if (ws.organisation.scope.systems.some((item) => item.toLowerCase() === name.toLowerCase())) {
    fail(400, `${name} is already in scope.`);
  }
  ws.organisation.scope.systems.push(name);
  log(ws, who.id, `Added ${name} to the governance scope.`);
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${name} is in scope. The register will not assume every system is in scope.`,
    open: { page: 'dashboard', ticketId: '' },
  };
}

async function setPlacement(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const target = person(ws, body.personId);
  if (!target) fail(404, 'That person is not on this organisation.');
  const unit = clean(body.unit, 80);
  const job = clean(body.job, 80);
  if (unit) ensureUnit(ws, unit);
  if (unit) target.unit = unit;
  if (job) {
    target.role = job;
    target.title = job;
  }
  const managerId = clean(body.managerId, 40);
  if (managerId === target.id) fail(400, 'A person cannot report to themselves.');
  if (managerId && !person(ws, managerId)) fail(400, 'Choose a manager who is on this organisation.');
  target.managerId = managerId;
  const employmentType = clean(body.employmentType, 20);
  if (employmentType && !['employee', 'contractor'].includes(employmentType)) {
    fail(400, 'Choose employee or contractor.');
  }
  if (employmentType) target.employmentType = employmentType;
  log(ws, who.id, `Updated ${target.name}: ${target.title || 'no job title'}, ${target.unit || 'no department'}${target.managerId ? `, reports to ${personName(ws, target.managerId)}` : ''}.`);
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${target.name} is placed in the organisation. Their job title is separate from their system profile.`,
    open: { page: 'dashboard', ticketId: '' },
  };
}

async function assignReviewer(body) {
  const ws = await load(body.organisationId);
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
  handoff(ws, who.id, [{ id: reviewer.id, page: 'review' }], `${who.name} assigned ${reviewer.name} to check documents for ${control.id}.`, { controlId: control.id });
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${reviewer.name} reviews ${control.id}, unless they are the person who filed that evidence.`,
    open: { page: 'controls', ticketId: '' },
  };
}

function reviewerFor(ws, ownerId, requestedId) {
  const requested = person(ws, requestedId);
  if (requested && holds(requested, 'reviewer')) return requested.id;
  const other = ws.people.find((row) => row.id !== ownerId && holds(row, 'reviewer'));
  if (other) return other.id;
  const anyReviewer = ws.people.find((row) => holds(row, 'reviewer'));
  if (anyReviewer) return anyReviewer.id;
  fail(400, 'Grant the reviewer profile to someone before adding this requirement. The person who files the evidence cannot approve it.');
}

function emailOf(value) {
  return clean(value, 120).toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function newOrganisationId() {
  return `ORG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function blankWorkspace(id, name = '', frameworks = []) {
  return shapeOrganisation({
    version: null,
    organisation: {
      id,
      name,
      legalName: '',
      industry: '',
      country: '',
      locations: [],
      framework: templates.frameworkLine(frameworks),
      reminders: true,
      reviewDays: 5,
      ticketDays: 28,
      units: [],
      departments: [],
      createdAt: new Date().toISOString(),
    },
    people: [],
    controls: [],
    evidence: [],
    decisions: [],
    tickets: [],
    history: [],
    invitations: [],
    acknowledgements: [],
    notifications: [],
  });
}

async function store(ws) {
  shapeOrganisation(ws);
  if (Number.isInteger(ws.version)) await db.save(ws);
  else await db.create(ws);
}

// Accounts start only from an invitation. Data Sentinels invites each
// organisation's admins; those admins invite their own users and reviewers.
async function register(body) {
  const password = String(body.password || '');
  if (password.length < 8) fail(400, 'Use a password of at least 8 characters.');
  const token = clean(body.inviteToken, 80);
  if (!token) {
    fail(400, body.profile === 'admin'
      ? 'Admin accounts are opened by Data Sentinels. Use the link in your invitation email.'
      : 'Ask the admin of your organisation for an invitation. The link in that email creates your account.');
  }
  const organisationId = await db.organisationForInvite(token);
  if (!organisationId) fail(400, 'Open the invitation link again. This one is no longer open.');
  return db.withOrganisation(organisationId, async () => {
    const ws = await load(organisationId);
    const invite = ws.invitations.find((row) => row.token === token && row.status === 'pending');
    if (!invite) fail(400, 'Open the invitation link again. This one is no longer open.');
    return createAccount(ws, invite, body, password);
  });
}

async function createAccount(ws, invite, body, password) {
  const profile = invite?.profile || body.profile;
  if (!ROLE_IDS.includes(profile)) fail(400, 'Open the user, reviewer, or admin link to create an account.');
  const email = emailOf(invite?.email || body.email);
  const name = clean(invite?.name || body.name, 80);
  const unit = clean(invite ? (invite.unit || 'Unassigned') : body.unit, 80);
  if (!name || !unit) fail(400, 'Give a name and a department.');
  if (!validEmail(email)) fail(400, 'Use a valid email address.');
  if (await auth.findByEmail(email)) fail(409, 'That email already has an account. Sign in on the profile this person holds.');
  if (invite && invite.profile && invite.profile !== body.profile) {
    fail(400, `This invitation opens ${invitePath(invite.profile)}.`);
  }
  const drawing = cleanDrawn(body.drawnSignature);
  if (invite?.signatureRequired && !drawing) fail(400, 'Draw your signature in the box before continuing.');
  if (!ws.organisation.units.includes(unit)) ensureUnit(ws, unit);
  let id = name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 24) || 'person';
  if (person(ws, id)) id = `${id}${ws.people.length + 1}`;
  const job = clean(invite?.job || body.job, 80) || 'Staff';
  const ageRange = normalAge(invite?.ageRange || body.ageRange) || '';
  const personRow = { id, name, role: job, title: job, unit, email, roles: [profile], ageRange };
  if (drawing) {
    personRow.drawnSignature = drawing;
    personRow.drawnAt = new Date().toISOString();
  }
  ws.people.push(personRow);
  if (invite) {
    invite.status = 'joined';
    invite.personId = id;
    invite.joinedAt = new Date().toISOString();
  }
  log(ws, 'system', `${name} signed in from the invitation on the ${profile} profile.`);
  await store(ws);
  const secret = auth.hashPassword(password);
  const account = { email, personId: id, organisationId: ws.organisation.id, salt: secret.salt, hash: secret.hash };
  await auth.addAccount(account);
  return {
    token: await auth.createSession(account),
    actorId: id,
    workspace: present(ws, id),
    flash: `${name} is signed in as ${profile}.`,
  };
}

async function login(body) {
  const profile = body.profile;
  if (!ROLE_IDS.includes(profile)) fail(400, 'Open the user, reviewer, or admin link to sign in.');
  const email = emailOf(body.email);
  const account = await auth.findByEmail(email);
  if (!account || !auth.verifyPassword(String(body.password || ''), account)) {
    fail(401, 'Email or password does not match.');
  }
  if (account.operator) fail(403, 'This is a platform operator account. Sign in at /operator.');
  const ws = await load(account.organisationId);
  const who = person(ws, account.personId);
  if (!who) fail(401, 'This account is no longer on the organisation.');
  if (!holds(who, profile)) {
    fail(403, `${who.name} does not have the ${profile} profile. An admin grants profiles from the people page.`);
  }
  return {
    token: await auth.createSession(account),
    actorId: who.id,
    workspace: present(ws, who.id),
    flash: `${who.name} is signed in.`,
  };
}

function resetProfile(who, invite) {
  if (invite && holds(who, invite.profile)) return invite.profile;
  return ['admin', 'reviewer', 'uploader'].find((role) => holds(who, role)) || '';
}

// Invited people reset once they have joined. The first admin of a
// self-started organisation has no invitation and can reset too.
function resetTarget(ws, account) {
  const who = person(ws, account.personId);
  if (!who) return null;
  const invite = (ws.invitations || []).find((row) => row.email === account.email) || null;
  if (invite && invite.status !== 'joined') return { who, invite, profile: '' };
  return { who, invite, profile: resetProfile(who, invite) };
}

async function requestReset(body) {
  const email = emailOf(body.email);
  if (!validEmail(email)) fail(400, 'Use a valid email address.');
  const account = await auth.findByEmail(email);
  if (!account || account.operator) fail(400, 'Password reset is only for people on an organisation.');
  return db.withOrganisation(account.organisationId, async () => {
    const ws = await load(account.organisationId);
    const target = resetTarget(ws, account);
    if (!target) fail(400, 'Password reset is only for people on an organisation.');
    if (target.invite && target.invite.status !== 'joined') {
      fail(400, 'Use the invitation email to sign in. A password has not been chosen yet.');
    }
    if (!target.profile) fail(400, 'Password reset is only for people on an organisation.');
    const token = await auth.rememberReset(email);
    const url = `${String(body.origin || '').replace(/\/$/, '')}${invitePath(target.profile)}?reset=${encodeURIComponent(token)}`;
    try {
      await mail.sendReset({ name: target.who.name || email, email, url, organisation: ws.organisation?.name || ws.organisation?.legalName || '' });
    } catch (error) {
      await auth.clearReset(email);
      fail(502, error.message || 'The reset email did not send.');
    }
    log(ws, 'system', `Sent ${target.who.name} a password reset link.`);
    await save(ws);
    return { ok: true, message: `A reset link was sent to ${email}. It expires in one hour.` };
  });
}

async function publicReset(token) {
  const account = await auth.accountForReset(token);
  if (!account) fail(404, 'That reset link is no longer open.');
  const ws = await load(account.organisationId);
  const target = resetTarget(ws, account);
  if (!target?.profile) fail(404, 'That reset link is no longer open.');
  return {
    reset: {
      name: target.who.name,
      email: account.email,
      path: invitePath(target.profile),
    },
  };
}

async function completeReset(body) {
  const password = String(body.password || '');
  if (password.length < 8) fail(400, 'Use a password of at least 8 characters.');
  const account = await auth.accountForReset(body.token);
  if (!account) fail(400, 'That reset link is no longer open.');
  return db.withOrganisation(account.organisationId, async () => {
    const ws = await load(account.organisationId);
    const target = resetTarget(ws, account);
    if (!target?.profile) fail(400, 'Password reset is only for people on an organisation.');
    const { who, profile } = target;
    if (body.profile && body.profile !== profile) fail(400, `This reset link opens ${invitePath(profile)}.`);
    await auth.replacePassword(account.email, password);
    log(ws, who.id, `${who.name} chose a new password.`);
    await save(ws);
    return {
      token: await auth.createSession(account),
      actorId: who.id,
      workspace: present(ws, who.id),
      flash: `${who.name} is signed in.`,
    };
  });
}

// Puts built-in templates on the control set with one owner and reviewer.
function addTemplates(ws, who, chosen, owner, reviewerId, evidenceDue = '') {
  const family = chosen[0].family;
  if (!templates.parseFrameworks(ws.organisation.framework).includes(family)) {
    ws.organisation.framework = templates.frameworkLine([...templates.parseFrameworks(ws.organisation.framework), family]);
  }
  const added = chosen.map((template) => {
    const numbers = ws.controls.map((row) => Number(row.id.replace(/\D/g, '')) || 0);
    const control = {
      id: `CTRL-${String(Math.max(0, ...numbers) + 1).padStart(4, '0')}`,
      requirement: template.requirement,
      expected: template.expected,
      frequency: template.frequency,
      ownerId: owner.id,
      reviewerId,
      templateId: template.id,
      origin: 'template',
      evidenceDue,
    };
    ws.controls.push(control);
    requestResponsibility(ws, owner, control);
    log(ws, who.id, `Added ${control.id} from the ${family} template "${template.title}". The wording is the organisation's, not the text of the standard.`);
    if (evidenceDue) log(ws, who.id, `Evidence for ${control.id} is due by ${evidenceDue}.`);
    return control;
  });
  const ids = added.map((control) => control.id);
  const listed = ids.length === 1 ? ids[0] : `${ids.length} ${family} requirements (${ids[0]} to ${ids[ids.length - 1]})`;
  handoff(
    ws,
    who.id,
    [{ id: owner.id, page: 'dashboard' }, { id: reviewerId, page: 'review' }],
    `${who.name} added ${listed} from the ${family} list. ${owner.name} owns the evidence. ${personName(ws, reviewerId)} checks documents filed against it.`,
    { controlId: ids[0] },
  );
  return listed;
}

function unusedTemplates(ws, family) {
  const used = new Set(ws.controls.map((control) => control.templateId).filter(Boolean));
  return templates.TEMPLATES.filter((row) => row.family === family && !used.has(row.id));
}

async function applyTemplate(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  let chosen;
  if (body.family) {
    chosen = unusedTemplates(ws, body.family);
    if (!chosen.length) fail(400, `Every ${body.family} requirement is already on the control set.`);
  } else {
    const template = templates.findTemplate(body.templateId);
    if (!template) fail(404, 'That template is not on this register.');
    if (ws.controls.some((control) => control.templateId === template.id)) fail(400, `${template.title} is already on the control set.`);
    chosen = [template];
  }
  const owner = person(ws, body.ownerId);
  if (!owner) fail(400, 'Choose an owner who has signed up.');
  const reviewer = person(ws, body.reviewerId);
  if (!reviewer || !holds(reviewer, 'reviewer')) {
    fail(400, 'Choose a reviewer. That person needs the reviewer profile, and they cannot approve a file they upload.');
  }
  const evidenceDue = cleanDay(body.evidenceDue);
  if (evidenceDue) await assertDeadlines();
  const listed = addTemplates(ws, who, chosen, owner, reviewer.id, evidenceDue);
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${listed} ${listed.includes('requirements') ? 'are' : 'is'} on the control set. ${owner.name} owns the evidence. ${reviewer.name} reviews it. Saving this does not approve a requirement or create evidence.`,
    open: { page: 'controls', ticketId: '' },
  };
}

const AGE_RANGES = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+'];

function normalAge(value) {
  const text = clean(value, 40).toLowerCase().replace(/[\s–—-]+/g, '-');
  const found = AGE_RANGES.find((age) => age.toLowerCase().replace('–', '-') === text);
  return found || '';
}

function normalRole(value) {
  const text = clean(value, 40).toLowerCase();
  if (['user', 'uploader', 'upload'].includes(text)) return 'uploader';
  if (['reviewer', 'review'].includes(text)) return 'reviewer';
  if (text === 'admin') return 'admin';
  return '';
}

function cleanDrawn(value) {
  const image = String(value || '');
  if (!image) return '';
  if (!image.startsWith('data:image/png;base64,')) fail(400, 'Draw the signature in the box.');
  if (image.length > 180000) fail(400, 'The signature drawing is too large. Clear it and sign again.');
  return image;
}

function invitePath(profile) {
  if (profile === 'reviewer') return '/reviewer';
  if (profile === 'admin') return '/admin';
  return '/user';
}

function addInvitation(ws, who, fields) {
  const email = emailOf(fields.email);
  const name = clean(fields.name, 80);
  const profile = normalRole(fields.profile) || (ROLE_IDS.includes(fields.profile) ? fields.profile : '');
  const ageRange = normalAge(fields.ageRange);
  const unit = clean(fields.unit, 80);
  if (!name) fail(400, 'Give the full name.');
  if (!validEmail(email)) fail(400, 'Use a work email.');
  if (!profile) fail(400, 'Choose User or Reviewer.');
  if (ws.people.some((row) => emailOf(row.email) === email)) fail(409, `${email} already has an account.`);
  if ((ws.invitations || []).some((row) => row.email === email && row.status === 'pending')) {
    fail(409, `${email} already has an invitation waiting.`);
  }
  if (unit) ensureUnit(ws, unit);
  const numbers = (ws.invitations || []).map((row) => Number(String(row.id).replace(/\D/g, '')) || 0);
  const invite = {
    id: `INV-${String(Math.max(0, ...numbers) + 1).padStart(4, '0')}`,
    name,
    email,
    unit,
    job: clean(fields.job, 80),
    profile,
    ageRange,
    signatureRequired: Boolean(fields.signatureRequired),
    token: crypto.randomBytes(16).toString('hex'),
    invitedBy: who.id,
    invitedAt: new Date().toISOString(),
    status: 'pending',
    personId: '',
    joinedAt: '',
  };
  ws.invitations.push(invite);
  return invite;
}

// One organisation per email: an account elsewhere cannot be invited here.
async function assertEmailFree(value) {
  const email = emailOf(value);
  if (email && await auth.findByEmail(email)) fail(409, `${email} already has an account on the register.`);
}

async function invitePerson(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  await assertEmailFree(body.email);
  const invite = addInvitation(ws, who, body);
  await save(ws);
  return finishInviteEmails(ws, who, [invite], body.origin, '');
}

async function finishInviteEmails(ws, who, invites, origin, problemText) {
  const sent = [];
  const failed = [];
  for (const invite of invites) {
    try {
      await mail.sendInvite(invite, origin, ws.organisation?.name || ws.organisation?.legalName || '');
      sent.push(invite);
      log(ws, who.id, `Sent ${invite.name} (${invite.email}) a link to join the ${invite.profile} page.`);
    } catch (error) {
      failed.push(clean(error.message, 140));
      log(ws, who.id, `Could not email ${invite.email}. ${clean(error.message, 160)}`);
    }
  }
  await save(ws);
  const local = String(origin || '').includes('localhost');
  const localNote = local ? ' The link opens on this computer until PUBLIC_URL is the public address.' : '';
  let flash = '';
  if (sent.length && !failed.length) {
    flash = sent.length === 1
      ? `An email was sent to ${sent[0].email}. It has the link to join.${localNote}`
      : `Emails were sent to ${sent.length} people. Each message has their link to join.${localNote}`;
  } else if (sent.length && failed.length) {
    flash = `Emails were sent to ${sent.length} ${sent.length === 1 ? 'person' : 'people'}. ${failed.length} could not be sent (${failed[0]}). The link is still on the list.${problemText}`;
  } else {
    flash = `The invitation is saved, but the email did not send. ${failed[0] || ''}${problemText}`;
  }
  return {
    workspace: present(ws, who.id),
    flash: `${flash}${problemText && sent.length && !failed.length ? problemText : ''}`.trim(),
    open: { page: 'organisation', ticketId: '' },
  };
}

async function importPeople(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const file = String(body.file || '').replace(/^data:.*base64,/, '');
  if (!file) fail(400, 'Choose an Excel file.');
  const buffer = Buffer.from(file, 'base64');
  if (!buffer.length || buffer.length > 2_000_000) fail(400, 'Use a spreadsheet under 2 MB.');
  let rows = [];
  try {
    const book = XLSX.read(buffer, { type: 'buffer' });
    const sheet = book.Sheets[book.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch {
    fail(400, 'That file could not be read. Use .xlsx, .xls, or .csv with columns for full name, email, and role.');
  }
  if (!rows.length) fail(400, 'The first sheet has no people.');
  const problems = [];
  const added = [];
  for (const [index, row] of rows.entries()) {
    const values = {};
    Object.keys(row).forEach((key) => {
      values[String(key).toLowerCase().replace(/[^a-z0-9]+/g, '')] = row[key];
    });
    const fields = {
      name: values.fullname || values.name || '',
      email: values.email || values.workemail || '',
      profile: values.role || values.roles || values.profile || '',
      ageRange: values.agerange || values.age || '',
      unit: values.department || values.unit || '',
      signatureRequired: Boolean(body.signatureRequired),
    };
    if (!clean(fields.name, 80) && !clean(fields.email, 120)) continue;
    try {
      await assertEmailFree(fields.email);
      added.push(addInvitation(ws, who, fields));
    } catch (error) {
      problems.push(`Row ${index + 2}: ${error.message}`);
    }
  }
  if (!added.length) fail(400, problems[0] || 'No people were found. Use columns Full name, Email, and Role.');
  await save(ws);
  const problemText = problems.length ? ` ${problems.length} ${problems.length === 1 ? 'row was' : 'rows were'} skipped.` : '';
  return finishInviteEmails(ws, who, added, body.origin, problemText);
}

async function sendInvitationEmail(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const invite = (ws.invitations || []).find((row) => row.id === body.invitationId && row.status === 'pending');
  if (!invite) fail(404, 'That invitation is not waiting.');
  return finishInviteEmails(ws, who, [invite], body.origin, '');
}

async function setInvitePen(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'admin', `${who.name} does not have the admin permission.`);
  const invite = (ws.invitations || []).find((row) => row.id === body.invitationId && row.status === 'pending');
  if (!invite) fail(404, 'That invitation is not waiting.');
  invite.signatureRequired = Boolean(body.signatureRequired);
  log(ws, who.id, invite.signatureRequired
    ? `${invite.name || invite.email} will draw a signature when they open their page.`
    : `${invite.name || invite.email} will not be asked to draw a signature.`);
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: invite.signatureRequired
      ? `${invite.name || invite.email} will draw a signature on ${invitePath(invite.profile)}.`
      : `${invite.name || invite.email} can open the page without a drawing.`,
    open: { page: 'organisation', ticketId: '' },
  };
}

async function publicInvite(token) {
  const organisationId = await db.organisationForInvite(token);
  if (!organisationId) fail(404, 'That invitation is no longer open.');
  const ws = await load(organisationId);
  const invite = (ws.invitations || []).find((row) => row.token && row.token === token && row.status === 'pending');
  if (!invite) fail(404, 'That invitation is no longer open.');
  return {
    invite: {
      name: invite.name,
      email: invite.email,
      profile: invite.profile,
      ageRange: invite.ageRange,
      unit: invite.unit,
      job: invite.job,
      signatureRequired: Boolean(invite.signatureRequired),
      path: invitePath(invite.profile),
    },
  };
}

async function acknowledge(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  const ack = (ws.acknowledgements || []).find((row) => row.id === body.acknowledgementId);
  if (!ack || ack.status === 'withdrawn') fail(404, 'That acknowledgement is not on this organisation.');
  if (ack.personId !== who.id) fail(403, `${who.name} cannot acknowledge a responsibility assigned to ${personName(ws, ack.personId)}.`);
  if (ack.status !== 'required') fail(400, 'This acknowledgement is already on the record.');
  const mark = clean(body.signature, 80);
  if (!mark) fail(400, 'Confirm your name as the signature.');
  if (mark.toLowerCase() !== who.name.toLowerCase()) fail(400, 'The signature has to match the name on the profile.');
  ack.status = 'signed';
  ack.signature = mark;
  ack.signedAt = new Date().toISOString();
  ack.userAgent = clean(body.userAgent, 180);
  ack.ip = clean(body.ip, 80);
  who.signature = { mark, capturedAt: ack.signedAt };
  log(ws, who.id, `${who.name} acknowledged responsibility for ${ack.controlId}, version ${ack.itemVersion}.`);
  await save(ws);
  return {
    workspace: present(ws, body.actorId),
    flash: `${who.name} acknowledged ${ack.controlId}. The organisation page now shows this as signed.`,
    open: { page: 'dashboard', ticketId: '' },
  };
}

async function reserveFile(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  assertRole(who, 'uploader', `${who.name} does not have the uploader permission.`);
  const name = clean(body.name, 160);
  if (!name) fail(400, 'Choose a file from this computer.');
  return files.reserve(ws.organisation.id, who.id, name);
}

function canReadFile(ws, who, item) {
  if (item.uploadedBy === who.id || holds(who, 'admin')) return true;
  if (!holds(who, 'reviewer')) return false;
  return (item.controlIds || []).some((id) => ws.controls.find((row) => row.id === id)?.reviewerId === who.id);
}

async function openFile(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  const item = ws.evidence.find((row) => row.id === body.evidenceId);
  if (!item) fail(404, 'That document is not on the register.');
  if (!canReadFile(ws, who, item)) fail(403, `${who.name} cannot open this document.`);
  const location = String(item.location || '');
  if (location.startsWith('storage:')) {
    return { url: await files.signedDownload(location.slice('storage:'.length)) };
  }
  if (/^https?:\/\//i.test(location)) return { url: location };
  fail(404, `${personName(ws, item.uploadedBy)} filed this before a copy was kept. They need to submit the document again.`);
}

async function readNotification(body) {
  const ws = await load(body.organisationId);
  const who = actor(ws, body.actorId);
  const now = new Date().toISOString();
  (ws.notifications || []).forEach((row) => {
    if (row.recipientId !== who.id || row.readAt) return;
    if (body.all || row.id === body.id) row.readAt = now;
  });
  await save(ws);
  return { workspace: present(ws, who.id), flash: '' };
}

async function sessionFor(token) {
  return auth.sessionFor(token);
}

async function logout(token) {
  await auth.destroySession(token);
}

async function operatorLogin(body) {
  const email = emailOf(body.email);
  const account = await auth.findByEmail(email);
  if (!account || !account.operator || !auth.verifyPassword(String(body.password || ''), account)) {
    fail(401, 'Email or password does not match a platform operator.');
  }
  return { token: await auth.createSession(account), email };
}

// Everything the super admin dashboard shows, shaped for the page.
async function operatorOverview() {
  const raw = (await db.operatorOverview()) || {};
  const iso = (value) => (value ? new Date(value).toISOString() : '');
  const invitations = (raw.invitations || []).map((row) => ({
    organisationId: row.organisation_id,
    id: row.id,
    name: row.name || '',
    email: row.email || '',
    status: row.status || 'pending',
    invitedBy: row.invited_by || '',
    invitedAt: iso(row.invited_at),
    joinedAt: iso(row.joined_at),
  }));
  const organisations = (raw.organisations || []).map((row) => {
    const pending = invitations.filter((invite) => invite.organisationId === row.id && invite.status === 'pending').length;
    const admins = Number(row.admins) || 0;
    return {
      id: row.id,
      name: row.name || '',
      legalName: row.legal_name || '',
      industry: row.industry || '',
      country: row.country || '',
      createdAt: iso(row.created_at),
      lastActivity: iso(row.last_activity),
      people: Number(row.people) || 0,
      controls: Number(row.controls) || 0,
      evidence: Number(row.evidence) || 0,
      openTickets: Number(row.open_tickets) || 0,
      admins,
      pendingAdminInvites: pending,
      status: admins ? 'active' : pending ? 'awaiting' : 'no-admin',
      profileComplete: Boolean(row.name && row.legal_name && row.country),
    };
  });
  return {
    organisations,
    admins: (raw.admins || []).map((row) => ({
      organisationId: row.organisation_id,
      personId: row.person_id,
      name: row.name || '',
      email: row.email || '',
      hasLogin: Boolean(row.has_login),
      joinedAt: iso(row.joined_at),
    })),
    invitations,
    operators: (raw.operators || []).map((row) => ({ email: row.email, createdAt: iso(row.created_at) })),
    today: today(),
  };
}

async function operatorOrganisations() {
  return { organisations: await db.listOrganisations() };
}

// A platform operator opens an organisation and invites its first admin.
async function createOrganisation(body) {
  const name = clean(body.name, 120);
  const adminName = clean(body.adminName, 80);
  const adminEmail = emailOf(body.adminEmail);
  if (!name) fail(400, 'Name the organisation.');
  if (!adminName || !validEmail(adminEmail)) fail(400, 'Give the first admin a name and a valid email.');
  if (await auth.findByEmail(adminEmail)) fail(409, `${adminEmail} already has an account on another organisation.`);
  const ws = blankWorkspace(newOrganisationId(), name, body.frameworks);
  const invite = addInvitation(ws, { id: 'platform' }, { name: adminName, email: adminEmail, profile: 'admin' });
  log(ws, 'system', `${clean(body.operatorEmail, 120) || 'A platform operator'} opened ${name} on the register and invited ${adminName} as its first admin.`);
  await store(ws);
  let emailed = true;
  let problem = '';
  try {
    await mail.sendInvite(invite, body.origin, name);
  } catch (error) {
    emailed = false;
    problem = clean(error.message, 160);
  }
  return {
    organisation: { id: ws.organisation.id, name },
    inviteUrl: mail.inviteUrl(invite, body.origin),
    emailed,
    flash: emailed
      ? `${name} is on the register. ${adminName} has an email with the link to join as admin.`
      : `${name} is on the register, but the email did not send (${problem}). Send ${adminName} the link below.`,
  };
}

// What Data Sentinels sees of one organisation: its admins and admin invitations.
// Evidence, controls and history stay with the organisation.
function operatorView(ws) {
  return {
    organisation: {
      id: ws.organisation.id,
      name: ws.organisation.name || '',
      legalName: ws.organisation.legalName || '',
      country: ws.organisation.country || '',
      createdAt: ws.organisation.createdAt || '',
      people: ws.people.length,
      controls: ws.controls.length,
    },
    admins: ws.people.filter((row) => holds(row, 'admin')).map((row) => ({ id: row.id, name: row.name, email: row.email || '' })),
    invitations: (ws.invitations || [])
      .filter((row) => row.profile === 'admin' && row.status === 'pending')
      .map((row) => ({ id: row.id, name: row.name, email: row.email, invitedAt: row.invitedAt })),
  };
}

async function operatorOrganisation(organisationId) {
  return operatorView(await load(organisationId));
}

async function operatorAddAdmin(body) {
  const ws = await load(body.organisationId);
  const name = clean(body.name, 80);
  const email = emailOf(body.email);
  if (!name || !validEmail(email)) fail(400, 'Give the admin a name and a valid email.');
  await assertEmailFree(email);
  const invite = addInvitation(ws, { id: 'platform' }, { name, email, profile: 'admin' });
  log(ws, 'system', `${clean(body.operatorEmail, 120) || 'A platform operator'} invited ${name} (${email}) as an admin.`);
  await save(ws);
  return operatorInviteResult(ws, invite, body.origin);
}

async function operatorResendInvite(body) {
  const ws = await load(body.organisationId);
  const invite = (ws.invitations || []).find((row) => row.id === body.invitationId && row.profile === 'admin' && row.status === 'pending');
  if (!invite) fail(404, 'That admin invitation is not waiting.');
  return operatorInviteResult(ws, invite, body.origin);
}

async function operatorInviteResult(ws, invite, origin) {
  const organisation = ws.organisation.name || ws.organisation.legalName || '';
  let problem = '';
  try {
    await mail.sendInvite(invite, origin, organisation);
  } catch (error) {
    problem = clean(error.message, 160) || 'The email did not send.';
  }
  return {
    ...operatorView(ws),
    inviteUrl: mail.inviteUrl(invite, origin),
    emailed: !problem,
    flash: problem
      ? `The invitation for ${invite.email} is saved, but the email did not send (${problem}). Send them the link below.`
      : `${invite.email} has an email with the link to join ${organisation || 'the organisation'} as admin.`,
  };
}

module.exports = {
  present,
  read: async (organisationId, actorId) => present(await load(organisationId), actorId),
  operatorLogin,
  operatorOverview,
  operatorOrganisations,
  operatorOrganisation,
  operatorAddAdmin,
  operatorResendInvite,
  createOrganisation,
  review,
  addEvidence,
  reserveFile,
  openFile,
  signEvidence,
  addControl,
  readPolicy,
  submitFix,
  verify,
  setOrganisation,
  setReminders,
  setDeadlines,
  setEvidenceDue,
  complianceReport,
  remindAll,
  addPerson,
  setRoles,
  addUnit,
  addSystem,
  setPlacement,
  assignReviewer,
  register,
  login,
  requestReset,
  publicReset,
  completeReset,
  logout,
  applyTemplate,
  invitePerson,
  importPeople,
  setInvitePen,
  sendInvitationEmail,
  publicInvite,
  acknowledge,
  readNotification,
  sessionFor,
};
