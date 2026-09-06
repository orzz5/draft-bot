const { Events } = require('discord.js');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📋 Serving ${client.guilds.cache.size} guild(s)`);
    client.user.setActivity('Volleyball Drafts', { type: 'Watching' });
  }
};
