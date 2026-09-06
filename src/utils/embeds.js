const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getTeamName } = require('./helpers');

function registrationEmbed(draft, host) {
  const posCounts = { WS: 0, Setter: 0, DS: 0, Lib: 0 };
  draft.players.forEach(p => posCounts[p.position]++);

  const embed = new EmbedBuilder()
    .setColor(config.colors.draft)
    .setTitle(`🏐 ${draft.type.toUpperCase()} Draft #${draft.draftNumber}`)
    .setDescription(`Registration is now **OPEN**!\nHosted by ${host}`)
    .addFields(
      { name: '📋 Draft Type', value: draft.type.charAt(0).toUpperCase() + draft.type.slice(1), inline: true },
      { name: '🆔 Draft ID', value: draft.id, inline: true },
      { name: '👥 Captains', value: `${draft.captainCandidates.length}`, inline: true },
      { name: '\u200b', value: '\u200b', inline: false },
      { name: '📊 Registered Players', value: [
        `**WS (Wing Spiker):** ${posCounts.WS}`,
        `**Setter:** ${posCounts.Setter}`,
        `**DS (Defensive Specialist):** ${posCounts.DS}`,
        `**Lib (Libero):** ${posCounts.Lib}`,
        `\n**Total:** ${draft.players.length}`
      ].join('\n'), inline: false }
    )
    .setFooter({ text: 'Click the buttons below to register!' });

  if (draft.isUnlimited) {
    embed.addFields({ name: '⏰ Registration', value: '**Unlimited** - Host will start manually', inline: false });
  } else {
    embed.addFields({ name: '⏰ Registration Ends', value: `<t:${Math.floor(draft.registrationEnd / 1000)}:R>`, inline: false });
    embed.setTimestamp();
  }

  return embed;
}

function draftPickEmbed(draft) {
  const posCounts = { WS: [], Setter: [], DS: [], Lib: [] };
  draft.players.forEach(p => {
    if (!p.picked) posCounts[p.position].push(p);
  });

  const fields = Object.entries(posCounts).map(([pos, players]) => ({
    name: `${pos} (${players.length})`,
    value: players.length > 0 ? players.map(p => `<@${p.id}> (${p.username})`).join(', ') : 'None available',
    inline: true
  }));

  return new EmbedBuilder()
    .setColor(config.colors.draft)
    .setTitle(`🏐 Draft Picking Phase - ${draft.type.toUpperCase()} #${draft.draftNumber}`)
    .setDescription(`Active Captain: ${draft.currentCaptain ? `<@${draft.currentCaptain.id}>` : 'None'}\n\n**Available Players:**`)
    .addFields(fields)
    .setFooter({ text: 'Type the @mention or username of the player you want to pick.' })
    .setTimestamp();
}

function teamRosterEmbed(draft, teamNumber) {
  const team = draft.teams[teamNumber];
  const captain = team.captain;
  const players = team.players;
  const teamName = getTeamName(draft, teamNumber);

  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle(`${teamName} Roster`)
    .setDescription(`**Captain:** ${captain ? `<@${captain.id}> (${captain.position})` : 'None'}`)
    .addFields(
      players.map(p => ({
        name: p.position,
        value: `<@${p.id}>`,
        inline: true
      }))
    )
    .setTimestamp();
}

function playersListEmbed(draft) {
  const posCounts = { WS: [], Setter: [], DS: [], Lib: [] };
  draft.players.forEach(p => {
    posCounts[p.position].push(p);
  });

  const fields = Object.entries(posCounts).map(([pos, players]) => ({
    name: `${pos} (${players.length})`,
    value: players.length > 0
      ? players.map(p => `<@${p.id}> (${p.username})${p.picked ? ' ✅' : ''}`).join(', ')
      : 'None available',
    inline: true
  }));

  return new EmbedBuilder()
    .setColor(config.colors.draft)
    .setTitle(`📋 ${draft.type.toUpperCase()} Draft #${draft.draftNumber} - Registered Players`)
    .addFields(fields)
    .setFooter({ text: 'Reference list for the host - report the winning team with /winner when finished.' })
    .setTimestamp();
}

function lineupsEmbed(draft) {
  const teams = Object.entries(draft.teams)
    .filter(([, t]) => t.captain)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  const fields = teams.map(([num, team]) => {
    const players = team.players.map(p =>
      p.isCaptain
        ? `👑 Captain: <@${p.id}> (${p.position})`
        : `<@${p.id}> (${p.position})`
    );
    return {
      name: getTeamName(draft, parseInt(num)),
      value: players.join('\n'),
      inline: true
    };
  });

  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle(`🏐 ${draft.type.toUpperCase()} Draft #${draft.draftNumber} - Final Lineups`)
    .addFields(fields)
    .setTimestamp();
}

function matchEmbed(match, draftId, draft) {
  const team1Name = getTeamName(draft, match.team1.number);
  const team2Name = getTeamName(draft, match.team2.number);
  
  return new EmbedBuilder()
    .setColor(config.colors.match)
    .setTitle('🏐 Match Results')
    .setDescription(`**${team1Name}** vs **${team2Name}**`)
    .addFields(
      { name: team1Name, value: match.team1.roster.map(p => `<@${p.id}>`).join('\n'), inline: true },
      { name: 'VS', value: '\u200b', inline: true },
      { name: team2Name, value: match.team2.roster.map(p => `<@${p.id}>`).join('\n'), inline: true }
    )
    .setFooter({ text: 'Both captains must vote on the winner!' })
    .setTimestamp();
}

function winnersEmbed(tournament, draft) {
  const winningTeam = tournament.teams[tournament.winner];
  const teamName = getTeamName(draft, tournament.winner);

  return new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle(`🏆 ${draft.type.toUpperCase()} Draft #${draft.draftNumber} Winner!`)
    .setDescription(`**${teamName}** has won the tournament!`)
    .addFields(
      { name: '👥 Winning Roster', value: winningTeam.roster.map(p => `<@${p.id}> (${p.position})`).join('\n'), inline: false }
    )
    .setTimestamp();
}

function errorEmbed(message) {
  return new EmbedBuilder()
    .setColor(config.colors.danger)
    .setTitle('❌ Error')
    .setDescription(message)
    .setTimestamp();
}

function successEmbed(message) {
  return new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('✅ Success')
    .setDescription(message)
    .setTimestamp();
}

function infoEmbed(message) {
  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setDescription(message)
    .setTimestamp();
}

module.exports = {
  registrationEmbed, draftPickEmbed, teamRosterEmbed, matchEmbed,
  winnersEmbed, playersListEmbed, lineupsEmbed, errorEmbed, successEmbed, infoEmbed
};
