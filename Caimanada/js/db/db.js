const DB_NAME = 'caimanada_db';
const DB_VERSION = 1;

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
      }

      if (!db.objectStoreNames.contains('teams')) {
        const teamsStore = db.createObjectStore('teams', { keyPath: 'id' });
        teamsStore.createIndex('leagueId', 'leagueId', { unique: false });
      }

      if (!db.objectStoreNames.contains('matches')) {
        const matchesStore = db.createObjectStore('matches', { keyPath: 'id' });
        matchesStore.createIndex('leagueId', 'leagueId', { unique: false });
      }
        if (!db.objectStoreNames.contains('players')) {
        const playersStore = db.createObjectStore('players', { keyPath: 'id' });
        playersStore.createIndex('teamId', 'teamId', { unique: false });
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

export async function executeTransaction(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    const request = callback(store);

    transaction.oncomplete = () => {
      resolve(request ? request.result : true);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}