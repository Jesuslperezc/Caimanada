import { executeTransaction } from '../db.js';

const STORE_NAME = 'teams';

export async function getTeamsByLeague(leagueId) {
  return executeTransaction(STORE_NAME, 'readonly', (store) => {
    const index = store.index('leagueId');
    return index.getAll(leagueId);
  });
}

export async function getAllUniqueClubs() {
  const allTeams = await executeTransaction(STORE_NAME, 'readonly', (store) => store.getAll());
  const uniqueClubsMap = new Map();

  allTeams.forEach(team => {
    if (team.clubId && !uniqueClubsMap.has(team.clubId)) {
      uniqueClubsMap.set(team.clubId, {
        clubId: team.clubId,
        name: team.name,
        delegate: team.delegate || '',
        phone: team.phone || ''
      });
    }
  });

  return Array.from(uniqueClubsMap.values());
}

export async function addTeam(teamData) {
  const gf = Number(teamData.stats?.gf) || 0;
  const gc = Number(teamData.stats?.gc) || 0;

  const newTeam = {
    id: `team_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    leagueId: teamData.leagueId,
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
  // Recalcular siempre la diferencia de goles al actualizar
  if (team.stats) {
    team.stats.df = (Number(team.stats.gf) || 0) - (Number(team.stats.gc) || 0);
  }
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.put(team));
}

export async function deleteTeam(teamId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.delete(teamId));
}

export async function bulkAddTeams(teamsList) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    teamsList.forEach(teamData => {
      const gf = Number(teamData.stats?.gf) || 0;
      const gc = Number(teamData.stats?.gc) || 0;

      const team = {
        id: `team_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        leagueId: teamData.leagueId,
        clubId: teamData.clubId || `club_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: teamData.name,
        delegate: teamData.delegate || '',
        phone: teamData.phone || '',
        players: teamData.players || [],
        stats: {
          pj: 0, pg: 0, pe: 0, pp: 0, gf: gf, gc: gc, df: gf - gc, pts: 0
        },
        createdAt: new Date().toISOString()
      };
      store.add(team);
    });
  });
}