const { MessageFlags, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getTournament } = require('../state/tournaments');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bracket')
    .setDescription('View tournament bracket')
    .addStringOption(opt =>
      opt.setName('draft_type')
        .setDescription('Draft type to view')
        .setRequired(true)
        .addChoices(
          { name: 'Lower', value: 'lower' },
          { name: 'Mixed', value: 'mixed' },
          { name: 'Higher', value: 'higher' }
        )
    ),

  async execute(interaction) {
    const type = interaction.options.getString('draft_type');

    const { drafts } = require('../state/drafts');
    const candidates = drafts
      .filter(d => d.type === type)
      .sort((a, b) => (b.draftNumber || 0) - (a.draftNumber || 0));

    const draft = candidates.find(d => d.status === 'completed') || candidates[0];

    if (!draft) {
      return interaction.reply({ embeds: [errorEmbed(`No ${type} draft found.`)], flags: MessageFlags.Ephemeral });
    }

    const tournament = getTournament(draft.id);
    if (!tournament) {
      return interaction.reply({
        embeds: [errorEmbed(`No tournament bracket found for \`${draft.id}\`. The bracket is generated automatically once the draft's picks finish and the match channels are created.`)],
        flags: MessageFlags.Ephemeral
      });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.info)
      .setTitle(`🏐 ${type.toUpperCase()} Draft #${draft.draftNumber} Bracket`)
      .setTimestamp();

    if (tournament.stage === 'completed') {
      const winnerTeam = tournament.teams[tournament.winner];
      embed.setDescription(`**🏆 Winner: Team ${tournament.winner}**\n\n${winnerTeam.roster.map(p => `<@${p.id}> (${p.position})`).join('\n')}`);
    } else {
      let bracketText = '**Semifinals:**\n';
      for (const match of tournament.matches) {
        if (match.id === 'final') continue;
        const status = match.status === 'completed' ? `✅ Winner: Team ${match.winner}` : '⏳ Pending';
        bracketText += `\n**${match.team1.number}** vs **${match.team2.number}**\n${status}\n`;
      }

      if (tournament.finals) {
        bracketText += '\n**Finals:**\n';
        if (tournament.finals.status === 'ready') {
          bracketText += `\n**${tournament.finals.team1.number}** vs **${tournament.finals.team2.number}**\n⏳ Pending`;
        } else {
          bracketText += '\n⏳ Waiting for semifinals...';
        }
      }

      embed.setDescription(bracketText);
    }

    await interaction.reply({ embeds: [embed] });
  }
};
