const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getVotation, addVote, closeVotation } = require('../state/votations');
const { errorEmbed, successEmbed, infoEmbed } = require('../utils/embeds');

const STYLE_BY_NAME = {
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
  secondary: ButtonStyle.Secondary,
  primary: ButtonStyle.Primary
};

function withName(id, username) {
  if (!id) return 'Unknown user';
  if (username) return `${username} (<@${id}>)`;
  return `<@${id}>`;
}

function buildVotationEmbed(votation) {
  const total = votation.voters.length;
  const byUser = votation.byUserId ? withName(votation.byUserId, votation.byUsername) : null;
  const targetUser = withName(votation.targetUserId, votation.targetUsername);

  let description;
  let color = config.colors.draft;
  let title = '🗳️ Votation';

  if (votation.type === 'request') {
    title = '⭐ High Drafter Request';
    description = `**${targetUser}** is requesting the **High Drafter** role.`;
    color = config.colors.draft;
  } else if (votation.type === 'trial_review') {
    title = '⏳ Trial Review';
    description = `Should **${targetUser}** keep on trial or not?`;
    color = config.colors.warning;
  } else if (votation.type === 'high_kick') {
    title = '🪓 High Drafter Removal';
    description = `${byUser || 'A staff member'} wants to **remove** **${targetUser}** from high draft${votation.reason ? `\n\n**Reason:** ${votation.reason}` : ''}`;
    color = config.colors.danger;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: '📌 Target', value: targetUser, inline: true },
      { name: '🗳️ Votes', value: `${total}/${votation.votesNeeded}`, inline: true },
      { name: '\u200b', value: `Vote below. **${votation.votesNeeded} votes** are required. Only <@&${votation.roleId}> can vote.`, inline: false }
    )
    .setFooter({ text: 'Votation ID: ' + votation.id })
    .setTimestamp();

  if (votation.resolved) {
    embed.setDescription(`${embed.data.description}\n\n**RESULT:** ${votation.resolvedChoice.toUpperCase()}`);
  }

  return embed;
}

function buildVotationButtons(votation) {
  const row = new ActionRowBuilder();
  for (const c of votation.choices) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`hvote_${votation.id}_${c.value}`)
        .setLabel(c.label)
        .setStyle(STYLE_BY_NAME[c.style] || ButtonStyle.Secondary)
        .setDisabled(votation.resolved)
    );
  }
  return row;
}

module.exports = {
  prefix: 'hvote',
  buildVotationEmbed,
  buildVotationButtons,
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const parts = interaction.customId.split('_');
    const choice = parts[parts.length - 1];
    const votationId = parts.slice(1, -1).join('_');

    const votation = getVotation(votationId);
    if (!votation) {
      return interaction.followUp({ embeds: [errorEmbed('Votation not found.')], flags: MessageFlags.Ephemeral });
    }

    if (!interaction.member.roles.cache.has(config.highVoteRoleId)) {
      return interaction.followUp({ embeds: [errorEmbed(`Only members with the <@&${config.highVoteRoleId}> role can vote on votations.`)], flags: MessageFlags.Ephemeral });
    }

    if (votation.resolved) {
      return interaction.followUp({ embeds: [infoEmbed('This votation has already been resolved.')], flags: MessageFlags.Ephemeral });
    }

    const votes = addVote(votation, interaction.user.id, choice);
    if (votes === null) {
      return interaction.followUp({ embeds: [infoEmbed('This votation has already been resolved.')], flags: MessageFlags.Ephemeral });
    }
    if (votes === false) {
      return interaction.followUp({ embeds: [errorEmbed('You have already voted on this votation.')], flags: MessageFlags.Ephemeral });
    }

    const total = votation.voters.length;

    if (total >= votation.votesNeeded) {
      const winner = closeVotation(votation);
      return resolveWithOutcome(interaction, votation, winner);
    }

    await interaction.message.edit({ embeds: [buildVotationEmbed(votation)], components: [buildVotationButtons(votation)] }).catch(() => {});
    await interaction.followUp({
      embeds: [infoEmbed(`🗳️ Vote recorded (**${total}/${votation.votesNeeded}**)`)],
      flags: MessageFlags.Ephemeral
    });
  }
};

async function resolveWithOutcome(interaction, votation, winner) {
  const targetMember = await interaction.guild.members.fetch(votation.targetUserId).catch(() => null);

  const embed = buildVotationEmbed(votation);
  await interaction.message.edit({ embeds: [embed], components: [buildVotationButtons(votation)] }).catch(() => {});

  if (votation.type === 'request') {
    return resolveRequestOutcome(interaction, votation, winner, targetMember);
  }
  if (votation.type === 'trial_review') {
    return resolveTrialReviewOutcome(interaction, votation, winner, targetMember);
  }
  if (votation.type === 'high_kick') {
    return resolveHighKickOutcome(interaction, votation, winner, targetMember);
  }

  await interaction.followUp({
    embeds: [successEmbed(`Votation resolved: **${winner.toUpperCase()}**`)],
    flags: MessageFlags.Ephemeral
  });
}

async function resolveRequestOutcome(interaction, votation, winner, targetMember) {
  const { setRequestCooldown } = require('../state/votations');
  setRequestCooldown(votation.targetUserId);

  const cooldownExpiry = Date.now() + config.highRequestCooldownMs;

  if (!targetMember) {
    await interaction.followUp({
      embeds: [errorEmbed(`Requester is no longer in the server. Votation resolved: **${winner.toUpperCase()}**`)],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (winner === 'accept') {
    await targetMember.roles.add(config.highDrafterRoleId, 'High Drafter request accepted').catch(() => {});
    await targetMember.roles.remove(config.trialHighPlayerRoleId, 'Promoted to High Drafter').catch(() => {});
    await targetMember.roles.remove(config.lowerDrafterRoleId, 'Promoted to High Drafter').catch(() => {});
  } else if (winner === 'reject') {
    // keep current role
  } else if (winner === 'trial') {
    await targetMember.roles.add(config.trialHighPlayerRoleId, 'Placed on Trial High Drafter').catch(() => {});
    await targetMember.roles.remove(config.highDrafterRoleId, 'Placed on Trial High Drafter').catch(() => {});
    await targetMember.roles.remove(config.lowerDrafterRoleId, 'Placed on Trial High Drafter').catch(() => {});
    const { startTrial } = require('../state/trialReviews');
    startTrial(targetMember.id);
  }

  await interaction.followUp({
    embeds: [successEmbed(`✅ Request resolved: **${winner.toUpperCase()}** — <@${votation.targetUserId}>`)],
    flags: MessageFlags.Ephemeral
  });

  await targetMember.send({
    embeds: [infoEmbed(`Your **High Drafter** request was **${winner.toUpperCase()}**.\n\nYou may request again after <t:${Math.floor(cooldownExpiry / 1000)}:R>.`)]
  }).catch(() => {});
}

async function resolveTrialReviewOutcome(interaction, votation, winner, targetMember) {
  const { extendTrial, removeFromTrial } = require('../state/trialReviews');

  if (winner === 'keep') {
    const entry = extendTrial(votation.targetUserId);
    await interaction.followUp({
      embeds: [successEmbed(`✅ <@${votation.targetUserId}> stays on **trial** for 1 more week. Next review <t:${Math.floor((entry?.nextReviewAt || Date.now()) / 1000)}:R>.`)],
      flags: MessageFlags.Ephemeral
    });
    if (targetMember) {
      await targetMember.send({ embeds: [infoEmbed(`✅ Your trial has been **extended** for 1 more week. Keep it up!`)], }).catch(() => {});
    }
  } else if (winner === 'reject') {
    removeFromTrial(votation.targetUserId);
    if (targetMember) {
      await targetMember.roles.remove(config.trialHighPlayerRoleId, 'Trial not extended - returning to Lower Drafter').catch(() => {});
      await targetMember.roles.add(config.lowerDrafterRoleId, 'Returned to Lower Drafter after trial').catch(() => {});
      await targetMember.send({ embeds: [infoEmbed(`Your trial has **ended**. You have been moved back to **Lower Drafter**. You can request the High Drafter role again.`)], }).catch(() => {});
    }
    await interaction.followUp({
      embeds: [successEmbed(`✅ <@${votation.targetUserId}> has been moved back to **Lower Drafter**.`)],
      flags: MessageFlags.Ephemeral
    });
  }
}

async function resolveHighKickOutcome(interaction, votation, winner, targetMember) {
  if (winner === 'remove') {
    if (targetMember) {
      const struck = (await targetMember.roles.remove(config.highDrafterRoleId, 'Removed via high-kick votation').catch(() => null))
        || (await targetMember.roles.remove(config.trialHighPlayerRoleId, 'Removed via high-kick votation').catch(() => null));
      await targetMember.roles.add(config.lowerDrafterRoleId, 'Demoted to Lower Drafter via high-kick').catch(() => {});
      const { removeFromTrial } = require('../state/trialReviews');
      removeFromTrial(targetMember.id, false);
      await targetMember.send({
        embeds: [infoEmbed(`You have been **removed** from high draft. You are now **Lower Drafter**.${struck ? '' : ' (no eligible role was removed)'}`)]
      }).catch(() => {});
    }
    await interaction.followUp({
      embeds: [successEmbed(`✅ <@${votation.targetUserId}> has been removed from high draft and moved to **Lower Drafter**.`)],
      flags: MessageFlags.Ephemeral
    });
  } else if (winner === 'cancel') {
    await interaction.followUp({
      embeds: [infoEmbed(`🛑 Votation cancelled. <@${votation.targetUserId}> keeps their role.`)],
      flags: MessageFlags.Ephemeral
    });
  }
}