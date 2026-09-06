const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getSetup } = require('./helpers');

function isOwner(userId) {
  return userId === config.ownerId;
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function isDraftHost(member, draftType) {
  const setup = getSetup(member.guild.id);
  if (!setup) return false;

  const hostRoles = {
    lower: setup.hostRoles.lower,
    mixed: setup.hostRoles.mixed,
    higher: setup.hostRoles.higher
  };

  const roleId = hostRoles[draftType];
  return roleId && member.roles.cache.has(roleId);
}

function canStartDraft(member, draftType) {
  return isAdmin(member) || isDraftHost(member, draftType);
}

function isRegistered(draft, userId) {
  return draft.players.some(p => p.id === userId);
}

function isCaptain(draft, userId) {
  return draft.captains.some(c => c.id === userId);
}

function isCaptainCandidate(draft, userId) {
  return draft.captainCandidates.some(c => c.id === userId);
}

function isCaptainOfTeam(draft, userId, teamNumber) {
  const cap = draft.teams[teamNumber]?.captain;
  return cap && cap.id === userId;
}

function isOnTeam(draft, userId) {
  for (const [num, team] of Object.entries(draft.teams)) {
    if (team.captain?.id === userId) return parseInt(num);
    if (team.players.some(p => p.id === userId)) return parseInt(num);
  }
  return null;
}

module.exports = {
  isOwner, isAdmin, isDraftHost, canStartDraft,
  isRegistered, isCaptain, isCaptainCandidate, isCaptainOfTeam, isOnTeam
};
