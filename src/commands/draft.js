const { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getSetup, getCaptainCount, selectCaptains, shuffleArray, getTeamName, computeTeamCount } = require('../utils/helpers');
const { createDraft, getActiveDraft, getActiveDrafts, getDraftById, deleteDraft, scheduleSave } = require('../state/drafts');
const { errorEmbed, successEmbed, registrationEmbed, infoEmbed } = require('../utils/embeds');
const { canStartDraft, isCaptain, isAdmin } = require('../utils/permissions');
const { startTurnTimer } = require('../utils/recovery');
const { isRegistrationCompleteEnough, cancelInsufficientDraft } = require('../utils/draftChecks');
const { logHostAction, logStaffAction } = require('../utils/auditLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('draft')
    .setDescription('Draft management commands')
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start a new draft')
        .addStringOption(opt => opt.setName('time').setDescription('Registration time in minutes or "unlimited"').setRequired(true))
        .addStringOption(opt => opt.setName('type').setDescription('Draft type').setRequired(true).addChoices(
          { name: 'Lower', value: 'lower' },
          { name: 'Mixed', value: 'mixed' },
          { name: 'Higher', value: 'higher' }
        ))
        .addStringOption(opt => opt.setName('automatization').setDescription('Automatic or Manual draft flow').setRequired(true).addChoices(
          { name: 'Automatic', value: 'automatic' },
          { name: 'Manual', value: 'manual' }
        ))
    )
    .addSubcommand(sub =>
      sub.setName('cancel')
        .setDescription('Cancel a draft that is in registration phase')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('force-cancel')
        .setDescription('Force cancel a draft in any state (Admin/Host only)')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('revert')
        .setDescription('Cancel and wipe a draft (Admin only)')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('fix')
        .setDescription('Fix a stuck draft by re-posting picks and re-notifying captain')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('sub')
        .setDescription('Substitute a player in an active draft')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
        .addUserOption(opt => opt.setName('sub_in').setDescription('Player to sub in').setRequired(true))
        .addUserOption(opt => opt.setName('sub_out').setDescription('Player to sub out').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('captain-sub')
        .setDescription('Substitute a captain')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('player-sub')
        .setDescription('Substitute a player')
        .addStringOption(opt => opt.setName('draft_type').setDescription('Draft type').setRequired(true).addChoices(
          { name: 'Lower', value: 'lower' },
          { name: 'Mixed', value: 'mixed' },
          { name: 'Higher', value: 'higher' }
        ))
    )
    .addSubcommand(sub =>
      sub.setName('unregister')
        .setDescription('Unregister yourself from a draft')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('move')
        .setDescription('Move a player between draft categories')
        .addUserOption(opt => opt.setName('player').setDescription('Player to move').setRequired(true))
        .addStringOption(opt => opt.setName('draft_type').setDescription('Target draft type').setRequired(true).addChoices(
          { name: 'Lower', value: 'lower' },
          { name: 'Trial High Drafter', value: 'trial_high' },
          { name: 'Higher', value: 'higher' }
        ))
    )
    .addSubcommand(sub =>
      sub.setName('setup-matches')
        .setDescription('Create match channels and vote buttons for a completed draft')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('force-register')
        .setDescription('Add a player to the active draft after registration (Host/Admin only)')
        .addUserOption(opt => opt.setName('player').setDescription('The player to add').setRequired(true))
        .addStringOption(opt => opt.setName('position').setDescription('Position').setRequired(true).addChoices(
          { name: 'WS', value: 'WS' },
          { name: 'Setter', value: 'Setter' },
          { name: 'DS', value: 'DS' },
          { name: 'Lib', value: 'Lib' }
        ))
    )
    .addSubcommand(sub =>
      sub.setName('blacklist')
        .setDescription('Blacklist a player for a set amount of time (Host/Admin only)')
        .addUserOption(opt => opt.setName('user').setDescription('The player to blacklist').setRequired(true))
        .addStringOption(opt => opt.setName('time').setDescription('Duration (e.g. 30min, 2h, 3d)').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the blacklist').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('unblacklist')
        .setDescription('Remove the blacklist from a player (Admin only)')
        .addUserOption(opt => opt.setName('player').setDescription('The player to unblacklist').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('high-request')
        .setDescription('Request the High Drafter role (Trial High Drafter or Lower Drafter only)')
    )
    .addSubcommand(sub =>
      sub.setName('force-winner')
        .setDescription('Force declare a winner when the other captain does not vote (Host/Admin only)')
        .addStringOption(opt => opt.setName('draftid').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
        .addStringOption(opt => opt.setName('winner').setDescription('Winning team name (e.g., 1auteq team)').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('high-kick')
        .setDescription('Start a votation to remove a player from high draft (Admin/' + 'role only)')
        .addUserOption(opt => opt.setName('player').setDescription('Player to remove').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the kick').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('reset-votations')
        .setDescription('Delete all unfinished votations (kick/requests) (Admin/' + 'role only)')
    )
    .addSubcommand(sub =>
      sub.setName('stats')
        .setDescription('View a player\'s stats')
        .addUserOption(opt => opt.setName('player').setDescription('The player to view stats for').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('edit-stats')
        .setDescription('Set a player\'s win count (Admin only)')
        .addUserOption(opt => opt.setName('player').setDescription('The player to edit').setRequired(true))
        .addIntegerOption(opt => opt.setName('wins').setDescription('New win count').setRequired(true).setMinValue(0))
        .addStringOption(opt => opt.setName('draft-type')
          .setDescription('Which draft type the wins count applies to (default: Overall)')
          .setRequired(false)
          .addChoices(
            { name: 'Overall', value: 'overall' },
            { name: 'Higher', value: 'higher' },
            { name: 'Mixed', value: 'mixed' },
            { name: 'Lower', value: 'lower' }
          ))
    )
    .addSubcommand(sub =>
      sub.setName('link')
        .setDescription('Link your Roblox account to show your avatar on the leaderboard (once)')
        .addStringOption(opt => opt.setName('user').setDescription('Your Roblox username').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'revert' && !isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Only administrators can use this command.')], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'start') return handleStart(interaction);
    if (sub === 'cancel') return handleCancel(interaction);
    if (sub === 'force-cancel') return handleForceCancel(interaction);
    if (sub === 'revert') return handleRevert(interaction);
    if (sub === 'fix') return handleFix(interaction);
    if (sub === 'sub') return handleSub(interaction);
    if (sub === 'captain-sub') return handleCaptainSub(interaction);
    if (sub === 'player-sub') return handlePlayerSub(interaction);
    if (sub === 'unregister') return handleUnregister(interaction);
    if (sub === 'move') return handleMove(interaction);
    if (sub === 'setup-matches') return handleSetupMatches(interaction);
    if (sub === 'force-register') return handleForceRegister(interaction);
    if (sub === 'blacklist') return handleBlacklist(interaction);
    if (sub === 'unblacklist') return handleUnblacklist(interaction);
    if (sub === 'high-request') return handleHighRequest(interaction);
    if (sub === 'force-winner') return handleForceWinner(interaction);
    if (sub === 'high-kick') return handleHighKick(interaction);
    if (sub === 'reset-votations') return handleResetVotations(interaction);
    if (sub === 'stats') return handleStats(interaction);
    if (sub === 'edit-stats') return handleEditStats(interaction);
    if (sub === 'link') return handleLink(interaction);
  },

  startPickingPhase,
  handleRandomizerSelection
};

async function handleStart(interaction) {
  const timeInput = interaction.options.getString('time');
  const type = interaction.options.getString('type');
  const autoManual = interaction.options.getString('automatization');
  const isUnlimited = timeInput.toLowerCase() === 'unlimited';

  if (!canStartDraft(interaction.member, type)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to start this draft type.')], flags: MessageFlags.Ephemeral });
  }

  const active = getActiveDraft(type);
  if (active) {
    return interaction.reply({ embeds: [errorEmbed(`There is already an active ${type} draft (${active.id}).`)], flags: MessageFlags.Ephemeral });
  }

  const setup = getSetup(interaction.guild.id);
  if (!setup) {
    return interaction.reply({ embeds: [errorEmbed('Bot not configured. Run `/setup` first.')], flags: MessageFlags.Ephemeral });
  }

  const announcementChannel = interaction.guild.channels.cache.get(setup.announcementChannels[type]);
  if (!announcementChannel) {
    return interaction.reply({ embeds: [errorEmbed(`Announcement channel for ${type} not configured.`)], flags: MessageFlags.Ephemeral });
  }

  const draft = createDraft(type, interaction.user.id, interaction.channel.id, announcementChannel.id);
  draft.autoManual = autoManual;
  draft.setup = setup;
  draft.isUnlimited = isUnlimited;

  let minutes = null;
  if (isUnlimited) {
    draft.registrationEnd = null;
  } else {
    minutes = parseInt(timeInput);
    if (isNaN(minutes) || minutes < 1 || minutes > 60) {
      return interaction.reply({ embeds: [errorEmbed('Time must be a number (1-60) or "unlimited".')], flags: MessageFlags.Ephemeral });
    }
    draft.registrationEnd = Date.now() + (minutes * 60 * 1000);
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const regEmbed = registrationEmbed(draft, interaction.user);

  const captainBtn = new ButtonBuilder()
    .setCustomId(`register_captain_${draft.id}`)
    .setLabel('Register as Captain')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('👑');

  const playerBtn = new ButtonBuilder()
    .setCustomId(`register_player_${draft.id}`)
    .setLabel('Register as Player')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🏐');

  const unregisterBtn = new ButtonBuilder()
    .setCustomId(`register_unregister_${draft.id}`)
    .setLabel('Unregister')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🚫');

  const row = new ActionRowBuilder().addComponents(captainBtn, playerBtn, unregisterBtn);

  if (isUnlimited) {
    const startBtn = new ButtonBuilder()
      .setCustomId(`draft_start_${draft.id}`)
      .setLabel('Start Draft')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀');

    const cancelBtn = new ButtonBuilder()
      .setCustomId(`draft_cancel_${draft.id}`)
      .setLabel('Cancel Draft')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌');

    const hostRow = new ActionRowBuilder().addComponents(startBtn, cancelBtn);
    const sentMsg = await announcementChannel.send({ embeds: [regEmbed], components: [row, hostRow] });
    draft.registrationMessageId = sentMsg.id;
  } else {
    const sentMsg = await announcementChannel.send({ embeds: [regEmbed], components: [row] });
    draft.registrationMessageId = sentMsg.id;
  }

  scheduleSave();

  await logHostAction(interaction.guild, interaction.user, `Started a **${type.toUpperCase()}** draft (${autoManual === 'automatic' ? '✅ Auto' : '👤 Manual'} mode)`, [
    { name: '🎯 Draft', value: draft.id, inline: true },
    { name: '⏰ Registration', value: isUnlimited ? 'Unlimited' : `${timeInput} minutes`, inline: true },
    { name: '📢 Channel', value: `<#${announcementChannel.id}>`, inline: true }
  ]);
  await interaction.editReply({ embeds: [successEmbed(`Draft **${draft.id}** started! Registration open${isUnlimited ? ' (unlimited time)' : ` for ${timeInput} minutes`} in <#${announcementChannel.id}>\n\nMode: **${autoManual === 'automatic' ? 'Automatic' : 'Manual'}**`)] });

  if (!isUnlimited) {
    setTimeout(async () => {
      if (draft.status !== 'registration') return;

      if (!isRegistrationCompleteEnough(draft)) {
        await cancelInsufficientDraft(draft, interaction.guild, announcementChannel);
        return;
      }

      draft.status = 'captain_selection';
      scheduleSave();

      await announcementChannel.send({ embeds: [infoEmbed(`⏰ Registration for **${draft.id}** is now **CLOSED**!`)] });

      if (autoManual === 'automatic') {
        await handleRandomizerSelection(draft, interaction);
      } else {
        await handleManualSelection(draft, interaction);
      }
    }, minutes * 60 * 1000);
  }
}

async function handleCancel(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const draft = getActiveDraft(draftId);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only the draft host or admins can cancel a draft.')], flags: MessageFlags.Ephemeral });
  }

  if (draft.status !== 'registration') {
    return interaction.reply({ embeds: [errorEmbed('Can only cancel a draft that is in registration phase.')], flags: MessageFlags.Ephemeral });
  }

  draft.turnTimers.forEach(t => clearTimeout(t));

  for (const catId of draft.categories) {
    const category = interaction.guild.channels.cache.get(catId);
    if (category) {
      for (const [id, ch] of category.children.cache) {
        await ch.delete().catch(() => {});
      }
      await category.delete().catch(() => {});
    }
  }

  deleteDraft(draft.id);
  await logHostAction(interaction.guild, interaction.user, `Cancelled draft **${draftId}** (registration phase)`);
  await interaction.reply({ embeds: [successEmbed(`Draft **${draftId}** has been cancelled.`)] });
}

async function handleForceCancel(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const draft = getDraftById(draftId) || getActiveDraft(draftId);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only the draft host or admins can force cancel a draft.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  draft.turnTimers.forEach(t => clearTimeout(t));

  const setup = getSetup(interaction.guild.id);
  for (const [num, team] of Object.entries(draft.teams)) {
    if (team.captain) {
      const capRoleId = setup?.captainRoles?.[draft.type]?.[num];
      if (capRoleId) {
        const member = await interaction.guild.members.fetch(team.captain.id).catch(() => null);
        if (member) await member.roles.remove(capRoleId).catch(() => {});
      }
    }
  }

  if (draft.picksChannelId) {
    const pickCh = interaction.guild.channels.cache.get(draft.picksChannelId);
    if (pickCh) await pickCh.delete().catch(() => {});
  }

  for (const catId of draft.categories) {
    const category = interaction.guild.channels.cache.get(catId);
    if (category) {
      for (const [id, ch] of category.children.cache) {
        await ch.delete().catch(() => {});
      }
      await category.delete().catch(() => {});
    }
  }

  const { deleteTournament, getTournament } = require('../state/tournaments');
  const tournament = getTournament(draft.id);
  if (tournament) {
    for (const match of tournament.matches) {
      if (match.channels) {
        for (const chId of match.channels) {
          const ch = interaction.guild.channels.cache.get(chId);
          if (ch) await ch.delete().catch(() => {});
        }
      }
    }
    if (tournament.finals?.channels) {
      for (const chId of tournament.finals.channels) {
        const ch = interaction.guild.channels.cache.get(chId);
        if (ch) await ch.delete().catch(() => {});
      }
    }
    deleteTournament(draft.id);
  }

  deleteDraft(draft.id);
  await logHostAction(interaction.guild, interaction.user, `Force-cancelled draft **${draftId}** (any state)`, [], config.colors.danger);
  await interaction.editReply({ embeds: [successEmbed(`Draft **${draftId}** has been force-cancelled and all cleanup completed.`)] });
}

async function handleRevert(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const draft = getActiveDraft(draftId.split('-').slice(0, -1).join('-')) || getDraftById(draftId);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  draft.turnTimers.forEach(t => clearTimeout(t));

  for (const catId of draft.categories) {
    const category = interaction.guild.channels.cache.get(catId);
    if (category) {
      for (const [id, ch] of category.children.cache) {
        await ch.delete().catch(() => {});
      }
      await category.delete().catch(() => {});
    }
  }

  const setup = getSetup(interaction.guild.id);
  for (const [num, team] of Object.entries(draft.teams)) {
    if (team.captain) {
      const capRoleId = setup?.captainRoles?.[draft.type]?.[num];
      if (capRoleId) {
        const member = await interaction.guild.members.fetch(team.captain.id).catch(() => null);
        if (member) await member.roles.remove(capRoleId).catch(() => {});
      }
    }
  }

  deleteDraft(draft.id);
  await logStaffAction(interaction.guild, interaction.user, `Reverted (hard-wiped) draft **${draftId}**`, [{ name: '🧹 Channels', value: draft.categories.length ? `${draft.categories.length} category/categories deleted` : 'None', inline: true }], config.colors.danger);
  await interaction.editReply({ embeds: [successEmbed(`Draft **${draftId}** has been cancelled and all channels cleared.`)] });
}

async function handleFix(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const draft = getDraftById(draftId);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only the draft host or admins can fix a draft.')], flags: MessageFlags.Ephemeral });
  }

  if (draft.status !== 'picking') {
    return interaction.reply({ embeds: [errorEmbed('Can only fix drafts in the picking phase.')], flags: MessageFlags.Ephemeral });
  }

  draft.turnTimers.forEach(t => clearTimeout(t));
  draft.turnTimers = [];

  const picksChannel = interaction.guild.channels.cache.get(draft.picksChannelId);
  if (!picksChannel) {
    return interaction.reply({ embeds: [errorEmbed('Picks channel not found.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.reply({ embeds: [infoEmbed('🔄 Fixing draft state...')] });

  const { draftPickEmbed } = require('../utils/embeds');
  const embed = draftPickEmbed(draft);
  await picksChannel.send({ embeds: [embed] }).catch(() => {});

  if (draft.currentCaptain) {
    const needed = getTeamNeeds(draft, draft.currentCaptain.teamNumber);
    const needsText = needed.map(n => `${n.position} (${n.count})`).join(', ');

    await picksChannel.send({
      content: `<@${draft.currentCaptain.id}>`,
      embeds: [infoEmbed(`🔄 **Draft fixed!** It's your turn to pick!\n**${getTeamName(draft, draft.currentCaptain.teamNumber)} needs:** ${needsText}\n\nType the @mention or username of the player you want to pick.`)]
    }).catch(() => {});

    startTurnTimer(draft, picksChannel);
    scheduleSave();
  }

  await interaction.editReply({ embeds: [successEmbed('✅ Draft fixed! Picks channel updated and captain re-notified.')] }).catch(() => {});
  await logHostAction(interaction.guild, interaction.user, `Fixed stuck draft **${draftId}** (picking phase)`);
}

async function handleSub(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const subIn = interaction.options.getUser('sub_in');
  const subOut = interaction.options.getUser('sub_out');

  const draft = getDraftById(draftId);
  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only the draft host or admins can substitute players.')], flags: MessageFlags.Ephemeral });
  }

  if (isDraftFinished(draft)) {
    return interaction.reply({ embeds: [errorEmbed(`Draft **${draft.id}** is finished and no longer accepts substitutions.`)], flags: MessageFlags.Ephemeral });
  }

  let teamNumber = null;
  let oldPlayerIndex = -1;
  let oldPlayerData = null;

  for (const [num, team] of Object.entries(draft.teams)) {
    const idx = team.players.findIndex(p => p.id === subOut.id);
    if (idx >= 0) {
      teamNumber = parseInt(num);
      oldPlayerIndex = idx;
      oldPlayerData = team.players[idx];
      break;
    }
  }

  if (teamNumber === null) {
    return interaction.reply({ embeds: [errorEmbed(`**${subOut.username}** is not on any team in this draft.`)], flags: MessageFlags.Ephemeral });
  }

  if (oldPlayerData.isCaptain) {
    return interaction.reply({ embeds: [errorEmbed('Cannot substitute a captain with this command. Use `/draft captain-sub` instead.')], flags: MessageFlags.Ephemeral });
  }

  const subInData = draft.players.find(p => p.id === subIn.id);
  if (!subInData) {
    return interaction.reply({ embeds: [errorEmbed(`**${subIn.username}** is not registered in this draft.`)], flags: MessageFlags.Ephemeral });
  }

  if (subInData.picked) {
    return interaction.reply({ embeds: [errorEmbed(`**${subIn.username}** is already on a team.`)], flags: MessageFlags.Ephemeral });
  }

  const team = draft.teams[teamNumber];
  team.players[oldPlayerIndex] = { id: subIn.id, position: subInData.position, username: subInData.username };

  const oldPlayerGlobal = draft.players.find(p => p.id === subOut.id);
  if (oldPlayerGlobal) oldPlayerGlobal.picked = false;
  subInData.picked = true;

  await interaction.deferReply();

  const setup = getSetup(interaction.guild.id);
  if (setup?.captainRoles?.[draft.type]?.[teamNumber]) {
    const capRoleId = setup.captainRoles[draft.type][teamNumber];
    const teamCaptain = team.captain;
    if (teamCaptain) {
      const capMember = await interaction.guild.members.fetch(teamCaptain.id).catch(() => null);
      if (capMember) {
        await capMember.send({
          embeds: [infoEmbed(`🔄 **Player Substitution:** **${subIn.username}** has replaced **${subOut.username}** on your team.`)]
        }).catch(() => {});
      }
    }
  }

  try {
    const subInMember = await interaction.guild.members.fetch(subIn.id).catch(() => null);
    if (subInMember) {
      await subInMember.send({
        embeds: [infoEmbed(`🏐 You have been substituted into **Team ${teamNumber}** in the ${draft.type.toUpperCase()} draft!`)]
      }).catch(() => {});
    }

    const subOutMember = await interaction.guild.members.fetch(subOut.id).catch(() => null);
    if (subOutMember) {
      await subOutMember.send({
        embeds: [infoEmbed(`🏐 You have been substituted out of **Team ${teamNumber}** in the ${draft.type.toUpperCase()} draft.`)]
      }).catch(() => {});
    }
  } catch (e) {}

  scheduleSave();

  const teamName = getTeamName(draft, teamNumber);
  await logHostAction(interaction.guild, interaction.user, `Substituted **${subIn.username}** in for **${subOut.username}**`, [
    { name: '🎯 Draft', value: draft.id, inline: true },
    { name: '👥 Team', value: teamName, inline: true },
    { name: '📌 Position', value: subInData.position, inline: true }
  ]);
  await interaction.editReply({
    embeds: [successEmbed(`✅ **${subIn.username}** (${subInData.position}) has replaced **${subOut.username}** (${oldPlayerData.position}) on **${teamName}**.`)]
  });
}

async function handleCaptainSub(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const draft = getDraftById(draftId);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (isDraftFinished(draft)) {
    return interaction.reply({ embeds: [errorEmbed(`Draft **${draft.id}** is finished and no longer accepts substitutions.`)], flags: MessageFlags.Ephemeral });
  }

  if (!canStartDraft(interaction.member, draft.type)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to manage this draft type.')], flags: MessageFlags.Ephemeral });
  }

  const currentCaptainOptions = draft.captains.map(c => ({
    label: c.username, value: c.id, description: `Team ${c.teamNumber}`
  }));

  const notSelectedOptions = draft.captainCandidates
    .filter(c => !draft.captains.some(cap => cap.id === c.id))
    .map(c => ({ label: c.username, value: c.id }));

  if (currentCaptainOptions.length === 0 || notSelectedOptions.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('Not enough captains or candidates available for substitution.')], flags: MessageFlags.Ephemeral });
  }

  const currentSelect = new StringSelectMenuBuilder()
    .setCustomId(`captainsub_current_${draft.id}`)
    .setPlaceholder('Select current captain to replace')
    .addOptions(currentCaptainOptions);

  const newSelect = new StringSelectMenuBuilder()
    .setCustomId(`captainsub_new_${draft.id}`)
    .setPlaceholder('Select new captain from candidates')
    .addOptions(notSelectedOptions);

  const row1 = new ActionRowBuilder().addComponents(currentSelect);
  const row2 = new ActionRowBuilder().addComponents(newSelect);

  await interaction.reply({
    components: [row1, row2],
    flags: MessageFlags.Ephemeral
  });
}

async function handlePlayerSub(interaction) {
  const type = interaction.options.getString('draft_type');
  const draft = getActiveDraft(type);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`No active ${type} draft found.`)], flags: MessageFlags.Ephemeral });
  }

  if (!canStartDraft(interaction.member, type)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to manage this draft type.')], flags: MessageFlags.Ephemeral });
  }

  const teamOptions = [];
  for (const [num, team] of Object.entries(draft.teams)) {
    if (team.captain) {
      teamOptions.push({ label: `Team ${num}`, value: num });
    }
  }

  if (teamOptions.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No teams with captains found.')], flags: MessageFlags.Ephemeral });
  }

  const teamSelect = new StringSelectMenuBuilder()
    .setCustomId(`playersub_team_${draft.id}`)
    .setPlaceholder('Select team')
    .addOptions(teamOptions);

  const row = new ActionRowBuilder().addComponents(teamSelect);

  await interaction.reply({
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}

async function handleUnregister(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const draft = getDraftById(draftId);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.status !== 'registration') {
    return interaction.reply({ embeds: [errorEmbed('Registration is closed for this draft.')], flags: MessageFlags.Ephemeral });
  }

  const playerIndex = draft.players.findIndex(p => p.id === interaction.user.id);
  const captainIndex = draft.captainCandidates.findIndex(c => c.id === interaction.user.id);

  if (playerIndex < 0 && captainIndex < 0) {
    return interaction.reply({ embeds: [errorEmbed('You are not registered in this draft.')], flags: MessageFlags.Ephemeral });
  }

  if (playerIndex >= 0) draft.players.splice(playerIndex, 1);
  if (captainIndex >= 0) draft.captainCandidates.splice(captainIndex, 1);

  scheduleSave();

  if (draft.registrationMessageId) {
    const announcementChannel = interaction.guild.channels.cache.get(draft.announcementId);
    if (announcementChannel) {
      const regMsg = await announcementChannel.messages.fetch(draft.registrationMessageId).catch(() => null);
      if (regMsg) {
        const embed = registrationEmbed(draft, await interaction.guild.members.fetch(draft.hostId).catch(() => interaction.user));
        await regMsg.edit({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  await interaction.reply({
    embeds: [successEmbed('✅ You have been unregistered from this draft.')],
    flags: MessageFlags.Ephemeral
  });
}

async function handleRandomizerSelection(draft, interaction) {
  const setup = getSetup(interaction.guild.id);
  const captainCount = computeTeamCount(draft.captainCandidates, draft.players);

  if (captainCount === 0) {
    const channel = interaction.guild.channels.cache.get(draft.announcementId) || interaction.channel;
    if (channel) {
      await channel.send({
        embeds: [errorEmbed('Not enough captain candidates or players to form the minimum 2 teams. The draft has been cancelled.')]
      }).catch(() => {});
    }
    deleteDraft(draft.id);
    return;
  }

  const selectedCaptains = selectCaptains(draft.captainCandidates, captainCount);
  const channel = interaction.guild.channels.cache.get(draft.announcementId) || interaction.channel;

  try {
    for (let i = 0; i < selectedCaptains.length; i++) {
      const cap = selectedCaptains[i];
      const teamNumber = i + 1;

      cap.teamNumber = teamNumber;
      draft.teams[teamNumber].captain = cap;
      draft.teams[teamNumber].players.push({ id: cap.id, position: cap.position, username: cap.username, isCaptain: true });

      const capRoleId = setup?.captainRoles?.[draft.type]?.[teamNumber];
      if (capRoleId) {
        const member = await interaction.guild.members.fetch(cap.id).catch(() => null);
        if (member) await member.roles.add(capRoleId).catch(() => {});
      }

      draft.captains.push(cap);

      const teamName = getTeamName(draft, teamNumber);
      if (channel) {
        await channel.send({
          embeds: [infoEmbed(`👑 **${cap.username}** has been selected as Captain for **${teamName}**!`)]
        }).catch(() => {});
      }
    }

    draft.status = 'picking';
    scheduleSave();
    await startPickingPhase(draft, interaction);
  } catch (e) {
    console.error(`Failed to assign captains for draft ${draft.id}:`, e);

    for (const cap of draft.captains) {
      const capRoleId = setup?.captainRoles?.[draft.type]?.[cap.teamNumber];
      if (capRoleId) {
        const member = await interaction.guild.members.fetch(cap.id).catch(() => null);
        if (member) await member.roles.remove(capRoleId).catch(() => {});
      }
    }

    if (draft.picksChannelId) {
      const picksCh = interaction.guild.channels.cache.get(draft.picksChannelId);
      if (picksCh) await picksCh.delete().catch(() => {});
    }

    deleteDraft(draft.id);
    if (channel) {
      await channel.send({
        embeds: [errorEmbed(`❌ **${draft.id}** could not assign captains and has been **cancelled**. Please start a new draft.`)]
      }).catch(() => {});
    }
  }
}

async function handleManualSelection(draft, interaction) {
  const setup = getSetup(interaction.guild.id);
  const announcementChannel = interaction.guild.channels.cache.get(draft.announcementId);

  const capList = draft.captainCandidates.map((c, i) => `${i + 1}. <@${c.id}>`).join('\n');

  const { playersListEmbed } = require('../utils/embeds');

  if (announcementChannel) {
    await announcementChannel.send({
      embeds: [infoEmbed(`📋 **Captain Candidates:**\n${capList}`)]
    }).catch(() => {});

    await announcementChannel.send({
      embeds: [playersListEmbed(draft)]
    }).catch(() => {});
  }

  const hostMember = await interaction.guild.members.fetch(draft.hostId).catch(() => null);
  if (hostMember) {
    await hostMember.send({
      embeds: [infoEmbed(`📋 **Manual Draft Mode - ${draft.id}**\n\nCaptain candidates:\n${capList}\n\nNo captain picking needed - the lists above are for reference only. When the matches are finished, report the winning team with:\n\n\`/winner draft-id: ${draft.id} player1: @user player2: @user player3: @user player4: @user player5: @user player6: @user\``)]
    }).catch(() => {});
  }

  draft.status = 'awaiting_winner';
  scheduleSave();
}

async function startPickingPhase(draft, interaction) {
  const setup = getSetup(interaction.guild.id);
  const draftCatId = setup?.categories?.[draft.type];

  const captainOverwrites = draft.isTest
    ? []
    : draft.captains.map(c => ({ id: c.id, allow: ['ViewChannel', 'SendMessages'] }));

  const pickChannel = await interaction.guild.channels.create({
    name: `${draft.type}-draft-picks`,
    type: 0,
    parent: draftCatId || null,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['ViewChannel'] },
      { id: draft.hostId, allow: ['ViewChannel', 'SendMessages'] },
      ...captainOverwrites
    ]
  });

  draft.picksChannelId = pickChannel.id;
  draft.currentTurn = 0;
  draft.draftOrder = generateSnakeDraftOrder(draft.captains);
  draft.currentCaptain = draft.draftOrder[0];

  scheduleSave();

  await sendDraftState(draft, pickChannel);
  await notifyCurrentCaptain(draft, pickChannel);
}

function generateSnakeDraftOrder(captains) {
  const order = [];
  let forward = true;
  let iterations = 0;
  const maxIterations = 50;

  while (iterations < maxIterations) {
    if (forward) {
      for (let i = 0; i < captains.length; i++) {
        order.push(captains[i]);
      }
    } else {
      for (let i = captains.length - 1; i >= 0; i--) {
        order.push(captains[i]);
      }
    }
    forward = !forward;
    iterations++;
  }

  return order;
}

async function sendDraftState(draft, channel) {
  const { draftPickEmbed } = require('../utils/embeds');
  const embed = draftPickEmbed(draft);
  await channel.send({ embeds: [embed] });
}

async function notifyCurrentCaptain(draft, channel) {
  const needed = getTeamNeeds(draft, draft.currentCaptain.teamNumber);
  const needsText = needed.map(n => `${n.position} (${n.count})`).join(', ');

  await channel.send({
    content: `<@${draft.currentCaptain.id}>`,
    embeds: [infoEmbed(`It's your turn to pick!\n**Team ${draft.currentCaptain.teamNumber} needs:** ${needsText}\n\nType the @mention or username of the player you want to pick.`)]
  });

  startTurnTimer(draft, channel);
}

function getTeamNeeds(draft, teamNumber) {
  const team = draft.teams[teamNumber];
  const needs = [];

  for (const [pos, count] of Object.entries(config.teamRoster)) {
    const current = team.players.filter(p => p.position === pos).length;
    if (current < count) {
      needs.push({ position: pos, count: count - current });
    }
  }

  return needs;
}

function startTurnTimerLocal(draft, channel) {
  draft.turnTimers.forEach(t => clearTimeout(t));
  draft.turnTimers = [];

  const reminderTimer = setTimeout(async () => {
    if (draft.status !== 'picking' || draft.currentCaptain.id !== draft.draftOrder[draft.currentTurn]?.id) return;
    await channel.send({
      content: `<@${draft.currentCaptain.id}>`,
      embeds: [infoEmbed('⏰ **30 second reminder:** Please make your pick!')]
    });
  }, config.turnTime.reminder);

  const hostTimer = setTimeout(async () => {
    if (draft.status !== 'picking' || draft.currentCaptain.id !== draft.draftOrder[draft.currentTurn]?.id) return;
    await channel.send({
      content: `<@${draft.hostId}>`,
      embeds: [infoEmbed(`⚠️ **60 seconds passed!** Captain <@${draft.currentCaptain.id}> has not picked yet.`)]
    });
  }, config.turnTime.hostAlert);

  draft.turnTimers = [reminderTimer, hostTimer];
}

async function handleMove(interaction) {
  const player = interaction.options.getUser('player');
  const targetType = interaction.options.getString('draft_type');
  const setup = getSetup(interaction.guild.id);

  if (!setup?.playerRoles?.lower || !setup?.playerRoles?.higher) {
    return interaction.reply({ embeds: [errorEmbed('Player roles not configured in setup.')], flags: MessageFlags.Ephemeral });
  }

  const member = await interaction.guild.members.fetch(player.id).catch(() => null);
  if (!member) {
    return interaction.reply({ embeds: [errorEmbed('Player not found in this server.')], flags: MessageFlags.Ephemeral });
  }

  const lowerRoleId = setup.playerRoles.lower;
  const higherRoleId = setup.playerRoles.higher;
  const trialRoleId = config.trialHighPlayerRoleId;

  const hasLower = member.roles.cache.has(lowerRoleId);
  const hasHigher = member.roles.cache.has(higherRoleId);
  const hasTrial = member.roles.cache.has(trialRoleId);

  async function change(action, roleId, reason) {
    try {
      if (action === 'add') await member.roles.add(roleId, reason);
      else await member.roles.remove(roleId, reason);
      return { ok: true };
    } catch (e) {
      console.error(`[move] ${action} role ${roleId} for ${player.id}:`, e.message);
      return { ok: false, error: e.message };
    }
  }

  let targetRoleId;
  let targetLabel;

  if (targetType === 'lower') {
    if (hasLower) {
      return interaction.reply({ embeds: [infoEmbed(`${player.username} already has the Lower Draft Player role.`)], flags: MessageFlags.Ephemeral });
    }
    targetRoleId = lowerRoleId;
    targetLabel = 'Lower';
  } else if (targetType === 'trial_high') {
    if (hasTrial) {
      return interaction.reply({ embeds: [infoEmbed(`${player.username} already has the Trial High Draft role.`)], flags: MessageFlags.Ephemeral });
    }
    targetRoleId = trialRoleId;
    targetLabel = 'Trial High Draft';
  } else if (targetType === 'higher') {
    if (hasHigher) {
      return interaction.reply({ embeds: [infoEmbed(`${player.username} already has the Higher Draft Player role.`)], flags: MessageFlags.Ephemeral });
    }
    targetRoleId = higherRoleId;
    targetLabel = 'Higher';
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  for (const [roleId] of [[lowerRoleId], [higherRoleId], [trialRoleId]]) {
    if (roleId !== targetRoleId && member.roles.cache.has(roleId)) {
      await change('remove', roleId, `Moved ${player.username} to ${targetLabel} draft`);
    }
  }

  const result = await change('add', targetRoleId, `Moved ${player.username} to ${targetLabel} draft`);
  if (!result.ok) {
    return interaction.editReply({
      embeds: [errorEmbed(`❌ Could not give **${player.username}** the **${targetLabel}** role.\n\nMake sure the bot's role is **above** the target role and the bot has **Manage Roles** permission.\n\n\`${result.error}\``)]
    });
  }

  await logHostAction(interaction.guild, interaction.user, `Moved **${player.username}** to the **${targetLabel}** draft`, [{ name: '📋 Player ID', value: `\`${player.id}\``, inline: true }]);
  await interaction.editReply({ embeds: [successEmbed(`✅ Moved **${player.username}** to **${targetLabel}** draft.`)] });
}

async function handleSetupMatches(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const draft = getDraftById(draftId);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only the draft host or admins can set up matches.')], flags: MessageFlags.Ephemeral });
  }

  if (draft.status !== 'completed') {
    return interaction.reply({ embeds: [errorEmbed('Matches can only be created after the draft is completed.')], flags: MessageFlags.Ephemeral });
  }

  const { getTournament } = require('../state/tournaments');
  const existing = getTournament(draft.id);
  const needsSetup = existing && existing.matches.every(m => !m.channels || m.channels.length === 0);

  if (existing && !needsSetup) {
    return interaction.reply({ embeds: [errorEmbed('Matches were already created for this draft.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { setupTournamentAfterPick } = require('../utils/matches');
    await setupTournamentAfterPick(draft, interaction.guild);
    await logHostAction(interaction.guild, interaction.user, `Set up match channels/votes for draft **${draft.id}**`);
    await interaction.editReply({
      embeds: [successEmbed(`✅ Match channels and vote buttons created for **${draft.id}**! Check the announcement channel.`)]
    });
  } catch (e) {
    console.error(`Failed to set up matches for ${draft.id}:`, e);
    await interaction.editReply({
      embeds: [errorEmbed('Failed to create the match channels. Make sure the bot has permissions to create channels.')]
    });
  }
}

async function handleForceRegister(interaction) {
  const user = interaction.options.getUser('player');
  const position = interaction.options.getString('position');

  if (user.bot) {
    return interaction.reply({ embeds: [errorEmbed('Bots cannot be force-registered.')], flags: MessageFlags.Ephemeral });
  }

  const { isMemberBlocked } = require('../utils/blacklist');
  const targetMember = interaction.guild.members.cache.get(user.id);
  if (isMemberBlocked(targetMember, user.id)) {
    return interaction.reply({ embeds: [errorEmbed(`**${user.username}** is blacklisted and cannot be force-registered.`)], flags: MessageFlags.Ephemeral });
  }

  if (!interaction.guild.members.cache.has(user.id)) {
    return interaction.reply({ embeds: [errorEmbed(`**${user.username}** is not a member of this server.`)], flags: MessageFlags.Ephemeral });
  }

  const all = getActiveDrafts().filter(d => d.status !== 'awaiting_winner' && !d.isTest);
  let draft = all.find(d => d.hostId === interaction.user.id)
    || all.find(d => d.status === 'registration' || d.status === 'captain_selection' || d.status === 'picking');
  if (!draft && all.length === 1) draft = all[0];

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed('No active draft found to register into.')], flags: MessageFlags.Ephemeral });
  }

  if (draft.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only the draft host or admins can force-register players.')], flags: MessageFlags.Ephemeral });
  }

  if (draft.status !== 'registration' && draft.status !== 'captain_selection' && draft.status !== 'picking') {
    return interaction.reply({ embeds: [errorEmbed(`The draft **${draft.id}** is not accepting new players right now.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.players.some(p => p.id === user.id)) {
    return interaction.reply({ embeds: [infoEmbed(`**${user.username}** is already registered in **${draft.id}**.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.captainCandidates.some(c => c.id === user.id)) {
    return interaction.reply({ embeds: [infoEmbed(`**${user.username}** is already registered as a captain in **${draft.id}**.`)], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  draft.players.push({ id: user.id, username: user.username, position, picked: false, registeredAt: Date.now() });
  scheduleSave();

  if (draft.status === 'picking' && draft.picksChannelId) {
    const picksChannel = interaction.guild.channels.cache.get(draft.picksChannelId);
    if (picksChannel) {
      const { draftPickEmbed } = require('../utils/embeds');
      await picksChannel.send({ embeds: [draftPickEmbed(draft)] }).catch(() => {});
    }
  }

  const announcementChannel = interaction.guild.channels.cache.get(draft.announcementId);
  if (announcementChannel) {
    await announcementChannel.send({
      embeds: [infoEmbed(`➕ **${user.username}** (${position}) has been force-registered into **${draft.id}**!`)],
    }).catch(() => {});
  }

  await logHostAction(interaction.guild, interaction.user, `Force-registered **${user.username}** into draft ${draft.id}`, [
    { name: '📌 Position', value: position, inline: true },
    { name: '📋 Player ID', value: `\`${user.id}\``, inline: true }
  ]);
  await interaction.editReply({
    embeds: [successEmbed(`✅ **${user.username}** added to **${draft.id}** as **${position}**.`)]
  });
}

async function handleBlacklist(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only administrators can blacklist players.')], flags: MessageFlags.Ephemeral });
  }

  const user = interaction.options.getUser('user');
  const timeInput = interaction.options.getString('time');
  const reason = interaction.options.getString('reason');

  if (user.bot) {
    return interaction.reply({ embeds: [errorEmbed('Bots cannot be blacklisted.')], flags: MessageFlags.Ephemeral });
  }

  const { parseTime, applyBlacklist, isBlacklisted } = require('../utils/blacklist');
  const durationMs = parseTime(timeInput);
  if (!durationMs) {
    return interaction.reply({
      embeds: [errorEmbed('Invalid time format. Use `Xmin`, `Xh` or `Xd` (e.g. `30min`, `2h`, `3d`).')],
      flags: MessageFlags.Ephemeral
    });
  }

  if (isBlacklisted(user.id)) {
    return interaction.reply({ embeds: [infoEmbed(`**${user.username}** is already blacklisted.`)], flags: MessageFlags.Ephemeral });
  }

  const expiresAt = Date.now() + durationMs;

  await applyBlacklist(user.id, user.username, interaction.user.id, reason, durationMs);

  const logChannel = interaction.guild.channels.cache.get(config.blacklistChannelId);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.danger)
      .setTitle('🚫 Player Blacklisted')
      .addFields(
        { name: 'Player', value: `<@${user.id}>`, inline: true },
        { name: 'Blacklisted By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason || 'No reason provided', inline: false },
        { name: 'Until', value: `<t:${Math.floor(expiresAt / 1000)}:F> (<t:${Math.floor(expiresAt / 1000)}:R>)`, inline: false }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  await logStaffAction(interaction.guild, interaction.user, `Blacklisted **${user.username}**`, [
    { name: '⏳ Duration', value: timeInput, inline: true },
    { name: '🗓️ Until', value: `<t:${Math.floor(expiresAt / 1000)}:F>`, inline: true },
    { name: '📝 Reason', value: reason || 'No reason provided', inline: false },
    { name: '📋 Player ID', value: `\`${user.id}\``, inline: true }
  ], config.colors.danger);

  await interaction.reply({
    embeds: [successEmbed(`✅ **${user.username}** has been blacklisted until <t:${Math.floor(expiresAt / 1000)}:F>.\nReason: **${reason}**`)],
    flags: MessageFlags.Ephemeral
  });
}

async function handleUnblacklist(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only administrators can unblacklist players.')], flags: MessageFlags.Ephemeral });
  }

  const user = interaction.options.getUser('player');

  const { isBlacklisted, unblacklist } = require('../utils/blacklist');
  if (!isBlacklisted(user.id)) {
    return interaction.reply({ embeds: [infoEmbed(`**${user.username}** is not blacklisted.`)], flags: MessageFlags.Ephemeral });
  }

  await unblacklist(user.id);

  const logChannel = interaction.guild.channels.cache.get(config.blacklistChannelId);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Player Unblacklisted')
      .addFields(
        { name: 'Player', value: `<@${user.id}>`, inline: true },
        { name: 'Unblacklisted By', value: `<@${interaction.user.id}>`, inline: true }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  await logStaffAction(interaction.guild, interaction.user, `Unblacklisted **${user.username}**`, [
    { name: '📋 Player ID', value: `\`${user.id}\``, inline: true }
  ]);

  await interaction.reply({
    embeds: [successEmbed(`✅ **${user.username}** has been unblacklisted.`)],
    flags: MessageFlags.Ephemeral
  });
}

async function handleHighRequest(interaction) {
  const requesterId = interaction.user.id;
  const member = interaction.member;

  const hasTrial = member.roles.cache.has(config.trialHighPlayerRoleId);
  const hasLower = member.roles.cache.has(config.lowerDrafterRoleId);

  if (!hasTrial && !hasLower) {
    return interaction.reply({ embeds: [errorEmbed('Only members with the **Trial High Drafter** or **Lower Drafter** role can request the High Drafter role.')], flags: MessageFlags.Ephemeral });
  }

  const { getRequestCooldown, getActiveVotationByTarget, createVotation } = require('../state/votations');

  const cooldown = getRequestCooldown(requesterId);
  if (cooldown) {
    return interaction.reply({ embeds: [errorEmbed(`You are on cooldown. You can request again <t:${Math.floor(cooldown / 1000)}:R>.`)], flags: MessageFlags.Ephemeral });
  }

  const active = getActiveVotationByTarget(requesterId, 'request');
  if (active) {
    return interaction.reply({ embeds: [errorEmbed('You already have an active request awaiting votes.')], flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.guild.channels.cache.get(config.highVoteChannelId);
  if (!channel) {
    return interaction.reply({ embeds: [errorEmbed('High request channel is not configured.')], flags: MessageFlags.Ephemeral });
  }

  const votation = createVotation({
    type: 'request',
    channelId: channel.id,
    targetUserId: requesterId,
    targetUsername: interaction.user.username,
    choices: [
      { value: 'accept', label: 'Accept', style: 'success' },
      { value: 'reject', label: 'Reject', style: 'danger' },
      { value: 'trial', label: 'Trial', style: 'secondary' }
    ]
  });

  const { buildVotationEmbed, buildVotationButtons } = require('../interactions/votation');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sent = await channel.send({
    content: `<@&${config.highVoteRoleId}>`,
    embeds: [buildVotationEmbed(votation)],
    components: [buildVotationButtons(votation)]
  });

  const { markPosted } = require('../state/votations');
  markPosted(votation, sent.id);

  await interaction.editReply({
    embeds: [successEmbed(`✅ Your request for the **High Drafter** role has been posted to <#${channel.id}>. It needs **${config.highRequestVotesNeeded} votes** to be decided.`)],
    flags: MessageFlags.Ephemeral
  });

  await logHostAction(interaction.guild, interaction.user, `Submitted a High Drafter role request`, [
    { name: '📌 User', value: `<@${requesterId}>`, inline: true },
    { name: '📢 Channel', value: `<#${channel.id}>`, inline: true }
  ]);
}

function isDraftFinished(draft) {
  if (!draft || draft.status === 'cancelled') return true;
  if (draft.status !== 'completed') return false;

  const { getTournament } = require('../state/tournaments');
  const tournament = getTournament(draft.id);
  if (!tournament) return true;
  return !!tournament.winner || tournament.stage === 'completed';
}

function resolveTeamNumber(draft, raw) {
  const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, ' ');
  const input = normalize(raw);

  for (const [num, team] of Object.entries(draft.teams)) {
    if (!team.captain) continue;
    const capNorm = normalize(team.captain.username);
    if (capNorm && (input.includes(capNorm) || capNorm.includes(input))) {
      return parseInt(num);
    }
  }

  const teamMatch = String(raw).toLowerCase().match(/team\s*(\d)/);
  if (teamMatch) return parseInt(teamMatch[1]);

  if (/^\d+$/.test(input)) return parseInt(input);

  return null;
}

async function handleForceWinner(interaction) {
  const draftId = interaction.options.getString('draftid');
  const winnerInput = interaction.options.getString('winner');
  const setup = getSetup(interaction.guild.id);

  const draft = getDraftById(draftId);
  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (draft.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only the draft host or admins can force declare a winner.')], flags: MessageFlags.Ephemeral });
  }

  const teamNumber = resolveTeamNumber(draft, winnerInput);
  if (teamNumber === null || !draft.teams[teamNumber]?.captain) {
    return interaction.reply({ embeds: [errorEmbed(`Could not resolve **${winnerInput}** to a team. Available teams:\n${Object.entries(draft.teams).filter(([, t]) => t.captain).map(([n, t]) => `${n}. ${getTeamName(draft, parseInt(n))}`).join('\n')}`)], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  try {
    const { getTournament, scheduleSave: scheduleTournamentSave } = require('../state/tournaments');
    let tournament = getTournament(draft.id);
    if (!tournament) {
      const teams = {};
      for (const [num, team] of Object.entries(draft.teams)) {
        if (team.captain) teams[num] = { number: parseInt(num), captain: { id: team.captain.id, username: team.captain.username }, roster: team.players };
      }
      const { createTournament } = require('../state/tournaments');
      tournament = createTournament(draft.id, teams);
    }

    tournament.winner = teamNumber;
    tournament.stage = 'completed';
    if (tournament.finals) {
      tournament.finals.winner = teamNumber;
      tournament.finals.status = 'completed';
    }
    for (const match of tournament.matches) {
      if (match.status !== 'completed') {
        match.winner = teamNumber;
        match.status = 'completed';
      }
    }
    scheduleTournamentSave();

    draft.status = 'completed';
    scheduleSave();

    const { announceWinner } = require('../interactions/draftPicks');
    await announceWinner(tournament, draft, interaction.guild, setup);

    await interaction.editReply({
      embeds: [successEmbed(`✅ **${getTeamName(draft, teamNumber)}** has been declared the winner of **${draft.id}**! The winners channel has been updated and the draft channels cleaned up.`)]
    }).catch(e => console.error(`[force-winner] editReply failed for ${draft.id}:`, e.message));
  } catch (e) {
    console.error(`[force-winner] failed for ${draft.id}:`, e);
    await interaction.editReply({
      embeds: [errorEmbed(`Failed to declare the winner of **${draft.id}**. The tournament data may already be updated - check the winners channel or use /draft force-cancel if needed.`)]
    }).catch(() => {});
  }

  await logHostAction(interaction.guild, interaction.user, `Force-declared the winner of **${draft.id}**: **${getTeamName(draft, teamNumber)}**`, [
    { name: '🏆 Winner', value: getTeamName(draft, teamNumber), inline: true },
    { name: '🎯 Draft', value: draft.id, inline: true }
  ], config.colors.success);
}

async function handleHighKick(interaction) {
  const isAdminUser = isAdmin(interaction.member);
  const hasVoteRole = interaction.member.roles.cache.has(config.highVoteRoleId);

  if (!isAdminUser && !hasVoteRole) {
    return interaction.reply({ embeds: [errorEmbed('Only administrators or members with the required role can use this command.')], flags: MessageFlags.Ephemeral });
  }

  const player = interaction.options.getUser('player');
  const reason = interaction.options.getString('reason');

  const target = await interaction.guild.members.fetch(player.id).catch(() => null);
  if (!target) {
    return interaction.reply({ embeds: [errorEmbed('Player not found in this server.')], flags: MessageFlags.Ephemeral });
  }

  const hasHigh = target.roles.cache.has(config.highDrafterRoleId);
  const hasTrial = target.roles.cache.has(config.trialHighPlayerRoleId);
  if (!hasHigh && !hasTrial) {
    return interaction.reply({ embeds: [errorEmbed('This player does not hold the **High Drafter** or **Trial High Drafter** role.')], flags: MessageFlags.Ephemeral });
  }

  const channel = interaction.guild.channels.cache.get(config.highKickChannelId);
  if (!channel) {
    return interaction.reply({ embeds: [errorEmbed('High kick channel is not configured.')], flags: MessageFlags.Ephemeral });
  }

  const { getActiveVotationByTarget, createVotation } = require('../state/votations');
  const existing = getActiveVotationByTarget(player.id, 'high_kick');
  if (existing) {
    return interaction.reply({ embeds: [errorEmbed('There is already an active high-kick votation for this player.')], flags: MessageFlags.Ephemeral });
  }

  const votation = createVotation({
    type: 'high_kick',
    channelId: channel.id,
    targetUserId: player.id,
    targetUsername: player.username,
    byUserId: interaction.user.id,
    byUsername: interaction.user.username,
    reason,
    choices: [
      { value: 'remove', label: 'Remove', style: 'danger' },
      { value: 'cancel', label: 'Cancel', style: 'secondary' }
    ]
  });

  const { buildVotationEmbed, buildVotationButtons } = require('../interactions/votation');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sent = await channel.send({
    content: `<@&${config.highVoteRoleId}>`,
    embeds: [buildVotationEmbed(votation)],
    components: [buildVotationButtons(votation)]
  });

  const { markPosted } = require('../state/votations');
  markPosted(votation, sent.id);

  await interaction.editReply({
    embeds: [successEmbed(`✅ High-kick votation for **${player.username}** has been posted to <#${channel.id}>.`)],
    flags: MessageFlags.Ephemeral
  });

  await logHostAction(interaction.guild, interaction.user, `Started a high-kick votation for **${player.username}**`, [
    { name: '🎯 Target', value: `<@${player.id}>`, inline: true },
    { name: '📝 Reason', value: reason || 'None', inline: false }
  ], config.colors.danger);
}

async function handleResetVotations(interaction) {
  const isAdminUser = isAdmin(interaction.member);
  const hasVoteRole = interaction.member.roles.cache.has(config.highVoteRoleId);

  if (!isAdminUser && !hasVoteRole) {
    return interaction.reply({ embeds: [errorEmbed('Only administrators or members with the required role can use this command.')], flags: MessageFlags.Ephemeral });
  }

  const { deleteUnresolvedVotations, votations } = require('../state/votations');

  const removed = deleteUnresolvedVotations();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  for (const v of removed) {
    if (!v.channelId || !v.messageId) continue;
    const channel = interaction.guild.channels.cache.get(v.channelId);
    if (!channel) continue;
    await channel.messages.delete(v.messageId).catch(() => {});
  }

  const active = [...votations.values()].filter(v => !v.resolved).length;

  await interaction.editReply({
    embeds: [successEmbed(`✅ Deleted **${removed.length}** unfinished votation(s).\n\nRemaining active votations: **${active}**`)],
    flags: MessageFlags.Ephemeral
  });

  await logHostAction(interaction.guild, interaction.user, `Reset votations: deleted ${removed.length} unfinished votation(s)`);
}

function buildStatsBar(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round(clamped / 10);
  let bar = '';
  for (let i = 0; i < 10; i++) {
    bar += i < filled ? (i % 2 === 0 ? '🟨' : '🟧') : '⬛';
  }
  return bar;
}

async function handleStats(interaction) {
  const target = interaction.options.getUser('player');
  await interaction.deferReply();

  const { getPlayerStats } = require('../utils/stats');
  const stats = getPlayerStats(target.id);

  const winRate = stats.matchesPlayed > 0
    ? Math.min(100, Math.round((stats.wins / stats.matchesPlayed) * 100))
    : 0;

  const bar = buildStatsBar(winRate);

  const embed = new EmbedBuilder()
    .setColor(config.colors.warning)
    .setAuthor({ name: target.username, iconURL: target.displayAvatarURL({ size: 128 }) })
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setTitle('📊 Player Stats')
    .setDescription(`${bar}\n\n**Win Rate:** ${winRate}%`)
    .addFields(
      { name: '🏆 Wins', value: `**${stats.wins}**`, inline: true },
      { name: '🎮 Matches Played', value: `**${stats.matchesPlayed}**`, inline: true },
      { name: '📦 Drafts Joined', value: `**${stats.draftsJoined}**`, inline: true },
      { name: '🏆 Wins by type', value: `Higher **${stats.winsByType.higher}** · Mixed **${stats.winsByType.mixed}** · Lower **${stats.winsByType.lower}**`, inline: false }
    )
    .setFooter({ text: `Player ID: ${target.id}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleEditStats(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed('Only administrators can use this command.')], flags: MessageFlags.Ephemeral });
  }

  const target = interaction.options.getUser('player');
  const newWins = interaction.options.getInteger('wins');
  const draftTypeRaw = interaction.options.getString('draft-type') || 'overall';
  const draftType = ['lower', 'mixed', 'higher'].includes(draftTypeRaw) ? draftTypeRaw : 'overall';

  const { editWins } = require('../utils/stats');
  const { before, after } = editWins(target.id, newWins, draftType);
  const typeLabel = draftType === 'overall' ? 'overall wins' : `/draft type: ${draftType}`;

  await interaction.reply({
    embeds: [successEmbed(`✏️ Updated **${target.username}**'s ${typeLabel}: **${before}** → **${after}**`)],
    flags: MessageFlags.Ephemeral
  });

  const logEmbed = new EmbedBuilder()
    .setColor(config.colors.warning)
    .setTitle('✏️ Player stats edited')
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '👤 Edited by', value: `${interaction.user} (\`@${interaction.user.username}\`)`, inline: true },
      { name: '🎯 Player edited', value: `${target} (\`@${target.username}\`)`, inline: true },
      { name: `⚖️ ${draftType === 'overall' ? 'Overall wins' : draftType + ' wins'}`, value: `**${before}** → **${after}**`, inline: false }
    )
    .setFooter({ text: `Player ID: ${target.id}` })
    .setTimestamp();

  const logChannel = interaction.guild.channels.cache.get(config.statsLogChannelId);
  if (logChannel) {
    await logChannel.send({ embeds: [logEmbed] }).catch(e => console.error(`Stats log failed (${config.statsLogChannelId}):`, e.message));
  }

  const owner = await interaction.client.users.fetch(config.ownerId).catch(() => null);
  if (owner) {
    await owner.send({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.warning)
          .setTitle('✏️ Player stats edited')
          .setDescription(
            `${interaction.user} (\`@${interaction.user.username}\`) edited ${target}'s (\`@${target.username}\`) ${draftType} wins.\n\n**Before:** ${before}\n**After:** ${after}`
          )
          .setTimestamp()
      ]
    }).catch(() => {});
  }

  await logStaffAction(interaction.guild, interaction.user, `Edited **${target.username}**'s ${draftType} wins from **${before}** to **${after}**`, [
    { name: '🎯 Player', value: `${target} (\`@${target.username}\`)`, inline: true },
    { name: '⚖️ Wins', value: `${before} → **${after}**`, inline: true }
  ]);
}

async function handleLink(interaction) {
  const username = (interaction.options.getString('user') || '').trim();
  const { getLink, setLink } = require('../state/links');
  const { resolveRobloxUsername } = require('../utils/roblox');

  if (!username) {
    return interaction.reply({ embeds: [errorEmbed('You must provide your Roblox username.')], flags: MessageFlags.Ephemeral });
  }

  const existing = getLink(interaction.user.id);
  if (existing) {
    return interaction.reply({
      embeds: [errorEmbed(
        `You already linked your Roblox account **${existing.username}**. Open a ticket if you need to change your username.`
      )],
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let resolved;
  try {
    resolved = await resolveRobloxUsername(username);
  } catch (e) {
    console.warn('[draft link] Roblox API unreachable:', e.message);
    return interaction.editReply({ embeds: [errorEmbed('Could not reach the Roblox API right now. Try again in a few minutes.')] });
  }

  if (!resolved) {
    return interaction.editReply({ embeds: [errorEmbed(`No Roblox account named **${username}** was found. Double-check the spelling.`)] });
  }

  setLink({
    discordId: interaction.user.id,
    username: resolved.username,
    robloxId: resolved.robloxId,
    displayName: resolved.displayName,
    avatarUrl: resolved.avatarUrl
  });

  await interaction.editReply({
    embeds: [successEmbed(`✅ Roblox account **${resolved.username}** linked. Your avatar will show on the leaderboard shortly.`)]
  });

  await logStaffAction(interaction.guild, interaction.user, `🔗 Linked their Roblox account **${resolved.username}** (\`${resolved.robloxId}\`)`, [
    { name: '👤 User', value: `${interaction.user} (\`@${interaction.user.username}\`)`, inline: true },
    { name: '🦾 Roblox', value: `\`${resolved.username}\` · id \`${resolved.robloxId}\``, inline: true }
  ]);
}
