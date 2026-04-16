const API_BASE = 'https://ieee-eosin.vercel.app/api';
const USERNAME = process.env.ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ieeeadmin';

const PAGE_LIMIT = 200;
const FETCH_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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

function hasStrongOpportunitySignal(v) {
  return /(apply|deadline|register|submission|submit|nomination|cfp|call for papers|open now|applications? open|apply now|202[6-9]|20[3-9][0-9])/i.test(String(v || ''));
}

function commonPrefixWordCount(a, b) {
  const left = normalize(a).split(' ').filter(Boolean);
  const right = normalize(b).split(' ').filter(Boolean);
  const max = Math.min(left.length, right.length);
  let i = 0;
  while (i < max && left[i] === right[i]) i += 1;
  return i;
}

function isLowSignal(row) {
  const title = String(row?.title || '').trim();
  const t = normalize(title);
  const org = normalize(row?.organization?.name || '');

  const simple = new Set(['home', 'homepage', 'home page', 'other', 'index', 'main', 'welcome', 'ap s']);
  if (simple.has(t)) return true;
  if (/(^|\s)home(page)?(\s|$)/i.test(title) && !hasEventSignal(title)) return true;
  if (looksLikeDomain(title)) return true;
  if (/^(join our|welcome to|about us|news|events|conferences and events)\b/i.test(title) && !hasStrongOpportunitySignal(title)) return true;

  const orgPrefixWords = commonPrefixWordCount(title, row?.organization?.name || '');
  if (orgPrefixWords >= 3 && !hasEventSignal(title) && !hasStrongOpportunitySignal(title)) return true;

  if (!hasEventSignal(title) && !hasStrongOpportunitySignal(title) && t.length < 30) {
    if (/\b(community|society|chapter|council|region|technology for humanity|advancing|connecting)\b/i.test(title)) return true;
  }

  if (org && (t === org || org.includes(t) || t.includes(org)) && !hasEventSignal(title)) return true;
  return false;
}

async function main() {
  console.log('cleanup:start');

  const loginRes = await fetchWithTimeout(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  if (!loginRes.ok) {
    const text = await loginRes.text();
    throw new Error(`Login failed (${loginRes.status}): ${text}`);
  }

  const { token } = await loginRes.json();
  if (!token) throw new Error('No token returned from login');
  console.log('cleanup:login:ok');

  const byId = new Map();
  let page = 1;
  let scanned = 0;
  while (true) {
    const res = await fetchWithTimeout(`${API_BASE}/opportunities?page=${page}&limit=${PAGE_LIMIT}&sort=recent`);
    if (!res.ok) break;

    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (!rows.length) break;
    scanned += rows.length;

    for (const row of rows) {
      const isAuto = String(row?.source || '').toLowerCase() === 'auto';
      const isVerified = Boolean(row?.verified);
      if (!isAuto || isVerified) continue;
      if (!isLowSignal(row)) continue;
      byId.set(row.id, row);
    }

    const total = Number(data?.total || 0);
    const maxPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
    console.log(`cleanup:scan:page=${page}/${maxPages} scanned=${scanned} matched=${byId.size}`);
    if (page >= maxPages || page > 150) break;
    page += 1;
  }

  const targets = Array.from(byId.values());
  let deleted = 0;
  const failed = [];

  for (const row of targets) {
    const delRes = await fetchWithTimeout(`${API_BASE}/admin/opportunities/${row.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (delRes.ok) {
      deleted += 1;
      if (deleted % 10 === 0) {
        console.log(`cleanup:delete:deleted=${deleted}/${targets.length}`);
      }
    } else {
      failed.push({ id: row.id, status: delRes.status, title: row.title });
    }
  }

  console.log(JSON.stringify({
    matchedLowSignal: targets.length,
    deleted,
    failedCount: failed.length,
    failed,
    sample: targets.slice(0, 20).map((r) => ({
      id: r.id,
      title: r.title,
      organization: r.organization?.name || null,
      status: r.status,
      type: r.type,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
