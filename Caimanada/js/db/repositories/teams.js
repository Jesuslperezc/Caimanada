import { executeTransaction } from '../db.js';

const STORE_NAME = 'teams';

export async function getTeamsByLeague(leagueId) {
  const db = await import('../db.js').then(m => m.openDB());
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('leagueId');
    const request = index.getAll(leagueId);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Obtiene todos los clubes unicos creados en el sistema para sugerirlos al registrar
export async function getAllUniqueClubs() {
  const allTeams = await executeTransaction(STORE_NAME, 'readonly', (store) => store.getAll());
  const uniqueClubsMap = new Map();

  allTeams.forEach(team => {
    if (team.clubId && !uniqueClubsMap.has(team.clubId)) {
      uniqueClubsMap.set(team.clubId, {
        clubId: team.clubId,
        name: team.name,
        delegate: team.delegate,
        phone: team.phone || ''
      });
    }
  });

  return Array.from(uniqueClubsMap.values());
}

export async function addTeam(teamData) {
  const newTeam = {
    id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    leagueId: teamData.leagueId,
    // Si no viene un clubId existente, creamos uno nuevo identificador de club
    clubId: teamData.clubId || `club_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: teamData.name,
    delegate: teamData.delegate || '',
    phone: teamData.phone || '',
    players: teamData.players || [],
    stats: teamData.stats || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, df: 0, pts: 0 },
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