const crypto = require('crypto');

const BUCKET = 'evidence';

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function root() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail(500, 'Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  return { url, key };
}

async function storage(pathName, options = {}) {
  const { url, key } = root();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${url}/storage/v1/${pathName}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });
  const text = await response.text();
  if (!response.ok) {
    let message = 'The document store did not respond.';
    try {
      message = JSON.parse(text).message || JSON.parse(text).error || message;
    } catch {
      if (text) message = text.slice(0, 180);
    }
    fail(response.status === 404 ? 404 : 502, message);
  }
  return text ? JSON.parse(text) : null;
}

function safeName(name) {
  const base = String(name || 'document').split(/[/\\]/).pop();
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return cleaned || 'document';
}

async function ensureBucket() {
  const listed = await storage('bucket');
  const rows = Array.isArray(listed) ? listed : [];
  if (rows.some((row) => row.id === BUCKET || row.name === BUCKET)) return;
  try {
    await storage('bucket', {
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({
        id: BUCKET,
        name: BUCKET,
        public: false,
        file_size_limit: 20971520,
      }),
    });
  } catch (error) {
    if (!/already exists/i.test(error.message || '')) throw error;
  }
}

async function reserve(organisationId, personId, name) {
  await ensureBucket();
  const objectPath = `${organisationId}/${personId}/${crypto.randomBytes(8).toString('hex')}/${safeName(name)}`;
  const signed = await storage(`object/upload/sign/${BUCKET}/${objectPath}`, {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ expiresIn: 120 }),
  });
  const relative = signed?.url || signed?.signedUrl;
  if (!relative) fail(502, 'The document store did not open an upload.');
  const { url } = root();
  const uploadUrl = relative.startsWith('http') ? relative : `${url}/storage/v1${relative.startsWith('/') ? '' : '/'}${relative}`;
  return { uploadUrl, storagePath: `storage:${objectPath}` };
}

async function exists(objectPath) {
  try {
    await storage(`object/info/${BUCKET}/${objectPath}`);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function signedDownload(objectPath) {
  const signed = await storage(`object/sign/${BUCKET}/${objectPath}`, {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ expiresIn: 120 }),
  });
  const relative = signed?.signedURL || signed?.signedUrl || signed?.url;
  if (!relative) fail(502, 'The document could not be opened.');
  const { url } = root();
  return relative.startsWith('http') ? relative : `${url}/storage/v1${relative.startsWith('/') ? '' : '/'}${relative}`;
}

async function download(objectPath) {
  const { url, key } = root();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${objectPath}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

module.exports = { reserve, exists, signedDownload, download };
