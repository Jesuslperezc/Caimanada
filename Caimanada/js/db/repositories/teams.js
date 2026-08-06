import { executeTransaction } from '../db.js';

const STORE_NAME = 'teams';

export async function getTeamsBySport(sportId) {
  try {
    const result = await executeTransaction(STORE_NAME, 'readonly', (tx) => {
      const store = tx.objectStore(STORE_NAME);
      return store.getAll();
    });
    const allTeams = Array.isArray(result) ? result : [];
    return allTeams.filter(t => !t.sportId || t.sportId === sportId);
  } catch (error) {
    console.error('Error obteniendo equipos por deporte:', error);
    return [];
  }
}

export async function getTeamsByLeague(leagueId) {
  if (!leagueId) return [];
  try {
    const result = await executeTransaction(STORE_NAME, 'readonly', (tx) => {
      const store = tx.objectStore(STORE_NAME);
      return store.getAll();
    });
    const allTeams = Array.isArray(result) ? result : [];
    return allTeams.filter(t => t.leagueId === leagueId);
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
    createdAt: teamData.createdAt || new Date().toISOString()
  };

  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    if (teamData.id) {
      return store.put(newTeam);
    }
    return store.add(newTeam);
  });
  return newTeam;
}



export async function updateTeam(teamData) {
  if (!teamData.id) return null;
  
  // 1. Obtenemos el equipo actual para no perder sus datos
  const existing = await executeTransaction(STORE_NAME, 'readonly', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.get(teamData.id);
  });

  // 2. Fusionamos los datos nuevos con los viejos
  const updatedTeam = { ...existing, ...teamData };

  // 3. Guardamos el resultado
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.put(updatedTeam);
  });
  
  return updatedTeam;
}

export async function deleteTeam(teamId) {
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.delete(teamId);
  });
  return true;
}