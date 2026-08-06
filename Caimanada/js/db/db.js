const DB_NAME = 'caimanada_db';
const DB_VERSION = 3;

let dbInstance = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('leagues')) {
        const leaguesStore = db.createObjectStore('leagues', { keyPath: 'id' });
        leaguesStore.createIndex('isActive', 'isActive', { unique: false });
        leaguesStore.createIndex('name', 'name', { unique: false }); // Índice exigido
      }

      let teamsStore;
      if (!db.objectStoreNames.contains('teams')) {
        teamsStore = db.createObjectStore('teams', { keyPath: 'id' });
      } else {
        teamsStore = event.target.transaction.objectStore('teams');
      }

      if (!teamsStore.indexNames.contains('leagueId')) {
        teamsStore.createIndex('leagueId', 'leagueId', { unique: false });
        teamsStore.createIndex('name', 'name', { unique: false }); // Índice exigido
      }

      if (!db.objectStoreNames.contains('players')) {
        const playersStore = db.createObjectStore('players', { keyPath: 'id' });
        playersStore.createIndex('teamId', 'teamId', { unique: false });
        playersStore.createIndex('name', 'name', { unique: false }); // Índice exigido
      }
      if (!teamsStore.indexNames.contains('sportId')) {
        teamsStore.createIndex('sportId', 'sportId', { unique: false });
      }

      if (!db.objectStoreNames.contains('matches')) {
        const matchesStore = db.createObjectStore('matches', { keyPath: 'id' });
        matchesStore.createIndex('leagueId', 'leagueId', { unique: false });
        matchesStore.createIndex('homeTeamId', 'homeTeamId', { unique: false }); // Índice exigido
        matchesStore.createIndex('awayTeamId', 'awayTeamId', { unique: false }); // Índice exigido
        matchesStore.createIndex('date', 'date', { unique: false }); // Índice exigido
        matchesStore.createIndex('status', 'status', { unique: false }); // Índice exigido
      }

      // NUEVO: Object Store para los eventos (MatchEvents)
      if (!db.objectStoreNames.contains('events')) {
        const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
        eventsStore.createIndex('matchId', 'matchId', { unique: false });
        eventsStore.createIndex('playerId', 'playerId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

export async function executeTransaction(storeNames, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transaction = db.transaction(stores, mode);
    
    let request = null;
    try {
        // El callback ahora retorna el request de la operación
        request = callback(transaction); 
    } catch (error) {
        transaction.abort();
        return reject(error);
    }

    transaction.oncomplete = () => {
      // Devolvemos el resultado del request, no el request entero
      resolve(request ? request.result : true);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
    
    transaction.onabort = () => {
      reject(transaction.error);
    };
  });
}