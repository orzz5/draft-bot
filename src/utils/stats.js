const { loadDatabase, saveDatabase } = require('../state/persistence');

const wins = {};

let _saveTimer = null;

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(persistStats, 1000);
}

function persistStats() {
  const data = loadDatabase();
  data.wins = { ...wins };
  saveDatabase(data);
}

function loadStatsFromDisk() {
  const data = loadDatabase();
  if (data.wins) {
    for (const [id, count] of Object.entries(data.wins)) {
      wins[id] = count;
    }
  }
  return wins;
}

function recordWin(draft, roster) {
  for (const p of roster) {
    if (!p || !p.id) continue;
    wins[p.id] = (wins[p.id] || 0) + 1;
  }
  scheduleSave();
  return wins;
}

function getWins(userId) {
  return wins[userId] || 0;
}

function editWins(userId, count) {
  const before = getWins(userId);
  const after = Math.max(0, Math.floor(count));
  wins[userId] = after;
  scheduleSave();
  return { before, after };
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

  return { wins: winsCount, matchesPlayed, draftsJoined };
}

function getTopWins(limit = 10) {
  return Object.entries(wins)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

module.exports = { recordWin, getWins, editWins, getPlayerStats, getTopWins, persistStats, loadStatsFromDisk };