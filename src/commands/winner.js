const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getDraftById, deleteDraft, scheduleSave } = require('../state/drafts');
const { getSetup, getTeamName } = require('../utils/helpers');
const { errorEmbed, successEmbed, infoEmbed } = require('../utils/embeds');
const { canStartDraft, isAdmin } = require('../utils/permissions');
const { logHostAction } = require('../utils/auditLog');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('winner')
    .setDescription('Report the winning team for a manual draft')
    .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    .addUserOption(opt => opt.setName('player1').setDescription('Player 1 on winning team').setRequired(true))
    .addUserOption(opt => opt.setName('player2').setDescription('Player 2 on winning team').setRequired(true))
    .addUserOption(opt => opt.setName('player3').setDescription('Player 3 on winning team').setRequired(true))
    .addUserOption(opt => opt.setName('player4').setDescription('Player 4 on winning team').setRequired(true))
    .addUserOption(opt => opt.setName('player5').setDescription('Player 5 on winning team').setRequired(true))
    .addUserOption(opt => opt.setName('player6').setDescription('Player 6 on winning team').setRequired(true))
    .addUserOption(opt => opt.setName('sub1').setDescription('Substitute 1 on winning team (optional)').setRequired(false))
    .addUserOption(opt => opt.setName('sub2').setDescription('Substitute 2 on winning team (optional)').setRequired(false))
    .addUserOption(opt => opt.setName('sub3').setDescription('Substitute 3 on winning team (optional)').setRequired(false)),

  async execute(interaction) {
    const draftId = interaction.options.getString('draft_id');
    const draft = getDraftById(draftId);

    if (!draft) {
      return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
    }

    if (draft.status !== 'awaiting_winner' && draft.status !== 'completed') {
      return interaction.reply({ embeds: [errorEmbed('This draft is not ready for a winner report.')], flags: MessageFlags.Ephemeral });
    }

    if (draft.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Only the draft host or admins can report the winner.')], flags: MessageFlags.Ephemeral });
    }

    const players = [];
    const subs = [];
    const invalidPlayers = [];

    for (let i = 1; i <= 6; i++) {
      const user = interaction.options.getUser(`player${i}`);
      const isRegistered = draft.players.some(p => p.id === user.id);
      if (isRegistered) {
        const playerData = draft.players.find(p => p.id === user.id);
        players.push(playerData);
      } else {
        invalidPlayers.push(user.username);
      }
    }

    for (const label of ['sub1', 'sub2', 'sub3']) {
      const user = interaction.options.getUser(label);
      if (!user) continue;
      const playerData = draft.players.find(p => p.id === user.id);
      if (playerData) {
        subs.push(playerData);
      } else {
        invalidPlayers.push(user.username);
      }
    }

    if (invalidPlayers.length > 0) {
      return interaction.reply({
        embeds: [errorEmbed(`The following users are not registered in this draft: **${invalidPlayers.join(', ')}**`)],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply();

    const setup = getSetup(interaction.guild.id);
    const winnersChannel = interaction.guild.channels.cache.get(setup?.winnersChannels?.[draft.type]);

    if (winnersChannel) {
      let description = `**Winning Team:**\n${players.map(p => `<@${p.id}> (${p.position})`).join('\n')}`;
      if (subs.length > 0) {
        description += `\n\n**Substitutes:**\n${subs.map(p => `<@${p.id}> (${p.position})`).join('\n')}`;
      }
      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle(`🏆 ${draft.type.toUpperCase()} Draft #${draft.draftNumber} Winner!`)
        .setDescription(description)
        .setTimestamp();

      await winnersChannel.send({ embeds: [embed] }).catch(() => {});
    }

    const allRoster = [...players, ...subs];
    const deduped = [];
    const seen = new Set();
    for (const p of allRoster) {
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      deduped.push(p);
    }

    const hostMember = await interaction.guild.members.fetch(draft.hostId).catch(() => null);
    if (hostMember) {
      await hostMember.send({
        embeds: [infoEmbed('🏆 Draft complete! Please select the MVP by typing their @mention/username or type "none" in the winners channel.')]
      }).catch(() => {});
    }

    draft.status = 'completed';
    scheduleSave();

    const { recordWin } = require('../utils/stats');
    recordWin(draft, deduped);

    const { cleanupDraftAfterCompletion } = require('../utils/matches');
    if (typeof cleanupDraftAfterCompletion === 'function') {
      await cleanupDraftAfterCompletion(draft, interaction.guild);
    }

    await logHostAction(interaction.guild, interaction.user, `Reported the winning team for draft **${draft.id}**`, [
      { name: '🏆 Team', value: players.map(p => `<@${p.id}>`).join(', '), inline: false },
      { name: '🔁 Subs', value: subs.length ? subs.map(p => `<@${p.id}>`).join(', ') : 'None', inline: true },
      { name: '🎯 Draft', value: draft.id, inline: true }
    ], config.colors.success);

    await interaction.editReply({
      embeds: [successEmbed(`✅ Winner recorded for **${draft.id}**! Winning team: ${players.map(p => `**${p.username}**`).join(', ')}${subs.length > 0 ? ` (+ ${subs.length} sub${subs.length > 1 ? 's' : ''})` : ''}`)]
    });
  }
};
