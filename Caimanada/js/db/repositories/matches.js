import { executeTransaction } from '../db.js';

const STORE_NAME = 'matches';

export async function getMatchesByLeague(leagueId) {
  if (!leagueId) return [];
  try {
    const matches = await executeTransaction(STORE_NAME, 'readonly', (tx) => {
      const store = tx.objectStore(STORE_NAME);
      return store.getAll();
    });
    
    if (!Array.isArray(matches)) return [];
    return matches.filter(m => m.leagueId === leagueId);
  } catch (error) {
    console.error('Error al obtener partidos por liga:', error);
    return [];
  }
}

export async function saveMatchResult(matchId, scoreHome, scoreAway) {
  // Primero obtenemos el partido en una transacción de lectura
  const match = await executeTransaction(STORE_NAME, 'readonly', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.get(matchId);
  });

  if (!match) return null;

  // Luego lo actualizamos en una transacción de escritura
  match.scoreHome = Number(scoreHome);
  match.scoreAway = Number(scoreAway);
  match.status = 'completed';
  match.updatedAt = new Date().toISOString();

  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.put(match);
  });
  
  return match;
}

export async function bulkInsertMatches(matchesList) {
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    matchesList.forEach(match => {
      const newMatch = {
        id: match.id || `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        leagueId: match.leagueId,
        round: match.round || 1,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        scoreHome: match.scoreHome ?? null,
        scoreAway: match.scoreAway ?? null,
        status: match.status || 'pending',
        date: match.date || null
      };
      store.add(newMatch); // Se disparan todos en la misma transacción
    });
    return null;
  });
  return true;
}

export async function deleteMatchesByLeague(leagueId) {
  const matches = await getMatchesByLeague(leagueId);
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    matches.forEach(match => store.delete(match.id));
    return null;
  });
  return true;
}
export async function bulkInsertFullMatches(matchesList) {
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    matchesList.forEach(match => {
      const newMatch = {
        id: match.id || `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        leagueId: match.leagueId,
        round: match.round || 1,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        scoreHome: match.scoreHome ?? null,
        scoreAway: match.scoreAway ?? null,
        status: match.status || 'pending',
        date: match.date || null
      };
      store.put(newMatch); // <--- CAMBIADO A put
    });
    return null;
  });
  return true;
}
export async function updateMatch(matchData) {
  if (!matchData || !matchData.id) return null;
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.put(matchData);
  });
  return matchData;
}

export async function deleteMatch(matchId) {
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.delete(matchId);
  });
  return true;
}