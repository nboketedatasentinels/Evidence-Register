const ExcelJS = require('exceljs');

// The compliance report: one Excel workbook an admin or reviewer can hand to
// an auditor. It is built from the same view the pages show, so the numbers
// match what people see on screen.

const STATUS_LABEL = {
  MET: 'Met',
  PARTIAL: 'Partially met',
  'NOT MET': 'Not met',
  'NO EVIDENCE': 'No evidence',
  EXPIRED: 'Expired (past review date)',
};

const REVIEW_LABEL = {
  awaiting: 'Awaiting review',
  confirmed: 'Accepted',
  rejected: 'Rejected',
  overridden: 'Result edited',
  requested: 'More evidence requested',
};

const DECISION_LABEL = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  edited: 'Result edited',
  requested: 'More evidence requested',
  verified: 'Fix verified',
  'sent-back': 'Fix sent back',
};

const OPEN_TICKET = ['assigned', 'in_progress', 'reopened', 'verification'];

// The register's own colours, so the workbook looks like the app.
const C = {
  navy: 'FF071E36',
  brand: 'FF1860C8',
  ink: 'FF121417',
  muted: 'FF5C6E82',
  line: 'FFE6EAF0',
  mist: 'FFF4F6F8',
  white: 'FFFFFFFF',
};

// Same pairs as the status pills on screen: [background, text].
const TONE = {
  Met: ['FFECFDF5', 'FF065F46'],
  'Partially met': ['FFFFFBEB', 'FF78350F'],
  'Not met': ['FFFFF1F2', 'FF9F1239'],
  'No evidence': ['FFF1F5F9', 'FF475569'],
  'Expired (past review date)': ['FFFFF7ED', 'FF9A3412'],
  Accepted: ['FFECFDF5', 'FF065F46'],
  'Fix verified': ['FFECFDF5', 'FF065F46'],
  Rejected: ['FFFFF1F2', 'FF9F1239'],
  'Fix sent back': ['FFFFF1F2', 'FF9F1239'],
  'Awaiting review': ['FFEFF6FF', 'FF1E40AF'],
  'More evidence requested': ['FFFFFBEB', 'FF78350F'],
  'Result edited': ['FFF1F5F9', 'FF475569'],
};

const FONT = 'Calibri';
const thin = { style: 'thin', color: { argb: C.line } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function stamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function paint(cell, label, bold = true) {
  const tone = TONE[label];
  if (!tone) return;
  cell.fill = fill(tone[0]);
  cell.font = { name: FONT, size: 10, bold, color: { argb: tone[1] } };
}

function printSetup(page, org, landscape) {
  page.pageSetup = {
    orientation: landscape ? 'landscape' : 'portrait',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  const safe = String(org).replace(/&/g, '&&');
  page.headerFooter.oddHeader = `&L&8&K5C6E82${safe}&R&8&K5C6E82Compliance report`;
  page.headerFooter.oddFooter = '&L&8&K5C6E82Data Sentinels Evidence Register&R&8&K5C6E82Page &P of &N';
}

// One styled table sheet: a title band, a header row, then the rows.
function table(book, title, org, spec) {
  const { headers, rows, widths, wrap = [], status = [], flag = [] } = spec;
  const page = book.addWorksheet(title, {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  page.columns = widths.map((width) => ({ width }));
  const last = headers.length;

  page.mergeCells(1, 1, 1, last);
  const band = page.getCell(1, 1);
  band.value = title;
  band.font = { name: FONT, size: 14, bold: true, color: { argb: C.white } };
  band.fill = fill(C.navy);
  band.alignment = { vertical: 'middle', indent: 1 };
  page.getRow(1).height = 30;

  page.mergeCells(2, 1, 2, last);
  const sub = page.getCell(2, 1);
  sub.value = `${org}  ·  ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
  sub.font = { name: FONT, size: 9, color: { argb: C.muted } };
  sub.alignment = { vertical: 'middle', indent: 1 };
  page.getRow(2).height = 20;

  const head = page.getRow(3);
  head.values = headers;
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.brand);
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = BOX;
  });

  if (!rows.length) {
    page.mergeCells(4, 1, 4, last);
    const none = page.getCell(4, 1);
    none.value = 'Nothing recorded yet.';
    none.font = { name: FONT, size: 10, italic: true, color: { argb: C.muted } };
    none.alignment = { indent: 1 };
  }

  rows.forEach((values, index) => {
    const row = page.addRow(values);
    const stripe = index % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.border = BOX;
      cell.alignment = { vertical: 'top', wrapText: wrap.includes(col) };
      if (stripe) cell.fill = fill(C.mist);
      if (status.includes(col)) paint(cell, cell.value);
      if (flag.includes(col) && cell.value === 'Yes') {
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FF9F1239' } };
      }
    });
  });

  if (rows.length) page.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: last } };
  printSetup(page, org, last > 4);
  page.pageSetup.printTitlesRow = '3:3';
  return page;
}

function summarySheet(book, org, data) {
  const page = book.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  page.columns = [{ width: 38 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }];
  const width = 7;
  let at = 1;

  const band = (text, size, height, color = C.navy) => {
    page.mergeCells(at, 1, at, width);
    const cell = page.getCell(at, 1);
    cell.value = text;
    cell.font = { name: FONT, size, bold: true, color: { argb: C.white } };
    cell.fill = fill(color);
    cell.alignment = { vertical: 'middle', indent: 1 };
    page.getRow(at).height = height;
    at += 1;
  };
  const heading = (text) => {
    at += 1;
    page.mergeCells(at, 1, at, width);
    const cell = page.getCell(at, 1);
    cell.value = text;
    cell.font = { name: FONT, size: 12, bold: true, color: { argb: C.navy } };
    cell.border = { bottom: { style: 'medium', color: { argb: C.brand } } };
    page.getRow(at).height = 22;
    at += 1;
  };
  const pair = (label, value, opts = {}) => {
    const a = page.getCell(at, 1);
    const b = page.getCell(at, 2);
    a.value = label;
    b.value = value;
    a.font = { name: FONT, size: 10, color: { argb: C.muted } };
    b.font = { name: FONT, size: 10, bold: true, color: { argb: opts.alert && value ? 'FF9F1239' : C.ink } };
    b.alignment = { horizontal: typeof value === 'number' ? 'right' : 'left' };
    if (typeof value !== 'number') page.mergeCells(at, 2, at, width);
    [a, b].forEach((cell) => { cell.border = { bottom: thin }; });
    at += 1;
  };

  band('Compliance report', 20, 40);
  band(org, 12, 24, C.brand);

  heading('About this report');
  pair('Frameworks', data.frameworks);
  pair('Generated', data.generated);
  pair('Generated by', data.by);

  heading('Where the register stands');
  const head = page.getRow(at);
  ['Status', 'Requirements', 'Share'].forEach((text, i) => {
    const cell = head.getCell(i + 1);
    cell.value = text;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.brand);
    cell.border = BOX;
    cell.alignment = { horizontal: i ? 'right' : 'left', vertical: 'middle' };
  });
  head.height = 20;
  at += 1;
  const first = at;
  data.statuses.forEach(([label, count]) => {
    const row = page.getRow(at);
    row.getCell(1).value = label;
    row.getCell(2).value = count;
    row.getCell(3).value = data.total ? count / data.total : 0;
    row.getCell(3).numFmt = '0%';
    [1, 2, 3].forEach((i) => {
      const cell = row.getCell(i);
      cell.border = BOX;
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      if (i > 1) cell.alignment = { horizontal: 'right' };
    });
    paint(row.getCell(1), label);
    at += 1;
  });
  const total = page.getRow(at);
  total.getCell(1).value = 'Total requirements';
  total.getCell(2).value = data.total;
  [1, 2, 3].forEach((i) => {
    const cell = total.getCell(i);
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.navy } };
    cell.fill = fill(C.mist);
    cell.border = { ...BOX, top: { style: 'medium', color: { argb: C.navy } } };
    if (i > 1) cell.alignment = { horizontal: 'right' };
  });
  if (data.total) {
    page.addConditionalFormatting({
      ref: `C${first}:C${at - 1}`,
      rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF8DB4EA' }, gradient: false }],
    });
  }
  at += 1;

  heading('Needs attention');
  data.attention.forEach(([label, value]) => pair(label, value, { alert: true }));

  heading('Deadlines set by the admin');
  data.deadlines.forEach(([label, value]) => pair(label, value));

  heading('By framework');
  const cols = ['Framework', 'Requirements', ...data.statusNames];
  const fh = page.getRow(at);
  cols.forEach((text, i) => {
    const cell = fh.getCell(i + 1);
    cell.value = text;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.brand);
    cell.border = BOX;
    cell.alignment = { horizontal: i ? 'center' : 'left', vertical: 'middle', wrapText: true };
  });
  fh.height = 30;
  at += 1;
  data.families.forEach((values, index) => {
    const row = page.getRow(at);
    values.forEach((value, i) => {
      const cell = row.getCell(i + 1);
      cell.value = value;
      cell.border = BOX;
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.alignment = { horizontal: i ? 'center' : 'left' };
      if (index % 2 === 1) cell.fill = fill(C.mist);
    });
    at += 1;
  });

  at += 1;
  page.mergeCells(at, 1, at, width);
  const note = page.getCell(at, 1);
  note.value = 'This report records what the register holds. It does not certify the organisation against any standard.';
  note.font = { name: FONT, size: 9, italic: true, color: { argb: C.muted } };
  note.alignment = { wrapText: true };
  page.getRow(at).height = 28;

  printSetup(page, org, false);
}

async function build(view, who, day) {
  const name = (id) => view.people.find((row) => row.id === id)?.name || (id === 'system' ? 'Compliance Agent' : id || '');
  const controls = view.controls || [];
  const tickets = view.tickets || [];
  const open = tickets.filter((ticket) => OPEN_TICKET.includes(ticket.status));
  const count = (test) => controls.filter(test).length;
  const families = [...new Set(controls.map((control) => control.family || 'Internal policy'))];
  const statuses = Object.keys(STATUS_LABEL);
  const org = view.organisation.name || view.organisation.legalName || view.organisation.id;

  const book = new ExcelJS.Workbook();
  book.creator = 'Data Sentinels Evidence Register';
  book.created = new Date();
  book.title = `Compliance report: ${org}`;

  summarySheet(book, org, {
    frameworks: view.organisation.framework || 'Internal policy',
    generated: stamp(new Date()),
    by: who.name,
    total: controls.length,
    statuses: statuses.map((status) => [STATUS_LABEL[status], count((control) => control.agreed === status)]),
    statusNames: statuses.map((status) => STATUS_LABEL[status]),
    attention: [
      ['Waiting for a reviewer decision', count((control) => control.reviewBy)],
      ['Evidence overdue', count((control) => control.evidenceLate)],
      ['Reviewer decisions overdue', count((control) => control.reviewLate)],
      ['Evidence past its review date', count((control) => control.renewSince)],
      ['Open tickets', open.length],
      ['Overdue tickets', open.filter((ticket) => ticket.due && ticket.due < day).length],
    ],
    deadlines: [
      ['Reviewers decide within (days)', view.organisation.reviewDays],
      ['Fix tickets are due after (days)', view.organisation.ticketDays],
    ],
    families: families.map((family) => {
      const rows = controls.filter((control) => (control.family || 'Internal policy') === family);
      return [family, rows.length, ...statuses.map((status) => rows.filter((control) => control.agreed === status).length)];
    }),
  });

  table(book, 'Requirements', org, {
    headers: ['Requirement', 'Framework', 'Reference', 'Wording', 'Evidence it needs', 'Review it', 'Owner', 'Reviewer', 'Status', 'Reviewer decision',
      'Latest evidence', 'Version', 'Filed', 'Evidence due by', 'Evidence overdue', 'Decide by', 'Decision overdue', 'Next review date', 'Open ticket'],
    widths: [13, 16, 11, 60, 32, 14, 18, 18, 18, 22, 32, 9, 19, 14, 11, 12, 11, 14, 20],
    wrap: [2, 4, 5, 11, 19],
    status: [9, 10],
    flag: [15, 17],
    rows: controls.map((control) => {
      const files = (view.evidence || []).filter((item) => (control.evidenceIds || []).includes(item.id));
      const latest = [...files].sort((a, b) => b.version - a.version || String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0];
      const ticket = open.find((row) => row.controlId === control.id);
      return [
        control.id, control.family || 'Internal policy', control.ref || '', control.requirement, control.expected, control.frequency,
        name(control.ownerId), name(control.reviewerId), STATUS_LABEL[control.agreed] || control.agreed,
        latest ? (REVIEW_LABEL[control.decision?.review] || '') : '',
        latest?.name || '', latest?.version || '', stamp(latest?.uploadedAt),
        control.evidenceDue || '', control.evidenceLate ? 'Yes' : '',
        control.reviewBy || '', control.reviewLate ? 'Yes' : '',
        latest?.reviewDue || '', ticket ? `${ticket.id}, due ${ticket.due}` : '',
      ];
    }),
  });

  table(book, 'Evidence', org, {
    headers: ['Evidence', 'Document', 'Version', 'Requirements', 'Filed by', 'Filed', 'Where it lives', 'Next review date', 'Rejected', 'Fingerprint'],
    widths: [13, 44, 9, 22, 18, 19, 20, 14, 10, 40],
    wrap: [2, 4, 7, 10],
    flag: [9],
    rows: (view.evidence || []).map((item) => [
      item.id, item.name, item.version, (item.controlIds || []).join(', '), name(item.uploadedBy), stamp(item.uploadedAt),
      item.source, item.reviewDue || '', item.rejected ? 'Yes' : '', item.hash,
    ]),
  });

  table(book, 'Tickets', org, {
    headers: ['Ticket', 'Requirement', 'Title', 'Owner', 'Priority', 'Status', 'Due', 'Overdue', 'Opened'],
    widths: [11, 13, 44, 18, 10, 14, 12, 10, 19],
    wrap: [3],
    flag: [8],
    rows: tickets.map((ticket) => [
      ticket.id, ticket.controlId, ticket.title, name(ticket.ownerId), ticket.priority, ticket.status, ticket.due,
      OPEN_TICKET.includes(ticket.status) && ticket.due && ticket.due < day ? 'Yes' : '', stamp(ticket.createdAt),
    ]),
  });

  table(book, 'Decisions', org, {
    headers: ['When', 'Requirement', 'Document', 'Version', 'Filed by', 'Reviewer', 'Decision', 'Result', 'Reason', 'Ticket'],
    widths: [19, 13, 36, 9, 18, 18, 22, 18, 50, 11],
    wrap: [3, 9],
    status: [7, 8],
    rows: (view.reviews || []).map((row) => [
      stamp(row.at), row.controlId, row.evidenceName, row.evidenceVersion || '', name(row.filerId), name(row.reviewerId),
      DECISION_LABEL[row.decision] || row.decision, STATUS_LABEL[row.status] || row.status, row.comment, row.ticketId,
    ]),
  });

  table(book, 'Activity log', org, {
    headers: ['When', 'Who', 'What happened'],
    widths: [19, 22, 100],
    wrap: [3],
    rows: (view.history || []).map((row) => [stamp(row.at), name(row.actorId), row.text]),
  });

  return Buffer.from(await book.xlsx.writeBuffer());
}

module.exports = { build };
