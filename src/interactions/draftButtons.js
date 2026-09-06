const { MessageFlags } = require('discord.js');
const { getDraftById, deleteDraft, scheduleSave } = require('../state/drafts');
const { getSetup, getCaptainCount, selectCaptains, getTeamName, computeTeamCount } = require('../utils/helpers');
const { errorEmbed, successEmbed, infoEmbed } = require('../utils/embeds');
const { isRegistrationCompleteEnough, cancelInsufficientDraft } = require('../utils/draftChecks');
const { logHostAction } = require('../utils/auditLog');

module.exports = {
  prefix: 'draft',
  async execute(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const draftId = parts.slice(2).join('_');

    const draft = getDraftById(draftId);
    if (!draft) {
      return interaction.reply({ embeds: [errorEmbed('Draft not found.')], flags: MessageFlags.Ephemeral });
    }

    if (action === 'start') {
      if (draft.hostId !== interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed('Only the draft host can start the draft.')], flags: MessageFlags.Ephemeral });
      }

      if (draft.status !== 'registration') {
        return interaction.reply({ embeds: [errorEmbed('Draft is not in registration phase.')], flags: MessageFlags.Ephemeral });
      }

      if (!isRegistrationCompleteEnough(draft)) {
        await interaction.reply({ embeds: [infoEmbed('⏰ Registration closed. Checking minimum required players...')] });
        await interaction.message.edit({ components: [] }).catch(() => {});
        await cancelInsufficientDraft(draft, interaction.guild, interaction.channel);
        return;
      }

      draft.status = 'captain_selection';

      await interaction.reply({ embeds: [infoEmbed(`⏰ Registration for **${draft.id}** is now **CLOSED**!`)] });

      await interaction.message.edit({ components: [] }).catch(() => {});

      await logHostAction(interaction.guild, interaction.user, `Started draft **${draft.id}** (Start button)`, [
        { name: '🎯 Draft', value: draft.id, inline: true },
        { name: '🤖 Mode', value: draft.autoManual === 'automatic' ? '✅ Auto' : '👤 Manual', inline: true },
        { name: '👥 Signups', value: `${draft.players.length} players · ${draft.captainCandidates.length} captains`, inline: true }
      ]);

      if (draft.autoManual === 'automatic') {
        const setup = getSetup(interaction.guild.id);

        let realCandidates;
        if (draft.isTest) {
          realCandidates = draft.captainCandidates.filter(c => !c.isTestCaptain);
          if (realCandidates.length === 0) {
            const hostMember = await interaction.guild.members.fetch(draft.hostId).catch(() => null);
            if (hostMember) {
              realCandidates = [{
                id: draft.hostId,
                username: hostMember.user.username,
                displayName: hostMember.displayName,
                position: 'WS',
                picked: false
              }];
            }
          }
        } else {
          realCandidates = draft.captainCandidates;
        }

        const captainCount = draft.isTest ? Math.min(realCandidates.length, 4) : computeTeamCount(draft.captainCandidates, draft.players);

        if (captainCount === 0) {
          await interaction.channel.send({
            embeds: [errorEmbed('Not enough captain candidates or players to form the minimum 2 teams. The draft has been cancelled.')]
          });
          deleteDraft(draft.id);
          return;
        }

        const selectedCaptains = selectCaptains(realCandidates, captainCount);

        try {
          for (let i = 0; i < selectedCaptains.length; i++) {
            const cap = selectedCaptains[i];
            const teamNumber = i + 1;

            cap.teamNumber = teamNumber;
            draft.teams[teamNumber].captain = cap;
            draft.teams[teamNumber].players.push({ id: cap.id, position: cap.position, username: cap.username, isCaptain: true });

            if (!draft.isTest) {
              const capRoleId = setup.captainRoles?.[draft.type]?.[teamNumber];
              if (capRoleId) {
                const member = await interaction.guild.members.fetch(cap.id).catch(() => null);
                if (member) await member.roles.add(capRoleId).catch(() => {});
              }
            }

            draft.captains.push(cap);

            const teamName = getTeamName(draft, teamNumber);
            await interaction.channel.send({
              embeds: [infoEmbed(`👑 **${cap.username}** has been selected as Captain for **${teamName}**!`)]
            });
          }

          draft.status = 'picking';
          const { startPickingPhase } = require('../commands/draft');
          await startPickingPhase(draft, interaction);
        } catch (e) {
          console.error(`Failed to assign captains for draft ${draft.id}:`, e);

          for (const cap of draft.captains) {
            const capRoleId = setup.captainRoles?.[draft.type]?.[cap.teamNumber];
            if (capRoleId) {
              const member = await interaction.guild.members.fetch(cap.id).catch(() => null);
              if (member) await member.roles.remove(capRoleId).catch(() => {});
            }
          }

          if (draft.picksChannelId) {
            const pickCh = interaction.guild.channels.cache.get(draft.picksChannelId);
            if (pickCh) await pickCh.delete().catch(() => {});
          }

          deleteDraft(draft.id);
          await interaction.channel.send({
            embeds: [errorEmbed(`❌ **${draft.id}** could not assign captains and has been **cancelled**. Please start a new draft.`)]
          }).catch(() => {});
        }
      } else {
        const capList = draft.captainCandidates.map((c, i) => `${i + 1}. <@${c.id}>`).join('\n');

        await interaction.channel.send({
          embeds: [infoEmbed(`📋 **Captain Candidates:**\n${capList}\n\nPlease assign captains manually.`)]
        });

        const { playersListEmbed } = require('../utils/embeds');
        await interaction.channel.send({
          embeds: [playersListEmbed(draft)]
        }).catch(() => {});

        draft.status = 'awaiting_winner';
        scheduleSave();

        const hostMember = await interaction.guild.members.fetch(draft.hostId).catch(() => null);
        if (hostMember) {
          await hostMember.send({
            embeds: [infoEmbed(`📋 **Manual Draft Mode**\n\nCaptain candidates:\n${capList}\n\nWhen the draft is finished, report the winning team with:\n\`/winner draft-id: ${draft.id} player1: @user player2: @user player3: @user player4: @user player5: @user player6: @user\`\n\nto post the winner and complete the draft.`)]
          }).catch(() => {});
        }
      }
    } else if (action === 'cancel') {
      if (draft.hostId !== interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed('Only the draft host can cancel the draft.')], flags: MessageFlags.Ephemeral });
      }

      if (draft.status !== 'registration') {
        return interaction.reply({ embeds: [errorEmbed('Can only cancel a draft that is in registration phase.')], flags: MessageFlags.Ephemeral });
      }

      draft.turnTimers.forEach(t => clearTimeout(t));

      deleteDraft(draft.id);
      await interaction.reply({ embeds: [successEmbed(`Draft **${draftId}** has been cancelled.`)] });

      const pickCh = interaction.guild.channels.cache.get(draft.picksChannelId);
      if (pickCh) await pickCh.delete().catch(() => {});

      await logHostAction(interaction.guild, interaction.user, `Cancelled draft **${draftId}** (Cancel button, registration phase)`);
    }
  }
};
