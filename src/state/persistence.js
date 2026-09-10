const { initDatabase, loadAll, saveAll, closeDatabase } = require('../utils/db');

let initialized = false;

function ensureInit() {
  if (!initialized) {
    initDatabase();
    initialized = true;
  }
}

function loadDatabase() {
  ensureInit();
  return loadAll();
}

function saveDatabase(data) {
  ensureInit();
  saveAll(data);
}

module.exports = { loadDatabase, saveDatabase, closeDatabase };
