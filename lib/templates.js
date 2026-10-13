// Requirement templates, grouped by the framework an organisation governs
// against. The wording is a plain-language summary for the organisation to
// adopt. It is not the text of any standard, which stays with its publisher.
const FRAMEWORKS = ['ISO/IEC 27001', 'PCI DSS', 'ISO/IEC 42001', 'Internal policy'];
const DEFAULT_FRAMEWORKS = ['Internal policy'];

const ISO_27001 = [
  {
    id: 'iso27-scope',
    ref: 'Clause 4.3',
    title: 'Scope of the ISMS',
    requirement: 'The organisation has written down which sites, systems, and services its information security management system covers.',
    expected: 'ISMS scope statement',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso27-policy',
    ref: 'Clause 5.2',
    title: 'Information security policy',
    requirement: 'Top management has approved an information security policy and it has been shared with staff.',
    expected: 'Signed information security policy',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso27-risk',
    ref: 'Clause 6.1.2',
    title: 'Information security risk assessment',
    requirement: 'Information security risks are identified, given an owner, and rated on the method the organisation has chosen.',
    expected: 'Risk register and assessment method',
    frequency: 'Every 6 months',
  },
  {
    id: 'iso27-soa',
    ref: 'Clause 6.1.3',
    title: 'Statement of Applicability',
    requirement: 'The organisation lists which Annex A controls apply, why, and whether each one is in place.',
    expected: 'Statement of Applicability',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso27-assets',
    ref: 'Annex A 5.9',
    title: 'Inventory of information and assets',
    requirement: 'The organisation keeps a list of its information and the assets that hold it, with an owner for each.',
    expected: 'Asset inventory',
    frequency: 'Every 6 months',
  },
  {
    id: 'iso27-access',
    ref: 'Annex A 5.15, 5.18',
    title: 'Access control and access reviews',
    requirement: 'Access to systems is granted on need, and someone reviews who has access on a set interval.',
    expected: 'Access control policy and the last access review',
    frequency: 'Every 3 months',
  },
  {
    id: 'iso27-supplier',
    ref: 'Annex A 5.19–5.22',
    title: 'Supplier security',
    requirement: 'Security requirements are agreed with suppliers who handle the organisation\'s information, and suppliers are reviewed.',
    expected: 'Supplier register with security terms',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso27-incident',
    ref: 'Annex A 5.24–5.27',
    title: 'Incident management',
    requirement: 'Security incidents are reported, recorded, handled, and reviewed for lessons learned.',
    expected: 'Incident procedure and incident log',
    frequency: 'When an incident is raised',
  },
  {
    id: 'iso27-continuity',
    ref: 'Annex A 5.29–5.30',
    title: 'Continuity and backups',
    requirement: 'Backups are taken and a restore has been tested, so the organisation can keep running after a disruption.',
    expected: 'Backup restore test record',
    frequency: 'Every 6 months',
  },
  {
    id: 'iso27-awareness',
    ref: 'Annex A 6.3',
    title: 'Security awareness training',
    requirement: 'Staff complete information security awareness training, and the organisation can show who completed it.',
    expected: 'Training completion record',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso27-audit',
    ref: 'Clause 9.2',
    title: 'Internal audit',
    requirement: 'The ISMS is audited internally on a plan, and findings are tracked to closure.',
    expected: 'Internal audit report',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso27-review',
    ref: 'Clause 9.3',
    title: 'Management review',
    requirement: 'Management reviews the ISMS on the agreed interval and records its decisions.',
    expected: 'Management review minutes',
    frequency: 'Every 12 months',
  },
];

const PCI_DSS = [
  {
    id: 'pci-network',
    ref: 'Requirement 1',
    title: 'Network security controls',
    requirement: 'Firewall and network rules that protect the cardholder data environment are documented and reviewed.',
    expected: 'Network diagram and firewall rule review',
    frequency: 'Every 6 months',
  },
  {
    id: 'pci-config',
    ref: 'Requirement 2',
    title: 'Secure configuration',
    requirement: 'Systems are built from a hardening standard, and vendor default passwords are changed.',
    expected: 'Configuration standard',
    frequency: 'Every 12 months',
  },
  {
    id: 'pci-stored-data',
    ref: 'Requirement 3',
    title: 'Protect stored account data',
    requirement: 'Card data is kept only as long as needed, and any stored card number is unreadable.',
    expected: 'Data retention policy and encryption record',
    frequency: 'Every 12 months',
  },
  {
    id: 'pci-transmission',
    ref: 'Requirement 4',
    title: 'Encrypt card data in transit',
    requirement: 'Card data sent over open, public networks is protected with strong encryption.',
    expected: 'TLS configuration evidence',
    frequency: 'Every 12 months',
  },
  {
    id: 'pci-malware',
    ref: 'Requirement 5',
    title: 'Protection from malicious software',
    requirement: 'Anti-malware is running on systems at risk and is kept up to date.',
    expected: 'Anti-malware coverage report',
    frequency: 'Every 3 months',
  },
  {
    id: 'pci-patching',
    ref: 'Requirement 6',
    title: 'Secure systems and patching',
    requirement: 'Security patches are installed within the time the organisation has set, and software changes are controlled.',
    expected: 'Patch report and change records',
    frequency: 'Every month',
  },
  {
    id: 'pci-access',
    ref: 'Requirements 7–8',
    title: 'Restrict and authenticate access',
    requirement: 'Access to card data is limited to people who need it, each person has their own ID, and multi-factor authentication is used.',
    expected: 'Access list and MFA configuration',
    frequency: 'Every 6 months',
  },
  {
    id: 'pci-logging',
    ref: 'Requirement 10',
    title: 'Log and monitor access',
    requirement: 'Access to systems and card data is logged, and the logs are reviewed.',
    expected: 'Log review record',
    frequency: 'Every month',
  },
  {
    id: 'pci-testing',
    ref: 'Requirement 11',
    title: 'Vulnerability scans and testing',
    requirement: 'Vulnerability scans run each quarter, and a penetration test is done each year.',
    expected: 'Scan report or penetration test report',
    frequency: 'Every 3 months',
  },
  {
    id: 'pci-policy',
    ref: 'Requirement 12',
    title: 'Security policy and awareness',
    requirement: 'An information security policy is in place, and staff are trained on it.',
    expected: 'Security policy and training record',
    frequency: 'Every 12 months',
  },
];

const ISO_42001 = [
  {
    id: 'iso-policy',
    title: 'AI policy',
    requirement: 'The organisation has an AI policy that names who is accountable for the AI management system.',
    expected: 'AI policy',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso-roles',
    title: 'Roles and responsibilities',
    requirement: 'Roles for the AI management system are documented, including who owns each control and who may review evidence.',
    expected: 'Roles and responsibilities',
    frequency: 'When the organisation changes',
  },
  {
    id: 'iso-risk',
    title: 'AI risk assessment',
    requirement: 'AI risks are identified, assessed, and reviewed on the interval the organisation sets.',
    expected: 'AI risk assessment and its review record',
    frequency: 'Every 6 months',
  },
  {
    id: 'iso-objectives',
    title: 'AI objectives',
    requirement: 'The organisation records the objectives of its AI management system and how it will tell whether they are being met.',
    expected: 'AI objectives and how they are measured',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso-inventory',
    title: 'AI system inventory',
    requirement: 'The organisation keeps a list of the AI systems it uses, who owns each one, and what it is used for.',
    expected: 'AI system inventory',
    frequency: 'When a system is added or retired',
  },
  {
    id: 'iso-data',
    title: 'Data used by AI systems',
    requirement: 'For each AI system, the organisation can show what data it uses and any limit it has placed on that use.',
    expected: 'Data use record',
    frequency: 'When the data or the system changes',
  },
  {
    id: 'iso-training',
    title: 'Competence',
    requirement: 'People who carry AI governance duties have a training record the organisation can show.',
    expected: 'Training record',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso-operation',
    title: 'Operating AI systems',
    requirement: 'The organisation can show how an AI system is put into use, watched, and changed.',
    expected: 'Operating procedure or change record',
    frequency: 'When the system changes',
  },
  {
    id: 'iso-incident',
    title: 'Incidents and complaints',
    requirement: 'The organisation records AI incidents and complaints, and what was done about them.',
    expected: 'Incident or complaint record',
    frequency: 'When an incident or complaint is raised',
  },
  {
    id: 'iso-supplier',
    title: 'Supplied AI',
    requirement: 'Where another organisation supplies an AI system, the responsibilities of each side are written down.',
    expected: 'Supplier responsibility record',
    frequency: 'When a supplier arrangement changes',
  },
  {
    id: 'iso-review',
    title: 'Management review',
    requirement: 'Management reviews the AI management system on the agreed interval.',
    expected: 'Management review record',
    frequency: 'Every 6 months',
  },
];

// Policies an organisation sets for itself, with no standard behind them.
const INTERNAL = [
  {
    id: 'int-leave',
    title: 'Leave is recorded',
    requirement: 'Everyone records their paid time off in the leave system before they take it.',
    expected: 'Leave report for the period',
    frequency: 'Every 3 months',
  },
  {
    id: 'int-training',
    title: 'Mandatory training',
    requirement: 'Everyone completes the organisation\'s mandatory training each year.',
    expected: 'Training completion report',
    frequency: 'Every 12 months',
  },
  {
    id: 'int-community',
    title: 'Community service days',
    requirement: 'Everyone gives two days of community service each year.',
    expected: 'Community service log',
    frequency: 'Every 12 months',
  },
  {
    id: 'int-onboarding',
    title: 'Policies acknowledged at onboarding',
    requirement: 'New joiners read and sign the organisation\'s policies in their first week.',
    expected: 'Signed acknowledgements',
    frequency: 'When someone joins',
  },
];

const TEMPLATES = [
  ...ISO_27001.map((row) => ({ ...row, family: 'ISO/IEC 27001' })),
  ...PCI_DSS.map((row) => ({ ...row, family: 'PCI DSS' })),
  ...ISO_42001.map((row) => ({ ...row, family: 'ISO/IEC 42001' })),
  ...INTERNAL.map((row) => ({ ...row, family: 'Internal policy' })),
];

// The organisation's framework is stored as one line, e.g. "ISO/IEC 27001, PCI DSS".
function parseFrameworks(value) {
  const chosen = String(value || '').split(',').map((item) => item.trim()).filter((item) => FRAMEWORKS.includes(item));
  return chosen.length ? [...new Set(chosen)] : DEFAULT_FRAMEWORKS;
}

function frameworkLine(list) {
  const chosen = (Array.isArray(list) ? list : [list]).map((item) => String(item || '').trim()).filter((item) => FRAMEWORKS.includes(item));
  return (chosen.length ? [...new Set(chosen)] : DEFAULT_FRAMEWORKS).join(', ');
}

function listTemplates(controls, framework) {
  const used = new Set((controls || []).map((control) => control.templateId).filter(Boolean));
  const chosen = parseFrameworks(framework);
  // Every framework is offered. The ones the organisation has chosen come first.
  const rank = (family) => (chosen.includes(family) ? chosen.indexOf(family) : FRAMEWORKS.length + FRAMEWORKS.indexOf(family));
  return TEMPLATES
    .map((template) => ({ ...template, used: used.has(template.id), chosen: chosen.includes(template.family) }))
    .sort((a, b) => rank(a.family) - rank(b.family));
}

function findTemplate(id) {
  return TEMPLATES.find((template) => template.id === id) || null;
}

module.exports = { FRAMEWORKS, TEMPLATES, listTemplates, findTemplate, parseFrameworks, frameworkLine };
