const config = require('../config');
const { loadDatabase, saveDatabase } = require('../state/persistence');

const blacklists = new Map();
let _client = null;

function setClient(client) {
  _client = client;
}

function parseTime(input) {
  if (!input) return null;
  const str = String(input).trim().toLowerCase();
  const match = str.match(/^(\d+(?:\.\d+)?)(min|m|h|d)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];
  let ms;
  if (unit === 'min' || unit === 'm') ms = value * 60 * 1000;
  else if (unit === 'h') ms = value * 60 * 60 * 1000;
  else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;

  if (!ms || ms <= 0) return null;
  return ms;
}

function isBlacklisted(userId) {
  const entry = blacklists.get(userId);
  if (entry && entry.expiresAt > Date.now()) return true;
  if (entry && entry.expiresAt <= Date.now()) {
    blacklists.delete(userId);
  }
  return false;
}

function memberHasBlacklistRole(member) {
  return config.blacklistRoleId && member?.roles?.cache?.has(config.blacklistRoleId);
}

function isMemberBlocked(member, userId) {
  return isBlacklisted(userId) || memberHasBlacklistRole(member);
}

async function applyBlacklist(userId, username, by, reason, durationMs) {
  const expiresAt = Date.now() + durationMs;
  const hostId = by;

  blacklists.set(userId, {
    userId,
    username,
    hostId,
    by,
    reason,
    expiresAt
  });
  persist();

  const guild = _client?.guilds?.cache?.get(config.guildId);
  if (guild) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && config.blacklistRoleId) {
      await member.roles.add(config.blacklistRoleId, `Blacklisted until ${new Date(expiresAt).toISOString()}`).catch(() => {});
    }
  }

  scheduleRemoval(userId, durationMs);
}

function scheduleRemoval(userId, delayMs) {
  const MAX_TIMEOUT = 2147483647;
  const tick = () => {
    const entry = blacklists.get(userId);
    if (!entry) return;
    if (entry.expiresAt > Date.now()) {
      const remaining = Math.min(entry.expiresAt - Date.now(), MAX_TIMEOUT);
      setTimeout(tick, remaining);
      return;
    }

    blacklists.delete(userId);
    persist();

    const guild = _client?.guilds?.cache?.get(config.guildId);
    if (guild) {
      guild.members.fetch(userId).then(member => {
        if (member && config.blacklistRoleId) {
          return member.roles.remove(config.blacklistRoleId, 'Blacklist expired').catch(() => {});
        }
      }).catch(() => {});
    }
  };

  tick();
}

function persist() {
  const data = loadDatabase();
  const serialized = {};
  for (const [id, entry] of blacklists) {
    serialized[id] = entry;
  }
  data.blacklists = serialized;
  saveDatabase(data);
}

function loadBlacklistsFromDisk() {
  const data = loadDatabase();
  if (data.blacklists) {
    const now = Date.now();
    for (const [id, entry] of Object.entries(data.blacklists)) {
      if (entry.expiresAt > now) {
        if (entry.userId && !isBlacklisted(entry.userId)) {
          blacklists.set(id, entry);
        }
        scheduleRemoval(id, entry.expiresAt - now);
      } else {
        const guild = _client?.guilds?.cache?.get(config.guildId);
        if (guild) {
          guild.members.fetch(id).then(member => {
            if (member && config.blacklistRoleId) member.roles.remove(config.blacklistRoleId, 'Blacklist expired').catch(() => {});
          }).catch(() => {});
        }
      }
    }
  }
  return blacklists;
}

async function unblacklist(userId) {
  const existed = blacklists.has(userId);
  blacklists.delete(userId);
  persist();

  const guild = _client?.guilds?.cache?.get(config.guildId);
  if (guild) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && config.blacklistRoleId) {
      await member.roles.remove(config.blacklistRoleId, 'Unblacklisted').catch(() => {});
    }
  }

  return existed;
}

module.exports = {
  setClient, parseTime, isBlacklisted, memberHasBlacklistRole,
  isMemberBlocked, applyBlacklist, unblacklist, loadBlacklistsFromDisk, blacklists
};
