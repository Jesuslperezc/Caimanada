import { executeTransaction } from '../db.js';

const STORE_NAME = 'leagues';

export async function getAllLeagues() {
  try {
    const result = await executeTransaction(STORE_NAME, 'readonly', (tx) => {
      const store = tx.objectStore(STORE_NAME);
      return store.getAll();
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
    id: leagueData.id || `league_${Date.now()}`,
    name: leagueData.name ? leagueData.name.trim() : '',
    sport: leagueData.sport || 'Fútbol',
    season: leagueData.season ? leagueData.season.trim() : '',
    mode: leagueData.mode || 'Liga',
    durationDays: durationDays,
    description: leagueData.description ? leagueData.description.trim() : '',
    createdAt: leagueData.createdAt || now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, 
    startDate: leagueData.startDate || now.toISOString(),
    endDate: endDate.toISOString(),
    isActive: leagueData.isActive ?? isFirstLeague,
    role: leagueData.role || 'owner'
  };

  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    // Si viene con ID (es una importación), usamos put para que no fallé por duplicado
    if (leagueData.id) {
      return store.put(newLeague);
    }
    return store.add(newLeague);
  });

  if (newLeague.isActive) {
    await setActiveLeague(newLeague.id);
  }

  return newLeague;
}

export async function updateLeague(leagueData) {
  if (!leagueData || !leagueData.id) return null;

  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.put(leagueData);
  });
  return leagueData;
}

export async function setActiveLeague(leagueId) {
  const allLeagues = await getAllLeagues(); // Lo leemos primero fuera de la transacción de escritura
  
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    allLeagues.forEach((league) => {
      const shouldBeActive = (league.id === leagueId);
      if (league.isActive !== shouldBeActive) {
        league.isActive = shouldBeActive;
        store.put(league); // Disparamos los puts en la transacción
      }
    });
    return null; // No retornamos request porque son múltiples
  });
  return true;
}

export async function deleteLeague(leagueId) {
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.delete(leagueId);
  });
  return true;
}