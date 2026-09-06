const { Collection } = require('discord.js');
const config = require('../config');
const { loadDatabase, saveDatabase } = require('./persistence');

const drafts = new Collection();
const counters = {};

let _saveTimer = null;
let _client = null;

function setClient(client) {
  _client = client;
}

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(persistDrafts, 1000);
}

function persistDrafts() {
  const data = loadDatabase();
  const serialized = {};
  for (const [id, draft] of drafts) {
    const copy = { ...draft };
    delete copy.turnTimers;
    delete copy.setup;
    serialized[id] = copy;
  }
  data.drafts = serialized;
  data.sequenceCounters = { ...counters };
  saveDatabase(data);
}

function loadDraftsFromDisk() {
  const data = loadDatabase();

  if (data.sequenceCounters) {
    for (const [key, val] of Object.entries(data.sequenceCounters)) {
      counters[key] = val;
    }
  }

  if (data.drafts) {
    for (const [id, draftData] of Object.entries(data.drafts)) {
      draftData.turnTimers = [];
      drafts.set(id, draftData);

      const counterKey = (draftData.isTest ? 'test-' : '') + draftData.type;
      if (typeof draftData.draftNumber === 'number') {
        counters[counterKey] = Math.max(counters[counterKey] || 0, draftData.draftNumber);
      }
    }
  }

  return drafts;
}

function createDraft(type, hostId, channelId, announcementId, isTest = false) {
  const prefix = isTest ? 'test-' : '';
  const counterKey = (isTest ? 'test-' : '') + type;
  counters[counterKey] = (counters[counterKey] || 0) + 1;
  const draftNumber = counters[counterKey];

  const draft = {
    id: `${prefix}${type}-${draftNumber}`,
    type,
    draftNumber,
    isTest,
    hostId,
    channelId,
    announcementId,
    status: 'registration',
    registrationEnd: null,
    captains: [],
    captainCandidates: [],
    players: [],
    teams: {},
    draftOrder: [],
    currentTurn: 0,
    snakeIndex: 0,
    turnTimers: [],
    categories: [],
    channels: [],
    autoManual: 'automatic',
    registrationMessageId: null,
    subState: null
  };

  for (let i = 1; i <= config.maxTeams; i++) {
    draft.teams[i] = { captain: null, players: [] };
  }

  drafts.set(draft.id, draft);
  scheduleSave();
  return draft;
}

function getDraft(id) {
  return drafts.get(id);
}

function getActiveDraft(type) {
  return drafts.find(d => d.type === type && d.status !== 'completed' && d.status !== 'cancelled');
}

function getDraftById(id) {
  return drafts.get(id);
}

function getDraftsByType(type) {
  return drafts.filter(d => d.type === type);
}

function deleteDraft(id) {
  drafts.delete(id);
  scheduleSave();
}

function updateDraft(id, updates) {
  const draft = drafts.get(id);
  if (!draft) return null;
  Object.assign(draft, updates);
  scheduleSave();
  return draft;
}

function getActiveDrafts() {
  return drafts.filter(d => d.status !== 'completed' && d.status !== 'cancelled');
}

module.exports = {
  drafts, createDraft, getDraft, getActiveDraft, getDraftById,
  getDraftsByType, deleteDraft, updateDraft, persistDrafts,
  loadDraftsFromDisk, setClient, getActiveDrafts, scheduleSave
};
