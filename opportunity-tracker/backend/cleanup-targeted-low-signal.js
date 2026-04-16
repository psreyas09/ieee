const API_BASE = 'https://ieee-eosin.vercel.app/api';
const USERNAME = process.env.ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ieeeadmin';

const SEARCH_TERMS = [
  'home',
  'homepage',
  'ieee-bts.org',
  'ctsoc.ieee.org',
  'cis.ieee.org',
  'students.ieee.org',
  'futurenetworks.ieee.org',
  'ieee-eds.org',
  'rs.ieee.org',
  'mtt-s',
  'ap-s',
  'ieee region 1',
  'ieee region 2',
  'ieee region 5',
  'ieee communications society homepage',
];

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
  const loginRes = await fetch(`${API_BASE}/admin/login`, {
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

  const byId = new Map();

  for (const term of SEARCH_TERMS) {
    const res = await fetch(`${API_BASE}/opportunities?search=${encodeURIComponent(term)}&page=1&limit=200&sort=recent`);
    if (!res.ok) continue;
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];

    for (const row of rows) {
      const isAuto = String(row?.source || '').toLowerCase() === 'auto';
      const isVerified = Boolean(row?.verified);
      if (!isAuto || isVerified) continue;
      if (!isLowSignal(row)) continue;
      byId.set(row.id, row);
    }
  }

  const targets = Array.from(byId.values());
  let deleted = 0;
  const failed = [];

  for (const row of targets) {
    const delRes = await fetch(`${API_BASE}/admin/opportunities/${row.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (delRes.ok) {
      deleted += 1;
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
