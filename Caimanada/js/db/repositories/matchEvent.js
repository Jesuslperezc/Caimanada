// js/db/repositories/matchEvent.js

import { executeTransaction } from '../db.js'; 

const STORE_NAME = 'events';

const EVENT_TYPES = {
    POINT: 'point',
    WARNING: 'warning',
    EXPULSION: 'expulsion'
};

const MatchEventRepository = {
    /**
     * Crea un nuevo evento en la base de datos.
     */
       async addEvent(eventData) {
        if (!eventData.matchId || !eventData.playerId || !eventData.teamId) {
            throw new Error("Faltan campos obligatorios (matchId, teamId, playerId)");
        }

        return executeTransaction(STORE_NAME, 'readwrite', (tx) => {
            const store = tx.objectStore(STORE_NAME);
            return store.add({
                id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, // <--- ID AÑADIDO
                matchId: eventData.matchId,
                teamId: eventData.teamId,
                playerId: eventData.playerId,
                type: eventData.type || EVENT_TYPES.POINT,
                minute: eventData.minute || null,
                createdAt: new Date().toISOString()
            });
        });
    },

    async addEventsInTransaction(tx, events) {
        if (!events || events.length === 0) return Promise.resolve();
        
        const store = tx.objectStore(STORE_NAME);
        events.forEach(event => {
            if (!event.matchId || !event.playerId) {
                throw new Error("Evento inválido en la transacción masiva");
            }
            // Nos aseguramos de que el evento tenga ID antes de agregarlo
            if (!event.id) {
                event.id = `event_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            }
            store.add(event);
        });
    },
    /**
     * Obtiene todos los eventos de un partido específico.
     */
    async getEventsByMatch(matchId) {
        const events = await executeTransaction(STORE_NAME, 'readonly', (tx) => {
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('matchId');
            return index.getAll(matchId);
        });

        // Ordenamos por minuto si existe
        return events.sort((a, b) => {
            if (a.minute === null) return 1;
            if (b.minute === null) return -1;
            return a.minute - b.minute;
        });
    },

    /**
     * Obtiene los eventos de tipo 'punto' de un jugador.
     */
    async getScoringEventsByPlayer(playerId) {
        const events = await executeTransaction(STORE_NAME, 'readonly', (tx) => {
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('playerId');
            return index.getAll(playerId);
        });

        return events.filter(e => e.type === EVENT_TYPES.POINT);
    },

    /**
     * Elimina un evento individual por su ID.
     */
    async deleteEvent(eventId) {
        return executeTransaction(STORE_NAME, 'readwrite', (tx) => {
            const store = tx.objectStore(STORE_NAME);
            return store.delete(eventId);
        });
    },

    /**
     * Elimina todos los eventos de un partido.
     */
    async deleteEventsByMatch(matchId) {
        return executeTransaction(STORE_NAME, 'readwrite', (tx) => {
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('matchId');
            const cursorReq = index.openCursor(IDBKeyRange.only(matchId));
            
            cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            // No retornamos el cursorReq porque no nos interesa su resultado,
            // solo que la transacción se complete.
            return null; 
        });
    }
};

export { MatchEventRepository, EVENT_TYPES };