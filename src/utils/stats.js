const { loadDatabase, saveDatabase } = require('../state/persistence');

const DRAFT_TYPES = ['lower', 'mixed', 'higher'];

const wins = {};

let _saveTimer = null;

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(persistStats, 1000);
}

function normalizeWin(value) {
  if (value && typeof value === 'object') {
    return {
      overall: Number(value.overall) || 0,
      lower: Number(value.lower) || 0,
      mixed: Number(value.mixed) || 0,
      higher: Number(value.higher) || 0
    };
  }
  const n = Number(value) || 0;
  return { overall: n, lower: 0, mixed: 0, higher: 0 };
}

function ensureWin(userId) {
  if (!wins[userId]) wins[userId] = { overall: 0, lower: 0, mixed: 0, higher: 0 };
  return wins[userId];
}

function persistStats() {
  const data = loadDatabase();
  data.wins = { ...wins };
  saveDatabase(data);
}

function loadStatsFromDisk() {
  const data = loadDatabase();
  if (data.wins) {
    for (const [id, value] of Object.entries(data.wins)) {
      wins[id] = normalizeWin(value);
    }
  }
  return wins;
}

function recordWin(draft, roster) {
  const type = draft && draft.type;
  for (const p of roster || []) {
    if (!p || !p.id) continue;
    const w = ensureWin(String(p.id));
    if (DRAFT_TYPES.includes(type)) w[type]++;
    w.overall++;
  }
  scheduleSave();
  return wins;
}

function getWins(userId) {
  const w = wins[String(userId)];
  return w ? w.overall : 0;
}

function getWinsByType(userId) {
  const w = wins[String(userId)];
  return w
    ? { lower: w.lower, mixed: w.mixed, higher: w.higher }
    : { lower: 0, mixed: 0, higher: 0 };
}

function editWins(userId, count, draftType) {
  const key = String(userId);
  const w = ensureWin(key);
  const after = Math.max(0, Math.floor(count));
  let before;
  let target;

  if (draftType && DRAFT_TYPES.includes(draftType)) {
    before = w[draftType];
    w[draftType] = after;
    w.overall = w.lower + w.mixed + w.higher;
    target = draftType;
  } else {
    before = w.overall;
    w.overall = after;
    target = 'overall';
  }

  scheduleSave();
  return { before, after, draftType: target };
}

function getPlayerStats(userId) {
  const data = loadDatabase();
  const winsCount = getWins(userId);

  let matchesPlayed = 0;
  let draftsJoined = 0;

  const drafts = data.drafts || {};
  for (const d of Object.values(drafts)) {
    if (d && Array.isArray(d.players) && d.players.some(p => p && String(p.id) === String(userId))) {
      draftsJoined++;
    }
  }

  const tournaments = data.tournaments || {};
  for (const t of Object.values(tournaments)) {
    if (!t) continue;
    const allMatches = [...(Array.isArray(t.matches) ? t.matches : [])];
    if (t.finals && t.finals.status === 'completed' && t.finals.winner != null) {
      allMatches.push(t.finals);
    }

    for (const m of allMatches) {
      if (!m || m.status !== 'completed' || m.winner == null) continue;
      const team1 = m.team1 || {};
      const team2 = m.team2 || {};
      const winningRoster = m.winner === team1.number ? (team1.roster || []) : (team2.roster || []);
      const losingRoster = m.winner === team1.number ? (team2.roster || []) : (team1.roster || []);
      const playedIn = [...winningRoster, ...losingRoster];
      if (playedIn.some(p => p && String(p.id) === String(userId))) {
        matchesPlayed++;
      }
    }
  }

  return {
    wins: winsCount,
    winsByType: getWinsByType(userId),
    matchesPlayed,
    draftsJoined
  };
}

function getTopWins(limit = 10) {
  return Object.entries(wins)
    .map(([id, w]) => [id, w.overall])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function getAllWins() {
  return wins;
}

module.exports = { recordWin, getWins, getWinsByType, editWins, getPlayerStats, getTopWins, getAllWins, persistStats, loadStatsFromDisk };