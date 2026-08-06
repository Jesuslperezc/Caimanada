import { executeTransaction } from '../db.js';

const STORE_NAME = 'players';

export async function getPlayersByTeam(teamId) {
  return executeTransaction(STORE_NAME, 'readonly', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('teamId');
    return index.getAll(teamId);
  });
}

export async function addPlayer(playerData) {
  const newPlayer = {
    id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    teamId: playerData.teamId,
    name: playerData.name.trim(),
    number: Number(playerData.number) || 0,
    position: playerData.position || 'Jugador',
    dni: playerData.dni ? playerData.dni.trim() : '',
    createdAt: new Date().toISOString()
  };

  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.add(newPlayer);
  });
  return newPlayer;
}

export async function updatePlayer(playerData) {
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.put(playerData);
  });
  return playerData;
}

export async function deletePlayer(playerId) {
  await executeTransaction(STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_NAME);
    return store.delete(playerId);
  });
  return true;
}