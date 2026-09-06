const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { isVerificationMessage, addVerifiedUser } = require('../utils/verification');

const VERIFY_EMOJI = '✅';

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    if (user.bot) return;

    let message = reaction.message;
    if (message.partial) message = await message.fetch().catch(() => null);
    if (!message || message.guild?.id !== config.guildId) return;

    if (!isVerificationMessage(message.id)) return;

    let fullReaction = reaction;
    if (reaction.partial) fullReaction = await reaction.fetch().catch(() => null);
    if (!fullReaction) return;

    const emoji = fullReaction.emoji.name;
    if (emoji !== VERIFY_EMOJI) return;

    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    await fullReaction.users.remove(user.id).catch(() => {});

    const alreadyVerified = member.roles.cache.has(config.verification.verifiedRoleId);
    if (alreadyVerified) return;

    if (config.verification.unverifiedRoleId) {
      await member.roles.remove(config.verification.unverifiedRoleId).catch(() => {});
    }
    await member.roles.add(config.verification.verifiedRoleId).catch(() => {});

    addVerifiedUser(user.id, message.guild.id);

    user.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('✅ Verified')
        .setDescription(`You have been verified in **${message.guild.name}**! You can now access the rest of the server.`)
        .setTimestamp()]
    }).catch(() => {});
  }
};