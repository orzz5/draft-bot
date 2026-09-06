const config = require('../config');
const { errorEmbed } = require('./embeds');
const { deleteDraft } = require('../state/drafts');

function getMinimumRequirements() {
  const min = { captains: 2 };
  for (const [pos, count] of Object.entries(config.teamRoster)) {
    min[pos] = count * 2;
  }
  return min;
}

function getRegistrationCounts(draft) {
  const counts = { captains: draft.captainCandidates.length, WS: 0, Setter: 0, DS: 0, Lib: 0 };
  const seen = new Set();

  for (const p of draft.captainCandidates) {
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    if (counts[p.position] !== undefined) counts[p.position]++;
  }
  for (const p of draft.players) {
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    if (counts[p.position] !== undefined) counts[p.position]++;
  }
  return counts;
}

function isRegistrationCompleteEnough(draft) {
  const min = getMinimumRequirements();
  const counts = getRegistrationCounts(draft);
  return Object.entries(min).every(([key, needed]) => (counts[key] || 0) >= needed);
}

function getMissingPlayersText(draft) {
  const min = getMinimumRequirements();
  const counts = getRegistrationCounts(draft);
  const missing = [];

  if ((counts.captains || 0) < min.captains) {
    missing.push(`👑 **Captains:** ${counts.captains}/${min.captains}`);
  }

  for (const pos of config.positions) {
    if ((counts[pos] || 0) < min[pos]) {
      missing.push(`**${pos}:** ${counts[pos] || 0}/${min[pos]}`);
    }
  }

  return missing.join('\n');
}

async function cancelInsufficientDraft(draft, guild, channel) {
  draft.turnTimers.forEach(t => clearTimeout(t));
  draft.turnTimers = [];

  const announcementChannel = guild.channels.cache.get(draft.announcementId);
  if (announcementChannel && draft.registrationMessageId) {
    const regMsg = await announcementChannel.messages.fetch(draft.registrationMessageId).catch(() => null);
    if (regMsg) await regMsg.edit({ components: [] }).catch(() => {});
  }

  deleteDraft(draft.id);

  if (channel) {
    await channel.send({
      embeds: [errorEmbed([
        `❌ Draft **${draft.id}** has been **CANCELLED** because it did not reach the minimum required players for 2 teams.`,
        '',
        '**Still missing:**',
        `${getMissingPlayersText(draft)}`,
        '',
        '*Minimum needed: 2 captains, 4 WS, 2 Setters, 4 DS, 2 Libs*'
      ].join('\n'))]
    }).catch(() => {});
  }
}

module.exports = {
  getMinimumRequirements,
  getRegistrationCounts,
  isRegistrationCompleteEnough,
  getMissingPlayersText,
  cancelInsufficientDraft
};