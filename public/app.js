const FROM_PATH = { '/user': 'uploader', '/reviewer': 'reviewer', '/admin': 'admin' };
const VIEW_NAME = { uploader: 'User', reviewer: 'Reviewer', admin: 'Admin' };
const DEFAULT_ACTOR = { uploader: 'syntiche', reviewer: 'ayakwa', admin: 'ayakwa' };
const PROFILE_NOTE = {
  uploader: 'Files evidence and works the tickets assigned to them.',
  reviewer: 'Decides the finding. Cannot decide a file they uploaded.',
  admin: 'Sets up the organisation, people, and controls.',
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
  actorId: sessionStorage.getItem(`actor:${currentPath()}`) || DEFAULT_ACTOR[pathProfile()] || 'ayakwa',
  profile: pathProfile() || 'uploader',
};

const pane = document.getElementById('pane');
const actorSelect = document.getElementById('actor');
const search = document.getElementById('q');

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

function eligiblePeople() {
  return people().filter((row) => holds(row, state.profile));
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
  const tone = id === 'ayakwa' ? 'bg-[#E7EEF8] text-navy' : 'bg-slate-100 text-slate-700';
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
  const ticket = (ws()?.tickets || []).find((row) => row.controlId === control.id && row.id === 'T-0037')
    || (ws()?.tickets || []).find((row) => row.controlId === control.id);
  const labels = ['Organisation', 'Control', 'Evidence', 'Assessment', 'Review', 'Ticket', 'Verified'];
  let current = 4;
  if (ticket && ['assigned', 'in_progress', 'reopened'].includes(ticket.status)) current = 5;
  if (ticket && ticket.status === 'verification') current = 6;
  if (ticket && ticket.status === 'resolved') current = 7;
  if (!ticket && control.decision?.review === 'awaiting') current = 4;
  return `<ol class="mt-4 flex flex-wrap gap-2">${labels
    .map((label, index) => {
      const done = index < current;
      const now = index === current;
      const tone = now ? 'bg-navy text-white' : done ? 'bg-[#E7EEF8] text-navy' : 'bg-slate-100 text-slate-400';
      return `<li class="rounded-full px-2.5 py-1 text-xs font-medium ${tone}">${index + 1} ${label}</li>`;
    })
    .join('')}</ol>`;
}

function renderDashboard() {
  if (state.profile === 'uploader') return renderUploaderHome();
  if (state.profile === 'admin') return renderAdminHome();
  const all = ws().controls;
  const counts = ['MET', 'PARTIAL', 'NOT MET', 'NO EVIDENCE'].map((status) => [status, all.filter((control) => control.agreed === status).length]);
  const withFile = all.filter((control) => control.evidenceIds.length).length;
  const focus = controlById('CTRL-0012') || all[0];
  const stats = counts
    .map(
      ([status, count]) => `
        <div class="px-5 py-4">
          <p class="text-2xl font-semibold tracking-tight">${count}</p>
          <div class="mt-2">${pill(status)}</div>
        </div>`
    )
    .join('');
  const activity = ws().history.slice(0, 5).map((row) => `
    <li class="grid gap-1 border-t border-line py-3 sm:grid-cols-[11rem_1fr]">
      <span class="text-xs text-slate-500">${escapeHtml(whenTime(row.at))}</span>
      <span class="text-sm"><span class="font-medium">${escapeHtml(person(row.actorId).name)}. </span>${escapeHtml(row.text)}</span>
    </li>`).join('');
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(ws().organisation.framework)}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">${escapeHtml(ws().organisation.name)}</h1>
      </div>
      <p class="text-sm text-slate-500">${withFile} of ${all.length} controls have a file</p>
    </div>
    <div class="mt-5 grid overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">${stats}</div>
    <div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section class="rounded-xl border border-line bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">The loop to walk</p>
        <h2 class="mt-2 text-lg font-semibold">${escapeHtml(focus.id)} · ${escapeHtml(focus.expected)}</h2>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">${escapeHtml(focus.requirement)}</p>
        <div class="mt-3 flex flex-wrap items-center gap-2">${pill(focus.agreed)}${focus.agreed !== focus.judgement.status ? `<span class="text-xs text-slate-500">Reading now: ${escapeHtml(STATUS[focus.judgement.status][0])}, waiting for a person</span>` : ''}</div>
        ${storySteps(focus)}
        <button type="button" data-go="review" class="mt-5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Open the review</button>
      </section>
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
      <ul>${activity}</ul>
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

function renderAdminHome() {
  const org = ws().organisation;
  const rows = people().map((row) => `<li class="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3"><span class="text-sm font-medium">${escapeHtml(row.name)}</span><span class="text-xs text-slate-500">${roleChips(row)}</span></li>`).join('');
  pane.innerHTML = `
    ${banner()}
    <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Admin</p>
    <h1 class="mt-1 text-2xl font-semibold tracking-tight">${escapeHtml(org.name)}</h1>
    <p class="mt-2 max-w-2xl text-sm text-slate-500">This profile configures the organisation. It does not assess evidence and it does not approve a file.</p>
    <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${fact('Framework', org.framework)}
      ${fact('Departments', org.units.join(', '))}
      ${fact('People', String(people().length))}
      ${fact('Reminders', org.reminders ? 'On' : 'Off')}
    </div>
    <section class="mt-5 rounded-xl border border-line bg-white px-5">
      <h2 class="py-4 text-sm font-semibold">Who holds which profile</h2>
      <ul>${rows}</ul>
    </section>
    <div class="mt-5 flex flex-wrap gap-2">
      <button type="button" data-go="people" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">People and profiles</button>
      <button type="button" data-go="organisation" class="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium">Departments</button>
    </div>`;
}

function roleChips(row) {
  return (row.roles || []).map((role) => `<span class="mr-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 capitalize">${escapeHtml(role)}</span>`).join('');
}

function renderOrganisation() {
  const org = ws().organisation;
  const focus = controlById('CTRL-0012');
  const filer = latestFor(focus.id);
  const rows = people().map((row) => `
    <tr class="border-t border-line">
      <td class="px-5 py-3">${avatar(row.id)}</td>
      <td class="px-5 py-3 text-sm">${escapeHtml(row.role)}</td>
      <td class="px-5 py-3 text-sm text-slate-600">${escapeHtml(row.unit)}</td>
      <td class="px-5 py-3 text-sm">${roleChips(row)}</td>
    </tr>`).join('');
  const chain = focus
    ? `<div class="grid gap-3 sm:grid-cols-4">
        ${chainCell('Control', focus.id, focus.expected)}
        ${chainCell('Accountable', person(focus.ownerId).name, person(focus.ownerId).role)}
        ${chainCell('Filed the evidence', filer ? person(filer.uploadedBy).name : 'Nobody yet', filer ? filer.name : 'No file')}
        ${chainCell('Reviews it', person(focus.reviewerId).name, 'Cannot be the person who filed it')}
      </div>`
    : '';
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(org.id)}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">Organisation</h1>
      </div>
      <button type="button" id="toggle-reminders" class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">${org.reminders ? 'Turn reminders off' : 'Turn reminders on'}</button>
    </div>
    <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      ${fact('Legal name', org.legalName)}
      ${fact('Country', org.country)}
      ${fact('Industry', org.industry)}
      ${fact('Framework', org.framework)}
    </div>
    <p class="mt-3 text-sm text-slate-500">${org.reminders ? 'Reminders are on for this organisation. This demo stores the choice and does not send email.' : 'Reminders are off.'}</p>
    <form id="unit-form" class="mt-4 flex flex-wrap items-end gap-2">
      <label class="text-sm font-medium">Department
        <input name="name" required maxlength="80" placeholder="Security" class="mt-1 block rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" />
      </label>
      <button type="submit" class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">Add department</button>
    </form>
    <h2 class="mb-3 mt-8 text-sm font-semibold">How CTRL-0012 is staffed</h2>
    ${chain}
    <p class="mt-3 text-sm text-slate-500">The person who files a document cannot agree their own finding. That rule uses these relationships.</p>
    <div class="mt-6 overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3 font-medium">Person</th><th class="px-5 py-3 font-medium">Job</th><th class="px-5 py-3 font-medium">Department</th><th class="px-5 py-3 font-medium">Profiles</th></tr></thead>
        <tbody>${rows}</tbody>
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
        <p class="mt-2 max-w-2xl text-sm text-slate-500">These are the controls this organisation is keeping. The wording is ours. A control with no file stays at no evidence.</p>
      </div>
      ${state.profile === 'admin' ? '<button type="button" id="open-control" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Add control</button>' : ''}
    </div>
    <div class="mt-5 overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3 font-medium">Control</th><th class="px-5 py-3 font-medium">Requirement</th><th class="px-5 py-3 font-medium">Owner</th><th class="px-5 py-3 font-medium">Reviewer</th><th class="px-5 py-3 font-medium">Agreed</th><th class="px-5 py-3 font-medium">Files</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="px-5 py-8 text-sm text-slate-500">Nothing matches.</td></tr>`}</tbody>
      </table>
    </div>`;
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
        <tbody>${rows || `<tr><td colspan="6" class="px-5 py-8 text-sm text-slate-500">Nothing matches.</td></tr>`}</tbody>
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
      <button type="button" id="reset-demo" class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium">Restore the demo</button>
    </div>
    <ul class="mt-5 rounded-xl border border-line bg-white px-5">${list || '<li class="py-6 text-sm text-slate-500">Nothing matches.</li>'}</ul>`;
}

function renderPeople() {
  const rows = people().map((row) => {
    const toggles = ['uploader', 'reviewer', 'admin'].map((role) => {
      const on = holds(row, role);
      return `<button type="button" data-toggle-role="${role}" data-person="${row.id}" class="rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-navy text-white' : 'border border-line text-slate-500'}">${role}</button>`;
    }).join('');
    return `
      <tr class="border-t border-line align-top">
        <td class="px-5 py-3 text-sm font-medium">${escapeHtml(row.name)}<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(row.role)}</span></td>
        <td class="px-5 py-3 text-sm">${escapeHtml(row.unit)}</td>
        <td class="px-5 py-3"><div class="flex flex-wrap gap-1">${toggles}</div></td>
      </tr>`;
  }).join('');
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Admin</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">People</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-500">Profiles are permissions on a person. Syntiche can upload the risk assessment and, on another control, review a file Ayakwa uploaded. Neither can approve their own submission.</p>
      </div>
      <button type="button" id="open-person" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Add a person</button>
    </div>
    <div class="mt-5 overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3 font-medium">Person</th><th class="px-5 py-3 font-medium">Department</th><th class="px-5 py-3 font-medium">Profiles</th></tr></thead>
        <tbody>${rows}</tbody>
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

function paintChrome() {
  const data = ws();
  state.profile = pathProfile() || state.profile;
  const eligible = eligiblePeople();
  if (eligible.length && !eligible.some((row) => row.id === state.actorId)) state.actorId = eligible[0].id;
  if (!navItems().some(([id]) => id === state.page)) state.page = 'dashboard';
  const viewName = VIEW_NAME[state.profile] || 'User';
  document.getElementById('view-label').textContent = viewName;
  document.getElementById('view-label-mobile').textContent = viewName;
  document.getElementById('profile-note').textContent = PROFILE_NOTE[state.profile] || '';
  document.getElementById('side-nav').innerHTML = navItems().map(([id, label, glyph]) => navButton(id, label, glyph, false)).join('');
  document.getElementById('mobile-nav').innerHTML = navItems().map(([id, label]) => navButton(id, label, '', true)).join('');
  actorSelect.innerHTML = eligible.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join('');
  actorSelect.value = eligible.some((row) => row.id === state.actorId) ? state.actorId : eligible[0]?.id || '';
  state.actorId = actorSelect.value;
  const evidenceSelect = document.querySelector('#evidence-form select[name="controlId"]');
  const ownerSelect = document.querySelector('#control-form select[name="ownerId"]');
  if (evidenceSelect && data) {
    evidenceSelect.innerHTML = data.controls.map((control) => `<option value="${control.id}">${escapeHtml(control.id)} · ${escapeHtml(control.expected)}</option>`).join('');
  }
  if (ownerSelect && data) {
    ownerSelect.innerHTML = data.people.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join('');
  }
}

function render() {
  if (!ws()) {
    pane.innerHTML = '<p class="text-sm text-slate-500">Loading the register…</p>';
    return;
  }
  paintChrome();
  (PAGES[state.page] || renderDashboard)();
}

async function load() {
  if (!pathProfile()) {
    document.getElementById('gate').classList.remove('hidden');
    document.getElementById('shell').classList.add('hidden');
    return;
  }
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('shell').classList.remove('hidden');
  state.profile = pathProfile();
  const response = await fetch('/api/loop');
  const data = await response.json();
  state.workspace = data.workspace;
  render();
}

async function post(url, body) {
  state.error = '';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: state.actorId, ...body }),
  });
  const data = await response.json().catch(() => ({}));
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

actorSelect.addEventListener('change', () => {
  state.actorId = actorSelect.value;
  sessionStorage.setItem(`actor:${currentPath()}`, state.actorId);
  state.flash = '';
  state.error = '';
  render();
});

search.addEventListener('input', () => {
  state.query = search.value;
  render();
});

pane.addEventListener('click', (event) => {
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
    post('/api/loop/roles', { personId: row.id, roles: [...next] });
    return;
  }
  if (event.target.id === 'toggle-reminders') {
    post('/api/loop/reminders', { reminders: !ws().organisation.reminders });
  }
  if (event.target.id === 'open-person') document.getElementById('person-dialog').showModal();
  if (event.target.id === 'open-evidence') document.getElementById('evidence-dialog').showModal();
  if (event.target.id === 'open-control') document.getElementById('control-dialog').showModal();
  if (event.target.id === 'reset-demo') post('/api/loop/reset', {});
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
  if (event.target.id === 'unit-form') {
    event.preventDefault();
    const data = new FormData(event.target);
    post('/api/loop/units', { name: data.get('name') });
    event.target.reset();
  }
});

pane.addEventListener('change', (event) => {
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
  post('/api/loop/controls', { requirement: data.get('requirement'), expected: data.get('expected'), ownerId: data.get('ownerId') });
  event.target.reset();
});

document.body.addEventListener('click', (event) => {
  const closer = event.target.closest('[data-close]');
  if (!closer) return;
  document.getElementById(closer.dataset.close).close();
});

load();
