const { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { getSetup, getCaptainCount, selectCaptains, shuffleArray } = require('../utils/helpers');
const { createDraft, getActiveDraft, getDraftById, deleteDraft } = require('../state/drafts');
const { errorEmbed, successEmbed, registrationEmbed, infoEmbed } = require('../utils/embeds');
const { isAdmin } = require('../utils/permissions');
const { logStaffAction } = require('../utils/auditLog');

const TEST_NAMES = [
  'AlphaPlayer', 'BetaGamer', 'ProSniper', 'AceHunter', 'EliteFrag',
  'ShadowBlade', 'StormStrike', 'ThunderBolt', 'FireStorm', 'IceBreaker',
  'NightHawk', 'SilverWolf', 'GoldenEagle', 'CrimsonTide', 'AzureDragon',
  'MysticKnight', 'PhantomAce', 'RapidFire', 'SwiftStrike', 'IronGrip',
  'NeonPulse', 'PixelKing', 'QuantumLeap', 'RogueAgent', 'VortexStar'
];

const TEST_IDS = [
  '111111111111111111', '222222222222222222', '333333333333333333',
  '444444444444444444', '555555555555555555', '666666666666666666',
  '777777777777777777', '888888888888888888', '999999999999999999',
  '101010101010101010', '121212121212121212', '131313131313131313',
  '141414141414141414', '151515151515151515', '161616161616161616',
  '171717171717171717', '181818181818181818', '191919191919191919',
  '202020202020202020', '212121212121212121', '232323232323232323',
  '242424242424242424', '252525252525252525', '262626262626262626',
  '272727272727272727'
];

const POSITIONS = ['WS', 'Setter', 'DS', 'Lib'];

function generateTestPlayers(count) {
  const players = [];
  const shuffledNames = shuffleArray([...TEST_NAMES]);
  const shuffledIds = shuffleArray([...TEST_IDS]);
  
  const positionDistribution = [];
  for (let i = 0; i < 8; i++) positionDistribution.push('WS');
  for (let i = 0; i < 4; i++) positionDistribution.push('Setter');
  for (let i = 0; i < 8; i++) positionDistribution.push('DS');
  for (let i = 0; i < 4; i++) positionDistribution.push('Lib');
  
  const shuffledPositions = shuffleArray(positionDistribution);
  
  for (let i = 0; i < count; i++) {
    players.push({
      id: shuffledIds[i],
      username: shuffledNames[i],
      displayName: shuffledNames[i],
      position: shuffledPositions[i],
      picked: false
    });
  }
  return players;
}

function generateTestCaptainCandidates(count, playerStartIndex) {
  const captains = [];
  const shuffledNames = shuffleArray([...TEST_NAMES]);
  const shuffledIds = shuffleArray([...TEST_IDS]);
  
  for (let i = 0; i < count; i++) {
    captains.push({
      id: shuffledIds[playerStartIndex + i],
      username: shuffledNames[playerStartIndex + i],
      displayName: shuffledNames[playerStartIndex + i],
      position: POSITIONS[i % POSITIONS.length],
      picked: false,
      isTestCaptain: true
    });
  }
  return captains;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test-draft')
    .setDescription('Test draft commands (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Start a test draft with unlimited time')
        .addStringOption(opt => opt.setName('type').setDescription('Draft type').setRequired(true).addChoices(
          { name: 'Lower', value: 'lower' },
          { name: 'Mixed', value: 'mixed' },
          { name: 'Higher', value: 'higher' }
        ))
    )
    .addSubcommand(sub =>
      sub.setName('cancel')
        .setDescription('Cancel a test draft')
        .addStringOption(opt => opt.setName('draft_id').setDescription('Draft ID (e.g., lower-1)').setRequired(true))
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [errorEmbed('Only administrators can use this command.')], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'start') return handleTestStart(interaction);
    if (sub === 'cancel') return handleTestCancel(interaction);
  }
};

async function handleTestStart(interaction) {
  const type = interaction.options.getString('type');

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

  const draft = createDraft(type, interaction.user.id, interaction.channel.id, announcementChannel.id, true);
  draft.autoManual = 'automatic';
  draft.setup = setup;
  draft.isUnlimited = true;

  const captainCandidates = generateTestCaptainCandidates(8, 0);
  const testPlayers = generateTestPlayers(24);
  
  draft.players = testPlayers;
  draft.captainCandidates = captainCandidates;

  const regEmbed = registrationEmbed(draft, interaction.user);

  const captainBtn = new ButtonBuilder()
    .setCustomId(`register_captain_${draft.id}`)
    .setLabel('Register as Captain')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('👑');

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

  const captainRow = new ActionRowBuilder().addComponents(captainBtn);
  const hostRow = new ActionRowBuilder().addComponents(startBtn, cancelBtn);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  await announcementChannel.send({ embeds: [regEmbed], components: [captainRow, hostRow] });

  await interaction.editReply({ embeds: [successEmbed(`Test draft **${draft.id}** started with **16 fake players** and **8 captain candidates** in <#${announcementChannel.id}>\n\nRegister as captain, then click **Start Draft**!`)] });
  await logStaffAction(interaction.guild, interaction.user, `Started a **test draft** (${type.toUpperCase()})`, [
    { name: '🎯 Draft', value: draft.id, inline: true },
    { name: '📢 Channel', value: `<#${announcementChannel.id}>`, inline: true }
  ]);
}

async function handleTestCancel(interaction) {
  const draftId = interaction.options.getString('draft_id');
  const draft = getDraftById(draftId);

  if (!draft) {
    return interaction.reply({ embeds: [errorEmbed(`Draft \`${draftId}\` not found.`)], flags: MessageFlags.Ephemeral });
  }

  if (!draft.isTest) {
    return interaction.reply({ embeds: [errorEmbed('This is not a test draft. Use `/draft cancel` instead.')], flags: MessageFlags.Ephemeral });
  }

  if (draft.status !== 'registration') {
    return interaction.reply({ embeds: [errorEmbed('Can only cancel a draft that is in registration phase.')], flags: MessageFlags.Ephemeral });
  }

  draft.turnTimers.forEach(t => clearTimeout(t));

  const pickCh = interaction.guild.channels.cache.get(draft.picksChannelId);
  if (pickCh) await pickCh.delete().catch(() => {});

  deleteDraft(draft.id);
  await interaction.reply({ embeds: [successEmbed(`Test draft **${draftId}** has been cancelled.`)] });
  await logStaffAction(interaction.guild, interaction.user, `Cancelled test draft **${draftId}**`, [], config.colors.danger);
}
