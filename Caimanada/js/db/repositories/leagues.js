import { executeTransaction } from '../db.js';

const STORE_NAME = 'leagues';

export { executeTransaction };

export async function getAllLeagues() {
  try {
    const result = await executeTransaction(STORE_NAME, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(e.target.error);
      });
    });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error en getAllLeagues:', error);
    return [];
  }
}

export async function getActiveLeague() {
  const allLeagues = await getAllLeagues();
  if (!Array.isArray(allLeagues) || allLeagues.length === 0) return null;
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

  await executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.add(newLeague);
      request.onsuccess = () => resolve(newLeague);
      request.onerror = (e) => reject(e.target.error);
    });
  });

  if (newLeague.isActive) {
    await setActiveLeague(newLeague.id);
  }

  return newLeague;
}

export async function updateLeague(leagueData) {
  if (!leagueData || !leagueData.id) return null;

  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.put(leagueData);
      request.onsuccess = () => resolve(leagueData);
      request.onerror = (e) => reject(e.target.error);
    });
  });
}

export async function setActiveLeague(leagueId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onsuccess = () => {
        const leagues = request.result || [];
        const putPromises = leagues.map((league) => {
          const shouldBeActive = (league.id === leagueId);
          if (league.isActive !== shouldBeActive) {
            league.isActive = shouldBeActive;
            return store.put(league);
          }
          return null;
        });
        resolve(putPromises);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  });
}

export async function deleteLeague(leagueId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(leagueId);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  });
}