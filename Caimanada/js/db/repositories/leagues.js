import { executeTransaction } from '../db.js';

const STORE_NAME = 'leagues';

export { executeTransaction };

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

  const now = new Date();
  const durationDays = Number(leagueData.durationDays) || 7; 
  const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const newLeague = {
    id: `league_${Date.now()}`,
    name: leagueData.name ? leagueData.name.trim() : '',
    sport: leagueData.sport || 'Fútbol',
    season: leagueData.season ? leagueData.season.trim() : '',
    mode: leagueData.mode || 'Liga',
    durationDays: durationDays,
    description: leagueData.description ? leagueData.description.trim() : '',
    createdAt: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, 
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    isActive: leagueData.isActive ?? isFirstLeague
  };

  await executeTransaction(STORE_NAME, 'readwrite', (store) => store.add(newLeague));

  if (newLeague.isActive) {
    await setActiveLeague(newLeague.id);
  }

  return newLeague;
}


export async function updateLeague(leagueData) {
  if (!leagueData || !leagueData.id) return null;

  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return store.put(leagueData);
  });
}

export async function setActiveLeague(leagueId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    const request = store.getAll();
    
    request.onsuccess = () => {
      const leagues = request.result || [];
      leagues.forEach((league) => {
        const shouldBeActive = (league.id === leagueId);
        if (league.isActive !== shouldBeActive) {
          league.isActive = shouldBeActive;
          store.put(league); 
        }
      });
    };
  });
}

export async function deleteLeague(leagueId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.delete(leagueId));
}