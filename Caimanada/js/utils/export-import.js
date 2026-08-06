import { createLeague, setActiveLeague, updateLeague, getActiveLeague } from '../db/repositories/leagues.js';
import { addTeam, getTeamsByLeague, updateTeam } from '../db/repositories/teams.js';
import { getPlayersByTeam } from '../db/repositories/players.js';
import { getMatchesByLeague, updateMatch, bulkInsertFullMatches } from '../db/repositories/matches.js';
import { MatchEventRepository } from '../db/repositories/matchEvent.js';

/**
 * 
 * @param {string} rawData -
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
      if (!payload || !payload.leagueName) throw new Error('Información de liga incompleta en el QR.');
      
      // Creamos la liga usando el mismo ID del Host
      const newLeague = await createLeague({
        id: payload.leagueId,
        name: payload.leagueName,
        sport: payload.sport || 'futbol_sala',
        mode: payload.mode || 'Liga',
        isActive: false,
        role: 'guest'
      });

      // Importamos los equipos si vienen en el QR
      if (payload.teams && payload.teams.length > 0) {
        for (const t of payload.teams) {
          await addTeam({ 
            id: t.id, 
            name: t.name, 
            sportId: t.sportId, 
            delegate: t.delegate, 
            leagueId: newLeague.id 
          });
        }
      }

      // Importamos el fixture completo si viene en el QR
      if (payload.matches && payload.matches.length > 0) {
        await bulkInsertFullMatches(payload.matches.map(m => ({
          id: m.id,
          leagueId: newLeague.id,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          scoreHome: m.scoreHome,
          scoreAway: m.scoreAway,
          status: m.status,
          date: m.date,
          round: m.round
        })));
      }

      return { 
        success: true, 
        league: newLeague, 
        message: `Liga "${newLeague.name}" importada con fixture y equipos.` 
      };
    }

    case 'IMPORT_TEAM': {
      if (!payload || !payload.name || !payload.leagueId) throw new Error('Información de equipo incompleta en el QR.');
      await addTeam({
        leagueId: payload.leagueId,
        sportId: payload.sportId || 'futbol_sala',
        name: payload.name,
        delegate: payload.delegate || 'Invitado'
      });
      return { success: true, message: `El equipo "${payload.name}" se ha importado a tu liga correctamente.` };
    }

    case 'LEAGUE_UPDATE': {
      if (!payload || !payload.matches || !payload.leagueId) throw new Error('Actualización incompleta.');
      
      // El Guest actualiza los marcadores de los partidos
      for (const match of payload.matches) {
        await updateMatch(match);
      }
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
 * EXPORTAR LIGA A ARCHIVO JSON
 * Recopila todos los datos de la liga y dispara la descarga en el navegador.
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
 * IMPORTAR LIGA DESDE ARCHIVO JSON
 * Lee el archivo seleccionado por el usuario y lo guarda en IndexedDB.
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
        const newLeague = await createLeague({
          name: `${parsed.league.name} (Importada)`,
          sport: parsed.league.sport, mode: parsed.league.mode,
          season: parsed.league.season, role: 'guest'
        });
        resolve({ success: true, league: newLeague, message: 'Liga importada desde archivo.' });
      } catch (err) {
        reject(new Error('Error al leer el archivo JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}