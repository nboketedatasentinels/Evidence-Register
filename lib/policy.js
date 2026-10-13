// Finds the lines in a policy document that set an obligation, so an admin can
// turn them into requirements. It reads the words only: nothing is sent to an
// outside service, and a person chooses which lines become requirements.
const OBLIGATION = /\b(must|shall|is required to|are required to|required to|will ensure|is responsible for|are responsible for|has to|have to|needs to|need to|may not|must not|shall not|is prohibited|are prohibited|at least|every|each|all (staff|employees|personnel|users|contractors|managers)|everyone|no one|annually|quarterly|monthly)\b/i;
const MAX_LINES = 30;

function tidy(line) {
  return String(line || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s•●▪◦\-–—*·>]+/, '')
    .replace(/^(\(?[0-9ivxlc]+[.)]|\(?[a-z][.)]|[0-9]+(\.[0-9]+)+\.?)\s+/i, '')
    .trim();
}

// PDF text breaks lines mid-sentence. A line that does not end a sentence and
// is followed by one starting in lower case is the same sentence.
function joinWrapped(text) {
  const out = [];
  String(text || '').replace(/\r/g, '\n').split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      out.push('');
      return;
    }
    const last = out[out.length - 1];
    if (last && !/[.;:!?]$/.test(last) && /^[a-z(]/.test(line)) out[out.length - 1] = `${last} ${line}`;
    else out.push(line);
  });
  return out.join('\n');
}

function sentences(text) {
  return joinWrapped(text)
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.;!?])\s+(?=[A-Z(])/))
    .map(tidy)
    .filter(Boolean);
}

function findObligations(text) {
  const seen = new Set();
  const lines = [];
  for (const line of sentences(text)) {
    if (line.length < 25 || line.length > 240) continue;
    if (!OBLIGATION.test(line)) continue;
    if (/^(page \d+|table of contents|contents|version \d)/i.test(line)) continue;
    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(/[.!?]$/.test(line) ? line : `${line}.`);
    if (lines.length >= MAX_LINES) break;
  }
  return lines;
}

module.exports = { findObligations };
