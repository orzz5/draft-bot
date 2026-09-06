const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(config.token);

function summarize(command) {
  const records = [];
  const walk = (data, prefix) => {
    if (data.type === 1 || data.type === 2) {
      records.push((prefix + data.name).trim());
    }
    if (data.options) {
      for (const opt of data.options) walk(opt, prefix + data.name + ' ');
    }
  };
  walk(command, '');
  return records.join(', ');
}

(async () => {
  try {
    if (!config.token) {
      console.error('❌ No DISCORD_TOKEN in .env. Cannot register commands.');
      return;
    }
    console.log(`Registering ${commands.length} commands...`);
    for (const c of commands) {
      console.log(`  - /${summarize(c)}`);
    }
    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log(`✅ Successfully registered ${data.length} commands: ${data.map(c => c.name).join(', ')}`);
  } catch (error) {
    console.error('❌ Failed to register commands:', error.code ? `HTTP ${error.code}` : '', error.message || error);
  }
})();