const FROM_PATH = { '/user': 'uploader', '/reviewer': 'reviewer', '/admin': 'admin' };
const VIEW_NAME = { uploader: 'User', reviewer: 'Reviewer', admin: 'Admin' };
const AUTH_COPY = {
  uploader: 'This account starts with the user profile. It can file evidence and work tickets assigned to it.',
  reviewer: 'This account starts with the reviewer profile. It can accept, reject, or ask for more evidence.',
  admin: 'This account starts with the admin profile. It sets up the organisation, people, and requirements.',
};
const PROFILE_NOTE = {
  uploader: 'Files evidence and works the tickets assigned to them.',
  reviewer: 'Decides the finding. Cannot decide a file they uploaded.',
  admin: 'Establishes the organisation: identity, structure, people, and who may review.',
};

function currentPath() {
  return window.location.pathname.replace(/\/$/, '') || '/';
}

function pathProfile() {
  return FROM_PATH[currentPath()] || '';
}

const NAVS = {
  uploader: [
    ['dashboard', 'My work', icon('grid')],
    ['controls', 'My controls', icon('list')],
    ['evidence', 'Evidence', icon('file')],
    ['tickets', 'Tickets', icon('ticket')],
    ['history', 'History', icon('clock')],
  ],
  reviewer: [
    ['dashboard', 'Queue', icon('grid')],
    ['review', 'Review', icon('check')],
    ['evidence', 'Evidence', icon('file')],
    ['tickets', 'Tickets', icon('ticket')],
    ['history', 'History', icon('clock')],
  ],
  admin: [
    ['dashboard', 'Setup', icon('grid')],
    ['organisation', 'Organisation', icon('people')],
    ['people', 'People', icon('people')],
    ['controls', 'Controls', icon('list')],
    ['history', 'History', icon('clock')],
  ],
};

const STATUS = {
  MET: ['Met', 'bg-emerald-50 text-emerald-800'],
  PARTIAL: ['Partially met', 'bg-amber-50 text-amber-900'],
  'NOT MET': ['Not met', 'bg-rose-50 text-rose-800'],
  'NO EVIDENCE': ['No evidence', 'bg-slate-100 text-slate-600'],
};

const TICKET = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  verification: 'Needs verification',
  resolved: 'Resolved',
  reopened: 'Reopened',
};

const state = {
  workspace: null,
  page: 'dashboard',
  query: '',
  flash: '',
  error: '',
  ticketId: '',
  evidenceId: '',
  editId: '',
  actorId: '',
  profile: pathProfile() || 'uploader',
  authMode: 'signup',
  invite: null,
};

const pane = document.getElementById('pane');
const search = document.getElementById('q');

function sessionKey() {
  return `session:${currentPath()}`;
}

function token() {
  return sessionStorage.getItem(sessionKey()) || '';
}

function icon(name) {
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 19c.6-3 2.8-4.5 6-4.5S14.4 16 15 19"/><circle cx="17" cy="9" r="2"/><path d="M16 14.5c2.2.3 3.6 1.5 4.2 3.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>',
    ticket: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  };
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ws() {
  return state.workspace;
}

function people() {
  return ws()?.people || [];
}

function person(id) {
  if (id === 'system') return { name: 'Register', role: 'Calculated from the records' };
  return people().find((row) => row.id === id) || { name: 'Unassigned', role: '' };
}

function actor() {
  return person(state.actorId);
}

function holds(row, role) {
  const roles = row?.roles?.length ? row.roles : row?.canReview === false ? ['uploader'] : ['uploader', 'reviewer'];
  return roles.includes(role);
}

function navItems() {
  return NAVS[state.profile] || NAVS.reviewer;
}

function reviewers() {
  return people().filter((row) => holds(row, 'reviewer'));
}

function when(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function whenTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pill(status) {
  const [label, tone] = STATUS[status] || [status, 'bg-slate-100 text-slate-600'];
  return `<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}">${escapeHtml(label)}</span>`;
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function avatar(id) {
  const name = person(id).name;
  const tone = 'bg-[#E7EEF8] text-navy';
  return `<span class="inline-flex items-center gap-2"><span class="inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${tone}">${escapeHtml(initials(name))}</span><span>${escapeHtml(name)}</span></span>`;
}

function hashLine(hash) {
  if (!hash) return '—';
  return `${hash.slice(0, 12)}…${hash.slice(-4)}`;
}

function matches(text) {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return String(text || '').toLowerCase().includes(q);
}

function controls() {
  return (ws()?.controls || []).filter((control) => matches(`${control.id} ${control.requirement} ${control.expected} ${person(control.ownerId).name}`));
}

function evidenceRows() {
  return (ws()?.evidence || []).filter((item) => matches(`${item.id} ${item.name} ${item.note} ${item.controlIds.join(' ')} ${person(item.uploadedBy).name}`));
}

function tickets() {
  return (ws()?.tickets || []).filter((ticket) => matches(`${ticket.id} ${ticket.title} ${ticket.problem} ${ticket.controlId} ${person(ticket.ownerId).name}`));
}

function controlById(id) {
  return (ws()?.controls || []).find((control) => control.id === id);
}

function latestFor(controlId) {
  const rows = (ws()?.evidence || []).filter((item) => !item.rejected && item.controlIds.includes(controlId));
  return rows.sort((a, b) => b.version - a.version || String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0] || null;
}

function waitingReviews() {
  return (ws()?.controls || []).filter((control) => {
    const waiting = control.decision?.review === 'awaiting';
    const hasFile = (control.judgement?.sources || []).length > 0;
    const changed = control.agreed !== control.judgement.status;
    return hasFile && waiting && (changed || !control.decision.reviewedStatus);
  });
}

function openTickets() {
  return (ws()?.tickets || []).filter((ticket) => ticket.status !== 'resolved');
}

function card(title, body, extra = '') {
  return `<section class="rounded-xl border border-line bg-white ${extra}"><h2 class="border-b border-line px-5 py-4 text-sm font-semibold">${title}</h2><div class="px-5 py-4">${body}</div></section>`;
}

function banner() {
  if (!state.error && !state.flash) return '';
  const bad = Boolean(state.error);
  const text = state.error || state.flash;
  return `<div class="mb-5 rounded-lg border px-4 py-3 text-sm ${bad ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-[#D5E4FA] bg-[#F4F8FE] text-[#163A66]'}">${escapeHtml(text)}</div>`;
}

function storySteps(control) {
  const ticket = control
    ? (ws()?.tickets || []).find((row) => row.controlId === control.id)
    : null;
  const labels = ['Organisation', 'Control', 'Evidence', 'Assessment', 'Review', 'Ticket', 'Verified'];
  let current = control ? 4 : ws()?.organisation?.name ? 1 : 0;
  if (ticket && ['assigned', 'in_progress', 'reopened'].includes(ticket.status)) current = 5;
  if (ticket && ticket.status === 'verification') current = 6;
  if (ticket && ticket.status === 'resolved') current = 7;
  if (!ticket && control?.decision?.review === 'awaiting') current = 4;
  return `<ol class="mt-4 flex flex-wrap gap-2">${labels
    .map((label, index) => {
      const done = index < current;
      const now = index === current;
      const tone = now ? 'bg-navy text-white' : done ? 'bg-[#E7EEF8] text-navy' : 'bg-slate-100 text-slate-400';
      return `<li class="rounded-full px-2.5 py-1 text-xs font-medium ${tone}">${index + 1} ${label}</li>`;
    })
    .join('')}</ol>`;
}

function orgName() {
  return ws()?.organisation?.name || 'Organisation not set up';
}

function signatureClass(status) {
  if (status === 'Signed') return 'bg-emerald-50 text-emerald-800';
  if (status === 'Signature required') return 'bg-amber-50 text-amber-900';
  return 'bg-slate-100 text-slate-600';
}

function pendingInvites() {
  return (ws().invitations || []).filter((row) => row.status === 'pending');
}

function profileLabel(profile) {
  if (profile === 'reviewer') return 'Reviewer';
  if (profile === 'admin') return 'Admin';
  return 'User';
}

function accountPill(label) {
  const cls = label === 'Active' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900';
  return `<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}">${label}</span>`;
}

function ackCards() {
  const rows = (ws().acknowledgements || []).filter((row) => row.personId === state.actorId && row.status === 'required');
  if (!rows.length) return '';
  const onFile = (ws().acknowledgements || []).some((row) => row.personId === state.actorId && row.status === 'signed');
  return rows.map((row) => `
    <form data-ack-form="${escapeHtml(row.id)}" class="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <p class="text-xs font-medium uppercase tracking-[0.14em] text-amber-900">Acknowledgement</p>
      <p class="mt-2 text-sm leading-relaxed text-amber-950">${escapeHtml(row.statement)}</p>
      <p class="mt-2 text-xs text-amber-900">${escapeHtml(row.controlId)} · version ${escapeHtml(String(row.itemVersion))}. ${onFile ? 'Confirm the signature already on your profile for this responsibility.' : 'A signature is asked for because of this assignment, not because you joined.'}</p>
      <label class="mt-3 block text-sm font-medium text-amber-950">Signature
        <input name="signature" required maxlength="80" value="${escapeHtml(actor().name)}" class="mt-1 w-full max-w-sm rounded-lg border border-amber-200 bg-white px-3 py-2 font-normal outline-none" />
      </label>
      <button type="submit" class="mt-3 rounded-lg bg-navy px-3.5 py-2 text-sm font-medium text-white">${onFile ? 'Confirm signature' : 'Acknowledge'}</button>
    </form>`).join('');
}

function renderDashboard() {
  if (state.profile === 'uploader') return renderUploaderHome();
  if (state.profile === 'admin') return renderAdminHome();
  const all = ws().controls || [];
  const focus = waitingReviews()[0] || all.find((control) => control.agreed !== 'MET') || all[0];
  const counts = ['MET', 'PARTIAL', 'NOT MET', 'NO EVIDENCE'].map((status) => [status, all.filter((control) => control.agreed === status).length]);
  const withFile = all.filter((control) => control.evidenceIds.length).length;
  const stats = counts
    .map(
      ([status, count]) => `
        <div class="px-5 py-4">
          <p class="text-2xl font-semibold tracking-tight">${count}</p>
          <div class="mt-2">${pill(status)}</div>
        </div>`
    )
    .join('');
  const activity = (ws().history || []).slice(0, 5).map((row) => `
    <li class="grid gap-1 border-t border-line py-3 sm:grid-cols-[11rem_1fr]">
      <span class="text-xs text-slate-500">${escapeHtml(whenTime(row.at))}</span>
      <span class="text-sm"><span class="font-medium">${escapeHtml(person(row.actorId).name)}. </span>${escapeHtml(row.text)}</span>
    </li>`).join('');
  const focusCard = focus
    ? `<section class="rounded-xl border border-line bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Next in the loop</p>
        <h2 class="mt-2 text-lg font-semibold">${escapeHtml(focus.id)} · ${escapeHtml(focus.expected)}</h2>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">${escapeHtml(focus.requirement)}</p>
        <div class="mt-3 flex flex-wrap items-center gap-2">${pill(focus.agreed)}${focus.agreed !== focus.judgement.status ? `<span class="text-xs text-slate-500">Reading now: ${escapeHtml(STATUS[focus.judgement.status][0])}. A person still decides.</span>` : ''}</div>
        ${storySteps(focus)}
        <button type="button" data-go="review" class="mt-5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Open the review</button>
      </section>`
    : `<section class="rounded-xl border border-line bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">The loop</p>
        <h2 class="mt-2 text-lg font-semibold">No requirement is on the control set yet</h2>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">Signing in does not create controls, evidence, or tickets. An admin adds a requirement from the inbuilt ISO/IEC 42001 list, or writes one for this organisation. A file can be reviewed after that.</p>
        ${storySteps(null)}
      </section>`;
  pane.innerHTML = `
    ${banner()}
    ${ackCards()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(ws().organisation.framework)}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">${escapeHtml(orgName())}</h1>
      </div>
      <p class="text-sm text-slate-500">${all.length ? `${withFile} of ${all.length} controls have a file` : 'No controls yet'}</p>
    </div>
    <div class="mt-5 grid overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">${stats}</div>
    <div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      ${focusCard}
      <section class="rounded-xl border border-line bg-white p-5">
        <h2 class="text-sm font-semibold">Needs a person</h2>
        <dl class="mt-4 space-y-3 text-sm">
          <div class="flex justify-between gap-4"><dt class="text-slate-500">Waiting for review</dt><dd class="font-medium">${waitingReviews().length}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-slate-500">Open tickets</dt><dd class="font-medium">${openTickets().length}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-slate-500">No evidence</dt><dd class="font-medium">${all.filter((control) => control.agreed === 'NO EVIDENCE').length}</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-slate-500">Reminders</dt><dd class="font-medium">${ws().organisation.reminders ? 'On' : 'Off'}</dd></div>
        </dl>
        <button type="button" data-go="tickets" class="mt-5 text-sm font-medium text-brand">See tickets</button>
      </section>
    </div>
    <section class="mt-5 rounded-xl border border-line bg-white px-5">
      <h2 class="py-4 text-sm font-semibold">Latest history</h2>
      <ul>${activity || '<li class="border-t border-line py-4 text-sm text-slate-500">Nothing has been recorded yet.</li>'}</ul>
    </section>`;
}

function renderUploaderHome() {
  const mine = (ws().controls || []).filter((control) => control.filerId === state.actorId || control.ownerId === state.actorId || (ws().tickets || []).some((ticket) => ticket.controlId === control.id && ticket.ownerId === state.actorId && ticket.status !== 'resolved'));
  const rows = mine.map((control) => `
    <article class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
      <div>
        <p class="text-sm font-medium">${escapeHtml(control.id)}</p>
        <p class="mt-1 text-sm text-slate-600">${escapeHtml(control.expected)}</p>
      </div>
      ${pill(control.agreed)}
    </article>`).join('');
  const assigned = (ws().tickets || []).filter((ticket) => ticket.ownerId === state.actorId && ticket.status !== 'resolved');
  pane.innerHTML = `
    ${banner()}
    ${ackCards()}
    <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Uploader</p>
    <h1 class="mt-1 text-2xl font-semibold tracking-tight">${escapeHtml(actor().name)}</h1>
    <p class="mt-2 max-w-2xl text-sm text-slate-500">You can file evidence and work tickets assigned to you. A reviewer permission on your account still cannot approve a file you uploaded.</p>
    <div class="mt-5 grid gap-4 sm:grid-cols-2">
      ${fact('Submissions you can see', String(mine.length))}
      ${fact('Tickets assigned to you', String(assigned.length))}
    </div>
    <section class="mt-5 overflow-hidden rounded-xl border border-line bg-white">
      <h2 class="px-5 py-4 text-sm font-semibold">Controls that involve you</h2>
      ${rows || '<p class="border-t border-line px-5 py-6 text-sm text-slate-500">Nothing is assigned to you yet.</p>'}
    </section>
    <button type="button" data-go="tickets" class="mt-5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Open your tickets</button>`;
}

function field(label, name, value, extra = '') {
  return `<label class="text-sm font-medium ${extra}">${label}<input name="${name}" value="${escapeHtml(value || '')}" class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" /></label>`;
}

function shortDate(value) {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function departmentTree(departments) {
  const list = departments || [];
  if (!list.length) return '<p class="mt-3 text-sm text-slate-500">No department yet.</p>';
  const walk = (parentId, depth) => list.filter((row) => (row.parentId || '') === parentId).map((row) => {
    const mark = depth ? '└ ' : '';
    return `<p class="text-sm text-slate-700" style="padding-left:${depth * 16}px">${mark}${escapeHtml(row.name)}</p>${walk(row.id, depth + 1)}`;
  }).join('');
  return `<div class="mt-3 space-y-1">${walk('', 0)}</div>`;
}

function parentOptions(departments) {
  return `<option value="">Top level</option>${(departments || []).map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}</option>`).join('')}`;
}

function unitOptions(selected) {
  const names = [...new Set([
    ...(ws().organisation.departments || []).map((row) => row.name),
    ...(ws().organisation.units || []),
    ...people().map((row) => row.unit).filter(Boolean),
  ])];
  return names.map((name) => `<option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
}

function setupChecks(org) {
  const list = controls();
  const reviewers = people().filter((row) => holds(row, 'reviewer'));
  const missingOwner = list.filter((control) => !control.ownerId);
  const missingReviewer = list.filter((control) => !control.reviewerId);
  const missingDept = people().filter((row) => !row.unit);
  const items = [
    ['Organisation identity', Boolean(org.name && org.legalName && org.country)],
    ['Departments', (org.departments || []).length > 0],
    ['People', people().length > 0],
    ['A reviewer profile', reviewers.length > 0],
    ['Governance scope', (org.scope?.systems || []).length > 0],
    ['Evidence owners', list.length > 0 && missingOwner.length === 0],
    ['Reviewers on requirements', list.length > 0 && missingReviewer.length === 0],
  ];
  return { items, missingOwner, missingReviewer, missingDept };
}

function renderAdminHome() {
  const org = ws().organisation;
  const departments = org.departments || [];
  const systems = org.scope?.systems || [];
  const checks = setupChecks(org);
  const done = checks.items.filter(([, ok]) => ok).length;
  const percent = Math.round((done / checks.items.length) * 100);
  const sizeOptions = ['', '1–10', '11–50', '51–200', '201–1000', 'More than 1000'].map((size) => `<option value="${escapeHtml(size)}" ${org.size === size ? 'selected' : ''}>${size || 'Not set'}</option>`).join('');
  const first = people()[0];
  const peopleRows = people().map((row) => {
    const manager = row.managerId ? person(row.managerId).name : 'Not set';
    const toggles = ['uploader', 'reviewer', 'admin'].map((role) => {
      const on = holds(row, role);
      return `<button type="button" data-toggle-role="${role}" data-person="${row.id}" class="rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-navy text-white' : 'border border-line text-slate-500'}">${role}</button>`;
    }).join('');
    return `<tr class="border-t border-line align-top">
      <td class="px-4 py-3 text-sm font-medium">${escapeHtml(row.name)}<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(row.email || '')}</span></td>
      <td class="px-4 py-3 text-sm">${escapeHtml(row.title || row.role || '')}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(row.unit || 'Not set')}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(manager)}</td>
      <td class="px-4 py-3 text-sm capitalize">${escapeHtml(row.employmentType || 'employee')}</td>
      <td class="px-4 py-3"><div class="flex flex-wrap gap-1">${toggles}</div></td>
      <td class="px-4 py-3">${accountPill('Active')}</td>
    </tr>`;
  }).join('');
  const dutyRows = controls().map((control) => `
    <tr class="border-t border-line">
      <td class="px-4 py-3 text-sm font-medium">${escapeHtml(control.id)}<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(control.expected)}</span></td>
      <td class="px-4 py-3 text-sm">${escapeHtml(person(control.ownerId).name)}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(person(control.reviewerId).name)}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(control.frequency)}</td>
    </tr>`).join('');
  const warnings = [
    checks.missingDept.length ? `${checks.missingDept.length} ${checks.missingDept.length === 1 ? 'person has' : 'people have'} no department.` : '',
    checks.missingReviewer.length ? `${checks.missingReviewer.length} ${checks.missingReviewer.length === 1 ? 'requirement has' : 'requirements have'} no reviewer.` : '',
    checks.missingOwner.length ? `${checks.missingOwner.length} ${checks.missingOwner.length === 1 ? 'requirement has' : 'requirements have'} no evidence owner.` : '',
    !systems.length ? 'No AI system is in scope yet.' : '',
    !people().some((row) => holds(row, 'reviewer')) ? 'Nobody holds the reviewer profile yet, so a requirement cannot be added.' : '',
  ].filter(Boolean);
  pane.innerHTML = `
    ${banner()}
    ${ackCards()}
    <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Admin · ${escapeHtml(org.id || 'ORG-001')}</p>
    <h1 class="mt-1 text-2xl font-semibold tracking-tight">${escapeHtml(org.name || 'Establish the organisation')}</h1>
    <p class="mt-2 max-w-3xl text-sm text-slate-500">This page records who the organisation is, how it is structured, and who may own or review a requirement. People confirm their own name and email when they sign up. Saving this does not create evidence or tickets, and it does not approve a file.</p>
    <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${fact('Framework', org.framework || 'ISO/IEC 42001')}
      ${fact('Country', org.country || 'Not set')}
      ${fact('Industry', org.industry || 'Not set')}
      ${fact('Created', shortDate(org.createdAt))}
    </div>

    <section class="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 class="text-sm font-semibold">People</h2>
      <p class="mt-1 max-w-3xl text-sm text-slate-500">Someone added from Excel or entered manually stays Pending until they open the link and create an account. After they sign up, they are Active.</p>
      <div class="mt-4 overflow-x-auto">
        <table class="w-full text-left">
          <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-4 py-2 font-medium">Person</th><th class="px-4 py-2 font-medium">Role</th><th class="px-4 py-2 font-medium">Department</th><th class="px-4 py-2 font-medium">Account</th></tr></thead>
          <tbody>${directoryRows() || '<tr><td colspan="4" class="px-4 py-6 text-sm text-slate-500">Nobody has been added yet.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section class="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 class="text-sm font-semibold">Identity</h2>
      <p class="mt-1 text-sm text-slate-500">Legal name, operating name, and where the organisation works. The framework stays ISO/IEC 42001.</p>
      <form id="org-form" class="mt-4 grid gap-3 sm:grid-cols-2">
        ${field('Legal name', 'legalName', org.legalName)}
        ${field('Operating name', 'name', org.name)}
        ${field('Industry', 'industry', org.industry)}
        ${field('Country', 'country', org.country)}
        ${field('Operating locations', 'locations', (org.locations || []).join(', '), 'sm:col-span-2')}
        ${field('Website', 'website', org.website)}
        <label class="text-sm font-medium">Organisation size
          <select name="size" class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal outline-none focus:border-brand">${sizeOptions}</select>
        </label>
        ${field('Main contact', 'contactName', org.contactName)}
        ${field('Email domain', 'emailDomain', org.emailDomain)}
        <label class="text-sm font-medium sm:col-span-2">Description
          <textarea name="description" maxlength="400" rows="3" class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand">${escapeHtml(org.description || '')}</textarea>
        </label>
        <p class="text-xs leading-relaxed text-slate-500 sm:col-span-2">Separate locations with commas. The organisation id is ${escapeHtml(org.id || 'ORG-001')} and is kept by the register.</p>
        <div><button type="submit" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Save identity</button></div>
      </form>
    </section>

    <section class="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 class="text-sm font-semibold">Structure</h2>
      <p class="mt-1 text-sm text-slate-500">Departments can sit under a parent. Later, a requirement is owned by a person in one of these departments.</p>
      ${departmentTree(departments)}
      <form id="unit-form" class="mt-4 flex flex-wrap items-end gap-2">
        <label class="text-sm font-medium">Department
          <input name="name" required maxlength="80" placeholder="AI and technology" class="mt-1 block rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" />
        </label>
        <label class="text-sm font-medium">Sits under
          <select name="parentId" class="mt-1 block rounded-lg border border-line bg-white px-3 py-2 font-normal">${parentOptions(departments)}</select>
        </label>
        <button type="submit" class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">Add department</button>
      </form>
    </section>

    <section class="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 class="text-sm font-semibold">People and system profiles</h2>
      <p class="mt-1 max-w-3xl text-sm text-slate-500">A job title is not a permission. Admin, user, and reviewer are the system profiles. The same person can hold more than one. They still cannot approve a file they uploaded.</p>
      <div class="mt-4 overflow-x-auto">
        <table class="w-full text-left">
          <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-4 py-2 font-medium">Person</th><th class="px-4 py-2 font-medium">Job title</th><th class="px-4 py-2 font-medium">Department</th><th class="px-4 py-2 font-medium">Reports to</th><th class="px-4 py-2 font-medium">Type</th><th class="px-4 py-2 font-medium">Profiles</th><th class="px-4 py-2 font-medium">Account</th></tr></thead>
          <tbody>${peopleRows || '<tr><td colspan="7" class="px-4 py-6 text-sm text-slate-500">Nobody has signed up yet.</td></tr>'}</tbody>
        </table>
      </div>
      ${first ? `<form id="placement-form" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label class="text-sm font-medium">Person
          <select id="place-person" name="personId" class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal">${people().map((row) => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join('')}</select>
        </label>
        ${field('Job title', 'job', first.title || first.role)}
        <label class="text-sm font-medium">Department
          <select name="unit" class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal">${unitOptions(first.unit)}</select>
        </label>
        <label class="text-sm font-medium">Reports to
          <select name="managerId" class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal"><option value="">Nobody</option>${people().filter((row) => row.id !== first.id).map((row) => `<option value="${row.id}" ${row.id === first.managerId ? 'selected' : ''}>${escapeHtml(row.name)}</option>`).join('')}</select>
        </label>
        <label class="text-sm font-medium">Employment
          <select name="employmentType" class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal"><option value="employee" ${first.employmentType !== 'contractor' ? 'selected' : ''}>Employee</option><option value="contractor" ${first.employmentType === 'contractor' ? 'selected' : ''}>Contractor</option></select>
        </label>
        <div class="flex items-end"><button type="submit" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Save placement</button></div>
      </form>` : '<p class="mt-4 text-sm text-slate-500">People join from the user, reviewer, or admin link. You place them after they have an account.</p>'}
    </section>

    <section class="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 class="text-sm font-semibold">Responsibilities</h2>
      <p class="mt-1 max-w-3xl text-sm text-slate-500">Each requirement has an evidence owner and a reviewer. Naming an owner asks that person to acknowledge the responsibility. A signature is not collected just because someone joined.</p>
      ${dutyRows ? `<div class="mt-4 overflow-x-auto"><table class="w-full text-left"><thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-4 py-2 font-medium">Requirement</th><th class="px-4 py-2 font-medium">Evidence owner</th><th class="px-4 py-2 font-medium">Reviewer</th><th class="px-4 py-2 font-medium">Review</th></tr></thead><tbody>${dutyRows}</tbody></table></div>` : '<p class="mt-4 text-sm text-slate-500">No requirement is on the control set yet. Add one from the inbuilt list, or write one in this organisation’s words, and name an owner and a reviewer.</p>'}
      <button type="button" data-go="controls" class="mt-4 rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium">Open controls</button>
    </section>

    <section class="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 class="text-sm font-semibold">Separation of duties</h2>
      <p class="mt-1 text-sm text-slate-500">These rules are enforced when the action is saved. Hiding a button is not the rule.</p>
      <ul class="mt-3 space-y-2 text-sm text-slate-700">
        <li>The person who uploads evidence cannot approve that evidence.</li>
        <li>The person who files a fix cannot verify that fix.</li>
        <li>Only a person with the reviewer profile can agree, disagree, edit the finding, or ask for more evidence.</li>
      </ul>
    </section>

    <section class="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 class="text-sm font-semibold">Governance scope</h2>
      <p class="mt-1 text-sm text-slate-500">Name the AI systems this register covers. Locations in the identity above are the places in scope. The register does not assume every system or department is in scope.</p>
      <ul class="mt-3 space-y-1 text-sm">${systems.map((name) => `<li>${escapeHtml(name)}</li>`).join('') || '<li class="text-slate-500">No AI system is listed yet.</li>'}</ul>
      <p class="mt-3 text-sm text-slate-600">Locations: ${escapeHtml((org.locations || []).join(', ') || 'Not set')}</p>
      <form id="system-form" class="mt-4 flex flex-wrap items-end gap-2">
        <label class="text-sm font-medium">AI system in scope
          <input name="name" required maxlength="120" placeholder="Customer support assistant" class="mt-1 block rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" />
        </label>
        <button type="submit" class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">Add to scope</button>
      </form>
    </section>

    <section class="mt-5 rounded-xl border border-line bg-white p-5">
      <h2 class="text-sm font-semibold">Organisation readiness</h2>
      <p class="mt-1 text-sm text-slate-500">This is how complete the setup is. It is not a certificate and it is not an audit result.</p>
      <div class="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full bg-brand" style="width:${percent}%"></div></div>
      <p class="mt-2 text-sm font-medium">${percent}% of the setup checks are in place</p>
      <ul class="mt-3 space-y-1 text-sm">${checks.items.map(([label, ok]) => `<li>${ok ? 'Ready' : 'Missing'} · ${escapeHtml(label)}</li>`).join('')}</ul>
      ${warnings.length ? `<ul class="mt-3 space-y-1 text-sm text-amber-900">${warnings.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
    </section>`;
}

function directoryRows() {
  const pending = pendingInvites().map((row) => `
    <tr class="border-t border-line">
      <td class="px-4 py-3 text-sm font-medium">${escapeHtml(row.name || row.email)}<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(row.email)}</span></td>
      <td class="px-4 py-3 text-sm">${profileLabel(row.profile)}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(row.unit || 'Not set')}</td>
      <td class="px-4 py-3">${accountPill('Pending')}</td>
    </tr>`).join('');
  const active = people().map((row) => `
    <tr class="border-t border-line">
      <td class="px-4 py-3 text-sm font-medium">${escapeHtml(row.name)}<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(row.email || '')}</span></td>
      <td class="px-4 py-3 text-sm">${roleChips(row) || profileLabel('uploader')}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(row.unit || 'Not set')}</td>
      <td class="px-4 py-3">${accountPill('Active')}</td>
    </tr>`).join('');
  return pending + active;
}

function roleChips(row) {
  return (row.roles || []).map((role) => `<span class="mr-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 capitalize">${escapeHtml(role)}</span>`).join('');
}

function penIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z"/></svg>`;
}

function penButton(opts) {
  const on = Boolean(opts.on);
  const attr = opts.draft
    ? `data-pen-draft="${escapeHtml(opts.draft)}" data-pen-on="${on ? '1' : '0'}"`
    : `data-pen="${escapeHtml(opts.id)}" data-pen-on="${on ? '1' : '0'}"`;
  return `<button type="button" ${attr} aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Drawing is on for this person' : 'Drawing is off for this person'}" class="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-3 text-white ${on ? 'ring-2 ring-brand ring-offset-2' : ''}">${penIcon()}</button>`;
}

function renderOrganisation() {
  const org = ws().organisation;
  const rows = people().map((row) => `
    <tr class="border-t border-line">
      <td class="px-5 py-3">${avatar(row.id)}</td>
      <td class="px-5 py-3 text-sm">${escapeHtml(row.role)}${row.ageRange ? `<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(row.ageRange)}</span>` : ''}</td>
      <td class="px-5 py-3 text-sm text-slate-600">${escapeHtml(row.unit)}</td>
      <td class="px-5 py-3 text-sm">${roleChips(row)}</td>
      <td class="px-5 py-3">${accountPill('Active')}</td>
      <td class="px-5 py-3"><span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${signatureClass(row.signatureStatus)}">${escapeHtml(row.signatureStatus || 'Not signed')}</span>${row.drawnSignature ? `<img alt="Drawn signature" src="${escapeHtml(row.drawnSignature)}" class="mt-2 h-8 bg-white" />` : ''}</td>
    </tr>`).join('');
  const invites = (ws().invitations || []).filter((row) => row.status === 'pending');
  const acks = (ws().acknowledgements || []).filter((row) => row.status === 'required' || row.status === 'signed');
  const ackRows = acks.map((row) => `
    <tr class="border-t border-line align-top">
      <td class="px-5 py-3 text-sm font-medium">${escapeHtml(person(row.personId).name)}</td>
      <td class="px-5 py-3 text-sm">${escapeHtml(row.controlId)}<span class="mt-1 block text-xs text-slate-500">version ${escapeHtml(String(row.itemVersion))}</span></td>
      <td class="px-5 py-3 text-sm">${escapeHtml(row.statement)}</td>
      <td class="px-5 py-3"><span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${signatureClass(row.status === 'signed' ? 'Signed' : 'Signature required')}">${row.status === 'signed' ? 'Signed' : 'Signature required'}</span>${row.status === 'signed' ? `<p class="mt-2 text-xs text-slate-500">${escapeHtml(whenTime(row.signedAt))} · ${escapeHtml(row.signature)}</p>` : ''}</td>
    </tr>`).join('');
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(org.id)}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">${escapeHtml(orgName())}</h1>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        ${penButton({ draft: 'page', on: false })}
        <button type="button" id="toggle-reminders" class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">${org.reminders ? 'Turn reminders off' : 'Turn reminders on'}</button>
      </div>
    </div>
    <h2 class="mb-1 mt-6 text-sm font-semibold">Add people</h2>
    <p class="mb-4 max-w-3xl text-sm text-slate-500">Upload an Excel file, or enter them manually. The file needs full name, email, role, and age range. Role is User or Reviewer. Age range is 18–24, 25–34, 35–44, 45–54, 55–64, or 65+. The blue pen at the top turns on a drawing when that person opens the link. Copy the link into the email you send. This register does not send the email.</p>
    <div class="grid gap-4 lg:grid-cols-2">
      <form id="excel-form" class="rounded-xl border border-line bg-white p-5">
        <h3 class="text-sm font-semibold">Upload Excel</h3>
        <p class="mt-1 text-sm text-slate-500">The sheet is read and the people are added. You do not type each row.</p>
        <label class="mt-4 block text-sm font-medium">Spreadsheet
          <input name="file" type="file" accept=".xlsx,.xls,.csv" required class="mt-1 block w-full text-sm" />
        </label>
        <button type="submit" class="mt-4 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Upload file</button>
      </form>
      <form id="invite-form" class="rounded-xl border border-line bg-white p-5">
        <h3 class="text-sm font-semibold">Enter manually</h3>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-medium sm:col-span-2">Full name
            <input name="name" required maxlength="80" class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" />
          </label>
          <label class="text-sm font-medium sm:col-span-2">Work email
            <input name="email" type="email" required maxlength="120" class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" />
          </label>
          <label class="text-sm font-medium">Role
            <select name="profile" class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal"><option value="uploader">User</option><option value="reviewer">Reviewer</option></select>
          </label>
          <label class="text-sm font-medium">Age range
            <select name="ageRange" required class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal"><option value="">Choose</option>${['18–24', '25–34', '35–44', '45–54', '55–64', '65+'].map((age) => `<option value="${age}">${age}</option>`).join('')}</select>
          </label>
          <label class="text-sm font-medium sm:col-span-2">Department
            <input name="unit" maxlength="80" placeholder="Optional. They can confirm it on their page." class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" />
          </label>
        </div>
        <button type="submit" class="mt-4 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Add this person</button>
      </form>
    </div>
    <ul class="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">${invites.map((row) => {
      const path = row.profile === 'reviewer' ? '/reviewer' : row.profile === 'admin' ? '/admin' : '/user';
      const link = `${path}?invite=${encodeURIComponent(row.token || '')}`;
      const roleName = row.profile === 'reviewer' ? 'Reviewer' : row.profile === 'admin' ? 'Admin' : 'User';
      return `<li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p class="text-sm font-medium">${escapeHtml(row.name || row.email)} <span class="ml-2 align-middle">${accountPill('Pending')}</span></p>
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(row.email)} · ${roleName}${row.ageRange ? ` · ${escapeHtml(row.ageRange)}` : ''}</p>
          <p class="mt-1 text-xs text-slate-500">${escapeHtml(link)}</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" data-copy-link="${escapeHtml(link)}" class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">Copy link</button>
          ${penButton({ id: row.id, on: row.signatureRequired })}
        </div>
      </li>`;
    }).join('') || '<li class="px-4 py-6 text-sm text-slate-500">Nobody is waiting on a link.</li>'}</ul>
    <div class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${fact('Legal name', org.legalName || 'Not set')}
      ${fact('Country', org.country || 'Not set')}
      ${fact('Industry', org.industry || 'Not set')}
      ${fact('Framework', org.framework)}
    </div>
    <p class="mt-3 text-sm text-slate-500">${org.reminders ? 'Reminders are on. The choice is stored. No email is sent.' : 'Reminders are off.'}</p>
    <h2 class="mb-1 mt-8 text-sm font-semibold">Structure</h2>
    ${departmentTree(org.departments || [])}
    <form id="unit-form" class="mt-4 flex flex-wrap items-end gap-2">
      <label class="text-sm font-medium">Department
        <input name="name" required maxlength="80" placeholder="Security" class="mt-1 block rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" />
      </label>
      <label class="text-sm font-medium">Sits under
        <select name="parentId" class="mt-1 block rounded-lg border border-line bg-white px-3 py-2 font-normal">${parentOptions(org.departments || [])}</select>
      </label>
      <button type="submit" class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">Add department</button>
    </form>
    <h2 class="mb-1 mt-8 text-sm font-semibold">People on this organisation</h2>
    <p class="mb-3 max-w-3xl text-sm text-slate-500">People confirm their own name, email, and job when they create an account. A signature stays Not signed until a governance action needs one, such as being named responsible for a requirement.</p>
    <div class="overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3 font-medium">Person</th><th class="px-5 py-3 font-medium">Job</th><th class="px-5 py-3 font-medium">Department</th><th class="px-5 py-3 font-medium">Profiles</th><th class="px-5 py-3 font-medium">Account</th><th class="px-5 py-3 font-medium">Signature</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="px-5 py-8 text-sm text-slate-500">Nobody has signed up yet.</td></tr>'}</tbody>
      </table>
    </div>
    <h2 class="mb-1 mt-8 text-sm font-semibold">Acknowledgements</h2>
    <p class="mb-3 max-w-3xl text-sm text-slate-500">Each row is one action: who acknowledged what, on which requirement and version. It is separate from the person’s job title and system profile.</p>
    <div class="overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3 font-medium">Person</th><th class="px-5 py-3 font-medium">Item</th><th class="px-5 py-3 font-medium">What they acknowledge</th><th class="px-5 py-3 font-medium">Status</th></tr></thead>
        <tbody>${ackRows || '<tr><td colspan="4" class="px-5 py-8 text-sm text-slate-500">No responsibility has asked for a signature yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function fact(label, value) {
  return `<div class="rounded-xl border border-line bg-white px-4 py-3"><p class="text-xs text-slate-500">${escapeHtml(label)}</p><p class="mt-1 text-sm font-medium">${escapeHtml(value)}</p></div>`;
}

function chainCell(label, title, detail) {
  return `<div class="rounded-xl border border-line bg-white px-4 py-3"><p class="text-xs text-slate-500">${escapeHtml(label)}</p><p class="mt-1 text-sm font-semibold">${escapeHtml(title)}</p><p class="mt-1 text-xs leading-relaxed text-slate-500">${escapeHtml(detail)}</p></div>`;
}

function relevant(control) {
  if (state.profile !== 'uploader') return true;
  return control.filerId === state.actorId || control.ownerId === state.actorId || (ws().tickets || []).some((ticket) => ticket.controlId === control.id && ticket.ownerId === state.actorId);
}

function renderControls() {
  const reviewerCell = (control) => {
    if (state.profile !== 'admin') return `<td class="px-5 py-3 text-sm">${escapeHtml(person(control.reviewerId).name)}</td>`;
    const options = people().filter((row) => holds(row, 'reviewer')).map((row) => `<option value="${row.id}" ${row.id === control.reviewerId ? 'selected' : ''}>${escapeHtml(row.name)}</option>`).join('');
    return `<td class="px-5 py-3"><select data-assign-reviewer="${control.id}" class="rounded-lg border border-line bg-white px-2 py-1.5 text-sm">${options}</select></td>`;
  };
  const rows = controls().filter(relevant).map((control) => `
    <tr class="border-t border-line align-top">
      <td class="whitespace-nowrap px-5 py-3 text-sm font-medium">${escapeHtml(control.id)}</td>
      <td class="px-5 py-3 text-sm">${escapeHtml(control.requirement)}<span class="mt-1 block text-xs text-slate-500">${escapeHtml(control.expected)} · ${escapeHtml(control.frequency)}</span></td>
      <td class="px-5 py-3 text-sm">${escapeHtml(person(control.ownerId).name)}</td>
      ${reviewerCell(control)}
      <td class="px-5 py-3">${pill(control.agreed)}</td>
      <td class="px-5 py-3 text-sm text-slate-600">${control.evidenceIds.length ? control.evidenceIds.length : 'None'}</td>
    </tr>`).join('');
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(ws().organisation.framework)}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">Controls</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-500">These are the requirements this organisation is keeping. Add one from an ISO/IEC 42001 template, or write a custom requirement. A requirement with no file stays at no evidence.</p>
      </div>
      ${state.profile === 'admin' ? '<button type="button" id="open-control" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Custom requirement</button>' : ''}
    </div>
    ${renderTemplates()}
    <div class="mt-5 overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3 font-medium">Control</th><th class="px-5 py-3 font-medium">Requirement</th><th class="px-5 py-3 font-medium">Owner</th><th class="px-5 py-3 font-medium">Reviewer</th><th class="px-5 py-3 font-medium">Agreed</th><th class="px-5 py-3 font-medium">Files</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="px-5 py-8 text-sm text-slate-500">Nothing matches.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderTemplates() {
  if (state.profile !== 'admin') return '';
  const cards = (ws().templates || []).map((template) => `
    <article class="rounded-xl border border-line bg-white p-4">
      <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(template.family)}</p>
      <h2 class="mt-2 text-sm font-semibold">${escapeHtml(template.title)}</h2>
      <p class="mt-2 text-sm leading-relaxed text-slate-600">${escapeHtml(template.requirement)}</p>
      <p class="mt-2 text-xs text-slate-500">${escapeHtml(template.expected)} · ${escapeHtml(template.frequency)}</p>
      <button type="button" data-use-template="${template.id}" ${template.used ? 'disabled' : ''} class="mt-4 rounded-lg px-3 py-2 text-sm font-medium ${template.used ? 'cursor-default bg-slate-100 text-slate-400' : 'bg-navy text-white'}">${template.used ? 'On the control set' : 'Use template'}</button>
    </article>`).join('');
  return `
    <h2 class="mt-8 text-sm font-semibold">ISO/IEC 42001 templates</h2>
    <p class="mt-2 max-w-2xl text-sm text-slate-500">Use a template to put that requirement on this organisation. The wording is for you to adopt. It is not the text of the standard.</p>
    <div class="mt-4 grid gap-3 lg:grid-cols-2">${cards}</div>`;
}

function renderEvidence() {
  const all = ws().controls;
  const withFile = all.filter((control) => control.evidenceIds.length).length;
  const pct = all.length ? Math.round((withFile / all.length) * 100) : 0;
  const rows = evidenceRows().map((item) => `
    <tr class="border-t border-line align-top hover:bg-[#FAFBFC]">
      <td class="px-5 py-3">
        <p class="text-sm font-medium">${escapeHtml(item.name)}</p>
        <p class="mt-0.5 text-xs text-slate-500">${escapeHtml(item.id)} · v${item.version}${item.rejected ? ' · not used' : ''}</p>
      </td>
      <td class="px-5 py-3 text-sm">${avatar(item.uploadedBy)}</td>
      <td class="whitespace-nowrap px-5 py-3 text-sm text-slate-600">${escapeHtml(when(item.uploadedAt))}</td>
      <td class="px-5 py-3 text-sm text-slate-600">${escapeHtml(item.note)}</td>
      <td class="whitespace-nowrap px-5 py-3 text-sm">${escapeHtml(item.controlIds.join(', '))}</td>
      <td class="px-5 py-3 text-right"><button type="button" data-evidence="${item.id}" class="text-sm font-medium text-brand">${state.evidenceId === item.id ? 'Hide' : 'Open'}</button></td>
    </tr>
    ${state.evidenceId === item.id ? `<tr class="border-t border-line bg-[#FAFBFC]"><td colspan="6" class="px-5 py-4 text-sm"><p><span class="text-slate-500">Fingerprint. </span><span class="font-medium">${escapeHtml(item.hash)}</span></p><p class="mt-1"><span class="text-slate-500">Section. </span>${escapeHtml(item.section)}</p><p class="mt-1"><span class="text-slate-500">Source. </span>${escapeHtml(item.source)}</p></td></tr>` : ''}`).join('');
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Evidence</h1>
        <p class="mt-2 text-sm text-slate-500">Manual upload is the path in this version. Drive, SharePoint, and a server folder are not connected.</p>
      </div>
      ${state.profile === 'uploader' ? '<button type="button" id="open-evidence" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Add evidence</button>' : ''}
    </div>
    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <section class="rounded-xl border border-line bg-white p-5">
        <p class="text-sm text-slate-500">Evidence on file</p>
        <p class="mt-2 text-3xl font-semibold tracking-tight">${pct}%</p>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-brand" style="width:${pct}%"></div></div>
        <p class="mt-2 text-sm text-slate-500">${withFile} of ${all.length} controls have a file</p>
      </section>
      <section class="rounded-xl border border-line bg-white p-5">
        <div class="flex items-start justify-between"><p class="text-sm text-slate-500">Needs attention</p><p class="text-3xl font-semibold tracking-tight">${waitingReviews().length + openTickets().length}</p></div>
        <dl class="mt-3 space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-slate-500">Waiting for review</dt><dd>${waitingReviews().length}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Open tickets</dt><dd>${openTickets().length}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">No evidence</dt><dd>${all.filter((control) => control.agreed === 'NO EVIDENCE').length}</dd></div>
        </dl>
      </section>
    </div>
    <div class="mt-5 overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr>
          <th class="px-5 py-3 font-medium">Name</th><th class="px-5 py-3 font-medium">Owner</th><th class="px-5 py-3 font-medium">Date</th><th class="px-5 py-3 font-medium">What it shows</th><th class="px-5 py-3 font-medium">Control</th><th class="px-5 py-3"></th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="px-5 py-8 text-sm text-slate-500">${state.query ? 'Nothing matches.' : 'No evidence has been filed.'}</td></tr>`}</tbody>
      </table>
    </div>`;
}

function sourceTrail(judgement) {
  const source = judgement.sources[0];
  if (!source) return '<p class="text-sm text-slate-600">No file to cite. The register will not guess a result from outside the record.</p>';
  const rows = [
    ['Evidence', source.evidenceId],
    ['Document', source.name],
    ['Version', `v${source.version}`],
    ['Section', source.section],
    ['Fingerprint', hashLine(source.hash)],
  ];
  return `<dl class="mt-4 grid gap-3 sm:grid-cols-2">${rows
    .map(([label, value]) => `<div><dt class="text-xs text-slate-500">${escapeHtml(label)}</dt><dd class="mt-0.5 text-sm font-medium">${escapeHtml(value)}</dd></div>`)
    .join('')}</dl>`;
}

function renderReview() {
  const waiting = waitingReviews().filter((control) => matches(`${control.id} ${control.requirement}`));
  const decided = (ws().controls || []).filter((control) => !waiting.includes(control) && matches(control.id + control.requirement));
  const blocks = waiting.map((control) => reviewCard(control)).join('');
  const compact = decided.map((control) => `
    <article class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <div>
        <p class="text-sm font-medium">${escapeHtml(control.id)}</p>
        <p class="text-xs text-slate-500">${escapeHtml(control.decision.review === 'awaiting' ? 'No file yet' : `${person(control.decision.reviewBy).name} · ${when(control.decision.reviewAt)}`)}</p>
      </div>
      ${pill(control.agreed)}
    </article>`).join('');
  pane.innerHTML = `
    ${banner()}
    <h1 class="text-2xl font-semibold tracking-tight">Review</h1>
    <p class="mt-2 max-w-2xl text-sm text-slate-500">You are ${escapeHtml(actor().name)} on the reviewer profile. Accept, reject, edit, or ask for more evidence. The person who filed the document cannot decide it.</p>
    <div class="mt-5 space-y-4">${blocks || '<p class="rounded-xl border border-line bg-white px-5 py-8 text-sm text-slate-500">Nothing is waiting for a person.</p>'}</div>
    <section class="mt-6 overflow-hidden rounded-xl border border-line bg-white">
      <h2 class="px-5 py-4 text-sm font-semibold">Already on the register</h2>
      ${compact}
    </section>`;
}

function reviewCard(control) {
  const judgement = control.judgement;
  const filer = latestFor(control.id);
  const blocked = filer && filer.uploadedBy === state.actorId;
  const editing = state.editId === control.id;
  const owners = people().map((row) => `<option value="${row.id}" ${row.id === control.ownerId ? 'selected' : ''}>${escapeHtml(row.name)}</option>`).join('');
  const statuses = Object.keys(STATUS).map((status) => `<option value="${status}" ${status === judgement.status ? 'selected' : ''}>${STATUS[status][0]}</option>`).join('');
  const proposed = control.agreed !== judgement.status
    ? `<p class="mt-3 text-sm text-slate-600">The agreed result is still ${escapeHtml(STATUS[control.agreed][0])}. The new reading is ${escapeHtml(STATUS[judgement.status][0])}, and it stays a reading until someone else verifies it.</p>`
    : '';
  return `
    <article class="rounded-xl border border-line bg-white p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(control.id)} · ${escapeHtml(judgement.quality)} evidence</p>
          <h2 class="mt-1 text-lg font-semibold">${escapeHtml(control.requirement)}</h2>
        </div>
        ${pill(judgement.status)}
      </div>
      <p class="mt-4 max-w-3xl text-sm leading-relaxed">${escapeHtml(judgement.reason)}</p>
      ${judgement.recommendation ? `<p class="mt-2 text-sm text-slate-600"><span class="font-medium text-ink">Suggested action. </span>${escapeHtml(judgement.recommendation)}</p>` : ''}
      ${proposed}
      ${sourceTrail(judgement)}
      <p class="mt-4 text-xs text-slate-500">Status is calculated from the file, the version, and whether a current review record is on file.</p>
      ${blocked ? `<p class="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm">${escapeHtml(actor().name)} filed ${escapeHtml(filer.name)}. Reviewer permission does not allow a decision on that submission. ${escapeHtml(person(control.reviewerId).name)} can decide it.</p>` : `
      <form data-decision="${control.id}" class="mt-4">
        <label class="block text-sm font-medium">Note for the history
          <textarea name="comment" rows="2" class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal" placeholder="Disagree and edit need a reason"></textarea>
        </label>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="submit" name="decision" value="agree" class="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">Accept</button>
          <button type="submit" name="decision" value="disagree" class="rounded-lg border border-line px-3 py-2 text-sm font-medium">Reject</button>
          <button type="submit" name="decision" value="request" class="rounded-lg border border-line px-3 py-2 text-sm font-medium">Request more evidence</button>
          <button type="button" data-edit="${control.id}" class="rounded-lg border border-line px-3 py-2 text-sm font-medium">Edit</button>
        </div>
      </form>`}
      ${editing && !blocked ? `
        <form data-edit-form="${control.id}" class="mt-4 grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2">
          <label class="text-sm font-medium">Result<select name="status" class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal">${statuses}</select></label>
          <label class="text-sm font-medium">Owner<select name="ownerId" class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal">${owners}</select></label>
          <label class="text-sm font-medium sm:col-span-2">Reason<textarea name="comment" required rows="2" class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal" placeholder="Why you are changing this"></textarea></label>
          <div class="sm:col-span-2"><button type="submit" class="rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white">Save the edit</button></div>
        </form>` : ''}
    </article>`;
}

function renderTickets() {
  const rows = tickets().filter((ticket) => state.profile !== 'uploader' || ticket.ownerId === state.actorId);
  const open = rows.find((ticket) => ticket.id === state.ticketId) || rows[0];
  if (open && !state.ticketId) state.ticketId = open.id;
  const list = rows.map((ticket) => `
    <button type="button" data-ticket="${ticket.id}" class="block w-full border-t border-line px-4 py-3 text-left ${ticket.id === open?.id ? 'bg-[#F4F8FE]' : 'hover:bg-[#FAFBFC]'}">
      <span class="flex items-center justify-between gap-2"><span class="text-sm font-medium">${escapeHtml(ticket.id)}</span><span class="text-xs text-slate-500">${escapeHtml(TICKET[ticket.status] || ticket.status)}</span></span>
      <span class="mt-1 block text-sm text-slate-600">${escapeHtml(ticket.title)}</span>
    </button>`).join('');
  pane.innerHTML = `
    ${banner()}
    <h1 class="text-2xl font-semibold tracking-tight">Tickets</h1>
    <p class="mt-2 max-w-2xl text-sm text-slate-500">A gap stays open until a different person has verified the new file. Clicking resolved is not enough.</p>
    <div class="mt-5 grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div class="overflow-hidden rounded-xl border border-line bg-white">${list || '<p class="px-4 py-6 text-sm text-slate-500">No tickets match.</p>'}</div>
      <div>${open ? ticketDetail(open) : ''}</div>
    </div>`;
}

function ticketDetail(ticket) {
  const control = controlById(ticket.controlId);
  const mine = ticket.ownerId === state.actorId;
  const canFile = mine && ['assigned', 'in_progress', 'reopened'].includes(ticket.status);
  const canVerify = state.profile === 'reviewer' && ticket.status === 'verification' && ticket.submittedBy !== state.actorId && holds(actor(), 'reviewer');
  const blockedVerify = ticket.status === 'verification' && ticket.submittedBy === state.actorId;
  const steps = ['assigned', 'verification', 'resolved'];
  const at = ticket.status === 'reopened' || ticket.status === 'in_progress' ? 'assigned' : ticket.status;
  const trail = steps.map((step) => {
    const on = steps.indexOf(step) <= steps.indexOf(at);
    return `<li class="text-xs font-medium ${on ? 'text-navy' : 'text-slate-400'}">${escapeHtml(TICKET[step] || step)}</li>`;
  }).join('<li class="text-slate-300">→</li>');
  return `
    <article class="rounded-xl border border-line bg-white p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs text-slate-500">${escapeHtml(ticket.id)} · ${escapeHtml(ticket.controlId)} · ${escapeHtml(ticket.priority)}</p>
          <h2 class="mt-1 text-lg font-semibold">${escapeHtml(ticket.title)}</h2>
        </div>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">${escapeHtml(TICKET[ticket.status] || ticket.status)}</span>
      </div>
      <ol class="mt-4 flex flex-wrap items-center gap-2">${trail}</ol>
      <dl class="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt class="text-xs text-slate-500">Problem</dt><dd class="mt-1 leading-relaxed">${escapeHtml(ticket.problem)}</dd></div>
        <div><dt class="text-xs text-slate-500">What to file</dt><dd class="mt-1 leading-relaxed">${escapeHtml(ticket.action)}</dd></div>
        <div><dt class="text-xs text-slate-500">Assigned to</dt><dd class="mt-1">${avatar(ticket.ownerId)}</dd></div>
        <div><dt class="text-xs text-slate-500">Due</dt><dd class="mt-1 font-medium">${escapeHtml(when(ticket.due))}</dd></div>
      </dl>
      ${control ? `<p class="mt-4 text-sm text-slate-600">Agreed result on ${escapeHtml(control.id)}: ${escapeHtml(STATUS[control.agreed][0])}. Reading from the files: ${escapeHtml(STATUS[control.judgement.status][0])}.</p>` : ''}
      <div class="mt-5">
        ${canFile && state.profile === 'uploader' ? `<button type="button" data-fix="${ticket.id}" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">File the missing record</button>` : ''}
        ${canFile && state.profile !== 'uploader' ? `<p class="text-sm text-slate-500">${escapeHtml(person(ticket.ownerId).name)} files this from the user view.</p>` : ''}
        ${!mine && ['assigned', 'in_progress', 'reopened'].includes(ticket.status) ? `<p class="text-sm text-slate-500">${escapeHtml(person(ticket.ownerId).name)} files the next document. You can verify it after that.</p>` : ''}
        ${canVerify ? `
          <form data-verify-form="${ticket.id}" class="grid gap-3">
            <label class="text-sm font-medium">Note for the history
              <textarea name="comment" rows="2" class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal" placeholder="Required if you send it back"></textarea>
            </label>
            <div class="flex flex-wrap gap-2">
              <button type="submit" name="decision" value="accept" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Verify and close</button>
              <button type="submit" name="decision" value="reject" class="rounded-lg border border-line px-3.5 py-2 text-sm font-medium">Send it back</button>
            </div>
          </form>` : ''}
        ${blockedVerify ? `<p class="text-sm text-slate-600">You filed this fix, so you cannot verify it. Switch to ${escapeHtml(person(control?.reviewerId).name)}.</p>` : ''}
        ${ticket.status === 'resolved' ? `<p class="text-sm text-slate-600">Closed. The history still has every step.</p>` : ''}
      </div>
    </article>`;
}

function renderHistory() {
  const rows = (ws().history || []).filter((row) => matches(`${row.text} ${person(row.actorId).name}`));
  const list = rows.map((row) => `
    <li class="grid gap-1 border-t border-line py-4 sm:grid-cols-[12rem_1fr]">
      <span class="text-xs text-slate-500">${escapeHtml(whenTime(row.at))}</span>
      <span class="text-sm leading-relaxed"><span class="font-medium">${escapeHtml(person(row.actorId).name)}. </span>${escapeHtml(row.text)}</span>
    </li>`).join('');
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">History</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-500">Each line is added. Nothing on this page rewrites an earlier line.</p>
      </div>
    </div>
    <ul class="mt-5 rounded-xl border border-line bg-white px-5">${list || '<li class="py-6 text-sm text-slate-500">Nothing matches.</li>'}</ul>`;
}

function renderPeople() {
  const pending = pendingInvites().map((row) => `
    <tr class="border-t border-line align-top">
      <td class="px-5 py-3 text-sm font-medium">${escapeHtml(row.name || row.email)}<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(row.email)}</span></td>
      <td class="px-5 py-3 text-sm">${escapeHtml(row.unit || 'Not set')}</td>
      <td class="px-5 py-3 text-sm">${profileLabel(row.profile)}</td>
      <td class="px-5 py-3">${accountPill('Pending')}</td>
    </tr>`).join('');
  const active = people().map((row) => {
    const toggles = ['uploader', 'reviewer', 'admin'].map((role) => {
      const on = holds(row, role);
      return `<button type="button" data-toggle-role="${role}" data-person="${row.id}" class="rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-navy text-white' : 'border border-line text-slate-500'}">${role}</button>`;
    }).join('');
    return `
      <tr class="border-t border-line align-top">
        <td class="px-5 py-3 text-sm font-medium">${escapeHtml(row.name)}<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(row.role)}${row.email ? ` · ${escapeHtml(row.email)}` : ''}</span></td>
        <td class="px-5 py-3 text-sm">${escapeHtml(row.unit)}</td>
        <td class="px-5 py-3"><div class="flex flex-wrap gap-1">${toggles}</div></td>
        <td class="px-5 py-3">${accountPill('Active')}</td>
      </tr>`;
  }).join('');
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Admin</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">People</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-500">A person stays Pending until they create an account from their link. After they sign up, they are Active. Admin, user, and reviewer are permissions. The same person can hold more than one, and still cannot approve a file they uploaded.</p>
      </div>
    </div>
    <div class="mt-5 overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3 font-medium">Person</th><th class="px-5 py-3 font-medium">Department</th><th class="px-5 py-3 font-medium">Profiles</th><th class="px-5 py-3 font-medium">Account</th></tr></thead>
        <tbody>${pending + active || '<tr><td colspan="4" class="px-5 py-8 text-sm text-slate-500">Nobody has been added yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

const PAGES = {
  dashboard: renderDashboard,
  organisation: renderOrganisation,
  people: renderPeople,
  controls: renderControls,
  evidence: renderEvidence,
  review: renderReview,
  tickets: renderTickets,
  history: renderHistory,
};

function navButton(id, label, glyph, mobile) {
  const on = state.page === id;
  if (mobile) {
    return `<button type="button" data-page="${id}" class="whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${on ? 'bg-navy text-white' : 'text-slate-600'}">${label}</button>`;
  }
  const ticketCount = (ws()?.tickets || []).filter((ticket) => ticket.status !== 'resolved' && (state.profile !== 'uploader' || ticket.ownerId === state.actorId)).length;
  const badge = id === 'review' ? waitingReviews().length : id === 'tickets' ? ticketCount : 0;
  return `<button type="button" data-page="${id}" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${on ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}">${glyph}<span class="flex-1">${label}</span>${badge ? `<span class="rounded-full bg-white/15 px-1.5 text-[11px]">${badge}</span>` : ''}</button>`;
}

function personOptions(rows) {
  return rows.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join('');
}

function paintChrome() {
  const data = ws();
  state.profile = pathProfile() || state.profile;
  if (!navItems().some(([id]) => id === state.page)) state.page = 'dashboard';
  const viewName = VIEW_NAME[state.profile] || 'User';
  document.getElementById('view-label').textContent = viewName;
  document.getElementById('view-label-mobile').textContent = viewName;
  document.getElementById('profile-note').textContent = PROFILE_NOTE[state.profile] || '';
  document.getElementById('signed-name').textContent = actor().name;
  document.getElementById('side-nav').innerHTML = navItems().map(([id, label, glyph]) => navButton(id, label, glyph, false)).join('');
  document.getElementById('mobile-nav').innerHTML = navItems().map(([id, label]) => navButton(id, label, '', true)).join('');
  const evidenceSelect = document.querySelector('#evidence-form select[name="controlId"]');
  const ownerSelect = document.querySelector('#control-form select[name="ownerId"]');
  const reviewerSelect = document.querySelector('#control-form select[name="reviewerId"]');
  const templateOwner = document.querySelector('#template-form select[name="ownerId"]');
  const templateReviewer = document.querySelector('#template-form select[name="reviewerId"]');
  if (evidenceSelect && data) {
    evidenceSelect.innerHTML = data.controls.map((control) => `<option value="${control.id}">${escapeHtml(control.id)} · ${escapeHtml(control.expected)}</option>`).join('');
  }
  if (ownerSelect && data) ownerSelect.innerHTML = personOptions(data.people);
  if (reviewerSelect && data) reviewerSelect.innerHTML = personOptions(reviewers());
  if (templateOwner && data) templateOwner.innerHTML = personOptions(data.people);
  if (templateReviewer && data) templateReviewer.innerHTML = personOptions(reviewers());
}

function render() {
  if (!ws()) {
    pane.innerHTML = '<p class="text-sm text-slate-500">Loading the register…</p>';
    return;
  }
  paintChrome();
  (PAGES[state.page] || renderDashboard)();
}

function showGate() {
  document.getElementById('gate').classList.remove('hidden');
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('shell').classList.add('hidden');
}

function showAuth(message) {
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('shell').classList.add('hidden');
  document.getElementById('auth').classList.remove('hidden');
  const profile = pathProfile();
  const name = VIEW_NAME[profile] || 'User';
  document.getElementById('auth-kicker').textContent = name;
  document.getElementById('auth-title').textContent = state.authMode === 'signup' ? 'Create an account' : 'Sign in';
  document.getElementById('auth-copy').textContent = AUTH_COPY[profile] || '';
  document.getElementById('signup-form').hidden = state.authMode !== 'signup';
  document.getElementById('signin-form').hidden = state.authMode !== 'signin';
  document.getElementById('auth-switch').textContent = state.authMode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one';
  const error = document.getElementById('auth-error');
  error.textContent = message || '';
  error.classList.toggle('hidden', !message);
  if (state.invite) applyInvite();
  if (!message) playAuthEnter();
  startAuthMotion();
}

function applyInvite() {
  const invite = state.invite;
  if (!invite || state.authMode !== 'signup') return;
  const form = document.getElementById('signup-form');
  if (invite.profile && pathProfile() !== invite.profile) {
    form.hidden = true;
    const error = document.getElementById('auth-error');
    error.textContent = `This invitation opens ${invite.path}.`;
    error.classList.remove('hidden');
    return;
  }
  form.hidden = false;
  form.elements.name.value = invite.name || '';
  form.elements.email.value = invite.email || '';
  form.elements.email.readOnly = true;
  form.elements.inviteToken.value = invite.token || '';
  if (invite.unit) form.elements.unit.value = invite.unit;
  if (invite.job) form.elements.job.value = invite.job;
  document.getElementById('age-field').hidden = false;
  if (invite.ageRange && form.elements.ageRange) form.elements.ageRange.value = invite.ageRange;
  const box = document.getElementById('sign-draw');
  box.hidden = !invite.signatureRequired;
  if (invite.signatureRequired) bindSignPad();
  document.getElementById('auth-copy').textContent = invite.signatureRequired
    ? 'Confirm your name, job, and department, then draw your signature.'
    : 'Confirm your name, job, and department.';
}

function bindSignPad() {
  const canvas = document.getElementById('sign-pad');
  if (!canvas || canvas.dataset.bound) return;
  canvas.dataset.bound = '1';
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#071E36';
  let drawing = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  canvas.addEventListener('pointerdown', (event) => {
    drawing = true;
    const at = point(event);
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const at = point(event);
    ctx.lineTo(at.x, at.y);
    ctx.stroke();
  });
  canvas.addEventListener('pointerup', () => { drawing = false; });
  canvas.addEventListener('pointerleave', () => { drawing = false; });
  document.getElementById('sign-clear').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}

function signatureImage() {
  const box = document.getElementById('sign-draw');
  const canvas = document.getElementById('sign-pad');
  if (!box || box.hidden || !canvas) return '';
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 0) {
      ink = true;
      break;
    }
  }
  return ink ? canvas.toDataURL('image/png') : '';
}

let authMotion = 0;

function playAuthEnter() {
  const panel = document.getElementById('auth-panel');
  if (!panel) return;
  panel.classList.remove('auth-enter');
  void panel.offsetWidth;
  panel.classList.add('auth-enter');
}

function startAuthMotion() {
  if (authMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const auth = document.getElementById('auth');
  const blue = document.getElementById('blob-blue');
  const purple = document.getElementById('blob-purple');
  if (!auth || !blue || !purple) return;
  const started = performance.now();
  function frame(now) {
    if (auth.classList.contains('hidden')) {
      authMotion = 0;
      return;
    }
    const t = (now - started) / 1000;
    blue.style.transform = `translate3d(${Math.sin(t * 0.45) * 26}px, ${Math.cos(t * 0.32) * 18}px, 0)`;
    purple.style.transform = `translate3d(${Math.cos(t * 0.36) * 22}px, ${Math.sin(t * 0.28) * 20}px, 0)`;
    blue.style.opacity = String(0.62 + Math.sin(t * 0.5) * 0.16);
    purple.style.opacity = String(0.58 + Math.cos(t * 0.42) * 0.16);
    authMotion = requestAnimationFrame(frame);
  }
  authMotion = requestAnimationFrame(frame);
}

function showApp() {
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('shell').classList.remove('hidden');
  render();
}

async function load() {
  if (!pathProfile()) {
    showGate();
    return;
  }
  state.profile = pathProfile();
  if (!token()) {
    const inviteToken = new URLSearchParams(location.search).get('invite');
    if (inviteToken) {
      const response = await fetch(`/api/auth/invite?token=${encodeURIComponent(inviteToken)}`);
      const data = await response.json().catch(() => ({}));
      state.authMode = 'signup';
      if (!response.ok) {
        showAuth(data.error || 'That invitation is not open.');
        return;
      }
      state.invite = { ...data.invite, token: inviteToken };
      showAuth();
      applyInvite();
      return;
    }
    showAuth();
    return;
  }
  const response = await fetch('/api/loop', { headers: { Authorization: `Bearer ${token()}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    sessionStorage.removeItem(sessionKey());
    showAuth(data.error || 'Sign in to continue.');
    return;
  }
  state.actorId = data.actorId;
  state.workspace = data.workspace;
  showApp();
}

async function post(url, body) {
  state.error = '';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem(sessionKey());
    showAuth(data.error || 'Sign in to continue.');
    return;
  }
  if (!response.ok) {
    state.error = data.error || 'That did not save.';
    state.flash = '';
    render();
    return;
  }
  state.workspace = data.workspace;
  state.flash = data.flash || '';
  if (data.open?.page) state.page = data.open.page;
  if (data.open && Object.prototype.hasOwnProperty.call(data.open, 'ticketId')) state.ticketId = data.open.ticketId || '';
  render();
}

document.getElementById('side-nav').addEventListener('click', onNav);
document.getElementById('mobile-nav').addEventListener('click', onNav);

function onNav(event) {
  const button = event.target.closest('[data-page]');
  if (!button) return;
  state.page = button.dataset.page;
  state.flash = '';
  state.error = '';
  render();
}

search.addEventListener('input', () => {
  state.query = search.value;
  render();
});

function drawingOn() {
  return document.querySelector('[data-pen-draft="page"]')?.dataset.penOn === '1';
}

pane.addEventListener('click', (event) => {
  const draft = event.target.closest('[data-pen-draft]');
  if (draft) {
    const on = draft.dataset.penOn !== '1';
    draft.dataset.penOn = on ? '1' : '0';
    draft.setAttribute('aria-pressed', on ? 'true' : 'false');
    draft.setAttribute('aria-label', on ? 'Drawing is on for this person' : 'Drawing is off for this person');
    draft.classList.toggle('ring-2', on);
    draft.classList.toggle('ring-brand', on);
    draft.classList.toggle('ring-offset-2', on);
    return;
  }
  const pen = event.target.closest('[data-pen]');
  if (pen) {
    post('/api/loop/invite-pen', { invitationId: pen.dataset.pen, signatureRequired: pen.dataset.penOn !== '1' });
    return;
  }
  const copy = event.target.closest('[data-copy-link]');
  if (copy) {
    const href = `${location.origin}${copy.dataset.copyLink}`;
    navigator.clipboard.writeText(href).then(() => {
      state.flash = 'Link copied. Paste it into the email as the button that opens their page.';
      state.error = '';
      render();
    }).catch(() => {
      state.error = href;
      state.flash = '';
      render();
    });
    return;
  }
  const go = event.target.closest('[data-go]');
  if (go) {
    state.page = go.dataset.go;
    state.flash = '';
    render();
    return;
  }
  const evidence = event.target.closest('[data-evidence]');
  if (evidence) {
    state.evidenceId = state.evidenceId === evidence.dataset.evidence ? '' : evidence.dataset.evidence;
    render();
    return;
  }
  const ticket = event.target.closest('[data-ticket]');
  if (ticket && !ticket.dataset.verify) {
    state.ticketId = ticket.dataset.ticket;
    render();
    return;
  }
  const edit = event.target.closest('[data-edit]');
  if (edit) {
    state.editId = state.editId === edit.dataset.edit ? '' : edit.dataset.edit;
    render();
    return;
  }
  const fix = event.target.closest('[data-fix]');
  if (fix) {
    post('/api/loop/fix', { ticketId: fix.dataset.fix });
    return;
  }
  const toggle = event.target.closest('[data-toggle-role]');
  if (toggle) {
    const row = people().find((personRow) => personRow.id === toggle.dataset.person);
    if (!row) return;
    const next = new Set(row.roles || []);
    if (next.has(toggle.dataset.toggleRole)) next.delete(toggle.dataset.toggleRole);
    else next.add(toggle.dataset.toggleRole);
    post('/api/loop/roles', { personId: row.id, roles: [...next], page: state.page });
    return;
  }
  if (event.target.id === 'toggle-reminders') {
    post('/api/loop/reminders', { reminders: !ws().organisation.reminders });
  }
  if (event.target.id === 'open-evidence') document.getElementById('evidence-dialog').showModal();
  if (event.target.id === 'open-control') document.getElementById('control-dialog').showModal();
  const useTemplate = event.target.closest('[data-use-template]');
  if (useTemplate && !useTemplate.disabled) {
    const template = (ws().templates || []).find((row) => row.id === useTemplate.dataset.useTemplate);
    if (!template) return;
    document.getElementById('template-title').textContent = template.title;
    document.getElementById('template-requirement').textContent = template.requirement;
    document.querySelector('#template-form [name="templateId"]').value = template.id;
    paintChrome();
    document.getElementById('template-dialog').showModal();
  }
});

pane.addEventListener('submit', (event) => {
  const editForm = event.target.closest('[data-edit-form]');
  if (editForm) {
    event.preventDefault();
    const data = new FormData(editForm);
    post('/api/loop/review', {
      controlId: editForm.dataset.editForm,
      decision: 'edit',
      status: data.get('status'),
      ownerId: data.get('ownerId'),
      comment: data.get('comment'),
    });
    return;
  }
  const decisionForm = event.target.closest('[data-decision]');
  if (decisionForm) {
    event.preventDefault();
    const data = new FormData(decisionForm);
    post('/api/loop/review', {
      controlId: decisionForm.dataset.decision,
      decision: event.submitter?.value || 'agree',
      comment: data.get('comment'),
    });
    return;
  }
  const verifyForm = event.target.closest('[data-verify-form]');
  if (verifyForm) {
    event.preventDefault();
    const data = new FormData(verifyForm);
    post('/api/loop/verify', {
      ticketId: verifyForm.dataset.verifyForm,
      decision: event.submitter?.value || 'accept',
      comment: data.get('comment'),
    });
    return;
  }
  if (event.target.id === 'org-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    post('/api/loop/organisation', {
      name: data.get('name'),
      legalName: data.get('legalName'),
      industry: data.get('industry'),
      country: data.get('country'),
      locations: data.get('locations'),
      website: data.get('website'),
      size: data.get('size'),
      description: data.get('description'),
      contactName: data.get('contactName'),
      emailDomain: data.get('emailDomain'),
    });
    return;
  }
  if (event.target.id === 'unit-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    post('/api/loop/units', { name: data.get('name'), parentId: data.get('parentId') });
    return;
  }
  if (event.target.id === 'system-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    post('/api/loop/systems', { name: data.get('name') });
    return;
  }
  if (event.target.id === 'placement-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    post('/api/loop/placement', {
      personId: data.get('personId'),
      job: data.get('job'),
      unit: data.get('unit'),
      managerId: data.get('managerId'),
      employmentType: data.get('employmentType'),
    });
    return;
  }
  const ackForm = event.target.closest('[data-ack-form]');
  if (ackForm) {
    event.preventDefault();
    const data = new FormData(ackForm);
    post('/api/loop/acknowledge', { acknowledgementId: ackForm.dataset.ackForm, signature: data.get('signature') });
    return;
  }
  if (event.target.id === 'invite-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    post('/api/loop/invite', {
      name: data.get('name'),
      email: data.get('email'),
      profile: data.get('profile'),
      ageRange: data.get('ageRange'),
      unit: data.get('unit'),
      signatureRequired: drawingOn(),
    });
    return;
  }
  if (event.target.id === 'excel-form') {
    event.preventDefault();
    const file = event.target.file?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      post('/api/loop/people-import', { file: String(reader.result || '').split(',')[1] || '', filename: file.name, signatureRequired: drawingOn() });
    };
    reader.readAsDataURL(file);
    return;
  }
});

pane.addEventListener('change', (event) => {
  if (event.target.id === 'place-person') {
    const row = person(event.target.value);
    const form = event.target.form;
    if (form.elements.job) form.elements.job.value = row.title || row.role || '';
    if (form.elements.unit) form.elements.unit.value = row.unit || '';
    if (form.elements.employmentType) form.elements.employmentType.value = row.employmentType || 'employee';
    const manager = form.elements.managerId;
    if (manager) {
      manager.innerHTML = `<option value="">Nobody</option>${people().filter((item) => item.id !== row.id).map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}`;
      manager.value = row.managerId && row.managerId !== row.id ? row.managerId : '';
    }
    return;
  }
  const select = event.target.closest('[data-assign-reviewer]');
  if (!select) return;
  post('/api/loop/reviewer', { controlId: select.dataset.assignReviewer, reviewerId: select.value });
});

document.getElementById('evidence-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  document.getElementById('evidence-dialog').close();
  post('/api/loop/evidence', { name: data.get('name'), controlId: data.get('controlId'), note: data.get('note') });
  event.target.reset();
});

document.getElementById('person-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  document.getElementById('person-dialog').close();
  post('/api/loop/people', {
    name: data.get('name'),
    job: data.get('job'),
    unit: data.get('unit'),
    roles: data.getAll('roles'),
  });
  event.target.reset();
});

document.getElementById('control-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  document.getElementById('control-dialog').close();
  post('/api/loop/controls', {
    requirement: data.get('requirement'),
    expected: data.get('expected'),
    frequency: data.get('frequency'),
    ownerId: data.get('ownerId'),
    reviewerId: data.get('reviewerId'),
  });
  event.target.reset();
});

async function authenticate(url, form) {
  if (url.endsWith('/signup') && state.invite?.signatureRequired && !signatureImage()) {
    showAuth('Draw your signature in the box.');
    return;
  }
  const data = new FormData(form);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: pathProfile(),
      name: data.get('name'),
      email: data.get('email'),
      password: data.get('password'),
      job: data.get('job'),
      unit: data.get('unit'),
      ageRange: data.get('ageRange'),
      inviteToken: data.get('inviteToken'),
      drawnSignature: signatureImage(),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showAuth(payload.error || 'That did not save.');
    return;
  }
  sessionStorage.setItem(sessionKey(), payload.token);
  state.actorId = payload.actorId;
  state.workspace = payload.workspace;
  state.flash = payload.flash || '';
  state.error = '';
  state.page = 'dashboard';
  showApp();
}

document.getElementById('signup-form').addEventListener('submit', (event) => {
  event.preventDefault();
  authenticate('/api/auth/signup', event.target);
});

document.getElementById('signin-form').addEventListener('submit', (event) => {
  event.preventDefault();
  authenticate('/api/auth/login', event.target);
});

document.getElementById('auth-switch').addEventListener('click', () => {
  state.authMode = state.authMode === 'signup' ? 'signin' : 'signup';
  showAuth();
});

document.getElementById('sign-out').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token()}` } });
  sessionStorage.removeItem(sessionKey());
  state.workspace = null;
  state.actorId = '';
  state.flash = '';
  state.error = '';
  showAuth();
});

document.getElementById('template-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  document.getElementById('template-dialog').close();
  post('/api/loop/templates', {
    templateId: data.get('templateId'),
    ownerId: data.get('ownerId'),
    reviewerId: data.get('reviewerId'),
  });
});

document.body.addEventListener('click', (event) => {
  const closer = event.target.closest('[data-close]');
  if (!closer) return;
  document.getElementById(closer.dataset.close).close();
});

load();
