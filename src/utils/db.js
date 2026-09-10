const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'bot.db');

let db = null;

function initDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  return db;
}

function getDb() {
  if (!db) initDatabase();
  return db;
}

function loadAll() {
  const d = getDb();
  const rows = d.prepare('SELECT key, value FROM kv').all();
  const data = {};
  for (const row of rows) {
    try {
      data[row.key] = JSON.parse(row.value);
    } catch {
      data[row.key] = row.value;
    }
  }
  return data;
}

function saveAll(data) {
  const d = getDb();
  const upsert = d.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const deleteKey = d.prepare('DELETE FROM kv WHERE key = ?');

  const existing = new Set(
    d.prepare('SELECT key FROM kv').all().map(r => r.key)
  );

  const transaction = d.transaction(() => {
    for (const [key, value] of Object.entries(data)) {
      upsert.run(key, JSON.stringify(value));
      existing.delete(key);
    }
    for (const leftover of existing) {
      deleteKey.run(leftover);
    }
  });

  transaction();
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDatabase, getDb, loadAll, saveAll, closeDatabase };
