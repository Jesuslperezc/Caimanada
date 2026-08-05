import { executeTransaction } from '../db.js';

const STORE_NAME = 'players';

export async function getPlayersByTeam(teamId) {
  return executeTransaction(STORE_NAME, 'readonly', (store) => {
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

  await executeTransaction(STORE_NAME, 'readwrite', (store) => store.add(newPlayer));
  return newPlayer;
}

export async function updatePlayer(playerData) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.put(playerData));
}

export async function deletePlayer(playerId) {
  return executeTransaction(STORE_NAME, 'readwrite', (store) => store.delete(playerId));
}