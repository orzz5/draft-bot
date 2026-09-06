const { Events } = require('discord.js');
const { getSetup } = require('../utils/helpers');
const config = require('../config');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (member.guild.id !== config.guildId) return;

    const setup = getSetup(member.guild.id);
    if (!setup?.playerRoles?.lower) return;

    const lowerRoleId = setup.playerRoles.lower;
    const higherRoleId = setup.playerRoles?.higher;

    if (member.roles.cache.has(lowerRoleId) || member.roles.cache.has(higherRoleId)) return;

    await member.roles.add(lowerRoleId).catch(() => {});
  }
};
