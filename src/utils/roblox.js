const https = require('https');

const USER_AGENT = 'OlympusDraftBot/1.0';
const USERS_API = 'https://users.roblox.com/v1/usernames/users';
const HEADSHOT_API = (id) =>
  `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(id)}&size=150x150&format=Png&isCircular=false`;

function requestJson(url, { method = 'GET', body = null, headers = {}, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      target,
      {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch {}
          if (res.statusCode >= 400) {
            const err = new Error(`Roblox API HTTP ${res.statusCode}`);
            err.status = res.statusCode;
            err.body = parsed;
            reject(err);
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('Roblox API timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Step 1: username -> roblox user id (+ display name).
 * Step 2: user id -> headshot thumbnail URL.
 * Resolves server-side (DisCloud) so the browser never talks to users.roblox.com.
 *
 * Returns { username, robloxId, displayName, avatarUrl } or null when the
 * username does not exist. Throws when the API is unreachable.
 */
async function resolveRobloxUsername(username) {
  const cleaned = String(username || '').trim();
  if (!cleaned) return null;

  const out = await requestJson(USERS_API, {
    method: 'POST',
    body: { usernames: [cleaned], excludeBannedUsers: true }
  });

  const hit = (out.data || []).find(
    (u) => String(u.name || '').toLowerCase() === cleaned.toLowerCase()
  );
  if (!hit) return null;

  const robloxId = String(hit.id);
  const result = {
    username: hit.name || cleaned,
    robloxId,
    displayName: hit.displayName || hit.name || cleaned,
    avatarUrl: ''
  };

  try {
    const th = await requestJson(HEADSHOT_API(robloxId));
    const img = (th.data || []).find((t) => t.state === 'Completed' && t.imageUrl);
    if (img) result.avatarUrl = img.imageUrl;
  } catch (e) {
    console.warn('[roblox] headshot thumbnail fetch failed:', e.message);
  }

  return result;
}

module.exports = { resolveRobloxUsername, requestJson };