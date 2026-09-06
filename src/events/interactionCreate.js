const { MessageFlags, Events, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const interactionHandlers = {};

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.guild?.id !== config.guildId) return;

    if (interaction.isChatInputCommand()) {
      const commands = interaction.client.commands;
      const command = commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        const reply = { content: 'An error occurred while executing this command.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const prefix = interaction.customId.split('_')[0];

      if (prefix === 'setup') {
        try {
          const handler = require('../interactions/setupHandler');
          await handler.execute(interaction);
        } catch (error) {
          console.error(`Error handling setup interaction:`, error);
          await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return;
      }

      loadAllHandlers();

      if (interactionHandlers[prefix]) {
        try {
          await interactionHandlers[prefix](interaction);
        } catch (error) {
          console.error(`Error handling ${interaction.customId}:`, error);
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
          } else {
            await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
          }
        }
      }
    }
  }
};

function loadAllHandlers() {
  if (Object.keys(interactionHandlers).length > 0) return;

  const handlersDir = path.join(__dirname, '..', 'interactions');
  if (!fs.existsSync(handlersDir)) return;

  const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    if (file === 'setupHandler.js') continue;
    const handler = require(path.join(handlersDir, file));

    if (handler.prefix && handler.execute) {
      interactionHandlers[handler.prefix] = handler.execute;
    }

    if (handler.handlers) {
      for (const [p, fn] of Object.entries(handler.handlers)) {
        interactionHandlers[p] = fn;
      }
    }
  }
}
