const zlib = require('zlib');
const XLSX = require('xlsx');

const FILE_LIMIT = 6 * 1024 * 1024;

function clip(value) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, 12000);
}

function mimeFor(filename) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  return '';
}

function extractText(buffer, filename) {
  if (!buffer || !buffer.length) return '';
  const name = String(filename || '').toLowerCase();
  try {
    if (name.endsWith('.docx')) return clip(officeXml(buffer, /^word\/(document|header\d+|footer\d+)\.xml$/));
    if (name.endsWith('.pptx')) return clip(taggedXml(buffer, /^ppt\/slides\/slide\d+\.xml$/, 'a:t'));
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) return clip(sheet(buffer));
    if (name.endsWith('.odt')) return clip(xmlPlain(zipEntry(buffer, 'content.xml')));
    if (name.endsWith('.rtf')) return clip(rtfPlain(buffer.toString('latin1')));
    if (name.endsWith('.html') || name.endsWith('.htm')) return clip(htmlPlain(buffer.toString('utf8')));
    if (name.endsWith('.doc')) return clip(legacyDoc(buffer));
    if (/\.(txt|md|csv|json|log)$/.test(name) || String(filename || '').toLowerCase().startsWith('text/')) {
      return clip(buffer.toString('utf8'));
    }
  } catch {
    return '';
  }
  return '';
}

function sheet(buffer) {
  const book = XLSX.read(buffer, { type: 'buffer' });
  return book.SheetNames.map((name) => `${name}\n${XLSX.utils.sheet_to_csv(book.Sheets[name])}`).join('\n');
}

function officeXml(buffer, pattern) {
  return zipNames(buffer)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => xmlPlain(zipEntry(buffer, name)))
    .join('\n');
}

function taggedXml(buffer, pattern, tag) {
  return zipNames(buffer)
    .filter((name) => pattern.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => tagText(zipEntry(buffer, name), tag))
    .join('\n');
}

function xmlPlain(xml) {
  return String(xml || '')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function tagText(xml, tag) {
  const parts = [];
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let match = pattern.exec(String(xml || ''));
  while (match) {
    parts.push(match[1].replace(/<[^>]+>/g, ''));
    match = pattern.exec(String(xml || ''));
  }
  return parts.join('\n');
}

function htmlPlain(raw) {
  return String(raw || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function rtfPlain(raw) {
  return String(raw || '')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, (mark) => String.fromCharCode(parseInt(mark.slice(2), 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, ' ');
}

function legacyDoc(buffer) {
  const text = buffer.toString('utf16le');
  const parts = text.match(/[A-Za-z0-9][A-Za-z0-9 ,.'’:;()\-]{12,}/g) || [];
  return parts.join('\n');
}

function zipNames(buffer) {
  return zipEntries(buffer).map((entry) => entry.name);
}

function zipEntry(buffer, wanted) {
  const found = zipEntries(buffer).find((entry) => entry.name === wanted);
  return found ? found.text : '';
}

function zipEntries(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const scan = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= scan; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let entry = 0; entry < count; entry += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = bytes.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;
    if (localOffset + 30 > bytes.length) continue;
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localName + localExtra;
    const slice = bytes.slice(dataStart, dataStart + compressed);
    let text = '';
    if (method === 0) text = slice.toString('utf8');
    else if (method === 8) {
      try {
        text = zlib.inflateRawSync(slice).toString('utf8');
      } catch {
        text = '';
      }
    }
    entries.push({ name, text });
  }
  return entries;
}

function attachment(filename, buffer) {
  const mimeType = mimeFor(filename);
  if (!mimeType || !buffer || !buffer.length || buffer.length > FILE_LIMIT) return null;
  return { mimeType, buffer };
}

module.exports = { extractText, mimeFor, attachment };
