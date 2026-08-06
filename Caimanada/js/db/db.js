const DB_NAME = 'caimanada_db';
const DB_VERSION = 2;

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

      let teamsStore;
      if (!db.objectStoreNames.contains('teams')) {
        teamsStore = db.createObjectStore('teams', { keyPath: 'id' });
      } else {
        teamsStore = event.target.transaction.objectStore('teams');
      }

      if (!teamsStore.indexNames.contains('leagueId')) {
        teamsStore.createIndex('leagueId', 'leagueId', { unique: false });
      }
      if (!teamsStore.indexNames.contains('sportId')) {
        teamsStore.createIndex('sportId', 'sportId', { unique: false });
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

    let callbackResult = null;

    try {
      callbackResult = callback(store);
    } catch (err) {
      return reject(err);
    }

    // Si el callback devuelve una Promesa
    if (callbackResult && typeof callbackResult.then === 'function') {
      callbackResult
        .then((res) => {
          transaction.oncomplete = () => resolve(res);
        })
        .catch(reject);
      return;
    }

    // Si el callback devuelve un IDBRequest directamente
    if (callbackResult && typeof callbackResult === 'object' && 'onsuccess' in callbackResult) {
      let requestResult = null;
      callbackResult.onsuccess = (e) => {
        requestResult = e.target.result;
      };
      transaction.oncomplete = () => {
        resolve(requestResult);
      };
    } else {
      transaction.oncomplete = () => {
        resolve(callbackResult ?? true);
      };
    }

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}