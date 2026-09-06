const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { getSetup, getTeamName } = require('./helpers');
const { draftPickEmbed, infoEmbed, registrationEmbed } = require('./embeds');
const { scheduleSave } = require('../state/drafts');
const { isRegistrationCompleteEnough, cancelInsufficientDraft } = require('./draftChecks');

async function recoverDraft(draft, client) {
  try {
    if (!draft.autoManual) draft.autoManual = 'automatic';

    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    if (draft.status === 'picking') {
      await recoverPickingPhase(draft, guild);
    } else if (draft.status === 'registration') {
      await recoverRegistrationPhase(draft, guild);
    } else if (draft.status === 'awaiting_winner') {
      console.log(`Draft ${draft.id} is awaiting winner report.`);
    }

    console.log(`✅ Recovered draft ${draft.id} (status: ${draft.status})`);
  } catch (e) {
    console.error(`Failed to recover draft ${draft.id}:`, e);
  }
}

async function recoverPickingPhase(draft, guild) {
  const picksChannel = guild.channels.cache.get(draft.picksChannelId);
  if (!picksChannel) {
    console.error(`Picks channel not found for draft ${draft.id}`);
    return;
  }

  const embed = draftPickEmbed(draft);
  await picksChannel.send({ embeds: [embed] }).catch(() => {});

  if (draft.currentCaptain) {
    const needed = getTeamNeeds(draft, draft.currentCaptain.teamNumber);
    const needsText = needed.map(n => `${n.position} (${n.count})`).join(', ');

    const content = draft.isTest
      ? `**${draft.currentCaptain.username}** (Test Captain)`
      : `<@${draft.currentCaptain.id}>`;

    await picksChannel.send({
      content: content,
      embeds: [infoEmbed(`🔄 **Draft recovered!** It's your turn to pick!\n**${getTeamName(draft, draft.currentCaptain.teamNumber)} needs:** ${needsText}\n\nType the @mention or username of the player you want to pick.`)]
    }).catch(() => {});

    startTurnTimer(draft, picksChannel);
  }
}

async function recoverRegistrationPhase(draft, guild) {
  if (draft.registrationEnd && !draft.isUnlimited) {
    const remaining = draft.registrationEnd - Date.now();
    if (remaining <= 0) {
      const announcementChannel = guild.channels.cache.get(draft.announcementId);
      if (announcementChannel) {
        await announcementChannel.send({
          embeds: [infoEmbed(`⏰ Registration for **${draft.id}** is now **CLOSED**!`)]
        }).catch(() => {});
      }

      if (!isRegistrationCompleteEnough(draft)) {
        await cancelInsufficientDraft(draft, guild, announcementChannel);
        return;
      }

      if (draft.autoManual === 'automatic') {
        const { handleRandomizerSelection } = require('../commands/draft');
        const fakeInteraction = { guild, user: { id: draft.hostId }, channel: announcementChannel, client: guild.client };
        await handleRandomizerSelection(draft, fakeInteraction);
      } else {
        await handleManualRecovery(draft, guild);
      }
    } else {
      console.log(`Draft ${draft.id} registration has ${Math.round(remaining / 1000)}s remaining.`);
      setTimeout(async () => {
        const announcementChannel = guild.channels.cache.get(draft.announcementId);
        if (announcementChannel) {
          await announcementChannel.send({
            embeds: [infoEmbed(`⏰ Registration for **${draft.id}** is now **CLOSED**!`)]
          }).catch(() => {});
        }

        if (!isRegistrationCompleteEnough(draft)) {
          await cancelInsufficientDraft(draft, guild, announcementChannel);
          return;
        }

        if (draft.autoManual === 'automatic') {
          const { handleRandomizerSelection } = require('../commands/draft');
          const fakeInteraction = { guild, user: { id: draft.hostId }, channel: announcementChannel, client: guild.client };
          await handleRandomizerSelection(draft, fakeInteraction);
        } else {
          await handleManualRecovery(draft, guild);
        }
      }, remaining);
    }
  }
}

async function handleManualRecovery(draft, guild) {
  const setup = getSetup(guild.id);
  const announcementChannel = guild.channels.cache.get(draft.announcementId);

  if (announcementChannel) {
    const { infoEmbed, playersListEmbed } = require('./embeds');
    const capList = draft.captainCandidates.map((c, i) => `${i + 1}. <@${c.id}>`).join('\n');
    await announcementChannel.send({
      embeds: [infoEmbed(`📋 **Captain Candidates:**\n${capList}`)]
    }).catch(() => {});
    await announcementChannel.send({
      embeds: [playersListEmbed(draft)]
    }).catch(() => {});
  }

  const hostMember = await guild.members.fetch(draft.hostId).catch(() => null);
  if (hostMember) {
    const capList = draft.captainCandidates.map((c, i) => `${i + 1}. <@${c.id}>`).join('\n');
    await hostMember.send({
      embeds: [infoEmbed(`🔄 **Draft Recovered**\n\n📋 **Captain Candidates:**\n${capList}\n\nUse \`/winner draft-id: ${draft.id} player1: @user player2: @user player3: @user player4: @user player5: @user player6: @user\` to report the winning team.`)]
    }).catch(() => {});
  }

  draft.status = 'awaiting_winner';
  scheduleSave();
}

function getTeamNeeds(draft, teamNumber) {
  const team = draft.teams[teamNumber];
  const needs = [];

  for (const [pos, count] of Object.entries(config.teamRoster)) {
    const current = team.players.filter(p => p.position === pos).length;
    if (current < count) {
      needs.push({ position: pos, count: count - current });
    }
  }

  return needs;
}

function startTurnTimer(draft, channel) {
  if (draft.turnTimers) {
    draft.turnTimers.forEach(t => clearTimeout(t));
  }
  draft.turnTimers = [];

  const reminderTimer = setTimeout(async () => {
    if (draft.status !== 'picking' || !draft.currentCaptain) return;
    try {
      await channel.send({
        content: `<@${draft.currentCaptain.id}>`,
        embeds: [infoEmbed('⏰ **30 second reminder:** Please make your pick!')]
      });
    } catch (e) {}
  }, config.turnTime.reminder);

  const hostTimer = setTimeout(async () => {
    if (draft.status !== 'picking' || !draft.currentCaptain) return;
    try {
      await channel.send({
        content: `<@${draft.hostId}>`,
        embeds: [infoEmbed(`⚠️ **60 seconds passed!** Captain <@${draft.currentCaptain.id}> has not picked yet.`)]
      });
    } catch (e) {}
  }, config.turnTime.hostAlert);

  draft.turnTimers = [reminderTimer, hostTimer];
}

module.exports = { recoverDraft, startTurnTimer };
