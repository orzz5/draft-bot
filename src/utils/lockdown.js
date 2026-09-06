const config = require('../config');
const { successEmbed, errorEmbed, infoEmbed } = require('./embeds');
const { logStaffAction } = require('./auditLog');

async function lockdownUnverified(message) {
  const guild = message.guild;
  const unverifiedRoleId = config.verification.unverifiedRoleId;
  const verificationChannelId = config.verification.verificationChannelId;

  if (!unverifiedRoleId || !verificationChannelId) {
    return message.reply({ embeds: [errorEmbed('Unverified role or verification channel is not configured.')] });
  }

  const role = guild.roles.cache.get(unverifiedRoleId);
  if (!role) {
    return message.reply({ embeds: [errorEmbed('Unverified role not found.')] });
  }

  const verificationChannel = guild.channels.cache.get(verificationChannelId);
  if (!verificationChannel) {
    return message.reply({ embeds: [errorEmbed('Verification channel not found.')] });
  }

  await message.reply({ embeds: [infoEmbed('🔒 Locking down... giving the Unverified role to everyone and locking all channels.')] });

  let roleCount = 0;
  let strippedCount = 0;
  const members = await guild.members.fetch();
  for (const [, member] of members) {
    if (member.user.bot) continue;

    const hadVerified = member.roles.cache.has(config.verification.verifiedRoleId) ||
      (config.verification.legacyVerifiedRoleIds || []).some(id => member.roles.cache.has(id));
    if (member.roles.cache.has(unverifiedRoleId)) continue;

    await member.roles.add(unverifiedRoleId).catch(() => {});
    roleCount++;

    if (hadVerified) {
      let stripped = false;
      if (member.roles.cache.has(config.verification.verifiedRoleId)) {
        await member.roles.remove(config.verification.verifiedRoleId).catch(() => {});
        stripped = true;
      }
      for (const id of config.verification.legacyVerifiedRoleIds || []) {
        if (member.roles.cache.has(id)) {
          await member.roles.remove(id).catch(() => {});
          stripped = true;
        }
      }
      if (stripped) strippedCount++;
    }
  }

  let channelCount = 0;
  for (const [, channel] of guild.channels.cache) {
    if (channel.id === verificationChannelId) {
      await channel.permissionOverwrites.edit(unverifiedRoleId, {
        ViewChannel: true,
        ReadMessageHistory: true,
        AddReactions: true
      }).catch(() => {});
    } else {
      await channel.permissionOverwrites.edit(unverifiedRoleId, {
        ViewChannel: false,
        SendMessages: false,
        Connect: false,
        Speak: false,
        Stream: false,
        UseVAD: false
      }).catch(() => {});
      channelCount++;
    }
  }

  await message.reply({
    embeds: [successEmbed([
      `✅ **Unverified everyone complete!**`,
      `• **${roleCount}** members given the Unverified role`,
      `• **${strippedCount}** members stripped of their Verified role(s)`,
      `• **${channelCount}** channels locked`,
      '',
      `Members can now only see <#${verificationChannelId}>.`
    ].join('\n'))]
  });

  await logStaffAction(guild, message.author, 'Ran **unverify all** — lockdown', [
    { name: '👥 Unverified', value: `${roleCount} members`, inline: true },
    { name: '🔨 Stripped Verified', value: `${strippedCount} members`, inline: true },
    { name: '🔒 Channels Locked', value: `${channelCount}`, inline: true }
  ], config.colors.warning);
}

module.exports = { lockdownUnverified };