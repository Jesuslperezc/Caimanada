import { createLeague, setActiveLeague } from '../db/repositories/leagues.js';
import { addTeam } from '../db/repositories/teams.js';

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

  // Validación de firmas de la aplicación
  if (parsed.app !== 'CaimanaDa') {
    throw new Error('El código QR escaneado no pertenece a la aplicación CaimanaDa.');
  }

  const { type, payload } = parsed;

  switch (type) {
    case 'LINK_LEAGUE': {
      if (!payload || !payload.leagueName) {
        throw new Error('Información de liga incompleta en el QR.');
      }

      // Se registra localmente la liga escaneada del amigo/organizador
      const newLeague = await createLeague({
        name: payload.leagueName,
        sport: payload.sport || 'Fútbol',
        mode: payload.mode || 'Liga',
        isActive: true
      });

      if (newLeague && newLeague.id) {
        await setActiveLeague(newLeague.id);
      }

      return {
        success: true,
        message: `Te has unido con éxito a la liga "${newLeague.name}".`
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