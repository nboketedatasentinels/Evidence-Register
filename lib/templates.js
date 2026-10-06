const ISO_TEMPLATES = [
  {
    id: 'iso-policy',
    family: 'ISO/IEC 42001',
    title: 'AI policy',
    requirement: 'The organisation has an AI policy that names who is accountable for the AI management system.',
    expected: 'AI policy',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso-roles',
    family: 'ISO/IEC 42001',
    title: 'Roles and responsibilities',
    requirement: 'Roles for the AI management system are documented, including who owns each control and who may review evidence.',
    expected: 'Roles and responsibilities',
    frequency: 'When the organisation changes',
  },
  {
    id: 'iso-risk',
    family: 'ISO/IEC 42001',
    title: 'AI risk assessment',
    requirement: 'AI risks are identified, assessed, and reviewed on the interval the organisation sets.',
    expected: 'AI risk assessment and its review record',
    frequency: 'Every 6 months',
  },
  {
    id: 'iso-objectives',
    family: 'ISO/IEC 42001',
    title: 'AI objectives',
    requirement: 'The organisation records the objectives of its AI management system and how it will tell whether they are being met.',
    expected: 'AI objectives and how they are measured',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso-inventory',
    family: 'ISO/IEC 42001',
    title: 'AI system inventory',
    requirement: 'The organisation keeps a list of the AI systems it uses, who owns each one, and what it is used for.',
    expected: 'AI system inventory',
    frequency: 'When a system is added or retired',
  },
  {
    id: 'iso-data',
    family: 'ISO/IEC 42001',
    title: 'Data used by AI systems',
    requirement: 'For each AI system, the organisation can show what data it uses and any limit it has placed on that use.',
    expected: 'Data use record',
    frequency: 'When the data or the system changes',
  },
  {
    id: 'iso-training',
    family: 'ISO/IEC 42001',
    title: 'Competence',
    requirement: 'People who carry AI governance duties have a training record the organisation can show.',
    expected: 'Training record',
    frequency: 'Every 12 months',
  },
  {
    id: 'iso-operation',
    family: 'ISO/IEC 42001',
    title: 'Operating AI systems',
    requirement: 'The organisation can show how an AI system is put into use, watched, and changed.',
    expected: 'Operating procedure or change record',
    frequency: 'When the system changes',
  },
  {
    id: 'iso-incident',
    family: 'ISO/IEC 42001',
    title: 'Incidents and complaints',
    requirement: 'The organisation records AI incidents and complaints, and what was done about them.',
    expected: 'Incident or complaint record',
    frequency: 'When an incident or complaint is raised',
  },
  {
    id: 'iso-supplier',
    family: 'ISO/IEC 42001',
    title: 'Supplied AI',
    requirement: 'Where another organisation supplies an AI system, the responsibilities of each side are written down.',
    expected: 'Supplier responsibility record',
    frequency: 'When a supplier arrangement changes',
  },
  {
    id: 'iso-review',
    family: 'ISO/IEC 42001',
    title: 'Management review',
    requirement: 'Management reviews the AI management system on the agreed interval.',
    expected: 'Management review record',
    frequency: 'Every 6 months',
  },
];

function listTemplates(controls) {
  const used = new Set((controls || []).map((control) => control.templateId).filter(Boolean));
  return ISO_TEMPLATES.map((template) => ({ ...template, used: used.has(template.id) }));
}

function findTemplate(id) {
  return ISO_TEMPLATES.find((template) => template.id === id) || null;
}

module.exports = { ISO_TEMPLATES, listTemplates, findTemplate };
