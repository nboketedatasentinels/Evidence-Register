function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

const CONFLICT = 'Someone else changed this register a moment ago. Open the page again and repeat the step.';

async function rest(pathName, options = {}) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail(500, 'Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  const response = await fetch(`${url}/rest/v1/${pathName}`, {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = 'The database did not save.';
    try {
      message = JSON.parse(text).message || message;
    } catch {
      if (text) message = text.slice(0, 240);
    }
    if (/register_conflict/.test(message)) fail(409, CONFLICT);
    fail(response.status === 404 ? 404 : 502, message);
  }
  return text ? JSON.parse(text) : null;
}

function eq(value) {
  return `eq.${encodeURIComponent(String(value))}`;
}

module.exports = { rest, eq, fail };
