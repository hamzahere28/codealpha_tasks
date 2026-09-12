const fs = require('node:fs');
const path = require('node:path');
const seed = require('./data/seed.json');
const versions = new WeakMap();
const localFile = process.env.SOCIAL_DB_FILE || path.join(__dirname, 'data', 'db.json');

function cloudStore() {
  const { getStore } = require('@netlify/blobs');
  return getStore({ name: 'codealpha-social-data', consistency: 'strong' });
}

async function readDb() {
  if (process.env.SOCIAL_STORAGE !== 'netlify') {
    if (!fs.existsSync(localFile)) fs.writeFileSync(localFile, JSON.stringify(seed, null, 2));
    return JSON.parse(fs.readFileSync(localFile, 'utf8'));
  }
  const store = cloudStore();
  let entry = await store.getWithMetadata('community', { type: 'json' });
  if (!entry) {
    await store.setJSON('community', structuredClone(seed), { onlyIfNew: true });
    entry = await store.getWithMetadata('community', { type: 'json' });
  }
  if (!entry?.data || !entry.etag) throw new Error('Community storage unavailable');
  versions.set(entry.data, entry.etag);
  return entry.data;
}

async function writeDb(db) {
  if (process.env.SOCIAL_STORAGE !== 'netlify') {
    fs.writeFileSync(localFile, JSON.stringify(db, null, 2));
    return;
  }
  const etag = versions.get(db);
  if (!etag) throw new Error('Missing storage version');
  const result = await cloudStore().setJSON('community', db, { onlyIfMatch: etag });
  if (!result.modified) {
    const error = new Error('The community was updated at the same time. Please try your action again.');
    error.statusCode = 409;
    throw error;
  }
  versions.set(db, result.etag);
}

module.exports = { readDb, writeDb };
