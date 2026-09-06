const { MessageFlags, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getActiveDraft } = require('../state/drafts');
const { errorEmbed } = require('../utils/embeds');

const POSITIONS = ['WS', 'Setter', 'DS', 'Lib'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('registers')
    .setDescription('View everyone registered in an active draft (sorted by position)')
    .addStringOption(opt =>
      opt.setName('draft')
        .setDescription('Draft type to check')
        .setRequired(true)
        .addChoices(
          { name: 'Lower', value: 'lower' },
          { name: 'Mixed', value: 'mixed' },
          { name: 'Higher', value: 'higher' }
        )
    ),

  async execute(interaction) {
    const type = interaction.options.getString('draft');
    const draft = getActiveDraft(type);

    if (!draft) {
      return interaction.reply({
        embeds: [errorEmbed(`There is no active **${type.toUpperCase()}** draft right now.`)],
        flags: MessageFlags.Ephemeral
      });
    }

    const players = draft.players || [];
    const captainIds = new Set((draft.captainCandidates || []).map(c => c.id));

    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setTitle(`📋 Registered — ${type.toUpperCase()} Draft #${draft.draftNumber}`)
      .addFields(
        { name: '🎯 Draft', value: `\`${draft.id}\``, inline: true },
        { name: '📌 Status', value: statusLabel(draft.status), inline: true },
        { name: '🤖 Mode', value: draft.autoManual === 'automatic' ? '✅ Auto' : '👤 Manual', inline: true }
      )
      .setTimestamp();

    let total = 0;
    for (const pos of POSITIONS) {
      const inPos = players.filter(p => p.position === pos);
      if (inPos.length === 0) continue;
      total += inPos.length;

      const lines = inPos.map(p => {
        const parts = [`<@${p.id}>`];
        if (p.picked) parts.push('✅');
        if (captainIds.has(p.id)) parts.push('👑');
        return parts.join(' ');
      });

      embed.addFields({ name: `${pos} (${inPos.length})`, value: lines.join('\n') || '—', inline: true });
    }

    if (total === 0) {
      embed.setDescription('No one is registered yet.');
    }

    embed.setFooter({ text: `${players.length} registered · sorted by position` });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};

function statusLabel(status) {
  const labels = {
    registration: '📝 Registration open',
    captain_selection: '🎲 Selecting captains',
    picking: '🏐 Picking',
    awaiting_winner: '🏆 Awaiting winner',
    completed: '✅ Completed'
  };
  return labels[status] || status;
}