const FROM_PATH = { '/user': 'uploader', '/reviewer': 'reviewer', '/admin': 'admin' };
const VIEW_NAME = { uploader: 'User', reviewer: 'Reviewer', admin: 'Admin' };
const AUTH_COPY = {
  uploader: 'This account starts with the user profile. It can file evidence and work tickets assigned to it.',
  reviewer: 'This account starts with the reviewer profile. It can accept, reject, or ask for more evidence.',
  admin: 'This account starts with the admin profile. It sets up the organisation, people, and requirements.',
};
const PROFILE_NOTE = {
  uploader: 'Uploads a document against an ISO/IEC 42001 requirement.',
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
    ['dashboard', 'Dashboard', icon('grid')],
    ['evidence', 'Evidence Register', icon('file')],
    ['upload', 'Upload Evidence', icon('upload')],
    ['tickets', 'Tickets', icon('ticket')],
    ['profile', 'Profile', icon('user')],
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
  evidenceTab: 'overview',
  profileTab: 'info',
  showHash: false,
  evidenceStatus: 'all',
  evidenceOwner: 'all',
  evidenceControl: 'all',
  evidencePage: 1,
  uploadStep: 1,
  editId: '',
  ackId: '',
  receiptId: '',
  reviewId: '',
  actorId: '',
  profile: pathProfile() || 'uploader',
  authMode: 'signup',
  invite: null,
  resetToken: '',
  busyAt: 0,
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
    upload: '<path d="M12 16V5"/><path d="M7 9l5-5 5 5"/><path d="M5 19h14"/>',
    user: '<circle cx="12" cy="8" r="3"/><path d="M5 19c.8-3 3.2-4.5 7-4.5s6.2 1.5 7 4.5"/>',
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

function noteCards() {
  const notes = (ws()?.notifications || []).filter((row) => !row.readAt).slice(0, 4);
  if (!notes.length) return '';
  const rows = notes.map((row) => `
    <button type="button" data-note="${escapeHtml(row.id)}" data-page="${escapeHtml(row.page || 'dashboard')}" class="block w-full border-t border-line px-5 py-3 text-left hover:bg-[#F4F8FE]">
      <span class="text-sm leading-relaxed">${escapeHtml(row.text)}</span>
      <span class="mt-1 block text-xs text-slate-500">${escapeHtml(whenTime(row.at))}</span>
    </button>`).join('');
  return `
    <section class="mb-5 overflow-hidden rounded-xl border border-line bg-white">
      <div class="flex items-center justify-between px-5 py-4">
        <h2 class="text-sm font-semibold">Sent to you</h2>
        <button type="button" id="note-read-page" class="text-xs font-medium text-brand">Mark read</button>
      </div>
      ${rows}
    </section>`;
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

function ownerAck(control) {
  const rows = (ws().acknowledgements || []).filter((row) => row.kind === 'responsibility' && row.controlId === control.id && row.personId === control.ownerId && row.status !== 'withdrawn');
  return rows.find((row) => row.status === 'required') || rows.find((row) => row.status === 'signed') || null;
}

function ackConfirm(control, ack) {
  return `
    <form data-ack-form="${escapeHtml(ack.id)}" class="rounded-xl border border-line bg-mist p-4">
      <p class="text-sm font-semibold">Responsibility assigned</p>
      <p class="mt-1 text-sm leading-relaxed text-slate-600">You are the evidence owner for ${escapeHtml(control.id)}. Please review and acknowledge this responsibility.</p>
      <p class="mt-2 text-xs text-slate-500">This confirms the responsibility. It does not approve the requirement or the evidence.</p>
      <input type="hidden" name="signature" value="${escapeHtml(actor().name)}" />
      <label class="mt-3 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" required class="mt-1" /> <span>I confirm that I have reviewed and acknowledge this responsibility.</span></label>
      <div class="mt-3 flex justify-end"><button type="submit" class="rounded-lg bg-[#1860C8] px-3.5 py-2 text-sm font-medium text-white">Acknowledge responsibility</button></div>
    </form>`;
}

function responsibilityTable(list, canAct) {
  const rows = list.map((control) => {
    const ack = ownerAck(control);
    const pending = !ack || ack.status !== 'signed';
    const mine = canAct && pending && ack && control.ownerId === state.actorId;
    const mark = pending
      ? '<span class="font-medium text-amber-800">Pending</span>'
      : '<span class="font-medium text-emerald-800">Acknowledged</span>';
    const action = mine
      ? `<button type="button" data-ack-open="${escapeHtml(ack.id)}" class="ml-3 text-sm font-medium text-[#1860C8]">Acknowledge responsibility</button>`
      : '';
    const open = mine && state.ackId === ack.id;
    return `
      <tr class="border-t border-line align-top">
        <td class="px-4 py-3 text-sm font-medium">${escapeHtml(control.id)}<span class="mt-1 block text-xs font-normal text-slate-500">${escapeHtml(control.expected || control.requirement || '')}</span></td>
        <td class="px-4 py-3 text-sm">${escapeHtml(person(control.ownerId).name)}</td>
        <td class="px-4 py-3 text-sm">${escapeHtml(person(control.reviewerId).name)}</td>
        <td class="px-4 py-3 text-sm">${mark}${action}</td>
      </tr>
      ${open ? `<tr class="border-t border-line"><td colspan="4" class="px-4 py-3">${ackConfirm(control, ack)}</td></tr>` : ''}`;
  }).join('');
  if (!rows) return '';
  return `
    <div class="mt-4 overflow-x-auto">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-4 py-2 font-medium">Requirement</th><th class="px-4 py-2 font-medium">Evidence owner</th><th class="px-4 py-2 font-medium">Reviewer</th><th class="px-4 py-2 font-medium">Owner acknowledgement</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
    ${noteCards()}
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

function controlChoice(control) {
  const text = control.requirement || control.expected || control.id;
  const short = text.length > 110 ? `${text.slice(0, 107)}…` : text;
  return `<option value="${escapeHtml(control.id)}">${escapeHtml(short)}</option>`;
}

function evidenceSources() {
  return ws()?.evidenceSources || [];
}

function assignedControls() {
  return (ws()?.controls || []).filter((control) => control.ownerId === state.actorId);
}

function uploadControlList() {
  return ws()?.controls || [];
}

function requirementLabel(control) {
  return `${control.id} · ${controlTitle(control)}`;
}

const STORAGE_LINE = 'A file from this computer is kept in a private store so the reviewer can open it. A link records where a document already lives. Drive, SharePoint, and OneDrive are not fetched.';

function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function frequencyInterval(frequency) {
  const match = String(frequency || '').match(/every\s+(\d+)\s+(day|week|month|year)s?/i);
  if (!match) return null;
  return { count: Number(match[1]), unit: match[2].toLowerCase() };
}

function reviewDueFor(control, from = new Date()) {
  const interval = frequencyInterval(control?.frequency);
  if (!interval) return '';
  const next = new Date(from);
  if (interval.unit.startsWith('day')) next.setDate(next.getDate() + interval.count);
  else if (interval.unit.startsWith('week')) next.setDate(next.getDate() + interval.count * 7);
  else if (interval.unit.startsWith('month')) next.setMonth(next.getMonth() + interval.count);
  else next.setFullYear(next.getFullYear() + interval.count);
  return localDay(next);
}

function clockText(date = new Date()) {
  return date.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function evidenceFields(controls = uploadControlList()) {
  const tiles = evidenceSources().map((source, index) => `
    <label class="er-source cursor-pointer rounded-xl px-3 py-3">
      <input type="radio" name="sourceId" value="${escapeHtml(source.id)}" ${index === 0 ? 'checked' : ''} class="sr-only" />
      <span class="block text-sm font-medium">${escapeHtml(source.name)}</span>
      <span class="mt-1 block text-xs font-normal text-slate-500">${source.connected ? 'Available now' : 'Record the place'}</span>
    </label>`).join('');
  const also = controls.length > 1
    ? `<fieldset class="mt-4"><legend class="text-sm font-medium">Also supports</legend><p class="mt-1 text-xs font-normal text-slate-500">One document can sit against more than one requirement.</p><div class="mt-2 max-h-28 space-y-1.5 overflow-y-auto">${controls.map((control) => `<label class="flex items-start gap-2 text-sm font-normal"><input type="checkbox" name="also" value="${escapeHtml(control.id)}" class="mt-1" /><span>${escapeHtml(control.id)} · ${escapeHtml(controlTitle(control))}</span></label>`).join('')}</div></fieldset>`
    : '';
  return `
    <p class="mt-5 text-sm font-medium">Where does this evidence live?</p>
    <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">${tiles}</div>
    <div data-source-file class="mt-4 rounded-xl border border-dashed border-line bg-mist px-4 py-4">
      <p class="text-sm font-medium">File from this computer</p>
      <p class="mt-1 text-xs font-normal text-slate-500">${STORAGE_LINE}</p>
      <input name="document" type="file" class="mt-3 block w-full text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#1860C8]" />
    </div>
    <div data-source-place hidden class="mt-4">
      <label class="block text-sm font-medium">Link or folder path
        <input name="location" maxlength="300" placeholder="https://drive.google.com/… or a folder path" class="mt-1 w-full rounded-lg border border-line px-3 py-2.5 font-normal outline-none focus:border-[#1860C8]" />
      </label>
      <p class="mt-1 text-xs font-normal text-slate-500">Record the link or path. The file stays in that repository.</p>
    </div>
    <label class="mt-4 block text-sm font-medium">Requirement
      <select name="controlId" required class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 font-normal outline-none">${controls.map(controlChoice).join('')}</select>
    </label>
    ${also}
    <label class="mt-4 block text-sm font-medium">Evidence title
      <input name="name" required maxlength="160" placeholder="AI risk register" class="mt-1 w-full rounded-lg border border-line px-3 py-2.5 font-normal outline-none focus:border-[#1860C8]" />
    </label>
    <div class="mt-4 rounded-xl border border-line bg-mist px-4 py-3 text-sm">
      <p class="font-medium">Date and time</p>
      <p class="mt-1 font-normal text-slate-600">Recorded automatically when you upload. <span data-recorded-at>${escapeHtml(clockText())}</span></p>
      <p class="mt-2 font-normal text-slate-600" data-review-line></p>
      <input type="hidden" name="reviewDue" value="" />
    </div>`;
}

function syncEvidenceSource(form) {
  if (!form) return;
  const source = evidenceSources().find((row) => row.id === form.elements.sourceId?.value);
  const file = form.querySelector('[data-source-file]');
  const place = form.querySelector('[data-source-place]');
  const connected = Boolean(source?.connected);
  if (file) file.hidden = !connected;
  if (place) place.hidden = connected;
  const fileInput = form.querySelector('input[name="document"]');
  const locationInput = form.querySelector('input[name="location"]');
  if (fileInput) fileInput.required = connected;
  if (locationInput) locationInput.required = !connected;
}

function syncAlso(form) {
  if (!form?.elements?.controlId) return;
  const primary = form.elements.controlId.value;
  form.querySelectorAll('input[name="also"]').forEach((box) => {
    const same = box.value === primary;
    if (same) box.checked = false;
    box.disabled = same;
    box.closest('label')?.classList.toggle('opacity-40', same);
  });
}

function nextVersion(controlId, name) {
  const title = String(name || '').trim();
  const version = (ws()?.evidence || [])
    .filter((item) => title && item.name === title && (item.controlIds || []).includes(controlId))
    .reduce((max, item) => Math.max(max, Number(item.version) || 0), 0) + 1;
  return `${version}.0`;
}

function slashDate(iso) {
  const [year, month, day] = String(iso || '').split('-');
  if (!day) return '';
  return `${day}/${month}/${year}`;
}

function syncRecorded(form) {
  if (!form) return;
  const control = controlById(form.elements.controlId?.value);
  const due = reviewDueFor(control);
  const hidden = form.elements.reviewDue;
  if (hidden) hidden.value = due;
  const stamp = form.querySelector('[data-recorded-at]');
  if (stamp) stamp.textContent = clockText();
  const line = form.querySelector('[data-review-line]');
  if (line) {
    if (due) line.textContent = `Next review ${when(due)}, from ${control.frequency}.`;
    else if (control?.frequency) line.textContent = `Next review follows the requirement: ${control.frequency}.`;
    else line.textContent = 'Next review is set from the requirement.';
  }
  const reviewDate = form.querySelector('[data-review-date]');
  if (reviewDate) reviewDate.textContent = due ? slashDate(due) : (control?.frequency || 'Follows the requirement');
  const sourceId = form.elements.sourceId?.value;
  const sourceLabel = form.querySelector('[data-source-label]');
  if (sourceLabel) sourceLabel.textContent = sourceId === 'computer' ? 'Uploaded file' : 'Approved repository';
  const version = form.querySelector('[data-version]');
  if (version) version.textContent = nextVersion(control?.id, form.elements.name?.value);
  const owner = form.querySelector('[data-party-owner]');
  const reviewer = form.querySelector('[data-party-reviewer]');
  const chosen = form.querySelector('[data-party-control]');
  if (owner) owner.textContent = control ? person(control.ownerId).name : '—';
  if (reviewer) reviewer.textContent = control ? person(control.reviewerId).name : '—';
  if (chosen) chosen.textContent = control ? requirementLabel(control) : 'Select a requirement';
}

function bindEvidenceForm(form) {
  syncEvidenceSource(form);
  syncAlso(form);
  syncRecorded(form);
}

function sourceCatalogue() {
  const rows = evidenceSources().map((source) => `
    <li class="flex items-center justify-between gap-3 border-t border-line py-2.5 text-sm">
      <span>${escapeHtml(source.name)}</span>
      <span class="text-xs font-medium ${source.connected ? 'text-emerald-800' : 'text-slate-500'}">${source.connected ? 'Available' : 'Not connected'}</span>
    </li>`).join('');
  if (!rows) return '';
  return `
    <section class="mt-5 rounded-xl border border-line bg-white px-5 pb-2 pt-4">
      <h2 class="text-sm font-semibold">Where evidence can come from</h2>
      <p class="mt-1 max-w-2xl text-sm text-slate-500">A file from this computer can be recorded now. The other places are named so someone can record where a document already lives. Those connections are not switched on.</p>
      <ul class="mt-3">${rows}</ul>
    </section>`;
}

function firstName(name) {
  return String(name || 'there').trim().split(/\s+/)[0];
}

function greeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `Good ${part}, ${firstName(actor().name)}`;
}

function ago(iso) {
  const then = new Date(iso).getTime();
  if (!then) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return when(iso);
}

function shiftDay(iso, days) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function statusDonut(counts) {
  const colors = { MET: '#059669', PARTIAL: '#D97706', 'NOT MET': '#E11D48', 'NO EVIDENCE': '#CBD5E1' };
  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  const circ = 2 * Math.PI * 42;
  let offset = 0;
  const rings = total
    ? counts.map(([status, count]) => {
      const len = (count / total) * circ;
      const ring = `<circle cx="60" cy="60" r="42" fill="none" stroke="${colors[status]}" stroke-width="14" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
      offset += len;
      return ring;
    }).join('')
    : '<circle cx="60" cy="60" r="42" fill="none" stroke="#E6EAF0" stroke-width="14"/>';
  return `<svg viewBox="0 0 120 120" class="h-36 w-36 shrink-0" role="img" aria-label="${total} requirements">${rings}<text x="60" y="56" text-anchor="middle" font-size="20" font-weight="700" fill="#121417">${total}</text><text x="60" y="72" text-anchor="middle" font-size="10" fill="#64748b">Total</text></svg>`;
}

function myTickets() {
  return (ws().tickets || []).filter((ticket) => ticket.ownerId === state.actorId && ticket.status !== 'resolved');
}

function controlTitle(control) {
  return control.expected || control.requirement || 'Requirement';
}

function dutyCards(controls) {
  return controls.map((control) => `
    <article class="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <p class="text-xs font-medium uppercase tracking-[0.14em] text-[#1860C8]">Evidence required</p>
      <h2 class="mt-2 text-base font-semibold">${escapeHtml(control.id)} — ${escapeHtml(controlTitle(control))}</h2>
      <p class="mt-2 text-sm text-slate-600">Upload a document for this requirement. The named reviewer makes the final decision.</p>
      <button type="button" data-open-evidence data-control="${escapeHtml(control.id)}" class="mt-4 rounded-lg bg-[#1860C8] px-3.5 py-2 text-sm font-medium text-white">Upload Evidence</button>
    </article>`).join('');
}

function renderUploaderHome() {
  const day = ws().today || new Date().toISOString().slice(0, 10);
  const all = ws().controls || [];
  const files = (ws().evidence || []).filter((item) => !item.rejected);
  const mine = files.filter((item) => item.uploadedBy === state.actorId);
  const pending = all.filter((control) => control.decision?.review === 'awaiting' && control.evidenceIds?.length);
  const assigned = myTickets();
  const counts = ['MET', 'PARTIAL', 'NOT MET', 'NO EVIDENCE'].map((status) => [status, all.filter((control) => control.agreed === status).length]);
  const dots = { MET: 'bg-emerald-500', PARTIAL: 'bg-amber-400', 'NOT MET': 'bg-rose-500', 'NO EVIDENCE': 'bg-slate-300' };
  const legend = counts.map(([status, count]) => {
    const share = all.length ? Math.round((count / all.length) * 100) : 0;
    return `<li class="flex items-center justify-between gap-3 text-sm"><span class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full ${dots[status]}"></span>${escapeHtml(STATUS[status][0])}</span><span class="text-slate-500">${share}% (${count})</span></li>`;
  }).join('');
  const met = counts.find(([status]) => status === 'MET')?.[1] || 0;
  const health = all.length ? Math.round((met / all.length) * 100) : 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = files.filter((item) => new Date(item.uploadedAt).getTime() >= weekAgo).length;
  const brief = (text) => {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (value.length <= 32) return value;
    const cut = value.slice(0, 32);
    const space = cut.lastIndexOf(' ');
    return `${(space > 12 ? cut.slice(0, space) : cut).trimEnd()}...`;
  };
  const activity = (ws().history || []).map((row) => `
    <li class="flex items-start gap-3 border-t border-line py-3">
      <span class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#E4EAF1] text-[#5C6E82]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
      </span>
      <p class="min-w-0 flex-1 text-sm leading-snug" title="${escapeHtml(row.text)}">${escapeHtml(brief(row.text))}</p>
      <span class="shrink-0 text-xs text-slate-400">${escapeHtml(ago(row.at))}</span>
    </li>`).join('');
  const soon = shiftDay(day, 7);
  const upcoming = [
    ...assigned.map((ticket) => ({
      title: ticket.title || ticket.id,
      meta: ticket.due && ticket.due < day ? `Overdue · ${ticket.due}` : (ticket.due ? `Due ${ticket.due}` : 'Open'),
      late: Boolean(ticket.due && ticket.due < day),
      go: 'tickets',
    })),
    ...mine.filter((item) => item.reviewDue && item.reviewDue <= soon).map((item) => ({
      title: item.name,
      meta: item.reviewDue < day ? `Review date passed · ${item.reviewDue}` : `Review ${item.reviewDue}`,
      late: item.reviewDue < day,
      go: 'evidence',
      evidence: item.id,
    })),
  ];
  const upcomingRows = upcoming.map((row) => `
    <li class="flex items-start gap-3 border-t border-line py-3">
      <span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${row.late ? 'bg-[#5C6E82]' : 'bg-[#B7C3D0]'}"></span>
      <button type="button" data-go="${row.go}" ${row.evidence ? `data-evidence-open="${escapeHtml(row.evidence)}"` : ''} class="min-w-0 flex-1 text-left text-sm">${escapeHtml(row.title)}</button>
      <span class="shrink-0 text-xs text-slate-500">${escapeHtml(row.meta)}</span>
    </li>`).join('');
  const gaps = all.filter((control) => control.agreed === 'NO EVIDENCE').length;
  const notMet = all.filter((control) => control.agreed === 'NOT MET').length;
  const expiring = mine.filter((item) => item.reviewDue && item.reviewDue <= soon).length;
  const overdue = assigned.filter((ticket) => ticket.due && ticket.due < day).length;
  const insight = (wash, icon, count, label, note) => `<article class="flex items-center gap-3 rounded-2xl px-4 py-3 ${wash}">${icon}<span><p class="text-sm font-semibold">${count} ${escapeHtml(label)}</p><p class="text-xs text-slate-500">${escapeHtml(note)}</p></span></article>`;
  pane.innerHTML = `
    ${banner()}
    ${noteCards()}
    ${all.some((control) => control.ownerId === state.actorId) ? `<section class="mb-5 rounded-2xl border border-line bg-white p-5 shadow-sm"><h2 class="text-sm font-semibold">Responsibilities</h2><p class="mt-1 max-w-2xl text-sm text-slate-500">Acknowledge a requirement only when you are the evidence owner. This does not approve the requirement or the evidence.</p>${responsibilityTable(all.filter((control) => control.ownerId === state.actorId), true)}</section>` : ''}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <article class="rounded-2xl border border-line bg-white p-4 shadow-sm"><span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#6E3EBE] text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2 2"/></svg></span><p class="mt-3 text-sm text-slate-500">Total controls</p><p class="mt-1 text-3xl font-semibold tracking-tight">${all.length}</p></article>
      <article class="rounded-2xl border border-line bg-white p-4 shadow-sm"><span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E6ECC] text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg></span><p class="mt-3 text-sm text-slate-500">Evidence submitted</p><p class="mt-1 text-3xl font-semibold tracking-tight">${files.length}</p><p class="mt-1 text-xs text-slate-400">+${thisWeek} this week</p></article>
      <article class="rounded-2xl border border-line bg-white p-4 shadow-sm"><span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#CC8618] text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v5"/></svg></span><p class="mt-3 text-sm text-slate-500">Pending review</p><p class="mt-1 text-3xl font-semibold tracking-tight">${pending.length}</p><p class="mt-1 text-xs text-slate-400">Requires action</p></article>
      <article class="rounded-2xl border border-line bg-white p-4 shadow-sm"><span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#DC4A5C] text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/></svg></span><p class="mt-3 text-sm text-slate-500">Open tickets</p><p class="mt-1 text-3xl font-semibold tracking-tight">${assigned.length}</p><p class="mt-1 text-xs text-slate-400">${overdue} overdue</p></article>
      <article class="rounded-2xl border border-line bg-white p-4 shadow-sm"><span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#15945A] text-white"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg></span><p class="mt-3 text-sm text-slate-500">Compliance health</p><p class="mt-1 text-3xl font-semibold tracking-tight">${health}%</p><div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-[#15945A]" style="width:${health}%"></div></div></article>
    </div>
    <div id="home-row" class="mt-4 grid gap-4 xl:grid-cols-3">
      <section class="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold">Control status</h2>
        <div class="mt-4 flex flex-wrap items-center gap-5">
          ${statusDonut(counts)}
          <ul class="min-w-[11rem] flex-1 space-y-2.5">${legend}</ul>
        </div>
      </section>
      <section class="flex flex-col rounded-2xl border border-line bg-white p-5 shadow-sm xl:h-0 xl:min-h-full">
        <h2 class="shrink-0 text-sm font-semibold">Recent activity</h2>
        <ul class="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain">${activity || '<li class="border-t border-line py-4 text-sm text-slate-500">Nothing has been recorded yet.</li>'}</ul>
      </section>
      <section class="flex flex-col rounded-2xl border border-line bg-white p-5 shadow-sm xl:h-0 xl:min-h-full">
        <div class="flex shrink-0 items-center justify-between"><h2 class="text-sm font-semibold">Upcoming / overdue</h2><button type="button" data-go="tickets" class="text-xs font-medium text-[#1860C8]">View all</button></div>
        <ul class="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-y-contain">${upcomingRows || '<li class="border-t border-line py-4 text-sm text-slate-500">No review date or ticket is due.</li>'}</ul>
      </section>
    </div>
    <section class="mt-4">
      <h2 class="text-sm font-semibold">Key Insights</h2>
      <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        ${insight('bg-white border border-line', '<span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E4EAF1] text-[#5C6E82]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg></span>', notMet, notMet === 1 ? 'Critical issue' : 'Critical issues', 'Requires immediate attention')}
        ${insight('bg-white border border-line', '<span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E4EAF1] text-[#5C6E82]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l2 2"/></svg></span>', expiring, 'Evidence expiring soon', 'Within 7 days')}
        ${insight('bg-white border border-line', '<span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E4EAF1] text-[#5C6E82]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg></span>', gaps, gaps === 1 ? 'Open gap' : 'Open gaps', 'Need remediation')}
        ${insight('bg-white border border-line', '<span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#E4EAF1] text-[#5C6E82]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16v12H4z"/><path d="M4 8l8 6 8-6"/></svg></span>', overdue, overdue === 1 ? 'Overdue ticket' : 'Overdue tickets', 'Action required')}
      </div>
    </section>`;
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
      return `<button type="button" data-toggle-role="${role}" data-person="${row.id}" class="rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-navy text-white' : 'border border-line text-slate-500'}">${role === 'uploader' ? 'User' : role === 'reviewer' ? 'Reviewer' : 'Admin'}</button>`;
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
  const warnings = [
    checks.missingDept.length ? `${checks.missingDept.length} ${checks.missingDept.length === 1 ? 'person has' : 'people have'} no department.` : '',
    checks.missingReviewer.length ? `${checks.missingReviewer.length} ${checks.missingReviewer.length === 1 ? 'requirement has' : 'requirements have'} no reviewer.` : '',
    checks.missingOwner.length ? `${checks.missingOwner.length} ${checks.missingOwner.length === 1 ? 'requirement has' : 'requirements have'} no evidence owner.` : '',
    !systems.length ? 'No AI system is in scope yet.' : '',
    !people().some((row) => holds(row, 'reviewer')) ? 'Nobody holds the reviewer profile yet, so a requirement cannot be added.' : '',
  ].filter(Boolean);
  pane.innerHTML = `
    ${banner()}
    ${noteCards()}
    <h1 class="text-2xl font-semibold tracking-tight">${escapeHtml(org.name || 'Establish the organisation')}</h1>
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
      <p class="mt-1 max-w-3xl text-sm text-slate-500">Adding a requirement configures the control set. It does not approve the requirement, create evidence, or ask the admin to sign. The evidence owner acknowledges the responsibility. The reviewer decides the evidence later.</p>
      ${controls().length ? responsibilityTable(controls(), false) : '<p class="mt-4 text-sm text-slate-500">No requirement is on the control set yet. Add one from the inbuilt list, or write one in this organisation’s words, and name an owner and a reviewer.</p>'}
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
  const label = { uploader: 'User', reviewer: 'Reviewer', admin: 'Admin' };
  return (row.roles || []).map((role) => `<span class="mr-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5">${escapeHtml(label[role] || role)}</span>`).join('');
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
  const acks = (ws().acknowledgements || []).filter((row) => row.kind !== 'submission' && (row.status === 'required' || row.status === 'signed'));
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
    <p class="mb-4 max-w-3xl text-sm text-slate-500">Upload an Excel file, or enter them manually. The file needs full name, email, role, and age range. Role is User or Reviewer. Age range is 18–24, 25–34, 35–44, 45–54, 55–64, or 65+. Adding someone sends them an email with the link to join. The blue pen at the top turns on a drawing when they open that link.</p>
    <div class="grid gap-4 lg:grid-cols-2">
      <form id="excel-form" class="rounded-xl border border-line bg-white p-5">
        <h3 class="text-sm font-semibold">Upload Excel</h3>
        <p class="mt-1 text-sm text-slate-500">The sheet is read and the people are added. You do not type each row.</p>
        <label class="mt-4 block text-sm font-medium">Spreadsheet
          <input name="file" type="file" accept=".xlsx,.xls,.csv" required class="mt-1 block w-full text-sm" />
        </label>
        <button type="submit" class="mt-4 inline-flex items-center justify-center rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white disabled:opacity-70">Upload file</button>
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
            <input name="unit" maxlength="80" placeholder="Optional" class="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand" />
          </label>
        </div>
        <button type="submit" class="mt-4 inline-flex items-center justify-center rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white disabled:opacity-70">Add this person</button>
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
          <button type="button" data-send-invite="${escapeHtml(row.id)}" class="inline-flex items-center justify-center rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-70">Send email</button>
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

function renderControls() {
  const reviewerCell = (control) => {
    if (state.profile !== 'admin') return `<td class="px-5 py-3 text-sm">${escapeHtml(person(control.reviewerId).name)}</td>`;
    const options = people().filter((row) => holds(row, 'reviewer')).map((row) => `<option value="${row.id}" ${row.id === control.reviewerId ? 'selected' : ''}>${escapeHtml(row.name)}</option>`).join('');
    return `<td class="px-5 py-3"><select data-assign-reviewer="${control.id}" class="rounded-lg border border-line bg-white px-2 py-1.5 text-sm">${options}</select></td>`;
  };
  const rows = controls().map((control) => `
    <tr class="border-t border-line align-top">
      <td class="whitespace-nowrap px-5 py-3 text-sm font-medium">${escapeHtml(control.id)}</td>
      <td class="px-5 py-3 text-sm">${escapeHtml(control.requirement)}<span class="mt-1 block text-xs text-slate-500">${escapeHtml(control.expected)} · ${escapeHtml(control.frequency)}</span></td>
      <td class="px-5 py-3 text-sm">${escapeHtml(person(control.ownerId).name)}</td>
      ${reviewerCell(control)}
      <td class="px-5 py-3">${pill(control.agreed)}</td>
      <td class="px-5 py-3 text-sm text-slate-600">${control.evidenceIds.length ? control.evidenceIds.length : 'None'}</td>
      ${state.profile === 'uploader' ? `<td class="px-5 py-3"><button type="button" data-open-evidence data-control="${escapeHtml(control.id)}" class="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white">Upload</button></td>` : ''}
    </tr>`).join('');
  const framework = ws().organisation?.framework || 'ISO/IEC 42001';
  const intro = state.profile === 'uploader'
    ? `These are the ${framework} requirements on this control set. Submit evidence against one of them. The named reviewer is notified and makes the final decision.`
    : 'These are the requirements this organisation is keeping. Add one from an ISO/IEC 42001 template, or write a custom requirement. A requirement with no file stays at no evidence.';
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(framework)}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">Requirements</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-500">${escapeHtml(intro)}</p>
      </div>
      ${state.profile === 'admin' ? '<button type="button" id="open-control" class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Custom requirement</button>' : ''}
    </div>
    ${renderTemplates()}
    <div class="mt-5 overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-5 py-3 font-medium">Control</th><th class="px-5 py-3 font-medium">Requirement</th><th class="px-5 py-3 font-medium">Owner</th><th class="px-5 py-3 font-medium">Reviewer</th><th class="px-5 py-3 font-medium">Agreed</th><th class="px-5 py-3 font-medium">Files</th>${state.profile === 'uploader' ? '<th class="px-5 py-3"></th>' : ''}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${state.profile === 'uploader' ? 7 : 6}" class="px-5 py-8 text-sm text-slate-500">${(ws().controls || []).length ? 'Nothing matches.' : `No ${escapeHtml(framework)} requirement is on the register yet.`}</td></tr>`}</tbody>
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

function whatNext() {
  return `
    <section class="mt-5 max-w-3xl rounded-2xl border border-line bg-white p-6 shadow-sm">
      <h2 class="text-sm font-semibold">What happens next?</h2>
      <ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
        <li>Evidence is fingerprinted and recorded.</li>
        <li>AI assesses it against the selected requirements.</li>
        <li>The authorised reviewer reviews the evidence and the AI assessment.</li>
        <li>If a gap is identified, a remediation ticket can be created.</li>
      </ol>
    </section>`;
}

function submissionAck(item) {
  return (ws()?.acknowledgements || []).find((row) => row.kind === 'submission' && String(row.statement || '').startsWith(`evidence:${item.id}`));
}

function submissionReceipt(item) {
  const primary = controlById(item.controlIds?.[0]);
  const names = [...new Set((item.controlIds || []).map((id) => controlById(id)?.reviewerId).filter(Boolean))].map((id) => person(id).name);
  const reviewer = names[0] || 'The reviewer';
  const ack = submissionAck(item);
  const signed = ack ? ack.status === 'signed' : true;
  const also = (item.controlIds || []).filter((id) => id !== primary?.id);
  const headline = signed
    ? (names.length > 1
      ? `${names.join(' and ')} have been notified. They will review this evidence and make the final decision.`
      : `${reviewer} has been notified. They will review this evidence and make the final decision.`)
    : `Draw your signature to send this to ${reviewer}. They receive it when you sign.`;
  const footer = signed
    ? `<div class="flex items-center justify-between gap-3 border-t border-line px-6 py-4">${ack?.signature?.startsWith('data:image') ? `<img src="${escapeHtml(ack.signature)}" alt="Signature" class="h-12 bg-white" />` : '<span></span>'}<button type="button" data-upload-reset class="text-sm font-medium text-[#1860C8]">Submit another</button></div>`
    : `<form id="receipt-sign-form" class="border-t border-line px-6 py-4">
        <p class="text-sm font-medium">Signature</p>
        <p class="mt-1 text-xs text-slate-500">This sends the evidence to ${escapeHtml(reviewer)}. It does not approve it.</p>
        <canvas id="receipt-pad" width="640" height="140" class="mt-3 w-full touch-none rounded-lg border border-line bg-white"></canvas>
        <div class="mt-3 flex items-center justify-between">
          <button type="button" id="receipt-clear" class="text-sm font-medium text-slate-500">Clear</button>
          <button type="submit" class="rounded-lg bg-[#071E36] px-4 py-2.5 text-sm font-medium text-white">Sign and send</button>
        </div>
      </form>`;
  return `
    <section class="mt-6 max-w-3xl overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div class="flex items-start gap-4 border-b border-[#D5E4FA] bg-[#F4F8FE] px-6 py-5">
        <span class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1860C8] text-white" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12.5l4.2 4.2L19 7.5"/></svg>
        </span>
        <div>
          <p class="text-xs font-medium uppercase tracking-[0.14em] text-[#1860C8]">${signed ? 'Evidence submitted' : 'Sign to send'}</p>
          <h2 class="mt-1 text-xl font-semibold tracking-tight">${escapeHtml(item.name)}</h2>
          <p class="mt-2 text-sm leading-relaxed text-[#163A66]">${escapeHtml(headline)}${signed ? ' The notification is in their Evidence Register queue.' : ''}</p>
        </div>
      </div>
      <dl class="grid gap-4 px-6 py-5 text-sm sm:grid-cols-2">
        <div><dt class="text-slate-500">Requirement</dt><dd class="mt-1 font-medium">${escapeHtml(primary ? requirementLabel(primary) : item.controlIds?.[0] || '—')}</dd></div>
        <div><dt class="text-slate-500">Also supports</dt><dd class="mt-1 font-medium">${escapeHtml(also.length ? also.join(', ') : 'None')}</dd></div>
        <div><dt class="text-slate-500">Submitted by</dt><dd class="mt-1 font-medium">${escapeHtml(person(item.uploadedBy).name)}</dd></div>
        <div><dt class="text-slate-500">Reviewer</dt><dd class="mt-1 font-medium">${escapeHtml(reviewer)}</dd></div>
        <div><dt class="text-slate-500">Fingerprint</dt><dd class="mt-1 font-medium">${escapeHtml(hashLine(item.hash))}</dd></div>
        <div><dt class="text-slate-500">Version</dt><dd class="mt-1 font-medium">${escapeHtml(String(item.version))}.0</dd></div>
        <div><dt class="text-slate-500">Submitted</dt><dd class="mt-1 font-medium">${escapeHtml(whenTime(item.uploadedAt))}</dd></div>
        <div><dt class="text-slate-500">Status</dt><dd class="mt-1"><span class="inline-flex rounded-full bg-[#E7EEF8] px-2.5 py-0.5 text-xs font-medium text-[#1860C8]">${signed ? 'Awaiting review' : 'Awaiting signature'}</span></dd></div>
      </dl>
      <div class="mx-6 mb-6 rounded-xl border border-line bg-mist px-4 py-4">
        <h3 class="text-sm font-semibold">What happens next</h3>
        <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
          ${signed
            ? `<li>The evidence is on record, with its fingerprint and version.</li><li>${escapeHtml(reviewer)} reviews the evidence and the assessment.</li><li>${escapeHtml(reviewer)} makes the final decision.</li>`
            : `<li>Draw your signature below.</li><li>${escapeHtml(reviewer)} is notified in Evidence Register.</li><li>${escapeHtml(reviewer)} reviews the evidence and makes the final decision.</li>`}
        </ol>
      </div>
      ${footer}
    </section>`;
}

function userUploadFields(controls) {
  const options = controls.map((control) => `<option value="${escapeHtml(control.id)}">${escapeHtml(requirementLabel(control))}</option>`).join('');
  const also = controls.length > 1
    ? `<fieldset class="mt-4"><legend class="text-sm font-medium">Also supports</legend><p class="mt-1 text-xs font-normal text-slate-500">One document can support more than one requirement.</p><div class="mt-2 max-h-40 space-y-1.5 overflow-y-auto">${controls.map((control) => `<label class="flex items-start gap-2 text-sm font-normal"><input type="checkbox" name="also" value="${escapeHtml(control.id)}" class="mt-1" /><span>${escapeHtml(requirementLabel(control))}</span></label>`).join('')}</div></fieldset>`
    : '';
  return `
    <section>
      <h2 class="text-sm font-semibold">1. Select requirement</h2>
      <label class="mt-3 block text-sm font-medium">Requirement
        <select name="controlId" required class="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 font-normal outline-none">${options}</select>
      </label>
      <dl class="mt-3 grid gap-2 rounded-xl border border-line bg-mist px-4 py-3 text-sm sm:grid-cols-3">
        <div><dt class="text-slate-500">Evidence owner</dt><dd class="mt-1 font-medium" data-party-owner></dd></div>
        <div><dt class="text-slate-500">Reviewer</dt><dd class="mt-1 font-medium" data-party-reviewer></dd></div>
        <div><dt class="text-slate-500">Control</dt><dd class="mt-1 font-medium" data-party-control></dd></div>
      </dl>
    </section>
    <section class="mt-6">
      <h2 class="text-sm font-semibold">2. Add evidence</h2>
      <p class="mt-3 text-sm font-medium">Evidence source</p>
      <div class="mt-2 grid gap-2 sm:grid-cols-2">
        <label class="er-source cursor-pointer rounded-xl px-3 py-3">
          <input type="radio" name="sourceId" value="computer" checked class="sr-only" />
          <span class="block text-sm font-medium">Upload a file</span>
          <span class="mt-1 block text-xs font-normal text-slate-500">From this computer</span>
        </label>
        <label class="er-source cursor-pointer rounded-xl px-3 py-3">
          <input type="radio" name="sourceId" value="other" class="sr-only" />
          <span class="block text-sm font-medium">Link to approved repository</span>
          <span class="mt-1 block text-xs font-normal text-slate-500">Record where it already lives</span>
        </label>
      </div>
      <p class="mt-3 text-xs leading-relaxed text-slate-500">${STORAGE_LINE}</p>
      <div data-source-file class="mt-4 rounded-xl border border-dashed border-line bg-mist px-4 py-4">
        <p class="text-sm font-medium">File</p>
        <input name="document" type="file" class="mt-3 block w-full text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#1860C8]" />
      </div>
      <div data-source-place hidden class="mt-4">
        <label class="block text-sm font-medium">Link or path
          <input name="location" maxlength="300" placeholder="https://… or a folder path" class="mt-1 w-full rounded-lg border border-line px-3 py-2.5 font-normal outline-none focus:border-[#1860C8]" />
        </label>
        <p class="mt-1 text-xs font-normal text-slate-500">Drive, SharePoint, OneDrive, and the other connectors are not switched on yet. Record the place. The file stays there.</p>
      </div>
      <label class="mt-4 block text-sm font-medium">Evidence title
        <input name="name" required maxlength="160" placeholder="AI Policy" class="mt-1 w-full rounded-lg border border-line px-3 py-2.5 font-normal outline-none focus:border-[#1860C8]" />
      </label>
    </section>
    ${also ? `<section class="mt-6"><h2 class="text-sm font-semibold">3. Link to other requirements</h2>${also}</section>` : ''}
    <section class="mt-6">
      <h2 class="text-sm font-semibold">${also ? '4' : '3'}. Evidence details</h2>
      <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt class="text-slate-500">Review / expiry date</dt><dd class="mt-1 font-medium" data-review-date></dd></div>
        <div><dt class="text-slate-500">Source</dt><dd class="mt-1 font-medium" data-source-label>Uploaded file</dd></div>
        <div><dt class="text-slate-500">Version</dt><dd class="mt-1 font-medium" data-version>1.0</dd></div>
      </dl>
      <input type="hidden" name="reviewDue" value="" />
    </section>
    <section class="mt-6">
      <h2 class="text-sm font-semibold">${also ? '5' : '4'}. Submit</h2>
      <label class="mt-3 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" name="confirm" required class="mt-1" /> <span>By submitting this evidence, you confirm that this document is an appropriate organisational record for the selected requirement.</span></label>
      <div class="mt-4 flex justify-end">
        <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-[#1860C8] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-70">Submit Evidence for Review</button>
      </div>
    </section>`;
}

function renderUpload() {
  const controls = ws()?.controls || [];
  const receipt = (ws()?.evidence || []).find((item) => item.id === state.receiptId);
  const intro = `
    <h1 class="text-2xl font-semibold tracking-tight">Upload Evidence</h1>
    <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">Submit evidence for a requirement on this control set. The named reviewer is notified and makes the final decision.</p>
    <p class="mt-4 max-w-2xl text-sm text-slate-500"><span class="font-medium text-ink">AI-assisted, human-controlled. </span>AI can analyse evidence, identify potential gaps and recommend actions. It does not make the final governance decision.</p>`;
  if (receipt) {
    pane.innerHTML = `${banner()}${submissionReceipt(receipt)}`;
    bindReceiptPad();
    return;
  }
  if (!controls.length) {
    pane.innerHTML = `${banner()}${intro}<p class="mt-5 max-w-2xl text-sm text-slate-600">No requirement is on the control set yet.</p>`;
    return;
  }
  const chosen = controls.find((control) => control.id === state.uploadControl);
  if (!chosen) {
    pane.innerHTML = `
      ${banner()}
      ${intro}
      <div class="mt-5 grid gap-3 lg:grid-cols-2">${dutyCards(controls)}</div>`;
    return;
  }
  pane.innerHTML = `
    ${banner()}
    <button type="button" id="upload-choices" class="text-sm font-medium text-[#1860C8]">All requirements</button>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight">Upload Evidence</h1>
    <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">${escapeHtml(chosen.id)} — ${escapeHtml(controlTitle(chosen))}. The named reviewer is notified and makes the final decision.</p>
    <form id="user-upload-form" class="mt-5 max-w-3xl rounded-2xl border border-line bg-white p-6 shadow-sm">
      ${userUploadFields(controls)}
    </form>
    ${whatNext()}`;
  const form = document.getElementById('user-upload-form');
  bindEvidenceForm(form);
  const select = form.elements.controlId;
  if (select && state.uploadControl && controls.some((control) => control.id === state.uploadControl)) {
    select.value = state.uploadControl;
    syncAlso(form);
    syncRecorded(form);
  }
}

function bindReceiptPad() {
  const canvas = document.getElementById('receipt-pad');
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
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  document.getElementById('receipt-clear')?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}

function receiptInk() {
  const canvas = document.getElementById('receipt-pad');
  if (!canvas) return '';
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 0) return canvas.toDataURL('image/png');
  }
  return '';
}

function fillUploadSummary(form) {
  const box = document.getElementById('upload-summary');
  if (!box || !form) return;
  const data = new FormData(form);
  const source = evidenceSources().find((row) => row.id === data.get('sourceId'));
  const control = controlById(data.get('controlId'));
  const file = form.querySelector('input[name="document"]')?.files?.[0];
  const also = data.getAll('also').filter((id) => id !== data.get('controlId'));
  const rows = [
    ['Where it lives', source?.name || 'Not chosen'],
    ['File or place', source?.connected ? (file?.name || 'No file chosen') : (data.get('location') || 'No place recorded')],
    ['Document', data.get('name') || 'Not named'],
    ['Requirement', control ? `${control.id} · ${control.requirement}` : 'Not chosen'],
    ['Also supports', also.length ? also.join(', ') : 'None'],
    ['Recorded', clockText()],
    ['Next review', data.get('reviewDue') ? when(data.get('reviewDue')) : 'Follows the requirement'],
  ];
  box.innerHTML = rows.map(([label, value]) => `<p class="mt-2 first:mt-0"><span class="text-slate-500">${escapeHtml(label)}. </span>${escapeHtml(value)}</p>`).join('');
}

function uploadStepReady(form, step) {
  if (step === 1 && !form.elements.controlId?.value) return 'Select a control.';
  if (step === 2) {
    const source = evidenceSources().find((row) => row.id === form.elements.sourceId?.value);
    if (!source) return 'Choose where the document lives.';
    if (source.connected && !form.querySelector('input[name="document"]')?.files?.[0]) return 'Choose a file from this computer.';
    if (!source.connected && !String(form.elements.location?.value || '').trim()) return `Record where the document lives in ${source.name}.`;
  }
  if (step === 3) {
    if (!String(form.elements.name?.value || '').trim()) return 'Give the document a title.';
  }
  return '';
}

function showUploadStep(step) {
  const form = document.getElementById('user-upload-form');
  if (!form) return;
  state.uploadStep = step;
  form.querySelectorAll('[data-upload-panel]').forEach((panel) => {
    panel.hidden = Number(panel.dataset.uploadPanel) !== step;
  });
  form.querySelectorAll('[data-upload-pip]').forEach((pip) => {
    const number = Number(pip.dataset.uploadPip);
    const on = number === step;
    const done = number < step;
    pip.className = `flex items-center gap-2 text-sm ${on ? 'font-semibold text-[#1860C8]' : 'text-slate-400'}`;
    const badge = pip.querySelector('span');
    if (badge) badge.className = `inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${on || done ? 'bg-[#1860C8] text-white' : 'bg-slate-100 text-slate-500'}`;
  });
  const back = document.getElementById('upload-back');
  const next = document.getElementById('upload-next');
  const submit = form.querySelector('[type="submit"]');
  if (back) back.classList.toggle('invisible', step === 1);
  if (next) next.classList.toggle('hidden', step === 4);
  if (submit) submit.classList.toggle('hidden', step !== 4);
  if (step === 4) fillUploadSummary(form);
}

function fileStatus(item) {
  if (item.rejected) return ['Rejected', 'bg-rose-50 text-rose-700'];
  const control = controlById(item.controlIds?.[0]);
  const review = control?.decision?.review;
  if (review === 'requested') return ['More evidence requested', 'bg-amber-50 text-amber-800'];
  if (review === 'confirmed' || review === 'overridden') {
    const agreed = control.decision?.reviewedStatus || control.agreed;
    if (agreed === 'MET') return ['Met', 'bg-emerald-50 text-emerald-800'];
    if (agreed === 'PARTIAL') return ['Partially met', 'bg-amber-50 text-amber-900'];
    if (agreed === 'NOT MET') return ['Not met', 'bg-rose-50 text-rose-800'];
    if (agreed === 'NO EVIDENCE') return ['No evidence', 'bg-slate-100 text-slate-600'];
  }
  return ['Under review', 'bg-amber-50 text-amber-800'];
}

function userEvidenceList() {
  return evidenceRows().filter((item) => {
    if (state.evidenceOwner !== 'all' && item.uploadedBy !== state.evidenceOwner) return false;
    if (state.evidenceControl !== 'all' && !item.controlIds.includes(state.evidenceControl)) return false;
    if (state.evidenceStatus !== 'all' && fileStatus(item)[0] !== state.evidenceStatus) return false;
    return true;
  });
}

function renderUserEvidence() {
  const selected = (ws().evidence || []).find((item) => item.id === state.evidenceId);
  if (selected) {
    renderEvidenceDetail(selected);
    return;
  }
  const rows = userEvidenceList();
  const pageSize = 6;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  if (state.evidencePage > pages) state.evidencePage = pages;
  const start = (state.evidencePage - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  const owners = [...new Map((ws().evidence || []).map((item) => [item.uploadedBy, person(item.uploadedBy).name])).entries()];
  const body = slice.map((item) => {
    const control = controlById(item.controlIds[0]);
    const [label, tone] = fileStatus(item);
    return `<tr class="border-t border-line hover:bg-[#FAFBFC]">
      <td class="px-4 py-3 text-sm font-medium text-[#1860C8]">${escapeHtml(item.id)}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(control?.id || '—')}</td>
      <td class="px-4 py-3 text-sm font-medium">${fileButton(item)}</td>
      <td class="px-4 py-3 text-sm">${avatar(item.uploadedBy)}</td>
      <td class="px-4 py-3 text-sm">${escapeHtml(control ? person(control.reviewerId).name : '—')}</td>
      <td class="px-4 py-3"><span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}">${escapeHtml(label)}</span></td>
      <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-500">${escapeHtml(whenTime(item.uploadedAt))}</td>
      <td class="px-4 py-3 text-right"><button type="button" data-evidence="${escapeHtml(item.id)}" class="text-sm font-medium text-[#1860C8]">Open</button></td>
    </tr>`;
  }).join('');
  const shown = rows.length ? `${start + 1}–${Math.min(start + pageSize, rows.length)}` : '0';
  const pager = `<div class="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-slate-500"><span>Showing ${shown} of ${rows.length}</span><span class="flex gap-2">${Array.from({ length: pages }, (_, index) => `<button type="button" data-evidence-page="${index + 1}" class="h-8 w-8 rounded-lg ${state.evidencePage === index + 1 ? 'bg-[#1860C8] text-white' : 'border border-line'}">${index + 1}</button>`).join('')}</span></div>`;
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Evidence Register</h1>
        <p class="mt-1 text-sm text-slate-500">View and manage all evidence submissions.</p>
      </div>
      <button type="button" data-go="upload" class="rounded-lg bg-[#1860C8] px-3.5 py-2 text-sm font-medium text-white">Upload Evidence</button>
    </div>
    <div class="mt-5 flex flex-wrap gap-2">
      <select data-evidence-filter="evidenceControl" class="rounded-lg border border-line bg-white px-3 py-2 text-sm"><option value="all">All controls</option>${(ws().controls || []).map((control) => `<option value="${escapeHtml(control.id)}" ${state.evidenceControl === control.id ? 'selected' : ''}>${escapeHtml(control.id)}</option>`).join('')}</select>
      <select data-evidence-filter="evidenceStatus" class="rounded-lg border border-line bg-white px-3 py-2 text-sm"><option value="all">All statuses</option>${['Under review', 'Partially met', 'Met', 'Not met', 'More evidence requested', 'Rejected'].map((label) => `<option value="${escapeHtml(label)}" ${state.evidenceStatus === label ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
      <select data-evidence-filter="evidenceOwner" class="rounded-lg border border-line bg-white px-3 py-2 text-sm"><option value="all">All owners</option>${owners.map(([id, name]) => `<option value="${escapeHtml(id)}" ${state.evidenceOwner === id ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select>
    </div>
    <div class="mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr><th class="px-4 py-3 font-medium">ID</th><th class="px-4 py-3 font-medium">Control</th><th class="px-4 py-3 font-medium">Title</th><th class="px-4 py-3 font-medium">Uploader</th><th class="px-4 py-3 font-medium">Reviewer</th><th class="px-4 py-3 font-medium">Status</th><th class="px-4 py-3 font-medium">Submitted</th><th class="px-4 py-3 font-medium">Actions</th></tr></thead>
        <tbody>${body || `<tr><td colspan="8" class="px-4 py-8 text-sm text-slate-500">${state.query || state.evidenceStatus !== 'all' || state.evidenceOwner !== 'all' || state.evidenceControl !== 'all' ? 'Nothing matches.' : 'No document has been filed yet.'}</td></tr>`}</tbody>
      </table>
      ${pager}
    </div>`;
}

function renderEvidenceDetail(item) {
  const tab = state.evidenceTab || 'overview';
  const tabs = [
    ['overview', 'Overview'],
    ['reading', 'AI Assessment'],
    ['history', 'Review History'],
    ['attachments', 'Attachments'],
    ['comments', 'Comments'],
  ].map(([id, label]) => `<button type="button" data-evidence-tab="${id}" class="border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-[#1860C8] text-[#1860C8]' : 'border-transparent text-slate-500'}">${label}</button>`).join('');
  const controls = item.controlIds.map((id) => controlById(id)).filter(Boolean);
  const primary = controls[0];
  const [statusLabel, statusTone] = fileStatus(item);
  const hashText = state.showHash ? item.hash : hashLine(item.hash);
  let body = '';
  if (tab === 'reading') {
    body = controls.map((control) => `
      <section class="rounded-2xl border border-line bg-white p-5">
        <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-sm font-semibold">${escapeHtml(control.id)}</h2>${pill(control.agreed)}</div>
        <p class="mt-3 text-sm leading-relaxed text-slate-600">${escapeHtml(control.judgement?.reason || '')}</p>
        <p class="mt-2 text-sm text-slate-600">${escapeHtml(control.judgement?.recommendation || '')}</p>
        ${documentBody(item)}
        ${sourceTrail(control.judgement || { sources: [] })}
        <p class="mt-3 text-xs text-slate-500">AI-assisted, human-controlled. This assessment uses the document on record and can identify a gap. ${escapeHtml(person(control.reviewerId).name)} makes the final decision.</p>
      </section>`).join('') || '<p class="text-sm text-slate-500">This document is not linked to a requirement.</p>';
  } else if (tab === 'history') {
    const ids = [item.id, ...item.controlIds];
    const lines = (ws().history || []).filter((row) => ids.some((id) => String(row.text).includes(id)));
    body = `<section class="rounded-2xl border border-line bg-white px-5"><ul>${lines.map((row) => `<li class="border-t border-line py-3 text-sm first:border-t-0"><span class="font-medium">${escapeHtml(person(row.actorId).name)}. </span>${escapeHtml(row.text)}<span class="mt-1 block text-xs text-slate-400">${escapeHtml(whenTime(row.at))}</span></li>`).join('') || '<li class="py-4 text-sm text-slate-500">No review history yet.</li>'}</ul></section>`;
  } else if (tab === 'attachments') {
    body = `<section class="rounded-2xl border border-line bg-white p-5"><p class="text-sm font-medium">${escapeHtml(item.name)}</p><p class="mt-2 text-sm text-slate-600">${escapeHtml(item.location ? `${item.source} · ${item.location}` : (item.source || 'Recorded in the register'))}</p><p class="mt-2 break-all text-xs text-slate-500">${escapeHtml(item.hash || 'No fingerprint')}</p>${documentBody(item)}<p class="mt-3 text-xs text-slate-500">${STORAGE_LINE}</p></section>`;
  } else if (tab === 'comments') {
    const notes = controls.map((control) => control.decision?.comment).filter(Boolean);
    body = `<section class="rounded-2xl border border-line bg-white px-5"><ul>${notes.map((note) => `<li class="border-t border-line py-3 text-sm first:border-t-0">${escapeHtml(note)}</li>`).join('') || '<li class="py-4 text-sm text-slate-500">No comments yet.</li>'}</ul></section>`;
  } else {
    const facts = [
      ['Title', item.name],
      ['Control', primary ? `${primary.id} · ${primary.expected || primary.requirement}` : 'Not linked'],
      ['Uploader', person(item.uploadedBy).name],
      ['Reviewer', primary ? person(primary.reviewerId).name : 'Not set'],
      ['Submitted', whenTime(item.uploadedAt)],
      ['Last updated', whenTime(item.uploadedAt)],
    ];
    const readings = controls.map((control) => requirementBody(control)).join('') || requirementBody(primary);
    body = `<div class="grid gap-4 lg:grid-cols-[1fr_16rem]">
      <section class="rounded-2xl border border-line bg-white p-5"><dl class="grid gap-4 sm:grid-cols-2">${facts.map(([label, value]) => `<div><dt class="text-xs text-slate-500">${escapeHtml(label)}</dt><dd class="mt-1 text-sm font-medium">${escapeHtml(value)}</dd></div>`).join('')}</dl></section>
      <aside class="rounded-2xl border border-line bg-white p-5">
        <p class="text-sm font-semibold">Fingerprint</p>
        <p class="mt-2 break-all text-xs text-slate-500">${escapeHtml(hashText || 'Not recorded')}</p>
        <button type="button" id="show-hash" class="mt-4 rounded-lg bg-[#E7EEF8] px-3 py-2 text-sm font-medium text-[#1860C8]">${state.showHash ? 'Hide' : 'View'}</button>
      </aside>
    </div>
    <div class="mt-4 grid gap-3">${readings}${documentBody(item)}</div>`;
  }
  pane.innerHTML = `
    ${banner()}
    <button type="button" id="evidence-back" class="text-sm font-medium text-[#1860C8]">Back to Evidence Register</button>
    <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-[#1860C8]">${escapeHtml(item.id)}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">${escapeHtml(primary ? `${primary.id} · ${primary.expected || 'Requirement'}` : item.name)}</h1>
      </div>
      <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone}">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="mt-4 flex gap-1 overflow-x-auto border-b border-line">${tabs}</div>
    <div class="mt-4">${body}</div>`;
}

function renderProfile() {
  const who = actor();
  const roles = (who.roles || []).map((role) => profileLabel(role));
  const manager = who.managerId ? person(who.managerId).name : 'Not set';
  const tab = state.profileTab || 'info';
  const tabs = [
    ['info', 'Personal Info'],
    ['roles', 'Roles & Permissions'],
    ['signature', 'Signature'],
  ].map(([id, label]) => `<button type="button" data-profile-tab="${id}" class="border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-[#1860C8] text-[#1860C8]' : 'border-transparent text-slate-500'}">${label}</button>`).join('');
  const facts = [
    ['Full name', who.name],
    ['Email', who.email || 'Not set'],
    ['Department', who.unit || 'Not set'],
    ['Job title', who.title || who.role || 'Not set'],
    ['Manager', manager],
    ['Employment type', who.employmentType || 'employee'],
  ];
  let panel = '';
  if (tab === 'roles') {
    panel = `<ul class="mt-4 space-y-2">${(who.roles || ['uploader']).map((role) => `<li class="rounded-xl border border-line px-4 py-3 text-sm"><span class="font-medium">${escapeHtml(profileLabel(role))}</span><span class="mt-1 block text-slate-500">${escapeHtml(PROFILE_NOTE[role] || '')}</span></li>`).join('')}</ul>`;
  } else if (tab === 'signature') {
    panel = `<div class="mt-4 rounded-xl border border-line p-4"><p class="text-sm font-medium">${escapeHtml(who.signatureStatus || 'Not signed')}</p><p class="mt-2 text-sm text-slate-500">A signature is kept when you acknowledge a responsibility. Joining the organisation does not require one.</p>${who.drawnSignature ? `<img src="${escapeHtml(who.drawnSignature)}" alt="Signature on file" class="mt-4 max-h-24" />` : ''}</div>`;
  } else {
    panel = `<dl class="mt-4 grid gap-4 sm:grid-cols-2">${facts.map(([label, value]) => `<div><dt class="text-xs text-slate-500">${escapeHtml(label)}</dt><dd class="mt-1 text-sm font-medium">${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
  }
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">My Profile</h1>
    </div>
    <div class="mt-5 grid gap-4 lg:grid-cols-[1fr_18rem]">
      <section class="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <div class="flex items-center gap-3">
          <span class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#E7EEF8] text-base font-semibold text-[#1860C8]">${escapeHtml(initials(who.name))}</span>
          <div>
            <p class="text-lg font-semibold">${escapeHtml(who.name)}</p>
            <p class="text-sm text-slate-500">${escapeHtml(who.title || who.role || 'User')}</p>
          </div>
        </div>
        <div class="mt-4 flex gap-1 overflow-x-auto border-b border-line">${tabs}</div>
        ${panel}
      </section>
      <section class="h-fit rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 class="text-sm font-semibold">Signature status</h2>
        <p class="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#1860C8]"><span class="h-2 w-2 rounded-full ${who.signatureStatus === 'Signed' ? 'bg-[#1860C8]' : 'bg-slate-300'}"></span>${escapeHtml(who.signatureStatus || 'Not signed')}</p>
        <p class="mt-2 text-sm text-slate-500">${escapeHtml(roles.join(', ') || 'User')}</p>
      </section>
    </div>`;
}

function renderEvidence() {
  if (state.profile === 'uploader') return renderUserEvidence();
  const selected = (ws().evidence || []).find((item) => item.id === state.evidenceId);
  if (selected) return renderEvidenceDetail(selected);
  const all = ws().controls;
  const withFile = all.filter((control) => control.evidenceIds.length).length;
  const pct = all.length ? Math.round((withFile / all.length) * 100) : 0;
  const rows = evidenceRows().map((item) => `
    <tr class="border-t border-line align-top hover:bg-[#FAFBFC]">
      <td class="px-5 py-3">
        <p class="text-sm font-medium">${fileButton(item)}</p>
        <p class="mt-0.5 text-xs text-slate-500">${escapeHtml(item.id)} · v${item.version}${item.rejected ? ' · not used' : ''}</p>
      </td>
      <td class="px-5 py-3 text-sm">${avatar(item.uploadedBy)}</td>
      <td class="whitespace-nowrap px-5 py-3 text-sm text-slate-600">${escapeHtml(when(item.uploadedAt))}</td>
      <td class="whitespace-nowrap px-5 py-3 text-sm">${escapeHtml(item.controlIds.join(', '))}</td>
      <td class="px-5 py-3 text-right"><button type="button" data-evidence="${item.id}" class="text-sm font-medium text-brand">${state.evidenceId === item.id ? 'Hide' : 'Open'}</button></td>
    </tr>
    ${state.evidenceId === item.id ? `<tr class="border-t border-line bg-[#FAFBFC]"><td colspan="5" class="px-5 py-4 text-sm"><p><span class="text-slate-500">${item.section === 'File from this computer' ? 'Fingerprint of the file' : 'Fingerprint of the recorded place'}. </span><span class="font-medium">${escapeHtml(item.hash)}</span></p><p class="mt-1"><span class="text-slate-500">Where it lives. </span>${escapeHtml(item.source || 'Not recorded')}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</p><p class="mt-1"><span class="text-slate-500">Review date. </span>${escapeHtml(item.reviewDue || 'Not set')}</p></td></tr>` : ''}`).join('');
  pane.innerHTML = `
    ${banner()}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">${escapeHtml(ws().organisation?.framework || 'ISO/IEC 42001')}</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">Evidence</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-500">A document is recorded against a requirement. A file from this computer is fingerprinted here. Google Drive, SharePoint, OneDrive, and the other repositories are named, and a person records where the file already lives.</p>
      </div>
      ${state.profile === 'uploader' ? '<button type="button" data-open-evidence class="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">Upload a document</button>' : ''}
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
    ${sourceCatalogue()}
    <div class="mt-5 overflow-hidden rounded-xl border border-line bg-white">
      <table class="w-full text-left">
        <thead class="text-xs uppercase tracking-wide text-slate-500"><tr>
          <th class="px-5 py-3 font-medium">Name</th><th class="px-5 py-3 font-medium">Owner</th><th class="px-5 py-3 font-medium">Date</th><th class="px-5 py-3 font-medium">Control</th><th class="px-5 py-3"></th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="px-5 py-8 text-sm text-slate-500">${state.query ? 'Nothing matches.' : 'No evidence has been filed.'}</td></tr>`}</tbody>
      </table>
    </div>`;
}

function canOpenFile(item) {
  const location = String(item?.location || '');
  return location.startsWith('storage:') || /^https?:\/\//i.test(location);
}

function fileButton(item) {
  if (!canOpenFile(item)) return `<span class="text-sm font-semibold">${escapeHtml(item.name)}</span>`;
  return `<button type="button" data-open-file="${escapeHtml(item.id)}" class="text-left text-sm font-semibold text-[#1860C8] underline decoration-[#1860C8]/30 underline-offset-2">${escapeHtml(item.name)}</button>`;
}

function safePlace(location) {
  const value = String(location || '').trim();
  if (/^https?:\/\//i.test(value)) {
    return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener" class="font-medium text-[#1860C8]">${escapeHtml(value)}</a>`;
  }
  return escapeHtml(value);
}

function requirementBody(control) {
  if (!control) return '';
  return `
    <div class="rounded-xl border border-line bg-mist px-4 py-3">
      <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Requirement</p>
      <p class="mt-2 text-sm font-medium">${escapeHtml(control.id)}</p>
      <p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHtml(control.requirement || 'No wording has been recorded for this requirement.')}</p>
      <p class="mt-2 text-xs text-slate-500">${escapeHtml([control.expected, control.frequency].filter(Boolean).join(' · '))}</p>
    </div>`;
}

function documentBody(item) {
  if (!item) return '<p class="text-sm leading-relaxed text-slate-600">No document has been filed for this requirement.</p>';
  const text = String(item.note || '').trim();
  const stored = String(item.location || '').startsWith('storage:');
  const linked = item.location && !stored;
  const place = linked ? `<p class="mt-3 text-sm leading-relaxed text-slate-600">Where it lives. ${safePlace(item.location)}</p>` : '';
  const wording = text
    ? `<div class="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">${escapeHtml(text)}</div>`
    : `<p class="mt-3 text-sm leading-relaxed text-slate-600">${stored ? 'Open the document to read the file that was submitted.' : linked ? 'Open the recorded location to read the file.' : `${escapeHtml(person(item.uploadedBy).name)} filed this before a copy was kept, so it cannot be opened. They need to submit the document again.`}</p>`;
  return `
    <div class="rounded-xl border border-line px-4 py-3">
      <p class="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Document</p>
      <div class="mt-2">${fileButton(item)}</div>
      ${wording}
      ${place}
    </div>`;
}

function readingBlock(control, item) {
  return `<div class="mt-4 grid gap-3">${requirementBody(control)}${documentBody(item)}</div>`;
}

function sourceTrail(judgement) {
  const source = judgement.sources[0];
  if (!source) return '<p class="text-sm text-slate-600">No file to cite. The register will not guess a result from outside the record.</p>';
  const rows = [
    ['Evidence', source.evidenceId],
    ['Document', source.name],
    ['Version', `v${source.version}`],
    ['Where it lives', source.location ? `${source.repository} · ${source.location}` : (source.repository || source.section)],
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
    <article class="border-t border-line">
      <button type="button" data-review="${escapeHtml(control.id)}" class="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-left">
        <div>
          <p class="text-sm font-medium">${escapeHtml(control.id)} · ${escapeHtml(controlTitle(control))}</p>
          <p class="text-xs text-slate-500">${escapeHtml(control.decision.review === 'awaiting' ? 'No file yet' : `${person(control.decision.reviewBy).name} · ${when(control.decision.reviewAt)}`)}</p>
        </div>
        <span class="flex items-center gap-3">${pill(control.agreed)}<span class="text-sm font-medium text-[#1860C8]">${state.reviewId === control.id ? 'Hide' : 'Read'}</span></span>
      </button>
      ${state.reviewId === control.id ? `<div class="border-t border-line px-5 pb-4">${readingBlock(control, latestFor(control.id))}</div>` : ''}
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
      ${readingBlock(control, filer)}
      ${sourceTrail(judgement)}
      <p class="mt-4 text-xs text-slate-500">AI-assisted, human-controlled. This reading can identify a gap. It does not replace your decision.</p>
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
      return `<button type="button" data-toggle-role="${role}" data-person="${row.id}" class="rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-navy text-white' : 'border border-line text-slate-500'}">${role === 'uploader' ? 'User' : role === 'reviewer' ? 'Reviewer' : 'Admin'}</button>`;
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
        <p class="mt-2 max-w-2xl text-sm text-slate-500">A person stays Pending until they create an account from their link. After they sign up, they are Active. The admin assigns User, Reviewer, and Admin. The same person can hold more than one. A person who files evidence cannot approve that same file.</p>
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
  upload: renderUpload,
  profile: renderProfile,
};

function navButton(id, label, glyph, mobile) {
  const on = state.page === id;
  if (mobile) {
    return `<button type="button" data-page="${id}" class="whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${on ? 'bg-navy text-white' : 'text-slate-600'}">${label}</button>`;
  }
  const ticketCount = (ws()?.tickets || []).filter((ticket) => ticket.status !== 'resolved' && (state.profile !== 'uploader' || ticket.ownerId === state.actorId)).length;
  const badge = id === 'review' ? waitingReviews().length : id === 'tickets' ? ticketCount : 0;
  return `<button type="button" data-page="${id}" class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${on ? 'bg-[#1860C8] text-white shadow-sm' : 'text-white/70 hover:bg-white/5 hover:text-white'}">${glyph}<span class="flex-1">${label}</span>${badge ? `<span class="rounded-full bg-white/20 px-1.5 text-[11px]">${badge}</span>` : ''}</button>`;
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
  const who = actor();
  const named = who.name && who.name !== 'Unassigned' ? who.name : '';
  const sidePerson = document.getElementById('side-person');
  if (sidePerson) sidePerson.textContent = named || 'Evidence Register';
  const sideMark = document.getElementById('side-mark');
  if (sideMark) sideMark.textContent = named ? initials(named) : 'ER';
  document.getElementById('profile-note').textContent = who.title || who.role || PROFILE_NOTE[state.profile] || '';
  document.getElementById('signed-name').textContent = named;
  const headerMark = document.getElementById('header-mark');
  if (headerMark) headerMark.textContent = named ? initials(named) : 'ER';
  const headerRole = document.getElementById('header-role');
  if (headerRole) headerRole.textContent = who.title || who.role || viewName;
  const helloTitle = document.getElementById('hello-title');
  if (helloTitle) helloTitle.textContent = named ? greeting() : 'Evidence Register';
  const helloBand = document.getElementById('hello-band');
  const onHome = state.page === 'dashboard' && state.profile !== 'admin';
  if (helloBand) helloBand.hidden = !onHome;
  const headerUpload = document.getElementById('header-upload');
  if (headerUpload) headerUpload.hidden = state.profile !== 'uploader';
  pane.className = onHome
    ? 'flex-1 overflow-y-auto px-4 pb-6 pt-1 md:px-8'
    : 'flex-1 overflow-y-auto px-4 py-6 md:px-8';
  const accountProfile = document.getElementById('account-profile');
  if (accountProfile) accountProfile.hidden = !navItems().some(([id]) => id === 'profile');
  paintClock();
  document.getElementById('side-nav').innerHTML = navItems().map(([id, label, glyph]) => navButton(id, label, glyph, false)).join('');
  document.getElementById('mobile-nav').innerHTML = navItems().map(([id, label]) => navButton(id, label, '', true)).join('');
  const evidenceSelect = document.querySelector('#evidence-form select[name="controlId"]');
  const ownerSelect = document.querySelector('#control-form select[name="ownerId"]');
  const reviewerSelect = document.querySelector('#control-form select[name="reviewerId"]');
  const templateOwner = document.querySelector('#template-form select[name="ownerId"]');
  const templateReviewer = document.querySelector('#template-form select[name="reviewerId"]');
  if (evidenceSelect && data) {
    const current = evidenceSelect.value;
    evidenceSelect.innerHTML = uploadControlList().map(controlChoice).join('');
    if (current && [...evidenceSelect.options].some((option) => option.value === current)) evidenceSelect.value = current;
  }
  if (ownerSelect && data) ownerSelect.innerHTML = personOptions(data.people);
  if (reviewerSelect && data) reviewerSelect.innerHTML = personOptions(reviewers());
  if (templateOwner && data) templateOwner.innerHTML = personOptions(data.people);
  if (templateReviewer && data) templateReviewer.innerHTML = personOptions(reviewers());
  paintNotes();
}

let clockTimer = 0;

function paintClock() {
  const headerDate = document.getElementById('header-date');
  if (headerDate) headerDate.textContent = clockText();
  document.querySelectorAll('[data-recorded-at]').forEach((node) => {
    node.textContent = clockText();
  });
  if (!clockTimer) clockTimer = setInterval(paintClock, 30000);
}

function paintNotes() {
  const notes = ws()?.notifications || [];
  const unread = notes.filter((row) => !row.readAt);
  const count = document.getElementById('note-count');
  const list = document.getElementById('note-list');
  if (count) {
    count.hidden = unread.length === 0;
    count.textContent = unread.length > 9 ? '9+' : String(unread.length);
  }
  if (!list) return;
  list.innerHTML = notes.slice(0, 8).map((row) => `
    <button type="button" data-note="${escapeHtml(row.id)}" data-page="${escapeHtml(row.page || 'dashboard')}" class="block w-full rounded-lg px-2 py-2 text-left hover:bg-mist ${row.readAt ? 'opacity-60' : ''}">
      <span class="text-sm leading-relaxed">${escapeHtml(row.text)}</span>
      <span class="mt-1 block text-xs text-slate-500">${escapeHtml(whenTime(row.at))}</span>
    </button>`).join('') || '<p class="px-2 py-3 text-sm text-slate-500">Nothing has been sent to you yet.</p>';
}

function fillEvidenceDialog() {
  const box = document.getElementById('evidence-fields');
  const dialog = document.getElementById('evidence-dialog');
  if (!box || dialog?.open || !ws()) return;
  box.innerHTML = evidenceFields();
  bindEvidenceForm(document.getElementById('evidence-form'));
}

function render() {
  if (!ws()) {
    pane.innerHTML = '<p class="text-sm text-slate-500">Loading the register…</p>';
    return;
  }
  paintChrome();
  (PAGES[state.page] || renderDashboard)();
  fillEvidenceDialog();
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
  document.getElementById('auth-title').textContent = state.authMode === 'forgot'
    ? 'Reset password'
    : state.authMode === 'reset'
      ? 'Choose a new password'
      : state.authMode === 'signup'
        ? 'Create an account'
        : 'Sign in';
  document.getElementById('auth-copy').textContent = state.authMode === 'forgot'
    ? 'This is only for people an admin has added. A reset link is sent to that work email.'
    : state.authMode === 'reset'
      ? 'Choose a new password for the account an admin added. The link expires in one hour.'
      : AUTH_COPY[profile] || '';
  document.getElementById('signup-form').hidden = state.authMode !== 'signup';
  document.getElementById('signin-form').hidden = state.authMode !== 'signin';
  document.getElementById('forgot-form').hidden = state.authMode !== 'forgot';
  document.getElementById('reset-form').hidden = state.authMode !== 'reset' || !state.resetToken;
  document.getElementById('auth-switch').hidden = false;
  document.getElementById('auth-switch').textContent = state.authMode === 'signup'
    ? 'Already have an account? Sign in'
    : state.authMode === 'signin'
      ? 'Need an account? Create one'
      : 'Back to sign in';
  document.getElementById('signup-submit').textContent = 'Create account';
  document.getElementById('password-label').textContent = 'Password';
  document.getElementById('confirm-field').hidden = true;
  const signup = document.getElementById('signup-form');
  signup.elements.email.readOnly = false;
  ['name-field', 'email-field', 'job-field', 'unit-field'].forEach((id) => {
    document.getElementById(id).hidden = false;
  });
  document.getElementById('age-field').hidden = true;
  const error = document.getElementById('auth-error');
  error.textContent = message || '';
  error.classList.toggle('hidden', !message);
  const note = document.getElementById('auth-note');
  note.textContent = arguments[1] || '';
  note.classList.toggle('hidden', !arguments[1]);
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
  const unit = invite.unit || 'Unassigned';
  form.elements.name.value = invite.name || '';
  form.elements.email.value = invite.email || '';
  form.elements.email.readOnly = true;
  form.elements.inviteToken.value = invite.token || '';
  form.elements.unit.value = unit;
  form.elements.job.value = invite.job || '';
  if (form.elements.ageRange) form.elements.ageRange.value = invite.ageRange || '';
  ['name-field', 'job-field', 'unit-field', 'age-field'].forEach((id) => {
    document.getElementById(id).hidden = true;
  });
  document.getElementById('email-field').hidden = false;
  document.getElementById('password-label').textContent = 'Set password';
  document.getElementById('confirm-field').hidden = false;
  document.getElementById('auth-title').textContent = 'Sign in';
  document.getElementById('signup-submit').textContent = 'Sign in';
  document.getElementById('auth-switch').hidden = true;
  const box = document.getElementById('sign-draw');
  box.hidden = !invite.signatureRequired;
  if (invite.signatureRequired) bindSignPad();
  document.getElementById('auth-copy').textContent = invite.signatureRequired
    ? 'Draw your signature, set a password, and sign in.'
    : 'Set a password for this email and sign in.';
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
    const resetToken = new URLSearchParams(location.search).get('reset');
    if (resetToken) {
      state.authMode = 'reset';
      state.resetToken = resetToken;
      const response = await fetch(`/api/auth/reset?token=${encodeURIComponent(resetToken)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        state.resetToken = '';
        showAuth(data.error || 'That reset link is no longer open.');
        return;
      }
      if (data.reset?.path && data.reset.path !== currentPath()) {
        location.replace(`${data.reset.path}?reset=${encodeURIComponent(resetToken)}`);
        return;
      }
      showAuth();
      return;
    }
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

function openUploadDialog(controlId) {
  const controls = uploadControlList();
  if (!controls.length) {
    if (state.profile === 'uploader') {
      state.page = 'upload';
      state.flash = '';
      state.error = '';
      render();
      return;
    }
    state.error = 'Add a requirement before a document can be checked.';
    state.flash = '';
    render();
    return;
  }
  const form = document.getElementById('evidence-form');
  const box = document.getElementById('evidence-fields');
  box.innerHTML = evidenceFields(controls);
  bindEvidenceForm(form);
  const select = form.elements.controlId;
  if (select && controlId && controls.some((control) => control.id === controlId)) {
    select.value = controlId;
    syncAlso(form);
  }
  form.querySelector('.er-form-error')?.remove();
  document.getElementById('evidence-dialog').showModal();
}

function openEvidence(controlId) {
  if (state.profile === 'uploader') {
    state.page = 'upload';
    state.uploadControl = controlId || '';
    state.receiptId = '';
    state.flash = '';
    state.error = '';
    render();
    return;
  }
  openUploadDialog(controlId);
}

function armButton(button, text) {
  if (!button || button.disabled) return false;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `<span class="er-spin" aria-hidden="true"></span>${text}`;
  const form = button.closest('form');
  if (form && !form.querySelector('.er-hold')) {
    form.querySelectorAll('input, select, textarea').forEach((field) => { field.disabled = true; });
    const note = document.createElement('p');
    note.className = 'er-hold';
    note.setAttribute('role', 'status');
    note.innerHTML = `<span class="er-spin" aria-hidden="true"></span><span>${text}</span>`;
    form.appendChild(note);
  }
  state.busyAt = performance.now();
  return true;
}

async function releaseBusy() {
  const started = state.busyAt;
  state.busyAt = 0;
  if (!started) return;
  const remain = 900 - (performance.now() - started);
  if (remain > 0) await new Promise((resolve) => setTimeout(resolve, remain));
}

async function post(url, body, options = {}) {
  state.error = '';
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(body),
    });
  } catch {
    state.error = 'That did not save. Check the connection and try again.';
    state.flash = '';
    await releaseBusy();
    render();
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem(sessionKey());
    await releaseBusy();
    showAuth(data.error || 'Sign in to continue.');
    return;
  }
  if (!response.ok) {
    state.error = data.error || 'That did not save.';
    state.flash = '';
    await releaseBusy();
    render();
    return;
  }
  state.workspace = data.workspace;
  state.flash = options.stay ? '' : (data.flash || '');
  if (!options.stay && data.open?.page) state.page = data.open.page;
  if (options.stay && data.evidenceId) {
    state.page = 'upload';
    state.receiptId = data.evidenceId;
  }
  if (data.open && Object.prototype.hasOwnProperty.call(data.open, 'ticketId')) state.ticketId = data.open.ticketId || '';
  await releaseBusy();
  render();
  return data;
}

document.getElementById('side-nav').addEventListener('click', onNav);
document.getElementById('mobile-nav').addEventListener('click', onNav);

function onNav(event) {
  const button = event.target.closest('[data-page]');
  if (!button) return;
  state.page = button.dataset.page;
  if (state.page !== 'upload') state.receiptId = '';
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
  if (event.target.closest('[data-upload-reset]') || event.target.id === 'upload-choices') {
    state.receiptId = '';
    state.uploadControl = '';
    state.flash = '';
    state.error = '';
    render();
    return;
  }
  const ackOpen = event.target.closest('[data-ack-open]');
  if (ackOpen) {
    state.ackId = state.ackId === ackOpen.dataset.ackOpen ? '' : ackOpen.dataset.ackOpen;
    render();
    return;
  }
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
  const send = event.target.closest('[data-send-invite]');
  if (send) {
    if (!armButton(send, 'Sending…')) return;
    post('/api/loop/invite-email', { invitationId: send.dataset.sendInvite });
    return;
  }
  const copy = event.target.closest('[data-copy-link]');
  if (copy) {
    const href = `${location.origin}${copy.dataset.copyLink}`;
    navigator.clipboard.writeText(href).then(() => {
      state.flash = 'Link copied.';
      state.error = '';
      render();
    }).catch(() => {
      state.error = href;
      state.flash = '';
      render();
    });
    return;
  }
  const uploadNext = event.target.closest('#upload-next');
  if (uploadNext) {
    const form = document.getElementById('user-upload-form');
    const problem = uploadStepReady(form, state.uploadStep);
    if (problem) {
      showFormError(form, problem);
      return;
    }
    form.querySelector('.er-form-error')?.remove();
    const file = form.querySelector('input[name="document"]')?.files?.[0];
    if (file && form.elements.name && !String(form.elements.name.value || '').trim()) form.elements.name.value = file.name;
    showUploadStep(Math.min(4, state.uploadStep + 1));
    return;
  }
  if (event.target.closest('#upload-back')) {
    showUploadStep(Math.max(1, state.uploadStep - 1));
    return;
  }
  if (event.target.id === 'evidence-back') {
    state.evidenceId = '';
    state.evidenceTab = 'overview';
    state.showHash = false;
    render();
    return;
  }
  if (event.target.id === 'show-hash') {
    state.showHash = !state.showHash;
    render();
    return;
  }
  const profileTab = event.target.closest('[data-profile-tab]');
  if (profileTab) {
    state.profileTab = profileTab.dataset.profileTab;
    render();
    return;
  }
  const tab = event.target.closest('[data-evidence-tab]');
  if (tab) {
    state.evidenceTab = tab.dataset.evidenceTab;
    render();
    return;
  }
  const pageButton = event.target.closest('[data-evidence-page]');
  if (pageButton) {
    state.evidencePage = Number(pageButton.dataset.evidencePage) || 1;
    render();
    return;
  }
  const go = event.target.closest('[data-go]');
  if (go) {
    if (go.dataset.evidenceOpen) {
      state.evidenceId = go.dataset.evidenceOpen;
      state.evidenceTab = 'overview';
    }
    if (go.dataset.go === 'upload') {
      state.uploadStep = 1;
      state.uploadControl = '';
      state.receiptId = '';
    }
    state.page = go.dataset.go;
    state.flash = '';
    render();
    return;
  }
  const review = event.target.closest('[data-review]');
  if (review) {
    state.reviewId = state.reviewId === review.dataset.review ? '' : review.dataset.review;
    render();
    return;
  }
  const openFile = event.target.closest('[data-open-file]');
  if (openFile) {
    openStoredFile(openFile.dataset.openFile);
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
  const upload = event.target.closest('[data-open-evidence]');
  if (upload) {
    openEvidence(upload.dataset.control || '');
    return;
  }
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
  if (event.target.id === 'receipt-sign-form') {
    event.preventDefault();
    const signature = receiptInk();
    if (!signature) {
      state.error = 'Draw your signature in the box.';
      state.flash = '';
      render();
      return;
    }
    state.error = '';
    post('/api/loop/sign-evidence', { evidenceId: state.receiptId, signature }, { stay: true });
    return;
  }
  if (event.target.id === 'user-evidence-form' || event.target.id === 'user-upload-form') {
    event.preventDefault();
    sendEvidence(event.target);
    return;
  }
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
    const button = event.target.querySelector('[type="submit"]');
    if (!armButton(button, 'Adding…')) return;
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
    const button = event.target.querySelector('[type="submit"]');
    if (!armButton(button, 'Adding…')) return;
    const reader = new FileReader();
    reader.onload = () => {
      post('/api/loop/people-import', { file: String(reader.result || '').split(',')[1] || '', filename: file.name, signatureRequired: drawingOn() });
    };
    reader.readAsDataURL(file);
    return;
  }
});

pane.addEventListener('change', (event) => {
  if (event.target.dataset.evidenceFilter) {
    state[event.target.dataset.evidenceFilter] = event.target.value;
    state.evidencePage = 1;
    render();
    return;
  }
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
  sendEvidence(event.target);
});

document.addEventListener('change', (event) => {
  const form = event.target.form;
  if (!form || (form.id !== 'evidence-form' && form.id !== 'user-evidence-form' && form.id !== 'user-upload-form')) return;
  if (event.target.name === 'sourceId') {
    syncEvidenceSource(form);
    syncRecorded(form);
  }
  if (event.target.name === 'controlId' || event.target.name === 'name' || event.target.name === 'location') {
    syncAlso(form);
    syncRecorded(form);
  }
  if (event.target.name === 'document' && event.target.files?.[0]) {
    const name = form.elements.name;
    if (name && !String(name.value || '').trim()) name.value = event.target.files[0].name;
    syncRecorded(form);
  }
});

async function openStoredFile(evidenceId) {
  let response;
  try {
    response = await fetch(`/api/loop/evidence/${encodeURIComponent(evidenceId)}/file`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
  } catch {
    state.error = 'The document could not be opened. Check the connection and try again.';
    state.flash = '';
    render();
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    state.error = data.error || 'The document could not be opened.';
    state.flash = '';
    render();
    return;
  }
  window.open(data.url, '_blank', 'noopener');
}

async function storeComputerFile(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Use a document under 20 MB.');
  const response = await fetch('/api/loop/evidence/file-slot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ name: file.name }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.uploadUrl || !data.storagePath) {
    throw new Error(data.error || 'The document could not be stored.');
  }
  const uploaded = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!uploaded.ok) throw new Error('The document did not upload. Choose the file again.');
  return data.storagePath;
}

async function evidenceBody(form) {
  const data = new FormData(form);
  const sourceId = String(data.get('sourceId') || '');
  const source = evidenceSources().find((row) => row.id === sourceId);
  if (!source) throw new Error('Choose where the document lives.');
  let name = String(data.get('name') || '').trim();
  let fileHash = '';
  let documentText = '';
  let storagePath = '';
  if (source.connected) {
    const file = form.querySelector('input[name="document"]')?.files?.[0];
    if (!file) throw new Error('Choose a file from this computer.');
    if (!name) name = file.name;
    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength) throw new Error('That file is empty, so it cannot be read.');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    fileHash = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
    documentText = await readDocumentText(file, bytes);
    storagePath = await storeComputerFile(file);
  }
  return {
    name,
    controlId: data.get('controlId'),
    controlIds: data.getAll('also'),
    note: data.get('note'),
    documentText,
    storagePath,
    sourceId,
    location: data.get('location') || '',
    fileHash,
    reviewDue: data.get('reviewDue') || '',
  };
}

function clipText(value) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, 12000);
}

async function readDocumentText(file, bytes) {
  const name = String(file?.name || '').toLowerCase();
  try {
    if (name.endsWith('.docx')) return clipText(docxPlain(await zipEntry(bytes, 'word/document.xml')));
    if (name.endsWith('.pdf')) return clipText(pdfPlain(bytes));
    if (file.type.startsWith('text/') || /\.(txt|md|csv|json|html|htm|rtf|log)$/.test(name)) {
      return clipText(new TextDecoder().decode(bytes));
    }
  } catch {
    return '';
  }
  return '';
}

function docxPlain(xml) {
  return String(xml || '')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');
}

function pdfPlain(buffer) {
  const raw = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const parts = [];
  const pattern = /\(((?:\\.|[^\\)]){1,400})\)\s*Tj/g;
  let match = pattern.exec(raw);
  while (match) {
    parts.push(match[1].replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\([()\\])/g, '$1'));
    match = pattern.exec(raw);
  }
  return parts.join(' ');
}

async function zipEntry(buffer, wanted) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  const scan = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= scan; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return '';
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let entry = 0; entry < count; entry += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return '';
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLen));
    if (name === wanted) {
      if (localOffset + 30 > bytes.length) return '';
      const localName = view.getUint16(localOffset + 26, true);
      const localExtra = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localName + localExtra;
      const slice = bytes.slice(dataStart, dataStart + compressed);
      if (method === 0) return new TextDecoder().decode(slice);
      if (method === 8 && typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new TextDecoder().decode(await new Response(stream).arrayBuffer());
      }
      return '';
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return '';
}

function unlockEvidenceForm(form) {
  form.querySelectorAll('input, select, textarea, button').forEach((field) => { field.disabled = false; });
  form.querySelector('.er-hold')?.remove();
  const button = form.querySelector('[type="submit"]');
  if (button) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = form.id === 'user-upload-form' ? 'Submit Evidence for Review' : 'Upload evidence';
  }
  syncAlso(form);
}

async function sendEvidence(form) {
  form.querySelector('.er-form-error')?.remove();
  const button = form.querySelector('[type="submit"]');
  let body;
  try {
    body = await evidenceBody(form);
  } catch (error) {
    state.error = error.message || 'Choose a file and a requirement.';
    state.flash = '';
    if (form.id === 'evidence-form') {
      unlockEvidenceForm(form);
      showFormError(form, state.error);
    } else render();
    return;
  }
  if (!armButton(button, 'Submitting…')) return;
  if (form.id !== 'user-upload-form') body.release = true;
  const data = await post('/api/loop/evidence', body, { stay: form.id === 'user-upload-form' });
  if (form.id === 'user-upload-form') {
    if (!state.error && data?.evidenceId) {
      state.page = 'upload';
      state.receiptId = data.evidenceId;
      state.flash = '';
      state.error = '';
      render();
    }
    return;
  }
  if (!state.error) {
    form.reset();
    document.getElementById('evidence-dialog').close();
    fillEvidenceDialog();
  } else {
    unlockEvidenceForm(form);
    showFormError(form, state.error);
  }
}

function showFormError(form, message) {
  let note = form.querySelector('.er-form-error');
  if (!note) {
    note = document.createElement('p');
    note.className = 'er-form-error mt-3 text-sm text-rose-700';
    form.appendChild(note);
  }
  note.textContent = message;
}

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
  const confirming = url.endsWith('/reset') || (url.endsWith('/signup') && state.invite);
  if (confirming && data.get('password') !== data.get('confirm')) {
    showAuth('The two passwords do not match.');
    return;
  }
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
      token: state.resetToken,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showAuth(payload.error || 'That did not save.');
    return;
  }
  state.invite = null;
  state.resetToken = '';
  if (url.endsWith('/reset')) history.replaceState({}, '', currentPath());
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

document.getElementById('forgot-open').addEventListener('click', () => {
  state.authMode = 'forgot';
  showAuth();
});

document.getElementById('forgot-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = new FormData(event.target).get('email');
  const response = await fetch('/api/auth/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showAuth(payload.error || 'That reset link was not sent.');
    return;
  }
  showAuth('', payload.message || 'A reset link was sent.');
});

document.getElementById('reset-form').addEventListener('submit', (event) => {
  event.preventDefault();
  authenticate('/api/auth/reset', event.target);
});

document.getElementById('auth-switch').addEventListener('click', () => {
  state.authMode = state.authMode === 'signup' ? 'signin' : state.authMode === 'signin' ? 'signup' : 'signin';
  state.resetToken = '';
  showAuth();
});

document.addEventListener('click', (event) => {
  const panel = document.getElementById('note-panel');
  const account = document.getElementById('account-panel');
  const accountMenu = document.getElementById('account-menu');
  if (event.target.closest('#note-bell')) {
    if (panel) panel.hidden = !panel.hidden;
    if (account) account.hidden = true;
    if (accountMenu) accountMenu.setAttribute('aria-expanded', 'false');
    return;
  }
  if (event.target.closest('#account-menu')) {
    const open = account ? account.hidden : true;
    if (account) account.hidden = !open;
    if (accountMenu) accountMenu.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (panel) panel.hidden = true;
    return;
  }
  if (event.target.id === 'account-profile') {
    if (account) account.hidden = true;
    if (accountMenu) accountMenu.setAttribute('aria-expanded', 'false');
    state.page = 'profile';
    state.flash = '';
    state.error = '';
    render();
    return;
  }
  if (event.target.id === 'note-read' || event.target.id === 'note-read-page') {
    post('/api/loop/notifications/read', { all: true });
    return;
  }
  const note = event.target.closest('[data-note]');
  if (note) {
    const page = note.dataset.page;
    if (page && navItems().some(([id]) => id === page)) state.page = page;
    if (panel) panel.hidden = true;
    post('/api/loop/notifications/read', { id: note.dataset.note });
    return;
  }
  if (panel && !panel.hidden && !event.target.closest('#note-panel')) panel.hidden = true;
  if (account && !account.hidden && !event.target.closest('#account-panel')) {
    account.hidden = true;
    if (accountMenu) accountMenu.setAttribute('aria-expanded', 'false');
  }
});

document.getElementById('header-upload')?.addEventListener('click', () => {
  state.page = 'upload';
  state.uploadControl = '';
  state.receiptId = '';
  state.flash = '';
  state.error = '';
  render();
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
  const toggle = event.target.closest('[data-password-toggle]');
  if (toggle) {
    const input = toggle.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    toggle.querySelector('[data-eye-open]').hidden = show;
    toggle.querySelector('[data-eye-shut]').hidden = !show;
    return;
  }
  const closer = event.target.closest('[data-close]');
  if (!closer) return;
  document.getElementById(closer.dataset.close).close();
});

load();
