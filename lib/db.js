const fs = require('fs');
const path = require('path');

const LOOP = path.join(__dirname, '..', 'data', 'loop.json');
const ACCOUNTS = path.join(__dirname, '..', 'data', 'accounts.json');
const SEED = path.join(__dirname, '..', 'data', 'loop.seed.json');

const cache = { workspace: null, auth: null };
let queue = Promise.resolve();

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function enqueue(work) {
  const run = queue.then(work);
  queue = run.catch(() => {});
  return run;
}

async function request(pathName, options = {}) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail(500, 'Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  const response = await fetch(`${url}/rest/v1/${pathName}`, {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const text = await response.text();
  if (!response.ok) {
    let message = 'The database did not save.';
    try {
      message = JSON.parse(text).message || message;
    } catch {
      if (text) message = text.slice(0, 240);
    }
    fail(502, message);
  }
  return text ? JSON.parse(text) : null;
}

async function table(name) {
  return request(`${name}?select=*`) || [];
}

function iso(value) {
  if (!value) return '';
  return new Date(value).toISOString();
}

function assemble(rows) {
  const org = rows.organisations.find((item) => item.id === 'ORG-001') || rows.organisations[0];
  if (!org) return null;
  const departments = rows.departments.filter((item) => item.organisation_id === org.id);
  const names = Object.fromEntries(departments.map((item) => [item.id, item.name]));
  const people = rows.people.filter((item) => item.organisation_id === org.id);
  const personIds = new Set(people.map((item) => item.id));
  const roles = {};
  rows.person_roles.forEach((item) => {
    if (!personIds.has(item.person_id)) return;
    roles[item.person_id] = roles[item.person_id] || [];
    roles[item.person_id].push(item.role);
  });
  const controls = rows.controls.filter((item) => item.organisation_id === org.id);
  const controlIds = new Set(controls.map((item) => item.id));
  const evidence = rows.evidence.filter((item) => item.organisation_id === org.id);
  const links = {};
  rows.evidence_controls.forEach((item) => {
    links[item.evidence_id] = links[item.evidence_id] || [];
    links[item.evidence_id].push(item.control_id);
  });
  return {
    organisation: {
      id: org.id,
      name: org.name || '',
      legalName: org.legal_name || '',
      industry: org.industry || '',
      country: org.country || '',
      locations: org.locations || [],
      framework: org.framework || 'ISO/IEC 42001',
      reminders: Boolean(org.reminders),
      units: departments.map((item) => item.name),
      departments: departments.map((item) => ({ id: item.id, name: item.name, parentId: item.parent_id || '' })),
      website: org.website || '',
      size: org.size || '',
      description: org.description || '',
      contactName: org.contact_name || '',
      emailDomain: org.email_domain || '',
      createdAt: iso(org.created_at),
      scope: { systems: org.systems || [] },
    },
    people: people.map((item) => {
      const row = {
        id: item.id,
        name: item.name,
        role: item.job || item.title || '',
        title: item.title || item.job || '',
        unit: names[item.department_id] || '',
        email: item.email || '',
        roles: roles[item.id] || [],
        employmentType: item.employment_type === 'contractor' ? 'contractor' : 'employee',
        managerId: item.manager_id || '',
        ageRange: item.age_range || '',
      };
      if (item.drawn_signature) {
        row.drawnSignature = item.drawn_signature;
        row.drawnAt = iso(item.drawn_at);
      }
      return row;
    }),
    controls: controls.map((item) => ({
      id: item.id,
      requirement: item.requirement,
      expected: item.expected,
      frequency: item.frequency,
      ownerId: item.owner_id,
      reviewerId: item.reviewer_id,
      templateId: item.template_id || '',
      origin: item.origin || 'custom',
      responsibilityVersion: item.responsibility_version || 1,
    })),
    evidence: evidence.map((item) => ({
      id: item.id,
      name: item.name,
      version: item.version,
      uploadedBy: item.uploaded_by,
      uploadedAt: iso(item.uploaded_at),
      source: item.source,
      location: item.location || '',
      hash: item.hash,
      controlIds: links[item.id] || [],
      note: item.note || '',
      section: item.section || '',
      hasReview: Boolean(item.has_review),
      readable: item.readable !== false,
      reviewDue: item.review_due || '',
      rejected: Boolean(item.rejected),
    })),
    decisions: rows.decisions.filter((item) => controlIds.has(item.control_id)).map((item) => ({
      controlId: item.control_id,
      review: item.review || 'awaiting',
      reviewBy: item.review_by || '',
      reviewAt: iso(item.review_at),
      comment: item.comment || '',
      reviewedStatus: item.reviewed_status || '',
    })),
    tickets: rows.tickets.filter((item) => controlIds.has(item.control_id)).map((item) => ({
      id: item.id,
      controlId: item.control_id,
      title: item.title,
      problem: item.problem,
      action: item.action,
      ownerId: item.owner_id,
      priority: item.priority,
      status: item.status,
      due: item.due,
      createdAt: iso(item.created_at),
      fixEvidenceId: item.fix_evidence_id || '',
      submittedBy: item.submitted_by || '',
    })),
    history: rows.history.filter((item) => item.organisation_id === org.id).map((item) => ({
      at: iso(item.occurred_at),
      actorId: item.actor_id,
      text: item.body,
    })),
    invitations: rows.invitations.filter((item) => item.organisation_id === org.id).map((item) => ({
      id: item.id,
      name: item.name || '',
      email: item.email,
      unit: item.unit || '',
      job: item.job || '',
      profile: item.profile,
      ageRange: item.age_range || '',
      signatureRequired: Boolean(item.signature_required),
      token: item.token,
      invitedBy: item.invited_by || '',
      invitedAt: iso(item.invited_at),
      status: item.status || 'pending',
      personId: item.person_id || '',
      joinedAt: iso(item.joined_at),
    })),
    notifications: (rows.notifications || []).filter((item) => item.organisation_id === org.id).map((item) => ({
      id: item.id,
      recipientId: item.recipient_id,
      actorId: item.actor_id || '',
      text: item.body || '',
      page: item.page || 'dashboard',
      controlId: item.control_id || '',
      ticketId: item.ticket_id || '',
      at: iso(item.created_at),
      readAt: iso(item.read_at),
    })),
    acknowledgements: rows.acknowledgements.filter((item) => item.organisation_id === org.id).map((item) => ({
      id: item.id,
      personId: item.person_id,
      organisationId: item.organisation_id,
      kind: item.kind,
      controlId: item.control_id || '',
      statement: item.statement || '',
      itemVersion: item.item_version || 1,
      status: item.status,
      signature: item.signature || '',
      signedAt: iso(item.signed_at),
      userAgent: item.user_agent || '',
      ip: item.ip || '',
    })),
  };
}

async function optionalTable(name) {
  try {
    return await table(name);
  } catch (error) {
    if (/notifications/i.test(error.message)) return [];
    throw error;
  }
}

async function fetchWorkspace() {
  const [organisations, departments, people, personRoles, controls, evidence, evidenceControls, decisions, tickets, history, invitations, acknowledgements, notifications] = await Promise.all([
    table('organisations'),
    table('departments'),
    table('people'),
    table('person_roles'),
    table('controls'),
    table('evidence'),
    table('evidence_controls'),
    table('decisions'),
    table('tickets'),
    table('history'),
    table('invitations'),
    table('acknowledgements'),
    optionalTable('notifications'),
  ]);
  return assemble({
    organisations,
    departments,
    people,
    person_roles: personRoles,
    controls,
    evidence,
    evidence_controls: evidenceControls,
    decisions,
    tickets,
    history,
    invitations,
    acknowledgements,
    notifications,
  });
}

async function fetchAuth() {
  const [accounts, sessions] = await Promise.all([table('accounts'), table('sessions')]);
  return {
    accounts: accounts.map((item) => ({
      email: item.email,
      personId: item.person_id,
      salt: item.salt,
      hash: item.password_hash,
      createdAt: iso(item.created_at),
      resetToken: item.reset_token || '',
      resetExpires: Number(item.reset_expires) || 0,
    })),
    sessions: sessions.map((item) => ({
      token: item.token,
      personId: item.person_id,
      createdAt: iso(item.created_at),
      expiresAt: Number(item.expires_at) || 0,
    })),
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function plainWorkspace(ws) {
  const copy = JSON.parse(JSON.stringify(ws));
  (copy.people || []).forEach((row) => delete row.signatureStatus);
  (copy.controls || []).forEach((row) => {
    delete row.judgement;
    delete row.decision;
    delete row.agreed;
    delete row.filerId;
    delete row.evidenceIds;
  });
  return copy;
}

async function saveWorkspace(ws) {
  cache.workspace = ws;
  await enqueue(() => request('rpc/save_register', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ payload: plainWorkspace(ws) }),
  }));
}

async function saveAuth(data) {
  cache.auth = data;
  await enqueue(() => request('rpc/save_auth', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ payload: data }),
  }));
}

async function init() {
  let workspace = await fetchWorkspace();
  let auth = await fetchAuth();
  const file = readJson(LOOP, null);
  if ((!workspace || !workspace.people.length) && file?.people?.length) {
    workspace = file;
    await saveWorkspace(workspace);
    auth = readJson(ACCOUNTS, { accounts: [], sessions: [] });
    await saveAuth(auth);
  }
  if (!workspace) {
    workspace = readJson(SEED, null);
    if (!workspace) fail(500, 'The register has no organisation in the database.');
    await saveWorkspace(workspace);
  }
  cache.workspace = workspace;
  cache.auth = auth || { accounts: [], sessions: [] };
}

function workspace() {
  return cache.workspace;
}

function authState() {
  return cache.auth;
}

module.exports = { init, workspace, authState, saveWorkspace, saveAuth };
