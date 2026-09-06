const config = require('../config');
const { loadDatabase, saveDatabase } = require('./persistence');

const votations = new Map();
const cooldowns = new Map();

let _saveTimer = null;

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(persistVotations, 500);
}

function createVotation(data) {
  const v = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: data.type,
    channelId: data.channelId,
    messageId: data.messageId || null,
    targetUserId: data.targetUserId,
    targetUsername: data.targetUsername || null,
    byUserId: data.byUserId || null,
    byUsername: data.byUsername || null,
    reason: data.reason || null,
    choices: data.choices,
    votes: {},
    voters: [],
    votesNeeded: config.highRequestVotesNeeded,
    roleId: config.highVoteRoleId,
    resolved: false,
    resolvedChoice: null,
    extra: data.extra || {},
    createdAt: Date.now(),
    resolvedAt: null
  };
  for (const c of v.choices) v.votes[c.value] = 0;
  votations.set(v.id, v);
  scheduleSave();
  return v;
}

function getVotation(votationId) {
  return votations.get(votationId);
}

function getActiveVotationByTarget(targetUserId, type) {
  for (const [, v] of votations) {
    if (v.targetUserId === targetUserId && v.type === type && !v.resolved) return v;
  }
  return null;
}

function getActiveVotationByByUser(byUserId, type) {
  for (const [, v] of votations) {
    if (v.byUserId === byUserId && v.type === type && !v.resolved) return v;
  }
  return null;
}

function addVote(votation, userId, choice) {
  if (votation.resolved) return null;
  if (votation.voters.includes(userId)) return false;
  if (!(choice in votation.votes)) return false;
  votation.voters.push(userId);
  votation.votes[choice] += 1;
  scheduleSave();
  return votation.votes;
}

function markPosted(votation, messageId) {
  votation.messageId = messageId;
  scheduleSave();
}

function closeVotation(votation) {
  if (votation.resolved) return null;

  let winner = votation.choices[0].value;
  for (const c of votation.choices) {
    if (votation.votes[c.value] > votation.votes[winner]) winner = c.value;
  }

  votation.resolved = true;
  votation.resolvedChoice = winner;
  votation.resolvedAt = Date.now();
  scheduleSave();
  return winner;
}

function setRequestCooldown(userId) {
  cooldowns.set(userId, Date.now() + config.highRequestCooldownMs);
  scheduleSave();
}

function deleteUnresolvedVotations() {
  const removed = [];
  for (const [id, v] of votations) {
    if (!v.resolved) {
      removed.push(v);
      votations.delete(id);
    }
  }
  scheduleSave();
  return removed;
}

function getRequestCooldown(userId) {
  const expiresAt = cooldowns.get(userId);
  if (!expiresAt) return null;
  if (expiresAt <= Date.now()) {
    cooldowns.delete(userId);
    scheduleSave();
    return null;
  }
  return expiresAt;
}

function persistVotations() {
  const data = loadDatabase();
  const serialized = {};
  for (const [id, v] of votations) {
    serialized[id] = {
      ...v,
      votes: { ...v.votes },
      voters: [...v.voters],
      choices: v.choices.map(c => ({ ...c }))
    };
  }
  const cdSerialized = {};
  for (const [id, expiresAt] of cooldowns) {
    cdSerialized[id] = expiresAt;
  }
  data.votations = serialized;
  data.highRequestCooldowns = cdSerialized;
  saveDatabase(data);
}

function loadVotationsFromDisk() {
  const data = loadDatabase();
  if (data.votations) {
    for (const [id, v] of Object.entries(data.votations)) {
      votations.set(id, v);
    }
  }
  if (data.highRequestCooldowns) {
    for (const [id, expiresAt] of Object.entries(data.highRequestCooldowns)) {
      cooldowns.set(id, expiresAt);
    }
  }
  return votations;
}

module.exports = {
  votations, createVotation, getVotation, getActiveVotationByTarget,
  getActiveVotationByByUser, addVote, markPosted, closeVotation,
  setRequestCooldown, getRequestCooldown, deleteUnresolvedVotations,
  persistVotations, loadVotationsFromDisk
};