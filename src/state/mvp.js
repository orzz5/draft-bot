const pendingMvps = new Map();

function setPendingMvp(draftId, data) {
  pendingMvps.set(draftId, data);
}

function getPendingMvp(draftId) {
  return pendingMvps.get(draftId);
}

function getPendingMvpByHost(hostId) {
  for (const [draftId, data] of pendingMvps) {
    if (data.hostId === hostId) return { draftId, data };
  }
  return null;
}

function deletePendingMvp(draftId) {
  pendingMvps.delete(draftId);
}

module.exports = {
  setPendingMvp, getPendingMvp, getPendingMvpByHost, deletePendingMvp
};
