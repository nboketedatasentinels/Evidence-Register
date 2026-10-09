const MARKS = new Set(['MET', 'PARTIAL', 'NOT MET']);

function clip(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseGrade(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let body;
  try {
    body = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const status = String(body.status || '').trim().toUpperCase().replace('PARTIALLY MET', 'PARTIAL').replace('NOTMET', 'NOT MET');
  if (!MARKS.has(status)) return null;
  const reason = clip(body.reason, 400);
  if (reason.length < 8) return null;
  return {
    status,
    reason,
    recommendation: clip(body.recommendation, 240),
  };
}

async function grade(control, documentName, documentText, file) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  const wording = clip(documentText, 8000);
  const attached = file && file.buffer && file.buffer.length && file.mimeType;
  if (!key || (wording.length < 20 && !attached)) return null;
  const requirement = clip(control.requirement, 500);
  const expected = clip(control.expected, 200);
  const lines = [
    'You prepare a suggested mark for an evidence register. A person makes the final decision. You do not approve the evidence.',
    'Compare only the requirement below with the document. Do not add requirements from outside this document, and do not quote a standard.',
    'Reply with JSON only: {"status":"MET"|"PARTIAL"|"NOT MET","reason":"...","recommendation":"..."}',
    'MET means the document covers what this requirement asks. PARTIAL means some of it is there and a gap remains. NOT MET means it does not cover the requirement.',
    'reason: one or two sentences on what is present and what is missing. recommendation: one sentence on what to add, or an empty string when the status is MET.',
    `Requirement ${control.id}: ${requirement}`,
    `Evidence it needs: ${expected}`,
    `Document name: ${clip(documentName, 160)}`,
  ];
  const parts = [];
  if (wording.length >= 20) {
    lines.push('Document text:', wording);
  } else {
    lines.push('The document file is attached. Read that file.');
    parts.push({ inlineData: { mimeType: file.mimeType, data: file.buffer.toString('base64') } });
  }
  parts.unshift({ text: lines.join('\n') });
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  return parseGrade(text);
}

module.exports = { grade, parseGrade };
