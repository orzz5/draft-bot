const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { buildDataPayload } = require('./httpApi');

const FILE_NAME = 'draft-data.json';
const META_PATH = path.join(__dirname, '..', 'data', 'gist-meta.json');
const MIN_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

let timer = null;
let lastSignature = null;
let nextAttemptAt = 0;
let backoffMs = 0;

function httpJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: opts.method || 'GET',
        headers: { 'User-Agent': 'OlympusDraftBot/1.0', ...(opts.headers || {}) }
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch {}
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json === null ? body : json);
          } else {
            reject(new Error(`GitHub HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

function api(url, method, body) {
  const headers = {
    Authorization: `Bearer ${config.gistToken}`,
    Accept: 'application/vnd.github+json'
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  return httpJson(url, { method, body, headers });
}

function savedMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveMeta(meta) {
  fs.mkdirSync(path.dirname(META_PATH), { recursive: true });
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

// Returns { id, rawShortUrl }. Creates the gist once if GIST_ID is not set.
async function ensureGist() {
  if (config.gistId) return { id: config.gistId, rawShortUrl: null };

  const stored = savedMeta();
  if (stored && stored.id) return stored;

  const placeholder = JSON.stringify({
    generatedAt: 0,
    overview: {},
    drafts: [],
    leaderboard: [],
    history: []
  });

  const created = await api('https://api.github.com/gists', 'POST', {
    description: 'Olympus Draft Hub live data (automatically updated by the bot)',
    public: true,
    files: { [FILE_NAME]: { content: placeholder } }
  });

  const rawShortUrl = `https://gist.githubusercontent.com/${created.owner.login}/${created.id}/raw/${FILE_NAME}`;
  saveMeta({ id: created.id, htmlUrl: created.html_url, rawShortUrl });
  console.log(`[gistPusher] Created gist: ${created.html_url}`);
  console.log(`[gistPusher] Vercel env  GIST_RAW_URL=${rawShortUrl}`);
  return { id: created.id, rawShortUrl };
}

// Signature of everything meaningful in the payload, ignoring the generatedAt
// timestamp (which changes every call and would force pointless pushes).
function buildSignature(payload) {
  const { generatedAt, ...rest } = payload;
  return crypto.createHash('sha1').update(JSON.stringify(rest)).digest('hex');
}

function isRateLimited(e) {
  return /HTTP (403|429)\b/.test(e.message);
}

async function push() {
  const now = Date.now();
  if (now < nextAttemptAt) return;

  const payload = buildDataPayload();
  const sig = buildSignature(payload);

  // Nothing meaningful changed — skip the API call entirely.
  if (lastSignature !== null && sig === lastSignature) return;

  try {
    const meta = await ensureGist();
    const json = JSON.stringify(payload);
    await api(`https://api.github.com/gists/${meta.id}`, 'PATCH', {
      files: { [FILE_NAME]: { content: json } }
    });
    lastSignature = sig;
    backoffMs = 0;
    nextAttemptAt = Date.now() + config.gistMinIntervalMs;
    console.log(`[gistPusher] Pushed ${(json.length / 1024).toFixed(1)} KB at ${new Date().toISOString()}`);
  } catch (e) {
    if (isRateLimited(e)) {
      backoffMs = backoffMs === 0 ? MIN_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, backoffMs * 2);
      nextAttemptAt = Date.now() + backoffMs;
      console.warn(`[gistPusher] rate limited — backing off ${Math.round(backoffMs / 1000)}s (${e.message})`);
    } else {
      nextAttemptAt = Date.now() + 15000;
      console.warn(`[gistPusher] push failed: ${e.message}`);
    }
  }
}

function startGistPusher() {
  clearInterval(timer);
  if (!config.gistToken) {
    console.warn('[gistPusher] GIST_TOKEN is not set — live data will not be published to the web.');
    return;
  }
  nextAttemptAt = 0;
  lastSignature = null;
  backoffMs = 0;
  push();
  const ms = Math.max(5000, config.gistPushIntervalMs);
  timer = setInterval(push, ms);
}

module.exports = { startGistPusher, push, ensureGist };