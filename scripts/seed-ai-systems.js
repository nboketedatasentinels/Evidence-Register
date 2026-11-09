// Fills one organisation's AI System Register with demo systems, for
// screenshots and demos. Each system is linked to requirements already on that
// organisation, so its status is the real one the register works out.
//   npm run seed-systems                          lists the organisations
//   npm run seed-systems -- ORG-ID                shows what would be added
//   npm run seed-systems -- ORG-ID --yes          adds it
//   npm run seed-systems -- ORG-ID --remove --yes takes the demo systems out again

require('dotenv').config({ quiet: true });
const db = require('../lib/db');
const loop = require('../lib/loop');

// want: the status each system should show, if the organisation has a
// requirement in that state to link it to.
const DEMO = [
  { name: 'Assignment grading assistant', purpose: "Suggests a mark and feedback on learners' written answers", source: 'third-party-model', provider: 'Google Gemini 3 Flash', stage: 'live', oversight: 'person-decides', personalData: 'no', countries: 'Germany (database); USA (Google)', risk: 'medium', want: 'review-due' },
  { name: 'Customer chatbot', purpose: 'Answers customer questions on the website and WhatsApp', source: 'third-party-model', provider: 'OpenAI GPT-4o', stage: 'live', oversight: 'automated', personalData: 'yes', countries: 'South Africa; USA (OpenAI)', risk: 'high', want: 'action' },
  { name: 'CV screening tool', purpose: 'Shortlists job applicants from their CVs', source: 'bought', provider: 'Recruitment platform add-on', stage: 'testing', oversight: 'person-decides', personalData: 'yes', countries: 'Ireland (vendor)', risk: 'high', want: 'no-evidence' },
  { name: 'Fraud detection', purpose: 'Flags unusual transactions for the risk team', source: 'in-house', provider: 'Own model, trained on 3 years of transactions', stage: 'live', oversight: 'person-samples', personalData: 'yes', countries: 'South Africa', risk: 'medium', want: 'approved' },
  { name: 'Meeting notes AI', purpose: 'Transcribes and summarises internal meetings', source: 'bought', provider: 'Microsoft Copilot', stage: 'live', oversight: 'person-decides', personalData: 'yes', countries: 'EU (Microsoft)', risk: 'low', want: 'approved' },
  { name: 'Credit scoring model', purpose: 'Scores loan applications before a person decides', source: 'in-house', provider: 'Own model', stage: 'building', oversight: 'person-decides', personalData: 'yes', countries: 'Zimbabwe', risk: 'high', want: 'action' },
  { name: 'Document summariser', purpose: 'Summarises contracts and policies for staff', source: 'third-party-model', provider: 'Anthropic Claude', stage: 'planned', oversight: 'person-decides', personalData: 'unsure', countries: 'USA (Anthropic)', risk: 'low', want: 'review-due' },
];

function groups(controls) {
  const approved = controls.filter((row) => row.agreed === 'MET' && row.decision.review === 'confirmed');
  const noEvidence = controls.filter((row) => row.agreed === 'NO EVIDENCE');
  const due = controls.filter((row) => row.agreed === 'EXPIRED' || row.reviewLate
    || (row.evidenceIds.length && row.decision.review === 'awaiting'));
  const taken = new Set([...approved, ...noEvidence, ...due].map((row) => row.id));
  const action = controls.filter((row) => !taken.has(row.id));
  return { approved, 'no-evidence': noEvidence, 'review-due': due, action };
}

function pick(list, index, count) {
  if (!list.length) return [];
  return Array.from({ length: Math.min(count, list.length) }, (_, step) => list[(index + step) % list.length].id);
}

async function main() {
  const [orgId] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const write = process.argv.includes('--yes');
  const remove = process.argv.includes('--remove');

  if (!orgId) {
    console.log('Name the organisation. These are on the register:\n');
    (await db.listOrganisations()).forEach((row) => console.log(`  ${row.id}  ${row.name}  (${row.people} people, opened ${row.createdAt.slice(0, 10)})`));
    return;
  }

  const ws = await loop.read(orgId, '');
  const admin = ws.people.find((row) => row.roles.includes('admin'));
  if (!admin) throw new Error(`${ws.organisation.name} has no admin, so nothing can be added.`);
  console.log(`${ws.organisation.name} (${orgId}): ${ws.people.length} people, ${ws.controls.length} requirements, ${ws.systems.length} AI systems now.\n`);

  if (remove) {
    const demo = new Set(DEMO.map((row) => row.name));
    const found = ws.systems.filter((row) => demo.has(row.name));
    found.forEach((row) => console.log(`  remove  ${row.name}`));
    if (!found.length) console.log('  No demo system is on this register.');
    if (!write) return console.log('\nNothing changed. Add --yes to remove them.');
    for (const row of found) {
      await loop.removeSystem({ organisationId: orgId, actorId: admin.id, name: row.name });
    }
    return console.log(`\nRemoved ${found.length}.`);
  }

  const byStatus = groups(ws.controls);
  const owners = ws.people;
  const existing = new Set(ws.systems.map((row) => row.name.toLowerCase()));
  const plan = DEMO.filter((row) => !existing.has(row.name.toLowerCase())).map((row, index) => {
    // An approved requirement alongside the one that sets the status, so the
    // "met" count is not always zero.
    const lead = pick(byStatus[row.want], index, row.want === 'approved' ? 2 : 1);
    const extra = row.want === 'approved' ? [] : pick(byStatus.approved, index, 1);
    return {
      ...row,
      ownerId: owners.length ? owners[index % owners.length].id : '',
      controlIds: [...new Set([...lead, ...extra])],
    };
  });

  plan.forEach((row) => {
    const owner = ws.people.find((item) => item.id === row.ownerId)?.name || 'not set';
    console.log(`  add  ${row.name.padEnd(26)} ${row.risk.padEnd(7)} owner ${owner.padEnd(20)} requirements ${row.controlIds.join(', ') || 'none'}`);
  });
  if (!plan.length) return console.log('  Every demo system is already on this register.');
  const missing = Object.entries(byStatus).filter(([, list]) => !list.length).map(([status]) => status);
  if (missing.length) console.log(`\nNo requirement is in these states yet, so some systems will show a different status: ${missing.join(', ')}.`);
  if (!write) return console.log('\nNothing changed. Add --yes to add them.');

  for (const row of plan) {
    await loop.addSystem({ organisationId: orgId, actorId: admin.id, ...row });
  }
  const after = await loop.read(orgId, '');
  console.log('\nAdded. The register now reads:\n');
  after.systems.forEach((row) => console.log(`  ${row.name.padEnd(26)} ${row.status}`));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
