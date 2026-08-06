import { executeTransaction } from '../db.js';

const STORE_NAME = 'matches';

export async function getMatchesByLeague(leagueId) {
  if (!leagueId) return [];
  try {
    const matches = await executeTransaction(STORE_NAME, 'readonly', (store) => {
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
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const getRequest = store.get(matchId);
      
      getRequest.onsuccess = () => {
        const match = getRequest.result;
        if (!match) return resolve(null);

        match.scoreHome = Number(scoreHome);
        match.scoreAway = Number(scoreAway);
        match.status = 'completed';
        match.updatedAt = new Date().toISOString();

        const putReq = store.put(match);
        putReq.onsuccess = () => resolve(match);
        putReq.onerror = (e) => reject(e.target.error);
      };

      getRequest.onerror = (e) => reject(e.target.error);
    });
  });
}

export async function bulkInsertMatches(matchesList) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
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
      store.add(newMatch);
    });
  });
}

export async function deleteMatchesByLeague(leagueId) {
  const matches = await getMatchesByLeague(leagueId);
  for (const match of matches) {
    await executeTransaction(STORE_NAME, 'readwrite', (store) => store.delete(match.id));
  }
}