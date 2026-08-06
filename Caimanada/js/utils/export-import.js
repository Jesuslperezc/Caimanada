import { executeTransaction } from '../db.js';
import { getActiveLeague, updateLeague } from '../db/repositories/leagues.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getPlayersByTeam } from '../db/repositories/players.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { MatchEventRepository } from '../db/repositories/matchEvent.js';

/**
 * Procesa el string escaneado/leído y lo guarda en IndexedDB usando transacciones íntegras.
 */
export async function handleImportData(rawData) {
  let parsed;

  try {
    parsed = JSON.parse(rawData);
  } catch (err) {
    throw new Error('El código QR no contiene un formato JSON válido.');
  }

  if (parsed.app !== 'CaimanaDa') {
    throw new Error('El código QR escaneado no pertenece a la aplicación CaimanaDa.');
  }

  const { type, payload } = parsed;

  switch (type) {
    case 'LINK_LEAGUE': {
      if (!payload || !payload.leagueId || !payload.leagueName) throw new Error('Información de liga incompleta en el QR.');
      
      const now = new Date();
      const newLeague = {
        id: payload.leagueId,
        name: payload.leagueName.trim(),
        sport: payload.sport || 'futbol_sala',
        season: payload.season || 'Importada',
        mode: payload.mode || 'Liga',
        durationDays: 7,
        description: 'Liga importada vía QR',
        createdAt: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: false,
        role: 'guest'
      };

      // TRANSACCIÓN ATÓMICA: Se garantiza que Liga, Equipos y Partidos se guarden juntos o falle todo.
      await executeTransaction(['leagues', 'teams', 'matches'], 'readwrite', async (tx) => {
        const leagueStore = tx.objectStore('leagues');
        leagueStore.put(newLeague);

        if (payload.teams && payload.teams.length > 0) {
          const teamStore = tx.objectStore('teams');
          payload.teams.forEach(t => {
            teamStore.put({
              id: t.id,
              name: t.name,
              sportId: t.sportId || newLeague.sport,
              delegate: t.delegate || '',
              leagueId: newLeague.id,
              color: t.color || '#3b82f6',
              createdAt: now.toISOString()
            });
          });
        }

        if (payload.matches && payload.matches.length > 0) {
          const matchStore = tx.objectStore('matches');
          payload.matches.forEach(m => {
            matchStore.put({
              id: m.id,
              leagueId: newLeague.id,
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId,
              scoreHome: m.scoreHome ?? null,
              scoreAway: m.scoreAway ?? null,
              status: m.status || 'pending',
              date: m.date || null,
              round: m.round || 1
            });
          });
        }
      });

      return { 
        success: true, 
        league: newLeague, 
        message: `Liga "${newLeague.name}" importada con fixture y equipos.` 
      };
    }

    case 'IMPORT_TEAM': {
      if (!payload || !payload.name || !payload.leagueId) throw new Error('Información de equipo incompleta en el QR.');
      
      await executeTransaction(['teams'], 'readwrite', (tx) => {
        const store = tx.objectStore('teams');
        store.put({
          id: payload.id, // Respetamos el ID original para evitar duplicados si se escanea 2 veces
          leagueId: payload.leagueId,
          sportId: payload.sportId || 'futbol_sala',
          name: payload.name,
          delegate: payload.delegate || 'Invitado',
          color: payload.color || '#3b82f6',
          createdAt: new Date().toISOString()
        });
      });
      
      return { success: true, message: `El equipo "${payload.name}" se ha importado a tu liga correctamente.` };
    }

    case 'LEAGUE_UPDATE': {
      if (!payload || !payload.matches || !payload.leagueId) throw new Error('Actualización incompleta.');
      
      // TRANSACCIÓN SEGURA: Obtenemos el partido existente y fusionamos solo los marcadores
      await executeTransaction(['matches'], 'readwrite', async (tx) => {
        const store = tx.objectStore('matches');
        for (const match of payload.matches) {
          const existing = await new Promise((res, rej) => {
            const req = store.get(match.id);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          
          if (existing) {
            existing.status = match.status;
            existing.scoreHome = match.scoreHome;
            existing.scoreAway = match.scoreAway;
            store.put(existing);
          } else {
            // Si por alguna razón no existe, lo creamos
            store.put(match);
          }
        }
      });
      
      return { success: true, message: 'Liga actualizada con los últimos resultados.' };
    }

    case 'FINAL_RESULTS': {
      if (!payload || !payload.leagueId || !payload.photo) throw new Error('Resultados finales incompletos.');
      
      const league = await getActiveLeague();
      if (league && league.id === payload.leagueId) {
        await updateLeague({ ...league, finalPhoto: payload.photo, isFinished: true });
      }
      return { success: true, message: 'Resultados finales descargados. ¡Revisa la foto del campeón!' };
    }

    default:
      throw new Error(`Tipo de acción no soportada: ${type}`);
  }
}

/**
 * EXPORTAR LIGA A ARCHIVO JSON (Respaldo completo)
 */
export async function exportLeagueToJson(leagueData) {
  try {
    const teams = await getTeamsByLeague(leagueData.id);
    const teamsWithPlayers = await Promise.all(teams.map(async (team) => {
      const players = await getPlayersByTeam(team.id);
      return { ...team, players };
    }));

    const matches = await getMatchesByLeague(leagueData.id);
    const matchesWithEvents = await Promise.all(matches.map(async (match) => {
      const events = await MatchEventRepository.getEventsByMatch(match.id);
      return { ...match, events };
    }));

    const fullLeagueBackup = {
      app: 'CaimanaDa', version: '1.0', type: 'FULL_BACKUP',
      exportedAt: new Date().toISOString(),
      league: leagueData, teams: teamsWithPlayers, matches: matchesWithEvents
    };

    const jsonString = JSON.stringify(fullLeagueBackup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CaimanaDa_${leagueData.name.replace(/\s/g, '_')}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true, message: 'Liga exportada correctamente.' };
  } catch (error) {
    throw new Error('No se pudo exportar la liga.');
  }
}

/**
 * IMPORTAR LIGA DESDE ARCHIVO JSON (Restauración completa)
 */
export async function importLeagueFromJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.app !== 'CaimanaDa' || parsed.type !== 'FULL_BACKUP') {
          return reject(new Error('El archivo no es un respaldo válido de CaimanaDa.'));
        }
        
        const now = new Date();
        const newLeague = {
          id: `league_${Date.now()}`,
          name: `${parsed.league.name} (Importada)`,
          sport: parsed.league.sport || 'futbol_sala',
          season: parsed.league.season || 'Importada',
          mode: parsed.league.mode || 'Liga',
          durationDays: 7,
          description: 'Liga importada desde JSON',
          createdAt: now.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          startDate: now.toISOString(),
          endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: false,
          role: 'guest'
        };

        // TRANSACCIÓN ATÓMICA PARA RESTAURAR TODO DESDE EL JSON
        await executeTransaction(['leagues', 'teams', 'players', 'matches', 'events'], 'readwrite', async (tx) => {
          const leagueStore = tx.objectStore('leagues');
          leagueStore.put(newLeague);

          const teamStore = tx.objectStore('teams');
          const playerStore = tx.objectStore('players');
          
          if (parsed.teams && parsed.teams.length > 0) {
            for (const t of parsed.teams) {
              teamStore.put({
                id: t.id,
                name: t.name,
                sportId: t.sportId || newLeague.sport,
                delegate: t.delegate || '',
                leagueId: newLeague.id,
                color: t.color || '#3b82f6',
                createdAt: now.toISOString()
              });
              
              if (t.players && t.players.length > 0) {
                t.players.forEach(p => {
                  playerStore.put({
                    id: p.id,
                    teamId: t.id,
                    name: p.name,
                    number: p.number,
                    position: p.position
                  });
                });
              }
            }
          }

          const matchStore = tx.objectStore('matches');
          const eventStore = tx.objectStore('events');
          
          if (parsed.matches && parsed.matches.length > 0) {
            for (const m of parsed.matches) {
              matchStore.put({
                id: m.id,
                leagueId: newLeague.id,
                homeTeamId: m.homeTeamId,
                awayTeamId: m.awayTeamId,
                scoreHome: m.scoreHome ?? null,
                scoreAway: m.scoreAway ?? null,
                status: m.status || 'pending',
                date: m.date || null,
                round: m.round || 1
              });
              
              if (m.events && m.events.length > 0) {
                m.events.forEach(ev => {
                  eventStore.put(ev);
                });
              }
            }
          }
        });

        resolve({ success: true, league: newLeague, message: 'Liga importada desde archivo correctamente.' });
      } catch (err) {
        reject(new Error('Error al procesar el archivo JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}