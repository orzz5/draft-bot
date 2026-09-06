const { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { isAdmin } = require('../utils/permissions');
const { successEmbed, errorEmbed } = require('../utils/embeds');
const { addVerificationMessage } = require('../utils/verification');
const { logStaffAction } = require('../utils/auditLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-setup')
    .setDescription('Generate a verification message in this channel with a green tick reaction (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Only administrators can use this command.')], flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('🔒 Verification')
      .setDescription([
        'Welcome! React with **✅** below to get verified and gain access to the server.',
        '',
        `Once verified you will automatically receive the <@&${config.verification.verifiedRoleId}> role.`
      ].join('\n'))
      .setFooter({ text: 'Your reaction is removed after verifying.' })
      .setTimestamp();

    try {
      const msg = await interaction.channel.send({ embeds: [embed] });
      await msg.react('✅');

      addVerificationMessage(msg.id);

      await interaction.reply({ embeds: [successEmbed('Verification message created! Users can now react with ✅ to get verified.')], flags: MessageFlags.Ephemeral });
      await logStaffAction(interaction.guild, interaction.user, 'Created a **verification message**', [
        { name: '📢 Channel', value: `<#${interaction.channel.id}>`, inline: true },
        { name: '🔗 Message', value: `[Jump](${msg.url})`, inline: true }
      ]);
    } catch (e) {
      console.error('Failed to send verification message:', e);
      await interaction.reply({ embeds: [errorEmbed('Failed to send the verification message. Make sure the bot has the required permissions.')], flags: MessageFlags.Ephemeral });
    }
  }
};