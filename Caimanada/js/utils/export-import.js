import { createLeague, setActiveLeague } from '../db/repositories/leagues.js';
import { addTeam, getTeamsByLeague } from '../db/repositories/teams.js';
import { getPlayersByTeam } from '../db/repositories/players.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { MatchEventRepository } from '../db/repositories/matchEvent.js';

/**
 * Procesa y valida los datos crudos extraídos de un código QR o archivo JSON
 * @param {string} rawData - String en formato JSON
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
      if (!payload || !payload.leagueName) {
        throw new Error('Información de liga incompleta en el QR.');
      }

      const newLeague = await createLeague({
        name: payload.leagueName,
        sport: payload.sport || 'futbol_sala',
        mode: payload.mode || 'Liga',
        isActive: false,
        role: 'guest'
      });

      return {
        success: true,
        league: newLeague,
        message: `Liga "${newLeague.name}" importada como invitado.`
      };
    }

    case 'IMPORT_TEAM': {
      if (!payload || !payload.name || !payload.leagueId) {
        throw new Error('Información de equipo incompleta en el QR.');
      }

      await addTeam({
        leagueId: payload.leagueId,
        name: payload.name,
        delegate: payload.delegate || '',
        phone: payload.phone || ''
      });

      return {
        success: true,
        message: `El equipo "${payload.name}" se ha importado correctamente.`
      };
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
    // 1. Obtenemos todos los hijos de la liga
    const teams = await getTeamsByLeague(leagueData.id);
    
    // 2. Por cada equipo, obtenemos sus jugadores
    const teamsWithPlayers = await Promise.all(teams.map(async (team) => {
      const players = await getPlayersByTeam(team.id);
      return { ...team, players };
    }));

    // 3. Obtenemos los partidos
    const matches = await getMatchesByLeague(leagueData.id);

    // 4. Por cada partido, obtenemos sus eventos (goles, tarjetas)
    const matchesWithEvents = await Promise.all(matches.map(async (match) => {
      const events = await MatchEventRepository.getEventsByMatch(match.id);
      return { ...match, events };
    }));

    // 5. Construimos el objeto completo de la liga
    const fullLeagueBackup = {
      app: 'CaimanaDa',
      version: '1.0',
      type: 'FULL_BACKUP',
      exportedAt: new Date().toISOString(),
      league: leagueData,
      teams: teamsWithPlayers,
      matches: matchesWithEvents
    };

    // 6. Convertimos a texto JSON y forzamos la descarga
    const jsonString = JSON.stringify(fullLeagueBackup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `CaimanaDa_${leagueData.name.replace(/\s/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, message: 'Liga exportada correctamente.' };
  } catch (error) {
    console.error('Error al exportar liga:', error);
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

        // Insertamos la liga como invitada
        await createLeague({
          name: `${parsed.league.name} (Importada)`,
          sport: parsed.league.sport,
          mode: parsed.league.mode,
          season: parsed.league.season,
          role: 'guest'
        });
        
      

        resolve({ success: true, message: 'Liga importada desde archivo.' });
      } catch (err) {
        reject(new Error('Error al leer el archivo JSON.'));
      }
    };

    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}