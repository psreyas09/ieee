const API_BASE = 'https://ieee-eosin.vercel.app/api';
const USERNAME = process.env.ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ieeeadmin';

function normalize(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function looksLikeDomain(v) {
  const s = String(v || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s);
}

function hasEventSignal(v) {
  return /(contest|workshop|conference|summit|symposium|school|course|webinar|fellowship|scholarship|challenge|hackathon|grant|award|call\s+for\s+papers|program|internship|competition)/i.test(String(v || ''));
}

function isLowSignal(row) {
  const title = String(row?.title || '').trim();
  const t = normalize(title);
  const org = normalize(row?.organization?.name || '');

  const simple = new Set(['home', 'homepage', 'home page', 'other', 'index', 'main', 'welcome', 'ap s']);
  if (simple.has(t)) return true;
  if (/(^|\s)home(page)?(\s|$)/i.test(title) && !hasEventSignal(title)) return true;
  if (looksLikeDomain(title)) return true;
  if (org && (t === org || org.includes(t) || t.includes(org)) && !hasEventSignal(title)) return true;

  return false;
}

async function main() {
  console.log('cleanup:start');

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  console.log('cleanup:login-request');
  const loginRes = await fetchWithTimeout(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  console.log('cleanup:login-response', loginRes.status);

  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`Login failed (${loginRes.status}): ${text}`);
  }

  const { token } = await loginRes.json();
  if (!token) throw new Error('No token returned from login');

  let page = 1;
  const limit = 200;
  const candidates = [];

  while (true) {
    console.log(`cleanup:scan-page:${page}`);
    const res = await fetchWithTimeout(`${API_BASE}/opportunities?page=${page}&limit=${limit}&sort=recent`);
    if (!res.ok) throw new Error(`Fetch opportunities failed (${res.status})`);
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];

    for (const row of rows) {
      const isAuto = String(row?.source || '').toLowerCase() === 'auto';
      const isVerified = Boolean(row?.verified);
      if (!isAuto || isVerified) continue;
      if (!isLowSignal(row)) continue;
      candidates.push(row);
    }

    const totalPages = Number(data?.pagination?.totalPages || data?.pagination?.pages || 1);
    console.log(`cleanup:scan-progress page=${page}/${totalPages} candidates=${candidates.length}`);
    if (page >= totalPages) break;
    page += 1;
  }

  let deleted = 0;
  const failed = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i];
    const delRes = await fetch(`${API_BASE}/admin/opportunities/${row.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (delRes.ok) {
      deleted += 1;
    } else {
      failed.push({ id: row.id, status: delRes.status, title: row.title });
    }

    if ((i + 1) % 25 === 0 || i === candidates.length - 1) {
      console.log(`cleanup:delete-progress ${i + 1}/${candidates.length} deleted=${deleted} failed=${failed.length}`);
    }
  }

  console.log(JSON.stringify({
    matchedLowSignal: candidates.length,
    deleted,
    failedCount: failed.length,
    failed: failed.slice(0, 20),
    sampleDeleted: candidates.slice(0, 25).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      organization: r.organization?.name || null,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
