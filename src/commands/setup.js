const { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = require('../config');
const { getSetup } = require('../utils/helpers');
const { isOwner } = require('../utils/permissions');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the draft bot (Owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('Only the bot owner can use this command.')], flags: MessageFlags.Ephemeral });
    }

    const embed = {
      color: config.colors.info,
      title: 'Bot Setup',
      description: 'Select only what you want to configure. Each dropdown saves automatically.\n\n**Tip:** Use `@bot work` to auto-create everything.',
      fields: [
        { name: 'Host Roles', value: 'Who can start each draft type', inline: true },
        { name: 'Player Roles', value: 'Lower/Higher Draft Player roles', inline: true },
        { name: 'Captain Roles (12)', value: 'Lower/Mixed/Higher Team 1-4 Captain', inline: true },
        { name: 'Channels (9)', value: 'Announcements, Winners, Picks', inline: true },
        { name: 'Categories (3)', value: 'Draft categories per type', inline: true },
        { name: 'Stages (12)', value: '4 stages per draft type', inline: true }
      ]
    };

    const allRows = [];

    const roleMenu = new StringSelectMenuBuilder()
      .setCustomId('setup_rolemenu')
      .setPlaceholder('Configure Host & Player Roles')
      .addOptions([
        { label: 'Lower Draft Host', value: 'host_lower' },
        { label: 'Mixed Draft Host', value: 'host_mixed' },
        { label: 'Higher Draft Host', value: 'host_higher' },
        { label: 'Lower Draft Player', value: 'player_lower' },
        { label: 'Higher Draft Player', value: 'player_higher' }
      ]);
    allRows.push(new ActionRowBuilder().addComponents(roleMenu));

    const capOpts = [];
    for (const type of ['lower', 'mixed', 'higher']) {
      for (const num of [1, 2, 3, 4]) {
        capOpts.push({ label: `${type.charAt(0).toUpperCase() + type.slice(1)} Team ${num} Captain`, value: `cap_${type}_${num}` });
      }
    }
    const capMenu = new StringSelectMenuBuilder()
      .setCustomId('setup_capmenu')
      .setPlaceholder('Configure Captain Roles (12 total)')
      .addOptions(capOpts);
    allRows.push(new ActionRowBuilder().addComponents(capMenu));

    const chOpts = [];
    for (const type of ['lower', 'mixed', 'higher']) {
      for (const ch of ['announcement', 'winners', 'picks']) {
        chOpts.push({ label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${ch.charAt(0).toUpperCase() + ch.slice(1)}`, value: `ch_${type}_${ch}` });
      }
    }
    const chMenu = new StringSelectMenuBuilder()
      .setCustomId('setup_chmenu')
      .setPlaceholder('Configure Text Channels (9 total)')
      .addOptions(chOpts);
    allRows.push(new ActionRowBuilder().addComponents(chMenu));

    const catMenu = new StringSelectMenuBuilder()
      .setCustomId('setup_catmenu')
      .setPlaceholder('Configure Categories')
      .addOptions([
        { label: 'Lower Draft Category', value: 'cat_lower' },
        { label: 'Mixed Draft Category', value: 'cat_mixed' },
        { label: 'Higher Draft Category', value: 'cat_higher' }
      ]);
    allRows.push(new ActionRowBuilder().addComponents(catMenu));

    const stageOpts = [];
    for (const type of ['lower', 'mixed', 'higher']) {
      for (const num of [1, 2, 3, 4]) {
        stageOpts.push({ label: `${type.charAt(0).toUpperCase() + type.slice(1)} Stage ${num}`, value: `stage_${type}_${num}` });
      }
    }
    const stageMenu = new StringSelectMenuBuilder()
      .setCustomId('setup_stagemenu')
      .setPlaceholder('Configure Stages (12 total)')
      .addOptions(stageOpts);
    allRows.push(new ActionRowBuilder().addComponents(stageMenu));

    await interaction.reply({
      embeds: [embed],
      components: allRows,
      flags: MessageFlags.Ephemeral
    });
  }
};
