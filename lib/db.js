const { rest, eq, fail } = require('./supabase');

const queues = new Map();

function iso(value) {
  if (!value) return '';
  return new Date(value).toISOString();
}

function assemble(rows) {
  const org = rows.organisations[0];
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
    version: Number(org.version) || 0,
    organisation: {
      id: org.id,
      name: org.name || '',
      legalName: org.legal_name || '',
      industry: org.industry || '',
      country: org.country || '',
      locations: org.locations || [],
      framework: org.framework || 'Internal policy',
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
      hash: item.row_hash || '',
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
    reviews: (rows.reviews || []).map((item) => ({
      id: item.id,
      controlId: item.control_id,
      evidenceId: item.evidence_id || '',
      evidenceName: item.evidence_name || '',
      evidenceVersion: Number(item.evidence_version) || 0,
      filerId: item.filer_id || '',
      reviewerId: item.reviewer_id || '',
      decision: item.decision,
      status: item.status || '',
      comment: item.comment || '',
      ticketId: item.ticket_id || '',
      at: iso(item.decided_at),
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

function plainWorkspace(ws) {
  const copy = JSON.parse(JSON.stringify(ws));
  delete copy.version;
  // Reviews are append-only: only the ones made in this step are sent.
  delete copy.reviews;
  copy.newReviews = ws.newReviews || [];
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

async function load(organisationId) {
  if (!organisationId) return null;
  const rows = await rest('rpc/load_register', { method: 'POST', body: { org_id: organisationId } });
  return rows ? assemble(rows) : null;
}

async function write(ws, expectedVersion) {
  const version = await rest('rpc/save_register', {
    method: 'POST',
    body: { payload: plainWorkspace(ws), expected_version: expectedVersion },
  });
  ws.version = Number(version) || 0;
  ws.newReviews = [];
  return ws;
}

// Saves only when the organisation is still at the version this copy was read at.
async function save(ws) {
  if (!Number.isInteger(ws.version)) fail(500, 'This copy of the register was not read from the database.');
  return write(ws, ws.version);
}

async function create(ws) {
  return write(ws, null);
}

// One step at a time per organisation on this server. The version check in
// save_register covers steps that run on another server.
function withOrganisation(organisationId, work) {
  const key = organisationId || '';
  const previous = queues.get(key) || Promise.resolve();
  const run = previous.then(() => work());
  const settled = run.catch(() => {});
  queues.set(key, settled);
  settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return run;
}

async function listOrganisations() {
  const rows = await rest('organisations?select=id,name,legal_name,country,created_at,people(count)&order=created_at.desc.nullslast');
  return (rows || []).map((row) => ({
    id: row.id,
    name: row.name || '',
    legalName: row.legal_name || '',
    country: row.country || '',
    createdAt: iso(row.created_at),
    people: row.people?.[0]?.count || 0,
  }));
}

async function operatorOverview() {
  try {
    return await rest('rpc/operator_overview', { method: 'POST', body: {} });
  } catch (error) {
    if (error.status === 404) fail(500, 'Run supabase/operator.sql in the Supabase SQL editor to open this dashboard.');
    throw error;
  }
}

async function organisationExists(organisationId) {
  const rows = await rest(`organisations?select=id&id=${eq(organisationId)}`);
  return Boolean(rows?.length);
}

async function organisationForInvite(token) {
  if (!token) return '';
  const rows = await rest(`invitations?select=organisation_id&status=eq.pending&token=${eq(token)}`);
  return rows?.[0]?.organisation_id || '';
}

async function init() {
  try {
    await rest('rpc/load_register', { method: 'POST', body: { org_id: '' } });
  } catch (error) {
    if (error.status === 404) fail(500, 'Run supabase/tenancy.sql in the Supabase SQL editor before starting the register.');
    throw error;
  }
}

module.exports = { init, load, save, create, withOrganisation, listOrganisations, operatorOverview, organisationExists, organisationForInvite };
