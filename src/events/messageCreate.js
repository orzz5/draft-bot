const { MessageFlags, Events, EmbedBuilder } = require('discord.js');
const { drafts, scheduleSave } = require('../state/drafts');
const { getSetup, canPickPosition, isTeamFull, getTeamName } = require('../utils/helpers');
const { draftPickEmbed, infoEmbed, successEmbed, errorEmbed } = require('../utils/embeds');
const config = require('../config');
const { autoBuild, autoReverse, removeAll } = require('../utils/autoBuild');
const { lockdownUnverified } = require('../utils/lockdown');
const { setupTournamentAfterPick } = require('../utils/matches');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    if (!message.guild) {
      return handleMvpReply(message);
    }

    if (message.guild.id !== config.guildId) return;

    if (message.mentions.has(message.client.user) && message.author.id === config.ownerId) {
      const content = message.content.toLowerCase();
      if (content.includes('remove everything')) {
        return removeAll(message);
      }
      if (content.includes('unverify all')) {
        return lockdownUnverified(message);
      }
      if (content.includes('work')) {
        return autoBuild(message);
      }
      if (content.includes('reverse')) {
        return autoReverse(message);
      }
    }

    const draft = drafts.find(d =>
      d.status === 'picking' &&
      d.picksChannelId === message.channel.id
    );

    if (!draft) return;

    const isCurrentCaptain = draft.isTest
      ? message.author.id === draft.hostId
      : draft.currentCaptain && message.author.id === draft.currentCaptain.id;

    if (isCurrentCaptain) {
      await handlePick(message, draft);
    }
  }
};

async function handlePick(message, draft) {
  const mentioned = message.mentions.users.first();
  let pickedUser = null;
  let playerData = null;

  if (mentioned) {
    pickedUser = mentioned;
    playerData = draft.players.find(p => p.id === pickedUser.id);
  } else {
    const input = message.content.toLowerCase();
    const candidate = draft.players.find(p =>
      !p.picked && (
        p.username.toLowerCase().includes(input) ||
        p.displayName?.toLowerCase().includes(input)
      )
    );
    if (candidate) {
      playerData = candidate;
      if (draft.isTest) {
        pickedUser = { id: candidate.id, username: candidate.username };
      } else {
        pickedUser = message.guild.members.cache.get(candidate.id)?.user;
      }
    }
  }

  if (!pickedUser || !playerData) {
    return message.reply({ embeds: [errorEmbed('Player not found or already picked. Please try again.')], flags: MessageFlags.Ephemeral }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  if (playerData.picked) {
    return message.reply({ embeds: [errorEmbed('This player has already been picked.')], flags: MessageFlags.Ephemeral }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  if (playerData.id === draft.currentCaptain.id) {
    return message.reply({ embeds: [errorEmbed('You cannot pick yourself.')], flags: MessageFlags.Ephemeral }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  const { isMemberBlocked } = require('../utils/blacklist');
  const memberToPick = message.guild.members.cache.get(playerData.id);
  if (isMemberBlocked(memberToPick, playerData.id)) {
    return message.reply({ embeds: [errorEmbed(`**${playerData.username}** is blacklisted and cannot be picked.`)], flags: MessageFlags.Ephemeral }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  const teamNumber = draft.currentCaptain.teamNumber;
  const team = draft.teams[teamNumber];
  const teamName = getTeamName(draft, teamNumber);

  if (!canPickPosition(team.players, playerData.position)) {
    return message.reply({ embeds: [errorEmbed(`Your team already has enough **${playerData.position}** players.`)], flags: MessageFlags.Ephemeral }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  playerData.picked = true;
  team.players.push({ id: playerData.id, position: playerData.position, username: playerData.username });

  const setup = getSetup(message.guild.id);

  if (!draft.isTest) {
    try {
      const member = await message.guild.members.fetch(playerData.id);
      if (member) {
        await member.send({
          embeds: [infoEmbed(`🏐 You have been picked by Captain **${draft.currentCaptain.username}** for **${teamName}**!`)]
        }).catch(() => {});
      }
    } catch (e) {}
  }

  await message.delete().catch(() => {});

  const picksLogChannel = message.guild.channels.cache.get(setup?.picksChannels?.[draft.type]);
  if (picksLogChannel) {
    await picksLogChannel.send({
      embeds: [infoEmbed(`📋 **${draft.type.toUpperCase()} Draft #${draft.draftNumber}** | Captain **${draft.currentCaptain.username}** picked **${playerData.username}** as **${playerData.position}**`)]
    }).catch(() => {});
  }

  await message.channel.send({
    embeds: [successEmbed(`✅ **${draft.currentCaptain.username}** picked **${playerData.username}** as **${playerData.position}** for ${teamName}!`)]
  });

  draft.currentTurn++;
  scheduleSave();

  if (isTeamFull(team.players)) {
    await message.channel.send({
      embeds: [infoEmbed(`🏆 **${teamName}** roster is now **COMPLETE**!`)]
    });
  }

  const teamList = Object.values(draft.teams).filter(t => t.captain);
  const allFull = teamList.length > 0 && teamList.every(t => isTeamFull(t.players));
  if (allFull) {
    draft.status = 'completed';
    draft.turnTimers.forEach(t => clearTimeout(t));
    scheduleSave();
    await message.channel.send({ embeds: [successEmbed('🏐 **Draft complete!** All teams are full.')] });

    try {
      await setupTournamentAfterPick(draft, message.guild);
    } catch (e) {
      console.error('Failed to set up tournament for ' + draft.id + ':', e);
    }
    return;
  }

  let nextCaptain = draft.draftOrder[draft.currentTurn];
  let safety = 0;
  while (nextCaptain && isTeamFull(draft.teams[nextCaptain.teamNumber].players) && safety < 20) {
    draft.currentTurn++;
    nextCaptain = draft.draftOrder[draft.currentTurn];
    safety++;
  }

  if (!nextCaptain) {
    draft.status = 'completed';
    draft.turnTimers.forEach(t => clearTimeout(t));
    scheduleSave();
    await message.channel.send({ embeds: [successEmbed('🏐 **Draft complete!** No more captains to pick.')] });

    try {
      await setupTournamentAfterPick(draft, message.guild);
    } catch (e) {
      console.error('Failed to set up tournament for ' + draft.id + ':', e);
    }
    return;
  }

  draft.currentCaptain = nextCaptain;
  scheduleSave();

  await sendDraftState(draft, message.channel);
  await notifyCurrentCaptain(draft, message.channel);
}

async function sendDraftState(draft, channel) {
  const embed = draftPickEmbed(draft);
  await channel.send({ embeds: [embed] });
}

async function notifyCurrentCaptain(draft, channel) {
  const needed = getTeamNeeds(draft, draft.currentCaptain.teamNumber);
  const needsText = needed.map(n => `${n.position} (${n.count})`).join(', ');

  const content = draft.isTest
    ? `**${draft.currentCaptain.username}** (Test Captain)`
    : `<@${draft.currentCaptain.id}>`;

  await channel.send({
    content: content,
    embeds: [infoEmbed(`It's your turn to pick!\n**${getTeamName(draft, draft.currentCaptain.teamNumber)} needs:** ${needsText}\n\nType the @mention or username of the player you want to pick.`)]
  });

  startTurnTimer(draft, channel);
}

function getTeamNeeds(draft, teamNumber) {
  const team = draft.teams[teamNumber];
  const needs = [];
  const config = require('../config');

  for (const [pos, count] of Object.entries(config.teamRoster)) {
    const current = team.players.filter(p => p.position === pos).length;
    if (current < count) {
      needs.push({ position: pos, count: count - current });
    }
  }

  return needs;
}

function startTurnTimer(draft, channel) {
  draft.turnTimers.forEach(t => clearTimeout(t));
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

async function handleMvpReply(message) {
  const { getPendingMvpByHost, deletePendingMvp } = require('../state/mvp');
  const pending = getPendingMvpByHost(message.author.id);
  if (!pending) return;

  const { draftId, data } = pending;
  const content = message.content.trim();

  if (content.toLowerCase() === 'none') {
    deletePendingMvp(draftId);
    await message.reply({
      embeds: [infoEmbed('No MVP selected. Nothing was posted.')]
    }).catch(() => {});
    return;
  }

  const roster = data.roster || [];
  const cleaned = content.replace(/[<@!&>]/g, '').trim();
  const matched = roster.find(p =>
    p.id === cleaned ||
    p.username.toLowerCase() === content.toLowerCase() ||
    p.displayName?.toLowerCase() === content.toLowerCase()
  );

  if (!matched) {
    await message.reply({
      embeds: [errorEmbed('Player not found on the winning team. Reply with a player @mention, their ID, or type `none`.')]
    }).catch(() => {});
    return;
  }

  const mvpChannelId = config.mvpsChannels?.[data.type];
  if (mvpChannelId) {
    const mvpChannel = await message.client.channels.fetch(mvpChannelId).catch(() => null);
    if (mvpChannel) {
      const mvpEmbed = new EmbedBuilder()
        .setColor(config.colors.match)
        .setTitle(`🏆 ${data.type.toUpperCase()} Draft #${data.draftNumber || ''} - MVP`)
        .setDescription(`**${data.winningTeamName || 'Winning Team'}**\n\n⭐ **${matched.username}** (${matched.position})\n<@${matched.id}> | ID: \`${matched.id}\``)
        .setTimestamp();
      await mvpChannel.send({ embeds: [mvpEmbed] }).catch(() => {});
    }
  }

  deletePendingMvp(draftId);
  await message.reply({
    embeds: [successEmbed(`✅ **${matched.username}** selected as the MVP!`)]
  }).catch(() => {});
}
