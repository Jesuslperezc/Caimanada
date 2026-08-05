import { executeTransaction } from '../db.js';

const STORE_NAME = 'teams';

// Obtener equipos asociados a un deporte en específico
export async function getTeamsBySport(sportId) {
  return executeTransaction(STORE_NAME, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      // Si tienes un índice por sportId configurado en IndexedDB
      if (store.indexNames.contains('sportId')) {
        const index = store.index('sportId');
        const request = index.getAll(sportId);
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(e.target.error);
      } else {
        // Fallback: Traer todos los registros y filtrar en memoria
        const request = store.getAll();

        request.onsuccess = () => {
          const allTeams = request.result || [];
          const filtered = allTeams.filter(t => t.sportId === sportId);
          resolve(filtered);
        };
        
        request.onerror = (e) => reject(e.target.error);
      }
    });
  });
}
export async function getTeamsByLeague(leagueId) {
  return executeTransaction(STORE_NAME, 'readonly', (store) => {
    const index = store.index('leagueId');
    return index.getAll(leagueId);
  });
}

export async function addTeam(teamData) {
  const gf = Number(teamData.stats?.gf) || 0;
  const gc = Number(teamData.stats?.gc) || 0;

  const newTeam = {
    id: `team_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sportId: teamData.sportId || 'futbol_sala', // Asocia el equipo al deporte global
    leagueId: teamData.leagueId || null,        // Opcional: Puede ser null hasta que se inscriba mediante QR/Torneo
    clubId: teamData.clubId || `club_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: teamData.name,
    delegate: teamData.delegate || '',
    phone: teamData.phone || '',
    players: teamData.players || [],
    stats: {
      pj: Number(teamData.stats?.pj) || 0,
      pg: Number(teamData.stats?.pg) || 0,
      pe: Number(teamData.stats?.pe) || 0,
      pp: Number(teamData.stats?.pp) || 0,
      gf: gf,
      gc: gc,
      df: gf - gc,
      pts: Number(teamData.stats?.pts) || 0
    },
    createdAt: new Date().toISOString()
  };

  await executeTransaction(STORE_NAME, 'readwrite', (store) => store.add(newTeam));
  return newTeam;
}

export async function updateTeam(team) {
  if (team.stats) {
    team.stats.df = (Number(team.stats.gf) || 0) - (Number(team.stats.gc) || 0);
  }
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.put(team));
}

export async function deleteTeam(teamId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.delete(teamId));
}