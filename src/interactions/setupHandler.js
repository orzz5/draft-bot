const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getSetup, saveSetup } = require('../utils/helpers');
const { successEmbed, errorEmbed } = require('../utils/embeds');

module.exports = {
  prefix: 'setup',
  execute: async (interaction) => {
    if (!interaction.customId.startsWith('setup_')) return;

    const customId = interaction.customId;

    if (customId === 'setup_rolemenu') {
      const opts = [];
      for (const type of ['lower', 'mixed', 'higher']) {
        opts.push({ label: `${type.charAt(0).toUpperCase() + type.slice(1)} Draft Host`, value: `host_${type}` });
      }
      opts.push({ label: 'Lower Draft Player', value: 'player_lower' });
      opts.push({ label: 'Higher Draft Player', value: 'player_higher' });
      const menu = new StringSelectMenuBuilder()
        .setCustomId('setup_rolepick')
        .setPlaceholder('Select which role to configure')
        .addOptions(opts);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'setup_capmenu') {
      const opts = [];
      for (const type of ['lower', 'mixed', 'higher']) {
        for (const num of [1, 2, 3, 4]) {
          opts.push({ label: `${type.charAt(0).toUpperCase() + type.slice(1)} Team ${num} Captain`, value: `cap_${type}_${num}` });
        }
      }
      const menu = new StringSelectMenuBuilder()
        .setCustomId('setup_cappick')
        .setPlaceholder('Select which captain role to configure')
        .addOptions(opts);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'setup_chmenu') {
      const opts = [];
      for (const type of ['lower', 'mixed', 'higher']) {
        for (const ch of ['announcement', 'winners', 'picks']) {
          opts.push({ label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${ch.charAt(0).toUpperCase() + ch.slice(1)}`, value: `ch_${type}_${ch}` });
        }
      }
      const menu = new StringSelectMenuBuilder()
        .setCustomId('setup_chpick')
        .setPlaceholder('Select which channel to configure')
        .addOptions(opts);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'setup_catmenu') {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('setup_catpick')
        .setPlaceholder('Select which category to configure')
        .addOptions([
          { label: 'Lower Draft Category', value: 'cat_lower' },
          { label: 'Mixed Draft Category', value: 'cat_mixed' },
          { label: 'Higher Draft Category', value: 'cat_higher' }
        ]);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'setup_stagemenu') {
      const opts = [];
      for (const type of ['lower', 'mixed', 'higher']) {
        for (const num of [1, 2, 3, 4]) {
          opts.push({ label: `${type.charAt(0).toUpperCase() + type.slice(1)} Stage ${num}`, value: `stage_${type}_${num}` });
        }
      }
      const menu = new StringSelectMenuBuilder()
        .setCustomId('setup_stagepick')
        .setPlaceholder('Select which stage to configure')
        .addOptions(opts);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'setup_rolepick') {
      const parts = interaction.values[0].split('_');
      const type = parts[0];
      const category = parts[1];
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const roles = await interaction.guild.roles.fetch();
      const roleList = roles
        .filter(r => !r.managed && r.id !== interaction.guild.id)
        .sort((a, b) => a.position - b.position)
        .map(r => ({ label: r.name, value: r.id }));
      
      let customIdSuffix;
      let placeholder;
      if (type === 'host') {
        customIdSuffix = `setup_hostval_${category}`;
        placeholder = `Select ${category} host role`;
      } else {
        customIdSuffix = `setup_playerval_${category}`;
        placeholder = `Select ${category} draft player role`;
      }
      const menu = new StringSelectMenuBuilder()
        .setCustomId(customIdSuffix)
        .setPlaceholder(placeholder)
        .addOptions(roleList.length > 0 ? roleList.slice(0, 25) : [{ label: 'No roles', value: 'none' }]);
      return interaction.editReply({ components: [new ActionRowBuilder().addComponents(menu)] });
    }

    if (customId === 'setup_cappick') {
      const parts = interaction.values[0].split('_');
      const type = parts[1];
      const num = parts[2];
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const roles = await interaction.guild.roles.fetch();
      const roleList = roles
        .filter(r => !r.managed && r.id !== interaction.guild.id)
        .sort((a, b) => a.position - b.position)
        .map(r => ({ label: r.name, value: r.id }));
      
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`setup_capval_${type}_${num}`)
        .setPlaceholder(`Select ${type} Team ${num} Captain role`)
        .addOptions(roleList.length > 0 ? roleList.slice(0, 25) : [{ label: 'No roles', value: 'none' }]);
      return interaction.editReply({ components: [new ActionRowBuilder().addComponents(menu)] });
    }

    if (customId === 'setup_chpick') {
      const parts = interaction.values[0].split('_');
      const type = parts[1];
      const chType = parts[2];
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const channels = interaction.guild.channels.cache
        .filter(c => c.type === 0)
        .sort((a, b) => a.position - b.position)
        .map(c => ({ label: c.name, value: c.id }));
      
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`setup_chval_${type}_${chType}`)
        .setPlaceholder(`Select ${type} ${chType} channel`)
        .addOptions(channels.length > 0 ? channels.slice(0, 25) : [{ label: 'No channels', value: 'none' }]);
      return interaction.editReply({ components: [new ActionRowBuilder().addComponents(menu)] });
    }

    if (customId === 'setup_catpick') {
      const type = interaction.values[0].split('_')[1];
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const cats = interaction.guild.channels.cache
        .filter(c => c.type === 4)
        .sort((a, b) => a.position - b.position)
        .map(c => ({ label: c.name, value: c.id }));
      
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`setup_catval_${type}`)
        .setPlaceholder(`Select ${type} draft category`)
        .addOptions(cats.length > 0 ? cats.slice(0, 25) : [{ label: 'No categories', value: 'none' }]);
      return interaction.editReply({ components: [new ActionRowBuilder().addComponents(menu)] });
    }

    if (customId === 'setup_stagepick') {
      const parts = interaction.values[0].split('_');
      const type = parts[1];
      const num = parts[2];
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const stages = interaction.guild.channels.cache
        .filter(c => c.type === 13)
        .sort((a, b) => a.position - b.position)
        .map(c => ({ label: c.name, value: c.id }));
      
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`setup_stageval_${type}_${num}`)
        .setPlaceholder(`Select ${type} stage ${num}`)
        .addOptions(stages.length > 0 ? stages.slice(0, 25) : [{ label: 'No stages', value: 'none' }]);
      return interaction.editReply({ components: [new ActionRowBuilder().addComponents(menu)] });
    }

    const value = interaction.values[0];
    if (value === 'none') {
      return interaction.reply({ embeds: [errorEmbed('No valid option selected.')], flags: MessageFlags.Ephemeral });
    }

    const setup = getSetup(interaction.guild.id) || {
      hostRoles: {}, playerRoles: {}, announcementChannels: {},
      winnersChannels: {}, picksChannels: {}, categories: {},
      stages: {}, captainRoles: {}
    };

    let message = '';

    if (customId.startsWith('setup_hostval_')) {
      const type = customId.split('_')[2];
      setup.hostRoles[type] = value;
      message = `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} Host Role saved.`;
    } else if (customId.startsWith('setup_playerval_')) {
      const type = customId.split('_')[2];
      setup.playerRoles[type] = value;
      message = `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} Draft Player Role saved.`;
    } else if (customId.startsWith('setup_capval_')) {
      const parts = customId.split('_');
      const type = parts[2];
      const num = parts[3];
      if (!setup.captainRoles) setup.captainRoles = {};
      if (!setup.captainRoles[type]) setup.captainRoles[type] = {};
      setup.captainRoles[type][num] = value;
      message = `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} Team ${num} Captain Role saved.`;
    } else if (customId.startsWith('setup_chval_')) {
      const parts = customId.split('_');
      const type = parts[2];
      const chType = parts[3];
      if (chType === 'announcement') setup.announcementChannels[type] = value;
      if (chType === 'winners') setup.winnersChannels[type] = value;
      if (chType === 'picks') setup.picksChannels[type] = value;
      message = `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} ${chType.charAt(0).toUpperCase() + chType.slice(1)} Channel saved.`;
    } else if (customId.startsWith('setup_catval_')) {
      const type = customId.split('_')[2];
      setup.categories[type] = value;
      message = `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} Draft Category saved.`;
    } else if (customId.startsWith('setup_stageval_')) {
      const parts = customId.split('_');
      const type = parts[2];
      const num = parts[3];
      if (!setup.stages) setup.stages = {};
      if (!setup.stages[type]) setup.stages[type] = {};
      setup.stages[type][num] = value;
      message = `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} Stage ${num} saved.`;
    }

    if (message) {
      saveSetup(interaction.guild.id, setup);
      await interaction.reply({ embeds: [successEmbed(message)], flags: MessageFlags.Ephemeral });
    }
  }
};
