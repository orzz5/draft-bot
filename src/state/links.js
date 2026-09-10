const { loadDatabase, saveDatabase } = require('./persistence');

// discordId -> { discordId, username, robloxId, displayName, avatarUrl, linkedAt }
const links = {};

let _saveTimer = null;

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(persistLinks, 1000);
}

function persistLinks() {
  const data = loadDatabase();
  data.robloxLinks = { ...links };
  saveDatabase(data);
}

function loadLinksFromDisk() {
  const data = loadDatabase();
  if (data.robloxLinks) {
    for (const [id, entry] of Object.entries(data.robloxLinks)) {
      if (entry && entry.discordId) links[String(id)] = entry;
    }
  }
  return links;
}

function getLink(discordId) {
  return links[String(discordId)] || null;
}

function setLink(entry) {
  const id = String(entry.discordId);
  links[id] = {
    discordId: id,
    username: entry.username,
    robloxId: entry.robloxId,
    displayName: entry.displayName || entry.username || '',
    avatarUrl: entry.avatarUrl || '',
    linkedAt: Date.now()
  };
  scheduleSave();
  return links[id];
}

function deleteLink(discordId) {
  delete links[String(discordId)];
  scheduleSave();
}

module.exports = {
  links, getLink, setLink, deleteLink, persistLinks, loadLinksFromDisk, scheduleSave
};