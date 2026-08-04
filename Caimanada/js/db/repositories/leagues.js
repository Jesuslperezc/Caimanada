import { executeTransaction } from '../db.js';

const STORE_NAME = 'leagues';

export async function getAllLeagues() {
  return executeTransaction(STORE_NAME, 'readonly', (store) => store.getAll());
}

export async function getActiveLeague() {
  const allLeagues = await getAllLeagues();
  return allLeagues.find(league => league.isActive === true) || null;
}

export async function createLeague(leagueData) {
  const allLeagues = await getAllLeagues();
  const isFirstLeague = allLeagues.length === 0;

  const newLeague = {
    id: `league_${Date.now()}`,
    name: leagueData.name,
    sport: leagueData.sport || 'Fútbol',
    mode: leagueData.mode || 'Liga',
    createdAt: new Date().toISOString(),
    isActive: leagueData.isActive ?? isFirstLeague
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
    const shouldBeActive = (league.id === leagueId);
    if (league.isActive !== shouldBeActive) {
      league.isActive = shouldBeActive;
      await executeTransaction(STORE_NAME, 'readwrite', (store) => store.put(league));
    }
  }
}

export async function deleteLeague(leagueId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.delete(leagueId));
}