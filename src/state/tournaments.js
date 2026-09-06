const { Collection } = require('discord.js');
const { loadDatabase, saveDatabase } = require('./persistence');

const tournaments = new Collection();

let _saveTimer = null;

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(persistTournaments, 1000);
}

function persistTournaments() {
  const data = loadDatabase();
  const serialized = {};
  for (const [id, tournament] of tournaments) {
    serialized[id] = { ...tournament };
  }
  data.tournaments = serialized;
  saveDatabase(data);
}

function loadTournamentsFromDisk() {
  const data = loadDatabase();
  if (data.tournaments) {
    for (const [id, tData] of Object.entries(data.tournaments)) {
      tournaments.set(id, tData);
    }
  }
  return tournaments;
}

function createTournament(draftId, teams) {
  const tournament = {
    draftId,
    teams,
    matches: [],
    finals: null,
    winner: null,
    stage: 'quarterfinals'
  };

  const teamIds = Object.keys(teams);

  if (teamIds.length === 4) {
    tournament.matches = [
      { id: 'm1', team1: teams[teamIds[0]], team2: teams[teamIds[1]], winner: null, status: 'pending', channels: [], votes: {} },
      { id: 'm2', team1: teams[teamIds[2]], team2: teams[teamIds[3]], winner: null, status: 'pending', channels: [], votes: {} }
    ];
    tournament.finals = { id: 'final', team1: null, team2: null, winner: null, status: 'pending', channels: [], votes: {} };
  } else if (teamIds.length === 2) {
    tournament.matches = [
      { id: 'final', team1: teams[teamIds[0]], team2: teams[teamIds[1]], winner: null, status: 'pending', channels: [], votes: {} }
    ];
    tournament.stage = 'finals';
  }

  tournaments.set(draftId, tournament);
  scheduleSave();
  return tournament;
}

function getTournament(draftId) {
  return tournaments.get(draftId);
}

function reportMatchWinner(draftId, matchId, winningTeamNumber) {
  const tournament = tournaments.get(draftId);
  if (!tournament) return null;

  const match = tournament.matches.find(m => m.id === matchId);
  if (!match) return null;

  match.winner = winningTeamNumber;
  match.status = 'completed';

  const losingTeamNumber = match.team1.number === winningTeamNumber ? match.team2.number : match.team1.number;

  if (matchId === 'm1' || matchId === 'm2') {
    const otherMatch = tournament.matches.find(m => m.id !== matchId && m.status === 'completed');
    if (otherMatch) {
      tournament.finals.team1 = { number: match.winner, roster: match.winner === match.team1.number ? match.team1.roster : match.team2.roster };
      tournament.finals.team2 = { number: otherMatch.winner, roster: otherMatch.winner === otherMatch.team1.number ? otherMatch.team1.roster : otherMatch.team2.roster };
      tournament.finals.status = 'ready';
      tournament.stage = 'finals';
    } else {
      tournament.stage = 'semifinals-pending';
    }
  }

  if (matchId === 'final') {
    tournament.winner = winningTeamNumber;
    tournament.stage = 'completed';
  }

  scheduleSave();
  return { tournament, losingTeamNumber };
}

function deleteTournament(draftId) {
  tournaments.delete(draftId);
  scheduleSave();
}

module.exports = {
  tournaments, createTournament, getTournament, reportMatchWinner,
  deleteTournament, loadTournamentsFromDisk, persistTournaments, scheduleSave
};
