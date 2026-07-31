import { executeTransaction } from '../db.js';

const STORE_NAME = 'matches';

export async function getMatchesByLeague(leagueId) {
  const db = await import('../db.js').then(m => m.openDB());
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('leagueId');
    const request = index.getAll(leagueId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMatchResult(matchId, scoreHome, scoreAway) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => {
    const getRequest = store.get(matchId);
    
    getRequest.onsuccess = () => {
      const match = getRequest.result;
      if (!match) return;

      match.scoreHome = Number(scoreHome);
      match.scoreAway = Number(scoreAway);
      match.status = 'completed';
      match.updatedAt = new Date().toISOString();

      store.put(match);
    };
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