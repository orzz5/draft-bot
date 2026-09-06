const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../config');
const { drafts, scheduleSave } = require('../state/drafts');
const { getSetup, canUserJoinDraft, isRestrictedUser } = require('../utils/helpers');
const { registrationEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
  prefix: 'register',
  execute: async (interaction) => {
    const parts = interaction.customId.split('_');
    const type = parts[1];
    const draftId = parts.slice(2).join('_');

    const draft = drafts.get(draftId);
    if (!draft) {
      return interaction.reply({ embeds: [errorEmbed('Draft not found.')], flags: MessageFlags.Ephemeral });
    }

    if (type === 'unregister') {
      const playerIndex = draft.players.findIndex(p => p.id === interaction.user.id);
      const captainIndex = draft.captainCandidates.findIndex(c => c.id === interaction.user.id);

      if (playerIndex < 0 && captainIndex < 0) {
        return interaction.reply({ embeds: [errorEmbed('You are not registered in this draft.')], flags: MessageFlags.Ephemeral });
      }

      if (playerIndex >= 0) draft.players.splice(playerIndex, 1);
      if (captainIndex >= 0) draft.captainCandidates.splice(captainIndex, 1);

      scheduleSave();

      await interaction.reply({
        embeds: [successEmbed('✅ You have been unregistered from this draft.')],
        flags: MessageFlags.Ephemeral
      });

      if (draft.registrationMessageId) {
        const announcementChannel = interaction.guild.channels.cache.get(draft.announcementId);
        if (announcementChannel) {
          const regMsg = await announcementChannel.messages.fetch(draft.registrationMessageId).catch(() => null);
          if (regMsg) {
            const embed = registrationEmbed(draft, await interaction.guild.members.fetch(draft.hostId).catch(() => interaction.user));
            await regMsg.edit({ embeds: [embed] }).catch(() => {});
          }
        }
      }

      return;
    }

    if (draft.status !== 'registration') {
      return interaction.reply({ embeds: [errorEmbed('Registration is closed for this draft.')], flags: MessageFlags.Ephemeral });
    }

    const setup = getSetup(interaction.guild.id);
    if (!setup) {
      return interaction.reply({ embeds: [errorEmbed('Bot not configured.')], flags: MessageFlags.Ephemeral });
    }

    const { isMemberBlocked } = require('../utils/blacklist');
    if (isMemberBlocked(interaction.member, interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('You are blacklisted and cannot join drafts.')], flags: MessageFlags.Ephemeral });
    }

    if (isRestrictedUser(interaction.member, draft.type)) {
      return interaction.reply({ embeds: [errorEmbed(`You cannot join ${draft.type} drafts.`)], flags: MessageFlags.Ephemeral });
    }

    if (!canUserJoinDraft(interaction.member, draft.type, setup)) {
      return interaction.reply({ embeds: [errorEmbed('You do not have the required role to join this draft.')], flags: MessageFlags.Ephemeral });
    }

    if (type === 'captain' && draft.captainCandidates.some(c => c.id === interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('You are already registered as a captain.')], flags: MessageFlags.Ephemeral });
    }

    if (type === 'player' && draft.players.some(p => p.id === interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('You are already registered as a player.')], flags: MessageFlags.Ephemeral });
    }

    if (type === 'captain' && draft.players.some(p => p.id === interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('You are already registered as a player. You cannot register as both.')], flags: MessageFlags.Ephemeral });
    }

    if (type === 'player' && draft.captainCandidates.some(c => c.id === interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('You are already registered as a captain. You cannot register as both.')], flags: MessageFlags.Ephemeral });
    }

    const posMenu = new StringSelectMenuBuilder()
      .setCustomId(`position_${type}_${draftId}`)
      .setPlaceholder('Select your position')
      .addOptions([
        { label: 'WS', value: 'WS', description: 'Wing Spiker' },
        { label: 'Setter', value: 'Setter', description: 'Setter' },
        { label: 'DS', value: 'DS', description: 'Defensive Specialist' },
        { label: 'Lib', value: 'Lib', description: 'Libero' }
      ]);

    const row = new ActionRowBuilder().addComponents(posMenu);

    await interaction.reply({
      embeds: [successEmbed(`Select your position for **${type === 'captain' ? 'Captain' : 'Player'}** registration:`)],
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }
};
