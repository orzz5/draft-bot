const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { loadDatabase, saveDatabase } = require('../state/persistence');

let setupCache = null;

function loadSetupData() {
  const data = loadDatabase();
  return data.setup || {};
}

function saveSetupData(data) {
  const db = loadDatabase();
  db.setup = data;
  saveDatabase(db);
}

function refreshSetupCache() {
  setupCache = loadSetupData();
}

function getSetup(guildId) {
  if (!setupCache) refreshSetupCache();
  return setupCache[guildId] || null;
}

function saveSetup(guildId, data) {
  if (!setupCache) refreshSetupCache();
  setupCache[guildId] = data;
  saveSetupData(setupCache);
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function selectCaptains(candidates, count) {
  const shuffled = shuffleArray(candidates);
  return shuffled.slice(0, count);
}

function getCaptainCount(playerCount) {
  if (playerCount >= 8) return 4;
  if (playerCount >= 4) return 2;
  return 0;
}

function computeTeamCount(captainCandidates, players) {
  const counts = { WS: 0, Setter: 0, DS: 0, Lib: 0 };
  const seen = new Set();

  for (const p of [...(captainCandidates || []), ...(players || [])]) {
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    if (counts[p.position] !== undefined) counts[p.position]++;
  }

  let maxTeams = (captainCandidates || []).length;
  for (const [pos, perTeam] of Object.entries(config.teamRoster)) {
    maxTeams = Math.min(maxTeams, Math.floor((counts[pos] || 0) / perTeam));
  }
  maxTeams = Math.min(maxTeams, config.maxTeams);

  if (maxTeams >= 4) return 4;
  if (maxTeams >= 2) return 2;
  return 0;
}

function generateSnakeDraftOrder(captains) {
  const order = [];
  const numTeams = captains.length;
  let forward = true;

  while (true) {
    if (forward) {
      for (let i = 0; i < numTeams; i++) {
        order.push(captains[i]);
      }
    } else {
      for (let i = numTeams - 1; i >= 0; i--) {
        order.push(captains[i]);
      }
    }

    const allFull = captains.every(c => {
      const needed = Object.values(config.teamRoster).reduce((a, b) => a + b, 0);
      return c.teamPlayers >= needed;
    });

    if (allFull) break;
    forward = !forward;
  }

  return order;
}

function canPickPosition(teamRoster, position) {
  const current = teamRoster.filter(p => p.position === position).length;
  return current < config.teamRoster[position];
}

function isTeamFull(teamRoster) {
  return Object.entries(config.teamRoster).every(([pos, count]) => {
    return teamRoster.filter(p => p.position === pos).length >= count;
  });
}

function isDraftComplete(draft) {
  return draft.captains.every(cap => {
    const teamNum = cap.teamNumber;
    return isTeamFull(draft.teams[teamNum].players);
  });
}

function canUserJoinDraft(user, draftType, setup) {
  if (draftType === 'lower') {
    return user.roles.cache.has(setup.playerRoles?.lower);
  }
  if (draftType === 'higher') {
    return user.roles.cache.has(setup.playerRoles?.higher) || user.roles.cache.has(config.trialHighPlayerRoleId);
  }
  return true;
}

function isRestrictedUser(user, draftType) {
  const setup = getSetup(user.guild?.id);
  const isHigh = user.roles.cache.has(setup?.playerRoles?.higher) || user.roles.cache.has(config.trialHighPlayerRoleId);
  if (draftType === 'lower' && isHigh) {
    return true;
  }
  if (draftType === 'higher' && user.roles.cache.has(setup?.playerRoles?.lower)) {
    return true;
  }
  return false;
}

function getTeamName(draft, teamNumber) {
  const team = draft.teams[teamNumber];
  if (team && team.captain) {
    return `${team.captain.username}'s Team`;
  }
  return `Team ${teamNumber}`;
}

module.exports = {
  getSetup, saveSetup, shuffleArray, selectCaptains,
  getCaptainCount, computeTeamCount, generateSnakeDraftOrder, canPickPosition, isTeamFull,
  isDraftComplete, canUserJoinDraft, isRestrictedUser, getTeamName
};
