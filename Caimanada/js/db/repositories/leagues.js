import { executeTransaction } from '../db.js';

const STORE_NAME = 'leagues';

export async function getAllLeagues() {
  return executeTransaction(STORE_NAME, 'readonly', (store) => store.getAll());
}

export async function getActiveLeague() {
  const allLeagues = await getAllLeagues();
  const active = allLeagues.find(league => league.isActive === true);
  return active || null;
}

export async function createLeague(leagueData) {
  const newLeague = {
    id: `league_${Date.now()}`,
    name: leagueData.name,
    sport: leagueData.sport || 'Fútbol',
    mode: leagueData.mode || 'Todos contra todos',
    createdAt: new Date().toISOString(),
    isActive: leagueData.isActive ?? false
  };

  await executeTransaction(STORE_NAME, 'readwrite', (store) => store.add(newLeague));

  if (newLeague.isActive) {
    await setActiveLeague(newLeague.id);
  }

  return newLeague;
}

export async function setActiveLeague(leagueId) {
  const leagues = await getAllLeagues();

  for (const league of leagues) {
    league.isActive = (league.id === leagueId);
    await executeTransaction(STORE_NAME, 'readwrite', (store) => store.put(league));
  }
}

export async function deleteLeague(leagueId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.delete(leagueId));
}