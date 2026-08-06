import { executeTransaction } from '../db.js';

const STORE_NAME = 'teams';

export async function getTeamsBySport(sportId) {
  try {
    const result = await executeTransaction(STORE_NAME, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const allTeams = request.result || [];
          // Filtra por deporte o los que no tengan deporte asignado aún
          const filtered = allTeams.filter(t => !t.sportId || t.sportId === sportId);
          resolve(filtered);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error obteniendo equipos por deporte:', error);
    return [];
  }
}

export async function getTeamsByLeague(leagueId) {
  if (!leagueId) return [];
  try {
    const result = await executeTransaction(STORE_NAME, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const allTeams = request.result || [];
          resolve(allTeams.filter(t => t.leagueId === leagueId));
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error obteniendo equipos por liga:', error);
    return [];
  }
}

export async function addTeam(teamData) {
  const newTeam = {
    id: teamData.id || (crypto.randomUUID ? crypto.randomUUID() : `team_${Date.now()}`),
    name: teamData.name,
    delegate: teamData.delegate || '',
    sportId: teamData.sportId || 'futbol_sala',
    leagueId: teamData.leagueId || null,
    color: teamData.color || '#3b82f6',
    createdAt: new Date().toISOString()
  };

  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.add(newTeam);
      request.onsuccess = () => resolve(newTeam);
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

export async function updateTeam(teamData) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.put(teamData);
      request.onsuccess = () => resolve(teamData);
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

export async function deleteTeam(teamId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(teamId);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  });
}