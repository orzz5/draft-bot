const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { drafts, scheduleSave } = require('../state/drafts');
const { getSetup, getTeamName, canPickPosition, isTeamFull } = require('../utils/helpers');
const { registrationEmbed, errorEmbed, successEmbed, infoEmbed, matchEmbed } = require('../utils/embeds');
const { createTournament, getTournament, reportMatchWinner, scheduleSave: scheduleTournamentSave } = require('../state/tournaments');
const { startTurnTimer } = require('../utils/recovery');

module.exports = {
  prefix: 'position',
  execute: async (interaction) => {
    const parts = interaction.customId.split('_');
    const regType = parts[1];
    const draftId = parts.slice(2).join('_');
    const position = interaction.values[0];

    const draft = drafts.get(draftId);
    if (!draft || draft.status !== 'registration') {
      return interaction.reply({ embeds: [errorEmbed('Registration is closed.')], flags: MessageFlags.Ephemeral });
    }

    const { isMemberBlocked } = require('../utils/blacklist');
    if (isMemberBlocked(interaction.member, interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('You are blacklisted and cannot join drafts.')], flags: MessageFlags.Ephemeral });
    }

    if (regType === 'captain' && draft.players.some(p => p.id === interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('You are already registered as a player. You cannot register as both.')], flags: MessageFlags.Ephemeral });
    }

    if (regType === 'player' && draft.captainCandidates.some(c => c.id === interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('You are already registered as a captain. You cannot register as both.')], flags: MessageFlags.Ephemeral });
    }

    const existing = draft.players.findIndex(p => p.id === interaction.user.id);

    const playerData = {
      id: interaction.user.id,
      username: interaction.user.username,
      displayName: interaction.member.displayName,
      position,
      picked: false
    };

    if (existing >= 0) {
      draft.players[existing] = playerData;
    } else {
      draft.players.push(playerData);
    }

    if (regType === 'captain') {
      const capExisting = draft.captainCandidates.findIndex(c => c.id === interaction.user.id);
      if (capExisting >= 0) {
        draft.captainCandidates[capExisting] = playerData;
      } else {
        draft.captainCandidates.push(playerData);
      }
    }

    scheduleSave();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const announcementChannel = interaction.guild.channels.cache.get(draft.announcementId);
    if (announcementChannel && draft.registrationMessageId) {
      const regMsg = await announcementChannel.messages.fetch(draft.registrationMessageId).catch(() => null);
      if (regMsg) {
        const embed = registrationEmbed(draft, await interaction.guild.members.fetch(draft.hostId).catch(() => interaction.user));
        await regMsg.edit({ embeds: [embed] }).catch(() => {});
      }
    }

    await interaction.editReply({
      embeds: [successEmbed(`✅ Registered as **${regType === 'captain' ? 'Captain' : 'Player'}** with position **${position}**!`)]
    });
  },

  announceWinner
};

module.exports.handlers = {
  captainsub: async (interaction) => {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const draftId = parts.slice(2).join('_');

    const draft = drafts.get(draftId);
    if (!draft) {
      return interaction.reply({ embeds: [errorEmbed('Draft not found.')], flags: MessageFlags.Ephemeral });
    }

    if (!draft.subState) draft.subState = {};

    if (action === 'current') {
      draft.subState.currentCaptainId = interaction.values[0];
      await interaction.reply({ embeds: [successEmbed('Select the new captain from the second menu.')], flags: MessageFlags.Ephemeral });
    } else if (action === 'new') {
      if (!draft.subState.currentCaptainId) {
        return interaction.reply({ embeds: [errorEmbed('Please select the current captain first.')], flags: MessageFlags.Ephemeral });
      }

      const newCapId = interaction.values[0];
      const currentCap = draft.captains.find(c => c.id === draft.subState.currentCaptainId);
      const newCapData = draft.captainCandidates.find(c => c.id === newCapId);

      if (!currentCap || !newCapData) {
        return interaction.reply({ embeds: [errorEmbed('Invalid captains selected.')], flags: MessageFlags.Ephemeral });
      }

      const teamNumber = currentCap.teamNumber;
      const setup = getSetup(interaction.guild.id);

      const capRoleId = setup?.captainRoles?.[draft.type]?.[teamNumber];
      if (capRoleId) {
        const oldMember = await interaction.guild.members.fetch(currentCap.id).catch(() => null);
        const newMember = await interaction.guild.members.fetch(newCapId).catch(() => null);

        if (oldMember) await oldMember.roles.remove(capRoleId).catch(() => {});
        if (newMember) await newMember.roles.add(capRoleId).catch(() => {});
      }

      const newCapPlayer = draft.players.find(p => p.id === newCapId);
      if (newCapPlayer) {
        newCapPlayer.picked = true;
        const oldCapPlayerIndex = draft.players.findIndex(p => p.id === currentCap.id);
        if (oldCapPlayerIndex >= 0) draft.players[oldCapPlayerIndex].picked = false;

        const teamPlayers = draft.teams[teamNumber].players;
        const capIndex = teamPlayers.findIndex(p => p.id === currentCap.id);
        if (capIndex >= 0) {
          teamPlayers[capIndex] = { id: newCapId, position: newCapData.position, username: newCapData.username, isCaptain: true };
        }

        const capIndex2 = draft.captains.findIndex(c => c.id === currentCap.id);
        if (capIndex2 >= 0) {
          draft.captains[capIndex2] = { id: newCapId, username: newCapData.username, position: newCapData.position, teamNumber };
        }

        draft.teams[teamNumber].captain = draft.captains[capIndex2];
      }

      const newCaptain = { id: newCapId, username: newCapData.username, position: newCapData.position, teamNumber };
      draft.draftOrder = draft.draftOrder.map(c => c.id === currentCap.id ? { ...newCaptain } : c);

      const wasCurrentTurn = draft.currentCaptain && draft.currentCaptain.id === currentCap.id;
      if (wasCurrentTurn) {
        draft.currentCaptain = { ...newCaptain };
      }

      delete draft.subState;
      scheduleSave();

      const teamName = getTeamName(draft, teamNumber);
      await interaction.reply({
        embeds: [successEmbed(`✅ Captain substituted! **${newCapData.username}** is now the captain of **${teamName}**.`)],
        flags: MessageFlags.Ephemeral
      });

      const { logHostAction } = require('../utils/auditLog');
      await logHostAction(interaction.guild, interaction.user, `Substituted captain **${currentCap.username}** → **${newCapData.username}**`, [
        { name: '🎯 Draft', value: draftId, inline: true },
        { name: '👥 Team', value: teamName, inline: true }
      ]);

      const picksChannel = interaction.guild.channels.cache.get(draft.picksChannelId);
      if (!picksChannel) return;

      if (wasCurrentTurn) {
        const needed = getTeamNeeds(draft, teamNumber);
        const needsText = needed.map(n => `${n.position} (${n.count})`).join(', ');

        await picksChannel.send({
          content: `<@${newCapId}>`,
          embeds: [infoEmbed(`🔁 You've been subbed in as captain for <@${currentCap.id}>.\n\nIt's your turn to pick! **${teamName} needs:** ${needsText}\n\nType the @mention or username of the player you want to pick.`)]
        }).catch(() => {});

        startTurnTimer(draft, picksChannel);
      } else {
        await picksChannel.send({
          content: `<@${newCapId}>`,
          embeds: [infoEmbed(`🔁 You've been subbed in as captain for <@${currentCap.id}> on **${teamName}**!`)]
        }).catch(() => {});
      }
    }
  },

  playersub: async (interaction) => {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const draftId = parts.slice(2).join('_');

    const draft = drafts.get(draftId);
    if (!draft) {
      return interaction.reply({ embeds: [errorEmbed('Draft not found.')], flags: MessageFlags.Ephemeral });
    }

    if (!draft.subState) draft.subState = {};

    if (action === 'team') {
      draft.subState.selectedTeam = parseInt(interaction.values[0]);

      const team = draft.teams[draft.subState.selectedTeam];
      const playerOptions = team.players
        .filter(p => !p.isCaptain)
        .map(p => ({ label: p.username, value: p.id, description: p.position }));

      if (playerOptions.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('No players to substitute on this team.')], flags: MessageFlags.Ephemeral });
      }

      const playerSelect = new StringSelectMenuBuilder()
        .setCustomId(`playersub_old_${draftId}`)
        .setPlaceholder('Select player to replace')
        .addOptions(playerOptions);

      const row = new ActionRowBuilder().addComponents(playerSelect);

      await interaction.reply({
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    } else if (action === 'old') {
      draft.subState.oldPlayerId = interaction.values[0];
      const oldPlayer = draft.teams[draft.subState.selectedTeam].players.find(p => p.id === draft.subState.oldPlayerId);

      const unpicked = draft.players.filter(p => !p.picked && p.position === oldPlayer.position);
      const subOptions = unpicked.map(p => ({ label: p.username, value: p.id, description: p.position }));

      if (subOptions.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('No unpicked players available for this position.')], flags: MessageFlags.Ephemeral });
      }

      const subSelect = new StringSelectMenuBuilder()
        .setCustomId(`playersub_new_${draftId}`)
        .setPlaceholder('Select substitute player')
        .addOptions(subOptions);

      const row = new ActionRowBuilder().addComponents(subSelect);

      await interaction.reply({
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    } else if (action === 'new') {
      const newPlayerId = interaction.values[0];
      const teamNumber = draft.subState.selectedTeam;
      const team = draft.teams[teamNumber];

      const oldPlayerIndex = team.players.findIndex(p => p.id === draft.subState.oldPlayerId);
      const oldPlayer = team.players[oldPlayerIndex];
      const newPlayerData = draft.players.find(p => p.id === newPlayerId);

      if (oldPlayerIndex < 0 || !newPlayerData) {
        return interaction.reply({ embeds: [errorEmbed('Invalid substitution.')], flags: MessageFlags.Ephemeral });
      }

      const oldPlayerGlobal = draft.players.find(p => p.id === draft.subState.oldPlayerId);
      if (oldPlayerGlobal) oldPlayerGlobal.picked = false;
      newPlayerData.picked = true;

      team.players[oldPlayerIndex] = { id: newPlayerId, position: newPlayerData.position, username: newPlayerData.username };

      delete draft.subState;
      scheduleSave();

      const teamName = getTeamName(draft, teamNumber);
      await interaction.reply({
        embeds: [successEmbed(`✅ Player substituted! **${newPlayerData.username}** replaced **${oldPlayer.username}** on **${teamName}**.`)],
        flags: MessageFlags.Ephemeral
      });

      const { logHostAction } = require('../utils/auditLog');
      await logHostAction(interaction.guild, interaction.user, `Substituted player **${newPlayerData.username}** in for **${oldPlayer.username}**`, [
        { name: '🎯 Draft', value: draftId, inline: true },
        { name: '👥 Team', value: teamName, inline: true }
      ]);
    }
  },

  vote: async (interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const parts = interaction.customId.split('_');
    const votedTeam = parts[1];
    const matchId = parts[2];
    const draftId = parts.slice(3).join('_');

    const tournament = getTournament(draftId);
    if (!tournament) {
      return interaction.followUp({ embeds: [errorEmbed('Tournament not found.')], flags: MessageFlags.Ephemeral });
    }

    const isFinals = matchId === 'final' && !tournament.matches.some(m => m.id === 'final');
    const match = isFinals
      ? (tournament.finals && tournament.finals.status !== 'completed' ? tournament.finals : null)
      : tournament.matches.find(m => m.id === matchId);
    if (!match || match.status === 'completed') {
      return interaction.followUp({ embeds: [errorEmbed('Match not found or already completed.')], flags: MessageFlags.Ephemeral });
    }

    const team1CaptainId = match.team1.roster[0]?.id;
    const team2CaptainId = match.team2.roster[0]?.id;
    if (interaction.user.id !== team1CaptainId && interaction.user.id !== team2CaptainId) {
      return interaction.followUp({ embeds: [errorEmbed('Only the captains of the teams can vote on the match result.')], flags: MessageFlags.Ephemeral });
    }

    const draft = drafts.get(draftId);
    const setup = getSetup(interaction.guild.id);
    const announcementChannel = interaction.guild.channels.cache.get(draft.announcementId);

    const votedTeamLabel = votedTeam === 'team1' ? getTeamName(draft, match.team1.number) : getTeamName(draft, match.team2.number);
    const voteChannel = interaction.guild.channels.cache.get(draft.picksChannelId) || announcementChannel;
    if (voteChannel) {
      await voteChannel.send({
        embeds: [infoEmbed(`🗳️ **${interaction.user.username}** voted for **${votedTeamLabel}**!`)]
      }).catch(() => {});
    }

    if (!match.votes) match.votes = {};
    match.votes[interaction.user.id] = votedTeam;
    scheduleTournamentSave();

    const playerVotes = Object.values(match.votes);

    if (playerVotes.length < 2) {
      await interaction.followUp({
        embeds: [infoEmbed(`🗳️ Vote recorded for **${votedTeamLabel}**! Waiting for the other captain to vote...`)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (playerVotes[0] !== playerVotes[1]) {
      const host = await interaction.guild.members.fetch(draft.hostId).catch(() => null);
      if (host) {
        const t1 = getTeamName(draft, match.team1.number);
        const t2 = getTeamName(draft, match.team2.number);
        await host.send({
          embeds: [infoEmbed(`⚔️ **Captain disagreement on ${matchId.toUpperCase()}** (${draft.id})\n\n<@${team1CaptainId}> voted **${t1}**\n<@${team2CaptainId}> voted **${t2}**\n\nThe captains do **not** agree on the winner. Please resolve this manually.`)]
        }).catch(() => {});
      }
      await interaction.followUp({
        embeds: [infoEmbed(`⚠️ Captains disagree on the winner of **${matchId.toUpperCase()}**! The host has been notified to resolve it.`)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const winningTeam = votedTeam === 'team1' ? match.team1.number : match.team2.number;

    if (isFinals) {
      tournament.finals.winner = winningTeam;
      tournament.finals.status = 'completed';
      tournament.winner = winningTeam;
      tournament.stage = 'completed';
    }

    const result = reportMatchWinner(draftId, matchId, winningTeam);

    await interaction.followUp({
      embeds: [successEmbed(`✅ Match result recorded! **Team ${winningTeam}** wins!`)],
      flags: MessageFlags.Ephemeral
    });

    if (announcementChannel) {
      const teamName = getTeamName(draft, winningTeam);
      await announcementChannel.send({
        embeds: [infoEmbed(`🏆 **${teamName}** has won the match!`)]
      }).catch(() => {});
    }

    if (matchId === 'm1' || matchId === 'm2') {
      const otherMatch = tournament.matches.find(m => m.id !== matchId && m.status === 'completed');
      if (otherMatch) {
        tournament.finals.team1 = { number: match.winner, roster: match.winner === match.team1.number ? match.team1.roster : match.team2.roster };
        tournament.finals.team2 = { number: otherMatch.winner, roster: otherMatch.winner === otherMatch.team1.number ? otherMatch.team1.roster : otherMatch.team2.roster };
        tournament.finals.status = 'ready';
        tournament.stage = 'finals';

        try {
          await createFinalsChannels(tournament, draft, interaction.guild, setup);
        } catch (e) {
          console.error(`Failed to create finals channels for ${draft.id}:`, e);
          if (announcementChannel) {
            await announcementChannel.send({
              embeds: [infoEmbed('⚠️ Both semifinals are complete, but the finals vote could not be posted automatically. A host can use `/draft setup-matches` to retry.')]
            }).catch(() => {});
          }
        }
      } else {
        if (announcementChannel) {
          await announcementChannel.send({
            embeds: [infoEmbed('⏳ The other semifinal match has not finished yet.')]
          }).catch(() => {});
        }
      }
    }

    try {
      if (matchId === 'final' && !isFinals) {
        await announceWinner(tournament, draft, interaction.guild, setup);
        if (result && result.losingTeamNumber) {
          await cleanupLosingChannels(result.losingTeamNumber, draft, interaction.guild, setup);
        }
      } else if (isFinals) {
        await announceWinner(tournament, draft, interaction.guild, setup);
        if (result && result.losingTeamNumber) {
          await cleanupLosingChannels(result.losingTeamNumber, draft, interaction.guild, setup);
        }
      } else if (result) {
        await cleanupLosingChannels(result.losingTeamNumber, draft, interaction.guild, setup);
      }
    } catch (e) {
      console.error(`Failed to finalize after vote on ${draft.id}:`, e);
    }
  }
};

async function createFinalsChannels(tournament, draft, guild, setup) {
  const picksChannel =
    guild.channels.cache.get(draft.picksChannelId) ||
    guild.channels.cache.get(draft.announcementId);
  if (!picksChannel) return;

  const team1Name = getTeamName(draft, tournament.finals.team1.number);
  const team2Name = getTeamName(draft, tournament.finals.team2.number);

  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vote_team1_final_${draft.id}`)
      .setLabel(team1Name)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`vote_team2_final_${draft.id}`)
      .setLabel(team2Name)
      .setStyle(ButtonStyle.Danger)
  );

  const matchData = tournament.finals;
  matchData.id = 'final';
  matchData.status = 'ready';

  await picksChannel.send({
    embeds: [matchEmbed(matchData, draft.id, draft)],
    components: [voteRow]
  });

  scheduleSave();
}

async function announceWinner(tournament, draft, guild, setup) {
  const winningTeamNumber = tournament.winner;
  const winningTeam = tournament.teams[winningTeamNumber];
  const teamName = getTeamName(draft, winningTeamNumber);

  try {
    const winnersChannel = guild.channels.cache.get(setup.winnersChannels[draft.type]);
    if (winnersChannel && winningTeam) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle(`🏆 ${draft.type.toUpperCase()} Draft #${draft.draftNumber} Winner!`)
        .setDescription(`**${teamName}** has won the tournament!\n\n${winningTeam.roster.map(p => `<@${p.id}> (${p.position})`).join('\n')}`)
        .setTimestamp();

      await winnersChannel.send({ embeds: [embed] });
    } else {
      console.error(`[announceWinner] Missing winners channel or winning team for ${draft.id}`);
    }
  } catch (e) {
    console.error(`[announceWinner] Failed to send winners embed for ${draft.id}:`, e);
  }

  try {
    const { recordWin } = require('../utils/stats');
    recordWin(draft, (winningTeam && winningTeam.roster) || []);
  } catch (e) {
    console.error(`[announceWinner] Failed to record win for ${draft.id}:`, e);
  }

  try {
    const hostMember = await guild.members.fetch(draft.hostId).catch(() => null);
    if (hostMember && winningTeam) {
      const { setPendingMvp } = require('../state/mvp');
      setPendingMvp(draft.id, {
        draftId: draft.id,
        hostId: draft.hostId,
        type: draft.type,
        draftNumber: draft.draftNumber,
        winningTeamNumber,
        winningTeamName: teamName,
        roster: winningTeam.roster
      });

      const lineup = winningTeam.roster
        .map(p => `**${p.position}** - <@${p.id}> | ID: \`${p.id}\``)
        .join('\n');

      const mvpEmbed = new EmbedBuilder()
        .setColor(config.colors.match)
        .setTitle(`🏆 ${draft.type.toUpperCase()} Draft #${draft.draftNumber} - MVP Selection`)
        .setDescription(`**${teamName}** won the tournament!\n\n**Winner lineup:**\n${lineup}\n\nReply to this message with a player's @mention or ID to select the **MVP**, or type \`none\` if there's no MVP.`)
        .setTimestamp();

      await hostMember.send({ embeds: [mvpEmbed] }).catch(() => {});
    }
  } catch (e) {
    console.error(`[announceWinner] Failed to send MVP prompt for ${draft.id}:`, e);
  }

  await finalizeDraftCleanup(draft, guild);
}

async function finalizeDraftCleanup(draft, guild) {
  try {
    const { cleanupDraftAfterCompletion } = require('../utils/matches');
    if (typeof cleanupDraftAfterCompletion === 'function') {
      await cleanupDraftAfterCompletion(draft, guild);
      return;
    }
    console.error(`[finalizeDraftCleanup] cleanupDraftAfterCompletion is not a function for ${draft.id}. Falling back to manual cleanup.`);
  } catch (e) {
    console.error(`[finalizeDraftCleanup] cleanupDraftAfterCompletion failed for ${draft.id}:`, e);
  }

  const setup = getSetup(guild.id);

  for (const [num, team] of Object.entries(draft.teams)) {
    if (!team.captain) continue;
    const capRoleId = setup?.captainRoles?.[draft.type]?.[num];
    if (!capRoleId) continue;
    const member = await guild.members.fetch(team.captain.id).catch(() => null);
    if (member) await member.roles.remove(capRoleId).catch(() => {});
  }

  if (draft.picksChannelId) {
    const pickCh = guild.channels.cache.get(draft.picksChannelId);
    if (pickCh) await pickCh.delete().catch(() => {});
  }

  for (const catId of draft.categories || []) {
    const category = guild.channels.cache.get(catId);
    if (!category) continue;
    for (const [, ch] of category.children.cache) {
      await ch.delete().catch(() => {});
    }
    await category.delete().catch(() => {});
  }
}

async function cleanupLosingChannels(losingTeamNumber, draft, guild, setup) {
  const tournament = getTournament(draft.id);
  if (!tournament) return;

  if (setup.captainRoles?.[draft.type]?.[losingTeamNumber]) {
    const losingTeam = tournament.teams[losingTeamNumber];
    if (losingTeam) {
      const capRoleId = setup.captainRoles[draft.type][losingTeamNumber];
      if (losingTeam.captain) {
        const member = await guild.members.fetch(losingTeam.captain.id).catch(() => null);
        if (member) await member.roles.remove(capRoleId).catch(() => {});
      }
    }
  }
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