const fs = require('fs');
const path = require('path');
const { loadDatabase, saveDatabase } = require('../state/persistence');

const VERIFICATION_KEY = 'verificationMessages';

function getVerificationMessages() {
  const data = loadDatabase();
  return Array.isArray(data[VERIFICATION_KEY]) ? data[VERIFICATION_KEY] : [];
}

function addVerificationMessage(messageId) {
  const data = loadDatabase();
  if (!Array.isArray(data[VERIFICATION_KEY])) data[VERIFICATION_KEY] = [];
  if (!data[VERIFICATION_KEY].includes(messageId)) {
    data[VERIFICATION_KEY].push(messageId);
    saveDatabase(data);
  }
}

function removeVerificationMessage(messageId) {
  const data = loadDatabase();
  if (!Array.isArray(data[VERIFICATION_KEY])) return;
  data[VERIFICATION_KEY] = data[VERIFICATION_KEY].filter(id => id !== messageId);
  saveDatabase(data);
}

function isVerificationMessage(messageId) {
  return getVerificationMessages().includes(messageId);
}

const VERIFIED_USERS_KEY = 'verifiedUsers';

function getVerifiedUsers(userId = null) {
  const data = loadDatabase();
  const list = Array.isArray(data[VERIFIED_USERS_KEY]) ? data[VERIFIED_USERS_KEY] : [];
  if (userId === null) return list;
  return list.find(u => u.id === userId) || null;
}

function addVerifiedUser(userId, guildId) {
  const data = loadDatabase();
  if (!Array.isArray(data[VERIFIED_USERS_KEY])) data[VERIFIED_USERS_KEY] = [];
  if (!data[VERIFIED_USERS_KEY].some(u => u.id === userId)) {
    data[VERIFIED_USERS_KEY].push({ id: userId, guildId, verifiedAt: Date.now() });
    saveDatabase(data);
  }
}

module.exports = {
  getVerificationMessages,
  addVerificationMessage,
  removeVerificationMessage,
  isVerificationMessage,
  getVerifiedUsers,
  addVerifiedUser
};