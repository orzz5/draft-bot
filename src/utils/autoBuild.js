const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { saveSetup, getSetup } = require('../utils/helpers');
const { colors } = require('../config');
const { logStaffAction } = require('./auditLog');

const BOT_CREATED_MARKER = 'bot-created';

async function autoBuild(message) {
  if (message.author.id !== config.ownerId) return;
  if (!message.mentions.has(message.client.user)) return;

  const content = message.content.toLowerCase();
  if (!content.includes('work')) return;

  const guild = message.guild;
  if (!guild) return;

  await message.react('⚙️');

  const statusMsg = await message.reply({
    embeds: [new EmbedBuilder().setColor(colors.info).setDescription('⚙️ Building server structure... This may take a moment.')]
  });

  const created = { roles: {}, channels: {}, categories: {}, stages: {} };
  const existingSetup = getSetup(guild.id) || {};

  const setupData = {
    hostRoles: existingSetup.hostRoles || {},
    playerRoles: existingSetup.playerRoles || {},
    announcementChannels: existingSetup.announcementChannels || {},
    winnersChannels: existingSetup.winnersChannels || {},
    picksChannels: existingSetup.picksChannels || {},
    categories: existingSetup.categories || {},
    stages: existingSetup.stages || {},
    captainRoles: existingSetup.captainRoles || {},
    botCreated: existingSetup.botCreated || { roles: [], channels: [], categories: [] }
  };

  for (const roleName of config.structure.roles.hosts) {
    let role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      role = await guild.roles.create({ name: roleName, color: colors.primary, mentionable: false }).catch(() => null);
      if (role) setupData.botCreated.roles.push(role.id);
    }
    if (role) {
      created.roles[roleName] = role.id;
      const type = roleName.split(' ')[0].toLowerCase();
      setupData.hostRoles[type] = role.id;
    }
  }

  for (const roleName of config.structure.roles.players) {
    let role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      role = await guild.roles.create({ name: roleName, color: colors.info, mentionable: false }).catch(() => null);
      if (role) setupData.botCreated.roles.push(role.id);
    }
    if (role) {
      created.roles[roleName] = role.id;
      const type = roleName.split(' ')[0].toLowerCase();
      if (!setupData.playerRoles) setupData.playerRoles = {};
      setupData.playerRoles[type] = role.id;
    }
  }

  const typeNames = { lower: 'Lower', mixed: 'Mixed', higher: 'Higher' };
  for (const type of config.draftTypes) {
    const typeName = typeNames[type];
    for (const num of config.teamNumbers) {
      const capRoleName = `${typeName} Team ${num} Captain`;
      let capRole = guild.roles.cache.find(r => r.name === capRoleName);
      if (!capRole) {
        capRole = await guild.roles.create({ name: capRoleName, color: 0xFFD700, mentionable: true }).catch(() => null);
        if (capRole) setupData.botCreated.roles.push(capRole.id);
      }
      if (capRole) {
        created.roles[capRoleName] = capRole.id;
        if (!setupData.captainRoles) setupData.captainRoles = {};
        if (!setupData.captainRoles[type]) setupData.captainRoles[type] = {};
        setupData.captainRoles[type][num] = capRole.id;
      }
    }
  }

  const draftTypeNames = { lower: 'Lower', mixed: 'Mixed', higher: 'Higher' };

  for (const type of config.draftTypes) {
    const typeName = draftTypeNames[type];

    let draftCat = guild.channels.cache.find(c => c.name === `${typeName} Draft` && c.type === ChannelType.GuildCategory);
    if (!draftCat) {
      draftCat = await guild.channels.create({
        name: `${typeName} Draft`,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
      }).catch(() => null);
      if (draftCat) setupData.botCreated.categories.push(draftCat.id);
    }
    if (draftCat) {
      created.categories[`${typeName} Draft`] = draftCat.id;
      setupData.categories[type] = draftCat.id;
    }

    const channelTypes = ['announcement', 'winners', 'picks'];
    for (const chType of channelTypes) {
      const chName = `〔〕${type}-${chType}`;
      let ch = guild.channels.cache.find(c => c.name === chName && c.type === ChannelType.GuildText);
      if (!ch) {
        ch = await guild.channels.create({
          name: chName,
          type: ChannelType.GuildText,
          parent: draftCat || null,
          permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
        }).catch(() => null);
        if (ch) setupData.botCreated.channels.push(ch.id);
      } else if (draftCat && ch.parentId !== draftCat.id) {
        await ch.setParent(draftCat.id).catch(() => {});
      }
      if (ch) {
        created.channels[chName] = ch.id;
        if (chType === 'announcement') setupData.announcementChannels[type] = ch.id;
        if (chType === 'winners') setupData.winnersChannels[type] = ch.id;
        if (chType === 'picks') setupData.picksChannels[type] = ch.id;
      }
    }

    if (!setupData.stages) setupData.stages = {};
    setupData.stages[type] = {};

    for (let i = 1; i <= 4; i++) {
      const stageName = `${typeName} Stage ${i}`;
      let stage = guild.channels.cache.find(c => c.name === stageName && c.type === ChannelType.GuildStageVoice);
      if (!stage) {
        stage = await guild.channels.create({
          name: stageName,
          type: ChannelType.GuildStageVoice,
          parent: draftCat || null,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }
          ]
        }).catch(err => {
          console.error(`Failed to create stage ${stageName}:`, err.message);
          return null;
        });
        if (stage) setupData.botCreated.channels.push(stage.id);
      }
      if (stage) {
        created.stages[stageName] = stage.id;
        setupData.stages[type][i] = stage.id;
      }
    }
  }

  saveSetup(guild.id, setupData);

  const embed = new EmbedBuilder()
    .setColor(colors.success)
    .setTitle('✅ Server Structure Built!')
    .setDescription(`<@${config.ownerId}> finished father`)
    .addFields(
      { name: 'Roles', value: Object.keys(created.roles).length > 0 ? Object.keys(created.roles).map(r => `\`${r}\``).join(', ') : 'Already existed', inline: false },
      { name: 'Categories', value: Object.keys(created.categories).length > 0 ? Object.keys(created.categories).map(c => `\`${c}\``).join(', ') : 'Already existed', inline: false },
      { name: 'Text Channels', value: Object.keys(created.channels).filter(c => !c.includes('Stage')).length > 0 ? Object.keys(created.channels).filter(c => !c.includes('Stage')).map(c => `\`${c}\``).join(', ') : 'Already existed', inline: false },
      { name: 'Stage Channels', value: Object.keys(created.stages).length > 0 ? Object.keys(created.stages).map(s => `\`${s}\``).join(', ') : 'Already existed', inline: false }
    )
    .setTimestamp();

  await statusMsg.edit({ content: `<@${config.ownerId}>`, embeds: [embed] });

  await logStaffAction(guild, message.author, 'Ran **@bot work** — built the server structure', [
    { name: 'Roles', value: `${Object.keys(created.roles).length}`, inline: true },
    { name: 'Channels', value: `${Object.keys(created.channels).length}`, inline: true },
    { name: 'Categories', value: `${Object.keys(created.categories).length}`, inline: true }
  ], colors.success);
}

async function autoReverse(message) {
  if (message.author.id !== config.ownerId) return;
  if (!message.mentions.has(message.client.user)) return;

  const content = message.content.toLowerCase();
  if (!content.includes('reverse')) return;

  const guild = message.guild;
  if (!guild) return;

  await message.react('🔄');

  const statusMsg = await message.reply({
    embeds: [new EmbedBuilder().setColor(colors.warning).setDescription('🔄 Reversing bot-created structure...')]
  });

  const setup = getSetup(guild.id);
  if (!setup || !setup.botCreated) {
    return statusMsg.edit({ embeds: [new EmbedBuilder().setColor(colors.danger).setDescription('❌ No bot-created structure found to reverse.')] });
  }

  const removed = { roles: 0, channels: 0, categories: 0 };

  for (const chId of setup.botCreated.channels || []) {
    const ch = guild.channels.cache.get(chId);
    if (ch) {
      await ch.delete().catch(() => {});
      removed.channels++;
    }
  }

  for (const catId of setup.botCreated.categories || []) {
    const cat = guild.channels.cache.get(catId);
    if (cat) {
      await cat.delete().catch(() => {});
      removed.categories++;
    }
  }

  for (const roleId of setup.botCreated.roles || []) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      await role.delete().catch(() => {});
      removed.roles++;
    }
  }

  const clearedSetup = {
    hostRoles: {},
    participationRoles: {},
    announcementChannels: {},
    winnersChannels: {},
    picksChannels: {},
    categories: {},
    draftCategories: {},
    stages: {},
    teamRoles: {},
    botCreated: { roles: [], channels: [], categories: [] }
  };
  saveSetup(guild.id, clearedSetup);

  const embed = new EmbedBuilder()
    .setColor(colors.success)
    .setTitle('✅ Structure Reversed!')
    .setDescription(`<@${config.ownerId}> finished father`)
    .addFields(
      { name: 'Roles Removed', value: `${removed.roles}`, inline: true },
      { name: 'Channels Removed', value: `${removed.channels}`, inline: true },
      { name: 'Categories Removed', value: `${removed.categories}`, inline: true }
    )
    .setTimestamp();

  await statusMsg.edit({ content: `<@${config.ownerId}>`, embeds: [embed] });

  await logStaffAction(guild, message.author, 'Ran **@bot reverse** — removed bot-created structure', [
    { name: 'Roles Removed', value: `${removed.roles}`, inline: true },
    { name: 'Channels Removed', value: `${removed.channels}`, inline: true },
    { name: 'Categories Removed', value: `${removed.categories}`, inline: true }
  ], colors.warning);
}

async function removeAll(message) {
  if (message.author.id !== config.ownerId) return;
  if (!message.mentions.has(message.client.user)) return;

  const content = message.content.toLowerCase();
  if (!content.includes('remove everything')) return;

  const guild = message.guild;
  if (!guild) return;

  await message.react('🗑️');

  const statusMsg = await message.reply({
    embeds: [new EmbedBuilder().setColor(colors.warning).setDescription('🗑️ Removing all channels and categories... (keeping #general)')]
  });

  const keptChannel = guild.channels.cache.find(c => c.name === 'general' && c.type === ChannelType.GuildText);
  const keptCategoryId = keptChannel?.parentId;

  let removedChannels = 0;
  let removedCategories = 0;

  const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
  for (const [, cat] of categories) {
    if (cat.id === keptCategoryId) continue;
    const children = guild.channels.cache.filter(c => c.parentId === cat.id);
    for (const [, ch] of children) {
      if (ch.name === 'general') continue;
      await ch.delete().catch(() => {});
      removedChannels++;
    }
    await cat.delete().catch(() => {});
    removedCategories++;
  }

  const standaloneChannels = guild.channels.cache.filter(c => !c.parentId && c.type !== ChannelType.GuildCategory);
  for (const [, ch] of standaloneChannels) {
    if (ch.name === 'general') continue;
    await ch.delete().catch(() => {});
    removedChannels++;
  }

  const embed = new EmbedBuilder()
    .setColor(colors.success)
    .setTitle('✅ Everything Removed!')
    .setDescription(`<@${config.ownerId}> finished father`)
    .addFields(
      { name: 'Channels Removed', value: `${removedChannels}`, inline: true },
      { name: 'Categories Removed', value: `${removedCategories}`, inline: true },
      { name: 'Kept', value: '#general', inline: true }
    )
    .setTimestamp();

  await statusMsg.edit({ content: `<@${config.ownerId}>`, embeds: [embed] });

  await logStaffAction(guild, message.author, 'Ran **@bot remove everything** — deleted all channels/categories', [
    { name: 'Channels Removed', value: `${removedChannels}`, inline: true },
    { name: 'Categories Removed', value: `${removedCategories}`, inline: true }
  ], colors.danger);
}

module.exports = { autoBuild, autoReverse, removeAll };
