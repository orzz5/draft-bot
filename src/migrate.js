const fs = require('fs');
const path = require('path');
const { initDatabase, saveAll, closeDatabase } = require('../src/utils/db');

const DATA_DIR = path.join(__dirname, '..', 'data');

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
  }
  return {};
}

function migrate() {
  console.log('Starting migration from JSON to SQLite...\n');

  const dbFile = path.join(DATA_DIR, 'bot.db');
  const dbJson = path.join(DATA_DIR, 'database.json');
  const setupJson = path.join(DATA_DIR, 'setup.json');

  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
    console.log('Removed existing bot.db');
  }

  initDatabase();

  const dbData = readJson(dbJson);
  const setupData = readJson(setupJson);

  const allData = { ...dbData, setup: setupData };

  const keys = Object.keys(allData);
  console.log(`Found ${keys.length} top-level keys to migrate:`);
  for (const key of keys) {
    const val = allData[key];
    const size = JSON.stringify(val).length;
    const type = Array.isArray(val) ? 'array' : typeof val === 'object' ? 'object' : typeof val;
    console.log(`  ${key}: ${type} (${size} bytes)`);
  }

  saveAll(allData);

  console.log('\nMigration complete!');

  closeDatabase();

  console.log('Verifying migration...');
  const { initDatabase: initDb2, loadAll: loadAll2, closeDatabase: close2 } = require('../src/utils/db');
  initDb2();
  const verifyData = loadAll2();
  close2();

  const verifyKeys = Object.keys(verifyData);
  console.log(`Verification: found ${verifyKeys.length} keys in SQLite`);
  for (const key of verifyKeys) {
    const orig = JSON.stringify(allData[key]).length;
    const stored = JSON.stringify(verifyData[key]).length;
    const match = orig === stored ? 'OK' : 'MISMATCH';
    console.log(`  ${key}: ${match} (orig: ${orig}, stored: ${stored})`);
  }

  console.log('\nDone! You can now remove database.json and setup.json.');
}

migrate();
