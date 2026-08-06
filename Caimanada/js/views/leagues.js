import { getAllLeagues, getActiveLeague, createLeague, setActiveLeague, deleteLeague, updateLeague } from '../db/repositories/leagues.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getPlayersByTeam } from '../db/repositories/players.js'; 
import { MatchEventRepository } from '../db/repositories/matchEvent.js'; 
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { renderLeagueStatsChart } from '../components/statsChart.js';
import { startQRScanner, stopQRScanner, buildQRPayload } from '../utils/qr.js';
import { handleImportData, exportLeagueToJson } from '../utils/export-import.js';
import { AlertService } from '../components/alert.js'; 
const SPORT_DISPLAY_NAMES = {
  futbol_sala: 'Futbolito / Futsal',
  futbol_campo: 'Fútbol Campo',
  basketball: 'Baloncesto',
  baseball: 'Béisbol',
  kickingball: 'Kickingball',
  volleyball: 'Voleibol',
  padel: 'Pádel',
  ping_pong: 'Ping-Pong',
  ajedrez: 'Ajedrez'
};

function getActiveSport() {
  return localStorage.getItem('active_sport_id') || 'futbol_sala';
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function renderLeaguesView() {
  const container = document.getElementById('leagues-section');
  if (!container) return;

  container.innerHTML = `<loading-state message="Cargando ligas..."></loading-state>`;

  try {
    const allLeagues = await getAllLeagues();
    const activeSport = getActiveSport();
    const leagues = allLeagues.filter(league => league.sport === activeSport);
    const activeLeague = await getActiveLeague();
    
    container.innerHTML = `
      <header class="leagues-header">
        <div>
          <h1 class="view-title">Gestión de Ligas</h1>
          <p class="view-subtitle">Crea, administra y activa los torneos de CaimanaDa</p>
        </div>
        <button id="btn-open-create-modal" class="btn btn--primary">+ Crear Nueva Liga</button>
      </header>

      <div id="league-modal" class="modal-overlay is-hidden">
        <div class="modal-card">
          <h2 id="modal-title" class="modal-card__title">Crear Liga</h2>
          <form id="league-form">
            <input type="hidden" id="league-id" />
            <div class="form-group">
              <label class="form-group__label">Nombre de la Liga *</label>
              <input type="text" id="league-name" required placeholder="Ej: Torneo Verano 2026" class="form-control" />
            </div>
            <div class="form-grid-2">
              <div class="form-group">
                <label class="form-group__label">Deporte *</label>
                <select id="league-sport" required class="form-control">
                  <option value="futbol_sala">Futbolito / Futsal</option>
                  <option value="futbol_campo">Fútbol Campo</option>
                  <option value="basketball">Baloncesto</option>
                  <option value="baseball">Béisbol</option>
                  <option value="kickingball">Kickingball</option>
                  <option value="volleyball">Voleibol</option>
                  <option value="padel">Pádel</option>
                  <option value="ping_pong">Ping-Pong</option>
                  <option value="ajedrez">Ajedrez</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-group__label">Temporada *</label>
                <input type="text" id="league-season" required placeholder="Ej: 2026-I" class="form-control" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-group__label">Modalidad *</label>
              <select id="league-mode" required class="form-control">
                <option value="Liga - Una vuelta">Liga (Todos contra todos - Una vuelta)</option>
                <option value="Liga - Ida y vuelta">Liga (Todos contra todos - Ida y vuelta)</option>
                <option value="Eliminación directa - 4 equipos">Eliminación directa (4 equipos)</option>
                <option value="Eliminación directa - 8 equipos">Eliminación directa (8 equipos)</option>
                <option value="Eliminación directa - 16 equipos">Eliminación directa (16 equipos)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-group__label">Duración estimada (días) *</label>
              <input type="number" id="league-duration" min="1" value="7" required class="form-control" />
            </div>
            <div class="form-group form-group--last">
              <label class="form-group__label">Descripción (Opcional)</label>
              <textarea id="league-description" rows="2" placeholder="Reglas especiales, sede, etc." class="form-control"></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" id="btn-close-modal" class="btn btn--secondary">Cancelar</button>
              <button type="submit" class="btn btn--primary">Guardar Liga</button>
            </div>
          </form>
        </div>
      </div>

      <div id="leagues-grid" class="leagues-grid"></div>
      <div id="league-stats-container" style="margin-top: 2rem;"></div>
    `;

    await renderLeaguesCards(leagues, activeLeague);
    await renderLeagueChartSection(leagues);
    setupModalEvents(leagues);

  } catch (error) {
    console.error('Error al renderizar ligas:', error);
    container.innerHTML = ''; 
    const errComp = document.createElement('error-state');
    errComp.setError('Hubo un problema al cargar las ligas.', () => renderLeaguesView());
    container.appendChild(errComp);
  }
}

async function renderLeagueChartSection(leagues) {
  const statsContainer = document.getElementById('league-stats-container');
  if (!statsContainer) return;

  if (leagues.length === 0) {
    statsContainer.innerHTML = '';
    return;
  }

  const leaguesDataWithTopWins = await Promise.all(leagues.map(async (league) => {
    const teams = await getTeamsByLeague(league.id);
    const matches = await getMatchesByLeague(league.id);

    const winsMap = {};
    teams.forEach(t => { winsMap[t.id] = 0; });

    matches.forEach(match => {
      if (match.status === 'completed' && match.scoreHome !== null && match.scoreAway !== null) {
        if (match.scoreHome > match.scoreAway) {
          winsMap[match.homeTeamId] = (winsMap[match.homeTeamId] || 0) + 1;
        } else if (match.scoreAway > match.scoreHome) {
          winsMap[match.awayTeamId] = (winsMap[match.awayTeamId] || 0) + 1;
        }
      }
    });

    let topTeamName = 'Sin datos';
    let maxWins = 0;

    teams.forEach(t => {
      const wins = winsMap[t.id] || 0;
      if (wins > maxWins) {
        maxWins = wins;
        topTeamName = t.name;
      }
    });

    return {
      ...league,
      teamsCount: teams.length,
      topTeamName: maxWins > 0 ? topTeamName : 'Sin definir',
      topTeamWins: maxWins
    };
  }));

  statsContainer.innerHTML = `
    <article class="info-card">
      <header class="info-card__header">
        <h3 class="info-card__label" style="margin-bottom: 1rem;">Equipos Registrados vs. Líder en Victorias por Liga</h3>
      </header>
      <div class="chart-wrapper" style="position: relative; height: 320px; width: 100%;">
        <canvas id="canvas-league-stats"></canvas>
      </div>
    </article>
  `;

  renderLeagueStatsChart('canvas-league-stats', leaguesDataWithTopWins);
}

async function renderLeaguesCards(leagues, activeLeague) {
  const grid = document.getElementById('leagues-grid');
  if (!grid) return;

  if (leagues.length === 0) {
    const sportName = SPORT_DISPLAY_NAMES[getActiveSport()] || 'este deporte';
    grid.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">No hay ligas de ${sportName} registradas.</p>
        <p class="empty-state__subtitle">Presiona "+ Crear Nueva Liga" para empezar tu torneo.</p>
      </div>
    `;
    return;
  }

  const cardsHTML = await Promise.all(leagues.map(async (league) => {
    const isActive = activeLeague && activeLeague.id === league.id;
    const teams = await getTeamsByLeague(league.id);
    const matches = await getMatchesByLeague(league.id);

    const safeName = escapeHTML(league.name);
    const displaySportName = SPORT_DISPLAY_NAMES[league.sport] || league.sport || 'Fútbol';
    const safeSport = escapeHTML(displaySportName);
    const safeSeason = escapeHTML(league.season || '2026');
    const safeMode = escapeHTML(league.mode);
    const safeDescription = escapeHTML(league.description);
    const safeId = escapeHTML(league.id);
    return `
      <article class="league-card ${isActive ? 'league-card--active' : ''}" style="position: relative;">
        <span class="league-card__role ${league.role === 'guest' ? 'league-card__role--guest' : 'league-card__role--owner'}">
          ${league.role === 'guest' ? 'INVITADO' : 'PROPIETARIO'}
        </span>
        
        <header class="league-card__header">
          <div class="league-card__meta">
            <span class="league-card__badge">${safeSport}</span>
            <span class="league-card__season">${safeSeason}</span>
          </div>
          <h2 class="league-card__title">${safeName}</h2>
        </header>
        <div class="league-card__body">
          <p><strong>Modalidad:</strong> ${safeMode}</p>
          <p><strong>Equipos:</strong> ${teams.length} registrados</p>
          <p><strong>Partidos:</strong> ${matches.length} programados</p>
          ${safeDescription ? `<p class="league-card__description">"${safeDescription}"</p>` : ''}
        </div>
        <footer class="league-card__footer">
          <div>
            ${isActive 
              ? '<span class="league-card__active-label">✓ LIGA ACTIVA</span>' 
              : `<button class="btn btn--secondary btn--sm btn-set-active" data-id="${safeId}">Activar</button>`
            }
          </div>
          <div class="league-card__actions">
            ${league.role === 'guest' ? '' : `<button class="btn btn--secondary btn--sm btn-edit-league" data-id="${safeId}">Editar</button>`}
            <!-- 2. AÑADIMOS EL BOTÓN DE EXPORTAR -->
            <button class="btn btn--secondary btn--sm btn-export-league" data-id="${safeId}">Exportar</button>
            <button class="btn btn--sm btn-danger btn-delete-league" data-id="${safeId}">Borrar</button>
          </div>
        </footer>
      </article>
    `;
  }));

  grid.innerHTML = cardsHTML.join('');
  setupCardEvents(leagues);
}

function setupModalEvents(leagues) {
  const modal = document.getElementById('league-modal');
  const btnOpen = document.getElementById('btn-open-create-modal');
  const btnClose = document.getElementById('btn-close-modal');
  const form = document.getElementById('league-form');
  const modalTitle = document.getElementById('modal-title');
  const sportSelect = document.getElementById('league-sport');
  const modeSelect = document.getElementById('league-mode');

  btnOpen?.addEventListener('click', () => {
    form.reset();
    document.getElementById('league-id').value = '';
    modalTitle.textContent = 'Crear Nueva Liga';
    sportSelect.value = getActiveSport();
    sportSelect.disabled = true; 
    modeSelect.disabled = false;
    modal.classList.remove('is-hidden');
  });

  btnClose?.addEventListener('click', () => modal.classList.add('is-hidden'));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('league-id').value;
    const name = document.getElementById('league-name').value.trim();
    const season = document.getElementById('league-season').value.trim();
    const durationDays = document.getElementById('league-duration').value;
    const description = document.getElementById('league-description').value.trim();

    const isDuplicate = leagues.some(l => l.name.toLowerCase() === name.toLowerCase() && l.id !== id);
    if (isDuplicate) {
      AlertService.showWarning(`Ya existe una liga con el nombre "${name}".`, 'NOMBRE EN USO');
      return;
    }

    try {
      if (id) {
        const targetLeague = leagues.find(l => l.id === id);
        if (targetLeague) {
          const updatedData = { ...targetLeague, name, season, durationDays: Number(durationDays), description };
          if (typeof updateLeague === 'function') {
            await updateLeague(updatedData);
            AlertService.showSuccess('Liga actualizada correctamente.');
          }
        }
      } else {
        const sport = sportSelect.value; 
        const mode = modeSelect.value;
        const createdLeague = await createLeague({ name, sport, season, mode, durationDays: Number(durationDays), description, isActive: true });
        localStorage.setItem('active_sport_id', sport);
        if (createdLeague && createdLeague.id) {
          localStorage.setItem('caimanada_active_league', createdLeague.id);
        }
        AlertService.showChampion('¡Liga creada y activada con éxito!', '¡NUEVO TORNEO!');
      }
      modal.classList.add('is-hidden');
      await renderLeaguesView();
    } catch (err) {
       AlertService.showError('No se pudo guardar la liga en la base de datos.');
    }
  });
}

function setupCardEvents(leagues) {
  const container = document.getElementById('leagues-grid');
  if (!container) return;

  container.addEventListener('click', async (e) => {
    const target = e.target;
    const leagueId = target.dataset.id;
    if (!leagueId) return;

    if (target.classList.contains('btn-set-active')) {
      const league = leagues.find(l => l.id === leagueId);
      await setActiveLeague(leagueId);
      localStorage.setItem('caimanada_active_league', leagueId);
      if (league && league.sport) {
        localStorage.setItem('active_sport_id', league.sport);
      }
      AlertService.showSuccess(`Liga ${league.name} activada.`, 'LIGA ACTIVA');
      setTimeout(() => window.location.hash = '#dashboard', 800);
      return;
    }

    // 3. AÑADIMOS EL EVENTO PARA EXPORTAR
       if (target.classList.contains('btn-export-league')) {
      const league = leagues.find(l => l.id === leagueId);
      if (league) {
        openShareLeagueModal(league);
      }
      return;
    }

    if (target.classList.contains('btn-edit-league')) {
      const league = leagues.find(l => l.id === leagueId);
      if (!league) return;

      document.getElementById('league-id').value = league.id;
      document.getElementById('league-name').value = league.name;
      document.getElementById('league-season').value = league.season || '';
      document.getElementById('league-duration').value = league.durationDays || 7;
      document.getElementById('league-description').value = league.description || '';

      const sportSelect = document.getElementById('league-sport');
      const modeSelect = document.getElementById('league-mode');

      sportSelect.value = league.sport;
      modeSelect.value = league.mode;
      sportSelect.disabled = true;
      modeSelect.disabled = true;

      document.getElementById('modal-title').textContent = 'Editar Liga';
      document.getElementById('league-modal').classList.remove('is-hidden');
      return;
    }

    if (target.classList.contains('btn-delete-league')) {
      const league = leagues.find(l => l.id === leagueId);
      showConfirmDialog(
        `¿Estás seguro de que deseas eliminar la liga <strong>"${escapeHTML(league.name)}"</strong>?<br><br>ESTA ACCIÓN BORRARÁ TODOS SUS EQUIPOS Y PARTIDOS ASOCIADOS.`,
        async () => {
          try {
            await deleteLeague(leagueId);
            const remainingLeagues = await getAllLeagues();
            if (remainingLeagues.length > 0) {
              const hasActive = remainingLeagues.some(l => l.isActive);
              if (!hasActive) {
                const nextLeague = remainingLeagues[0];
                await setActiveLeague(nextLeague.id);
                localStorage.setItem('caimanada_active_league', nextLeague.id);
                localStorage.setItem('active_sport_id', nextLeague.sport || 'futbol_sala');
              }
            } else {
              localStorage.removeItem('caimanada_active_league');
            }
            AlertService.showWarning('Liga eliminada correctamente.', 'LIGA BORRADA');
            renderLeaguesView();
          } catch (err) {
            AlertService.showError('Error al eliminar la liga.');
          }
        }
      );
    }
  });
}

function showConfirmDialog(messageHTML, onConfirmCallback) {
  document.getElementById('dynamic-confirm-modal')?.remove();

  const modalHTML = `
    <div id="dynamic-confirm-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 420px; text-align: center;">
        <h2 class="modal-card__title">Confirmar Acción</h2>
        <p style="color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.6; font-size: 0.95rem;">
          ${messageHTML}
        </p>
        <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: center;">
          <button type="button" id="dyn-confirm-cancel" class="btn btn--secondary">Cancelar</button>
          <button type="button" id="dyn-confirm-accept" class="btn btn--danger">Sí, Eliminar</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-confirm-modal');

  document.getElementById('dyn-confirm-cancel').onclick = () => modalEl.remove();

  modalEl.onclick = (e) => {
    if (e.target === modalEl) modalEl.remove();
  };

  document.getElementById('dyn-confirm-accept').onclick = async () => {
    modalEl.remove();
    if (onConfirmCallback) await onConfirmCallback();
  };
}
async function openShareLeagueModal(leagueData) {
  document.getElementById('dynamic-share-modal')?.remove();

  const modalHTML = `
    <div id="dynamic-share-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 420px;">
        <h2 class="modal-card__title">Compartir Liga</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; text-align: center;">
          Comparte el archivo JSON para que importen toda la liga, o muestra el código QR para que otros equipos se unan rápidamente como invitados.
        </p>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          
          <!-- Botón Compartir WhatsApp / Descargar -->
          <button id="btn-share-whatsapp" class="btn btn--primary" style="width: 100%;">
            📤 Compartir Archivo JSON
          </button>

          <!-- Separador -->
          <div style="text-align: center; color: #64748b; font-size: 0.8rem; margin: 0.5rem 0;">- O -</div>

          <!-- Botón Mostrar QR -->
          <button id="btn-show-qr" class="btn btn--secondary" style="width: 100%;">
            📱 Generar Código QR de Invitación
          </button>

          <!-- Contenedor del QR (Oculto por defecto) -->
          <div id="qr-display-container" style="display: none; flex-direction: column; align-items: center; margin-top: 1rem; padding: 1rem; background: #fff; border-radius: 8px;">
            <img id="qr-image" src="" alt="Código QR de Liga" style="width: 220px; height: 220px;" />
            <p style="font-size: 0.75rem; color: #0f172a; margin-top: 0.5rem; font-weight: bold;">Escanea para unirte a "${escapeHTML(leagueData.name)}"</p>
          </div>

        </div>

        <div class="modal-actions" style="margin-top: 2rem; text-align: right;">
          <button type="button" id="dyn-share-cancel" class="btn btn--secondary">Cerrar</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-share-modal');

  document.getElementById('dyn-share-cancel').onclick = () => modalEl.remove();

  // 1. Lógica Compartir por WhatsApp / Descargar
    // 1. Lógica Compartir por WhatsApp / Descargar
  document.getElementById('btn-share-whatsapp').onclick = async () => {
    try {
      // Obtenemos el JSON usando tu función existente
      const jsonString = await prepareLeagueJsonString(leagueData);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const fileName = `CaimanaDa_${leagueData.name.replace(/\s/g, '_')}.json`;
      
      // Verificamos si es un dispositivo móvil real (con pantalla táctil)
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // Si es móvil y soporta compartir archivos, usamos Web Share API
      if (isMobile && navigator.canShare && navigator.canShare({ files: [new File([blob], fileName)] })) {
        const file = new File([blob], fileName, { type: 'application/json' });
        await navigator.share({
          title: 'Liga CaimanaDa',
          text: `Aquí está la liga ${leagueData.name} para CaimanaDa`,
          files: [file]
        });
        AlertService.showSuccess('Liga compartida.', 'ACCIÓN COMPLETADA');
      } else {
        // Si es PC (o no soporta compartir), forzamos la descarga directa
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none'; // Lo ocultamos por si acaso
        document.body.appendChild(a);
        a.click();
        
        // Limpiamos la memoria y el DOM
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);

        AlertService.showSuccess('Archivo descargado. Ábrelo en WhatsApp Web para enviarlo.', 'DESCARGA LISTA');
      }
    } catch (err) {
      console.error('Error al compartir:', err);
      AlertService.showError('No se pudo compartir el archivo.', 'ERROR');
    }
  };
  // 2. Lógica Mostrar QR
  document.getElementById('btn-show-qr').onclick = async () => {
    const qrContainer = document.getElementById('qr-display-container');
    const qrImage = document.getElementById('qr-image');
    
    // Construimos el payload ligero para el QR
    const qrPayload = buildQRPayload('LINK_LEAGUE', {
      leagueName: leagueData.name,
      sport: leagueData.sport,
      mode: leagueData.mode
    });

    // Usamos una API pública para generar la imagen del QR
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}`;
    
    qrImage.src = qrApiUrl;
    qrContainer.style.display = 'flex';
  };
}

// Función helper para obtener el string del JSON (para no romper tu export-import.js)
async function prepareLeagueJsonString(leagueData) {
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

  return JSON.stringify({
    app: 'CaimanaDa',
    version: '1.0',
    type: 'FULL_BACKUP',
    exportedAt: new Date().toISOString(),
    league: leagueData,
    teams: teamsWithPlayers,
    matches: matchesWithEvents
  }, null, 2);
}