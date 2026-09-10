const http = require('http');
const { URL } = require('url');
const config = require('./config');
const { drafts } = require('./state/drafts');
const { tournaments } = require('./state/tournaments');
const { getAllWins } = require('./utils/stats');
const { getLink } = require('./state/links');

let _client = null;

const MAX_COMPLETED_DRAFTS = 12;

// ── helpers ────────────────────────────────────────────────

function playerName(discordId, fallbackName) {
  const u = _client?.users?.cache?.get(String(discordId));
  if (u) return u.displayName || u.username || String(discordId);
  return fallbackName || String(discordId);
}

function draftCaptainName(d, teamNumber) {
  const team = (d.teams || {})[teamNumber];
  const cap = team?.captain;
  if (cap) return cap.displayName || cap.username || "Captain";
  return `Team ${teamNumber}`;
}

function recordedName(d, id) {
  for (const p of [...(d.players || []), ...(d.captains || []), ...(d.captainCandidates || [])]) {
    if (String(p.id) === String(id)) return p.displayName || p.username || String(id);
  }
  return null;
}

function buildDraftCard(d) {
  const captains = (d.captains || []).map((c) => ({
    id: String(c.id),
    username: c.username || '',
    displayName: c.displayName || c.username || '',
    teamNumber: c.teamNumber || null
  }));

  // Adapt to 2 or 4 team drafts: once captains are assigned, only render the
  // teams that actually exist; before that, fall back to the max skeleton.
  const activeTeams = Object.values(d.teams || {})
    .filter((t) => t && (t.captain || (t.players && t.players.length)));
  const teamCount = activeTeams.length >= 2
    ? Math.min(config.maxTeams, activeTeams.length)
    : config.maxTeams;

  const teams = [];
  for (let i = 1; i <= teamCount; i++) {
    const t = (d.teams || {})[i] || {};
    const cap = t.captain || null;
    teams.push({
      number: i,
      name: cap ? (cap.displayName || cap.username || `Team ${i}'s Captain`).replace(/\s*'s\s*$/, '') + "'s Team" : `Team ${i}`,
      captainId: cap ? String(cap.id) : null,
      players: (t.players || []).map((p) => ({
        id: String(p.id),
        username: p.username || '',
        position: p.position || '',
        isCaptain: !!p.isCaptain
      }))
    });
  }

  const draftOrder = (d.draftOrder || []).map((c) => ({
    id: String(c.id),
    username: c.username || '',
    displayName: c.displayName || c.username || '',
    teamNumber: c.teamNumber || null
  }));

  let winner = null;
  const t = tournaments.get(d.id);
  if (t && t.winner != null && (d.teams || {})[t.winner]?.captain) {
    const cap = (d.teams || {})[t.winner].captain;
    winner = { id: String(cap.id), name: draftCaptainName(d, t.winner) };
  }

  return {
    id: d.id,
    type: d.type,
    draftNumber: d.draftNumber,
    isTest: !!d.isTest,
    status: d.status,
    hostId: d.hostId ? String(d.hostId) : null,
    autoManual: d.autoManual || 'automatic',
    isUnlimited: !!d.isUnlimited,
    playerCount: (d.players || []).length,
    captainCount: captains.length,
    teamCount,
    currentTurn: d.currentTurn || 0,
    totalPicks: draftOrder.length,
    captains,
    draftOrder,
    teams,
    winner
  };
}

function buildHistoryItem(d) {
  const t = tournaments.get(d.id);
  if (!t || t.winner == null) return null;

  let teams = [];
  if (t.finals && t.finals.team1 && t.finals.team2) {
    teams = [t.finals.team1, t.finals.team2].map((s) => ({
      name: draftCaptainName(d, s.number),
      isWinner: t.finals.winner === s.number
    }));
  } else {
    teams = Object.values(d.teams || {})
      .filter((x) => x && x.captain)
      .map((x) => ({
        name: x.captain.displayName || x.captain.username || "Captain",
        isWinner: t.winner === x.captain.teamNumber
      }));
  }

  return {
    id: d.id,
    type: d.type,
    draftNumber: d.draftNumber,
    playerCount: (d.players || []).length,
    teamCount: (d.captains || []).length,
    winner: draftCaptainName(d, t.winner),
    winnerId: String((d.teams || {})[t.winner]?.captain?.id || ''),
    teams
  };
}

function buildLeaderboard() {
  const winsMap = getAllWins();
  const rec = {};

  const EMPTY_TYPES = () => ({ lower: 0, mixed: 0, higher: 0 });

  const touch = (id, fn) => {
    const key = String(id);
    if (!rec[key]) rec[key] = {
      wins: 0, matches: 0, drafts: 0, id: key,
      winsByType: EMPTY_TYPES(),
      matchesByType: EMPTY_TYPES()
    };
    fn(rec[key]);
  };

  for (const d of drafts.values()) {
    if (!d) continue;
    const seen = new Set();
    for (const p of d.players || []) {
      const id = String(p.id);
      if (seen.has(id)) continue;
      seen.add(id);
      touch(id, (r) => r.drafts++);
    }
  }

  for (const t of tournaments.values()) {
    if (!t) continue;
    const draftType = drafts.get(t.draftId)?.type;
    const inTypes = config.draftTypes.includes(draftType);
    const finished = (t.matches || []).filter((m) => m.status === 'completed' && m.winner != null);
    if (t.finals && t.finals.status === 'completed' && t.finals.winner != null) finished.push(t.finals);
    for (const m of finished) {
      const t1 = m.team1 || {};
      const t2 = m.team2 || {};
      const winSide = m.winner === t1.number ? t1 : t2;
      const loseSide = m.winner === t1.number ? t2 : t1;
      for (const p of winSide.roster || []) {
        touch(p.id, (r) => {
          r.wins++;
          r.matches++;
          if (inTypes) {
            r.winsByType[draftType]++;
            r.matchesByType[draftType]++;
          }
        });
      }
      for (const p of loseSide.roster || []) {
        touch(p.id, (r) => {
          r.matches++;
          if (inTypes) r.matchesByType[draftType]++;
        });
      }
    }
  }

  for (const [id, count] of Object.entries(winsMap || {})) {
    const w = (count && typeof count === 'object')
      ? { overall: count.overall || 0, lower: count.lower || 0, mixed: count.mixed || 0, higher: count.higher || 0 }
      : { overall: count || 0, lower: 0, mixed: 0, higher: 0 };
    touch(id, (r) => {
      r.wins = Math.max(r.wins, w.overall);
      r.winsByType.lower = Math.max(r.winsByType.lower, w.lower);
      r.winsByType.mixed = Math.max(r.winsByType.mixed, w.mixed);
      r.winsByType.higher = Math.max(r.winsByType.higher, w.higher);
    });
  }

  const rows = Object.values(rec).map((r) => {
    const link = getLink(r.id);
    const fallback = playerName(r.id, undefined);
    const winRateByType = {};
    for (const key of config.draftTypes) {
      winRateByType[key] = r.matchesByType[key] ? Math.round((r.winsByType[key] / r.matchesByType[key]) * 100) : 0;
    }
    return {
      id: r.id,
      name: fallback,
      username: link?.username || '',
      robloxId: link?.robloxId || '',
      displayName: link?.displayName || '',
      avatarUrl: link?.avatarUrl || '',
      wins: r.wins,
      winsByType: { ...r.winsByType },
      matches: r.matches,
      matchesByType: { ...r.matchesByType },
      drafts: r.drafts,
      winRate: r.matches ? Math.round((r.wins / r.matches) * 100) : 0,
      winRateByType
    };
  });

  rows.sort((a, b) => (b.wins - a.wins) || (b.matches - a.matches));
  return rows.slice(0, 100);
}

function buildOverview() {
  const all = [...drafts.values()].filter(Boolean);
  const active = all.filter((d) => d.status !== 'completed' && d.status !== 'cancelled');
  const completed = all.filter((d) => d.status === 'completed');

  const activeByType = {};
  for (const type of config.draftTypes) {
    const found = active.find((d) => d.type === type && !d.isTest);
    activeByType[type] = found ? found.id : null;
  }

  const players = new Set();
  for (const d of all) {
    for (const p of d.players || []) players.add(String(p.id));
  }

  let matchesPlayed = 0;
  for (const t of tournaments.values()) {
    for (const m of t?.matches || []) {
      if (m.status === 'completed' && m.winner != null) matchesPlayed++;
    }
    if (t?.finals && t.finals.status === 'completed' && t.finals.winner != null) matchesPlayed++;
  }

  const lb = buildLeaderboard();
  const totalWins = lb.reduce((s, r) => s + r.wins, 0);
  const totalMatches = lb.reduce((s, r) => s + r.matches, 0);

  return {
    activeCount: active.length,
    activeByType,
    activeDraftIds: active.map((d) => d.id),
    completedCount: completed.length,
    totalDrafts: all.length,
    registeredPlayers: players.size,
    tournaments: tournaments.size,
    matchesPlayed,
    totalWins,
    avgWinRate: totalMatches ? Math.round((totalWins / totalMatches) * 100) : 0
  };
}

// ── response payload ───────────────────────────────────────

function buildDataPayload() {
  const all = [...drafts.values()].filter(Boolean);
  const active = all.filter((d) => d.status !== 'completed' && d.status !== 'cancelled');
  const completed = all
    .filter((d) => d.status === 'completed')
    .sort((a, b) => (b.draftNumber || 0) - (a.draftNumber || 0))
    .slice(0, MAX_COMPLETED_DRAFTS);

  const cards = [...active, ...completed]
    .map((d) => buildDraftCard(d))
    .sort((a, b) => {
      if (a.type !== b.type) return config.draftTypes.indexOf(b.type) - config.draftTypes.indexOf(a.type);
      return (b.draftNumber || 0) - (a.draftNumber || 0);
    });

  return {
    generatedAt: Date.now(),
    overview: buildOverview(),
    drafts: cards,
    leaderboard: buildLeaderboard(),
    history: all
      .filter((d) => d.status === 'completed')
      .map(buildHistoryItem)
      .filter(Boolean)
      .sort((a, b) => (b.draftNumber || 0) - (a.draftNumber || 0))
      .slice(0, 12)
  };
}

// ── HTTP server ────────────────────────────────────────────

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, (k, v) => (v === undefined ? null : v));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function authorized(parsed, req) {
  const key = config.apiKey;
  if (!key) return true;
  if (parsed.searchParams.get('key') === key) return true;
  const headers = (req.rawHeaders || []).reduce((acc, v, i) => {
    if (i % 2 === 0) acc[String(v).toLowerCase()] = req.rawHeaders[i + 1];
    return acc;
  }, {});
  return headers['x-api-key'] === key;
}

function startApiServer(client, opts = {}) {
  _client = client;
  const port = opts.port || config.apiPort;

  const server = http.createServer((req, res) => {
    let parsed;
    try {
      parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      sendJson(res, 400, { error: 'bad_request' });
      return;
    }

    const path = parsed.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health') {
      if (!authorized(parsed, req)) return sendJson(res, 403, { error: 'forbidden' });
      sendJson(res, 200, { ok: true, uptime: Math.floor(process.uptime()), generatedAt: Date.now() });
      return;
    }

    if (path === '/api/data') {
      if (!authorized(parsed, req)) return sendJson(res, 403, { error: 'forbidden' });
      try {
        sendJson(res, 200, buildDataPayload());
      } catch (e) {
        console.error('[httpApi] /api/data failed:', e);
        sendJson(res, 500, { error: 'internal_error' });
      }
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });

  server.on('error', (e) => console.error('[httpApi] server error:', e.message));
  server.listen(port, '0.0.0.0', () => {
    console.log(`[httpApi] public API listening on http://0.0.0.0:${port}`);
    console.log(`[httpApi] expose it on Discloud as https://<SUBDOMAIN>.discloud.app`);
  });

  return server;
}

module.exports = { startApiServer, buildDataPayload };