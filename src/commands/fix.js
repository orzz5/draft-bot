const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { isAdmin, isOwner } = require('../utils/permissions');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getLink, setLink } = require('../state/links');
const { resolveRobloxUsername } = require('../utils/roblox');
const { logStaffAction } = require('../utils/auditLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fix')
    .setDescription('Fix tools (Admins only)')
    .addSubcommand((sub) =>
      sub.setName('link')
        .setDescription('Change a player\'s linked Roblox username')
        .addUserOption((opt) => opt.setName('player').setDescription('The Discord user to update').setRequired(true))
        .addStringOption((opt) => opt.setName('user').setDescription('The new Roblox username').setRequired(true))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member) && !isOwner(interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('This command is restricted to admins.')], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'link') {
      return handleFixLink(interaction);
    }

    return interaction.reply({ embeds: [errorEmbed('Unknown /fix subcommand.')], flags: MessageFlags.Ephemeral });
  }
};

async function handleFixLink(interaction) {
  const target = interaction.options.getUser('player');
  const username = (interaction.options.getString('user') || '').trim();

  if (!username) {
    return interaction.reply({ embeds: [errorEmbed('You must provide the new Roblox username.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const before = getLink(target.id);

  let resolved;
  try {
    resolved = await resolveRobloxUsername(username);
  } catch (e) {
    console.warn('[fix link] Roblox API unreachable:', e.message);
    return interaction.editReply({ embeds: [errorEmbed('Could not reach the Roblox API right now. Try again in a few minutes.')] });
  }

  if (!resolved) {
    return interaction.editReply({ embeds: [errorEmbed(`No Roblox account named **${username}** was found. Double-check the spelling.`)] });
  }

  setLink({
    discordId: target.id,
    username: resolved.username,
    robloxId: resolved.robloxId,
    displayName: resolved.displayName,
    avatarUrl: resolved.avatarUrl
  });

  const oldName = before ? before.username : 'none';

  await interaction.editReply({
    embeds: [successEmbed(
      `🛠️ Updated **${target.username}**'s Roblox link: **${oldName}** → **${resolved.username}**`
    )]
  });

  await logStaffAction(interaction.guild, interaction.user, `🛠️ Changed **${target.username}**'s Roblox link: **${oldName}** → **${resolved.username}**`, [
    { name: '🦾 Roblox', value: `\`${resolved.username}\` · id \`${resolved.robloxId}\``, inline: true },
    { name: '🎯 User', value: `${target} (\`@${target.username}\`)`, inline: true }
  ]);
}