const config = require('../config');
const { loadDatabase, saveDatabase } = require('./persistence');

const trialMembers = new Map();

let _client = null;
let _saveTimer = null;

function setClient(client) {
  _client = client;
}

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(persistTrialMembers, 500);
}

function startTrial(userId) {
  trialMembers.set(userId, {
    userId,
    trialStartedAt: Date.now(),
    nextReviewAt: Date.now() + config.trialDurationMs
  });
  persistTrialMembers();
  scheduleTrialReview(userId);
  return trialMembers.get(userId);
}

function isOnTrial(userId) {
  return trialMembers.has(userId);
}

function removeFromTrial(userId, persist = true) {
  trialMembers.delete(userId);
  if (persist) persistTrialMembers();
}

function getNextReviewAt(userId) {
  return trialMembers.get(userId)?.nextReviewAt || null;
}

function extendTrial(userId) {
  const entry = trialMembers.get(userId);
  if (!entry) return null;
  entry.trialStartedAt = Date.now();
  entry.nextReviewAt = Date.now() + config.trialDurationMs;
  persistTrialMembers();
  scheduleTrialReview(userId);
  return entry;
}

function scheduleTrialReview(userId) {
  const entry = trialMembers.get(userId);
  if (!entry) return;

  const delay = entry.nextReviewAt - Date.now();

  const MAX_TIMEOUT = 2147483647;
  const tick = () => {
    if (!trialMembers.has(userId)) return;

    const remaining = trialMembers.get(userId).nextReviewAt - Date.now();
    if (remaining > 1) {
      setTimeout(tick, Math.min(remaining, MAX_TIMEOUT));
      return;
    }

    postTrialReview(userId).catch(e => {
      console.error(`[trialReview] Failed to post review for ${userId}:`, e);
      setTimeout(tick, 60 * 1000);
    });
  };

  if (delay > 1) {
    setTimeout(tick, Math.min(delay, MAX_TIMEOUT));
  } else {
    setTimeout(tick, 1000);
  }
}

async function postTrialReview(userId) {
  const guild = _client?.guilds?.cache?.get(config.guildId);
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member || !member.roles.cache.has(config.trialHighPlayerRoleId)) {
    removeFromTrial(userId);
    return;
  }

  const channel = guild.channels.cache.get(config.trialReviewChannelId);
  if (!channel) return;

  const { createVotation, getActiveVotationByTarget, markPosted } = require('./votations');
  const existing = getActiveVotationByTarget(userId, 'trial_review');
  if (existing && existing.messageId) return;

  const votation = createVotation({
    type: 'trial_review',
    channelId: channel.id,
    targetUserId: userId,
    targetUsername: member.user?.username || null,
    choices: [
      { value: 'keep', label: 'Keep', style: 'success' },
      { value: 'reject', label: 'Reject', style: 'danger' }
    ]
  });

  const { buildVotationEmbed, buildVotationButtons } = require('../interactions/votation');
  const sent = await channel.send({
    content: `<@&${config.highVoteRoleId}>`,
    embeds: [buildVotationEmbed(votation)],
    components: [buildVotationButtons(votation)]
  });

  markPosted(votation, sent.id);
}

function persistTrialMembers() {
  const data = loadDatabase();
  const serialized = {};
  for (const [id, entry] of trialMembers) {
    serialized[id] = { ...entry };
  }
  data.trialMembers = serialized;
  saveDatabase(data);
}

function loadTrialMembersFromDisk() {
  const data = loadDatabase();
  if (data.trialMembers) {
    for (const [id, entry] of Object.entries(data.trialMembers)) {
      trialMembers.set(id, entry);
    }
  }
  return trialMembers;
}

function rescheduleAllTrials() {
  for (const [, entry] of trialMembers) {
    scheduleTrialReview(entry.userId);
  }
}

module.exports = {
  trialMembers, setClient, startTrial, isOnTrial, removeFromTrial,
  extendTrial, getNextReviewAt, loadTrialMembersFromDisk,
  rescheduleAllTrials, persistTrialMembers
};