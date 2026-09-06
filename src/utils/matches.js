const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createTournament } = require('../state/tournaments');
const { getSetup, getTeamName } = require('./helpers');
const { matchEmbed, lineupsEmbed } = require('./embeds');
const { scheduleSave } = require('../state/drafts');

async function setupTournamentAfterPick(draft, guild) {
  const setup = getSetup(guild.id);
  if (!setup) return;

  await sendFinalLineups(draft, guild, setup);

  const { getTournament } = require('../state/tournaments');
  let tournament = getTournament(draft.id);

  if (!tournament) {
    const teams = {};
    for (const [num, team] of Object.entries(draft.teams)) {
      if (team.captain) {
        teams[num] = {
          number: parseInt(num),
          captain: { id: team.captain.id, username: team.captain.username },
          roster: team.players
        };
      }
    }

    tournament = createTournament(draft.id, teams);
  }

  if (!tournament || tournament.matches.length === 0) return;

  const picksChannel =
    guild.channels.cache.get(draft.picksChannelId) ||
    guild.channels.cache.get(draft.announcementId);

  for (const match of tournament.matches) {
    try {
      if (match.posted) {
        const existing = match.postedMessageId && picksChannel
          ? await picksChannel.messages.fetch(match.postedMessageId).catch(() => null)
          : null;
        if (existing) continue;
      }
      match.posted = false;
      await postMatchVote(draft, match, guild, setup);
    } catch (e) {
      console.error(`Failed to post vote embed for ${match.id} of ${draft.id}:`, e);
    }
  }
}

async function sendFinalLineups(draft, guild, setup) {
  try {
    const lineupsChannel =
      guild.channels.cache.get(setup?.picksChannels?.[draft.type]) ||
      guild.channels.cache.get(draft.announcementId);
    if (!lineupsChannel) return;

    await lineupsChannel.send({ embeds: [lineupsEmbed(draft)] });
  } catch (e) {
    console.error(`Failed to send final lineups for ${draft.id}:`, e);
  }
}

async function postMatchVote(draft, match, guild, setup) {
  const picksChannel =
    guild.channels.cache.get(draft.picksChannelId) ||
    guild.channels.cache.get(draft.announcementId);
  if (!picksChannel) return;

  const team1Name = getTeamName(draft, match.team1.number);
  const team2Name = getTeamName(draft, match.team2.number);

  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vote_team1_${match.id}_${draft.id}`)
      .setLabel(team1Name)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`vote_team2_${match.id}_${draft.id}`)
      .setLabel(team2Name)
      .setStyle(ButtonStyle.Danger)
  );

  const voteMsg = await picksChannel.send({
    embeds: [matchEmbed(match, draft.id, draft)],
    components: [voteRow]
  });

  match.posted = true;
  match.postedMessageId = voteMsg.id;
  scheduleSave();
}

async function cleanupDraftAfterCompletion(draft, guild) {
  const setup = getSetup(guild.id);

  for (const [num, team] of Object.entries(draft.teams)) {
    if (team.captain) {
      const capRoleId = setup?.captainRoles?.[draft.type]?.[num];
      if (capRoleId) {
        const member = await guild.members.fetch(team.captain.id).catch(() => null);
        if (member) await member.roles.remove(capRoleId).catch(() => {});
      }
    }
  }

  if (draft.picksChannelId) {
    const pickCh = guild.channels.cache.get(draft.picksChannelId);
    if (pickCh) await pickCh.delete().catch(() => {});
  }

  for (const catId of draft.categories || []) {
    const category = guild.channels.cache.get(catId);
    if (category) {
      for (const [, ch] of category.children.cache) {
        await ch.delete().catch(() => {});
      }
      await category.delete().catch(() => {});
    }
  }

  const { getTournament } = require('../state/tournaments');
  const tournament = getTournament(draft.id);
  if (tournament) {
    for (const match of tournament.matches) {
      for (const chId of match.channels || []) {
        const ch = guild.channels.cache.get(chId);
        if (ch) await ch.delete().catch(() => {});
      }
    }
    for (const chId of tournament.finals?.channels || []) {
      const ch = guild.channels.cache.get(chId);
      if (ch) await ch.delete().catch(() => {});
    }
  }
}

module.exports = { setupTournamentAfterPick, cleanupDraftAfterCompletion };