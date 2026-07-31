import { executeTransaction } from '../db.js';

const STORE_NAME = 'teams';

export async function getTeamsByLeague(leagueId) {
  const db = await import('../db.js').then(m => m.openDB());
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('leagueId');
    const request = index.getAll(leagueId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addTeam(teamData) {
  const newTeam = {
    id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    leagueId: teamData.leagueId,
    name: teamData.name,
    delegate: teamData.delegate || '',
    players: teamData.players || [],
    createdAt: new Date().toISOString()
  };

  await executeTransaction(STORE_NAME, 'readwrite', (store) => store.add(newTeam));
  return newTeam;
}

export async function updateTeam(team) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.put(team));
}

export async function deleteTeam(teamId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.delete(teamId));
}