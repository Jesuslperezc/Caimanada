import { getAllLeagues, getActiveLeague, createLeague, setActiveLeague, deleteLeague, updateLeague } from '../db/repositories/leagues.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getPlayersByTeam } from '../db/repositories/players.js'; 
import { MatchEventRepository } from '../db/repositories/matchEvent.js'; 
import { getMatchesByLeague, bulkInsertFullMatches } from '../db/repositories/matches.js';
import { generateLeagueFixture, generateEliminationBracket } from '../utils/fixtureGenerator.js';
import { renderLeagueStatsChart } from '../components/statsChart.js';
import { startQRScanner, stopQRScanner, buildQRPayload } from '../utils/qr.js';
import { handleImportData, exportLeagueToJson, importLeagueFromJsonFile } from '../utils/export-import.js';
import { AlertService } from '../components/alert.js'; 
import { getMaxPlayersForSport } from '../utils/sport-terms.js';

const SPORT_DISPLAY_NAMES = {
  futbol_sala: 'Futbolito / Futsal', futbol_campo: 'Fútbol Campo', basketball: 'Baloncesto',
  baseball: 'Béisbol', kickingball: 'Kickingball', volleyball: 'Voleibol',
  padel: 'Pádel', ping_pong: 'Ping-Pong', ajedrez: 'Ajedrez'
};

function getActiveSport() { return localStorage.getItem('active_sport_id') || 'futbol_sala'; }
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button id="btn-import-league" class="btn btn--secondary">📥 Importar Liga</button>
          <button id="btn-open-create-modal" class="btn btn--primary">+ Crear Nueva Liga</button>
        </div>
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

    document.getElementById('btn-import-league')?.addEventListener('click', () => {
      openImportLeagueModal();
    });

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
  if (leagues.length === 0) { statsContainer.innerHTML = ''; return; }

  const leaguesDataWithTopWins = await Promise.all(leagues.map(async (league) => {
    const teams = await getTeamsByLeague(league.id);
    const matches = await getMatchesByLeague(league.id);
    const winsMap = {};
    teams.forEach(t => { winsMap[t.id] = 0; });
    matches.forEach(match => {
      if (match.status === 'completed' && match.scoreHome !== null && match.scoreAway !== null) {
        if (match.scoreHome > match.scoreAway) winsMap[match.homeTeamId] = (winsMap[match.homeTeamId] || 0) + 1;
        else if (match.scoreAway > match.scoreHome) winsMap[match.awayTeamId] = (winsMap[match.awayTeamId] || 0) + 1;
      }
    });
    let topTeamName = 'Sin datos'; let maxWins = 0;
    teams.forEach(t => {
      const wins = winsMap[t.id] || 0;
      if (wins > maxWins) { maxWins = wins; topTeamName = t.name; }
    });
    return { ...league, teamsCount: teams.length, topTeamName: maxWins > 0 ? topTeamName : 'Sin definir', topTeamWins: maxWins };
  }));

  statsContainer.innerHTML = `
    <article class="info-card">
      <header class="info-card__header">
        <h3 class="info-card__label" style="margin-bottom: 1rem;">Equipos Registrados vs. Líder en Victorias por Liga</h3>
      </header>
      <div class="chart-wrapper" style="position: relative; height: 320px; width: 100%;">
        <canvas id="canvas-league-stats"></canvas>
      </div>
    </article>`;
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
      </div>`;
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

    // Validamos que los equipos tengan al menos 1 jugador (capitán) para no exportar equipos vacíos
    let hasPlayers = true;
    if (teams.length > 0) {
      for (const team of teams) {
        const players = await getPlayersByTeam(team.id);
        if (players.length === 0) { 
          hasPlayers = false; break;
        }
      }
    } else { hasPlayers = false; }

    const allMatchesPlayed = matches.length > 0 && matches.every(m => m.status === 'completed');
    const hasStartedPlaying = matches.some(m => m.status === 'completed');
    const isGuest = league.role === 'guest';
    const isLigaMode = league.mode.includes('Liga');
    
    let requiredTeams = 2;
    if (!isLigaMode) {
      if (league.mode.includes('4')) requiredTeams = 4;
      else if (league.mode.includes('8')) requiredTeams = 8;
      else if (league.mode.includes('16')) requiredTeams = 16;
    }

    const meetsTeamRequirements = isLigaMode ? (teams.length >= requiredTeams) : (teams.length === requiredTeams);
    const canExport = meetsTeamRequirements && hasPlayers;

    let primaryActionBtn = '';
    let secondaryActionBtn = '';

    if (isGuest) {
      primaryActionBtn = `<button class="btn btn--primary btn--sm btn-guest-update" data-id="${safeId}">🔄 Actualizar</button>`;
      secondaryActionBtn = '<div></div>';
    } else {
      if (league.isFinished) {
        primaryActionBtn = '<span style="color: #f59e0b; font-weight: bold; text-align: center; padding: 0.4rem;">🏁 FINALIZADA</span>';
        secondaryActionBtn = '<div></div>';
      } else if (allMatchesPlayed) {
        primaryActionBtn = `<button class="btn btn--primary btn--sm btn-final-results" data-id="${safeId}">🏆 Finalizar</button>`;
        secondaryActionBtn = '<div></div>';
      } else {
        if (canExport) {
          primaryActionBtn = `<button class="btn btn--secondary btn--sm btn-export-league" data-id="${safeId}">📤 Exportar</button>`;
        } else {
          let reason = !meetsTeamRequirements ? `Faltan equipos (Req: ${requiredTeams})` : 'Los equipos deben tener al menos 1 jugador (capitán)';
          primaryActionBtn = `<button class="btn btn--secondary btn--sm" disabled style="opacity: 0.5; cursor: not-allowed;" title="${reason}">🔒 Bloqueado</button>`;
        }
        
        if (hasStartedPlaying) {
          secondaryActionBtn = `<button class="btn btn--secondary btn--sm btn-export-update" data-id="${safeId}">📤 Sync</button>`;
        } else {
          secondaryActionBtn = '<div></div>';
        }
      }
    }
    
    let importTeamsBtn = '';
    if (!isGuest && !allMatchesPlayed && matches.length === 0) {
      importTeamsBtn = `<button class="btn btn--secondary btn--sm btn-import-teams" data-id="${safeId}">📷 Importar</button>`;
    } else {
      importTeamsBtn = '<div></div>';
    }
    
    return `
      <article class="league-card ${isActive ? 'league-card--active' : ''}" style="position: relative; overflow: hidden;">
        <span class="league-card__role ${isGuest ? 'league-card__role--guest' : 'league-card__role--owner'}">
          ${isGuest ? 'INVITADO' : 'PROPIETARIO'}
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
          <p><strong>Equipos:</strong> ${teams.length} ${!isGuest && !meetsTeamRequirements ? `<span style="color:#f59e0b; font-size:0.75rem;">(Req: ${requiredTeams})</span>` : ''}</p>
          <p><strong>Partidos:</strong> ${matches.length}</p>
          ${safeDescription ? `<p class="league-card__description">"${safeDescription}"</p>` : ''}
        </div>
        <footer class="league-card__footer">
          <div class="league-card__actions">
            ${isActive 
              ? '<span class="league-card__active-label">✓ LIGA ACTIVA</span>' 
              : `<button class="btn btn--secondary btn--sm btn-set-active" data-id="${safeId}">✅ Activar</button>`
            }
            
            ${!isGuest ? `<button class="btn btn--secondary btn--sm btn-edit-league" data-id="${safeId}">✏️ Editar</button>` : '<div></div>'}
            ${!isGuest ? `<button class="btn btn--primary btn--sm btn-gen-fixture" data-id="${safeId}" data-mode="${safeMode}" data-teams="${teams.length}">⚡ Fixture</button>` : '<div></div>'}
            
            ${importTeamsBtn}
            ${primaryActionBtn}
            ${secondaryActionBtn}
            
            <button class="btn btn--sm btn-danger btn-delete-league" data-id="${safeId}">🗑️ Borrar</button>
            ${isGuest ? '<div></div>' : ''} 
          </div>
        </footer>
      </article>`;
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
    if (isDuplicate) { AlertService.showWarning(`Ya existe una liga con el nombre "${name}".`, 'NOMBRE EN USO'); return; }

    try {
      if (id) {
        const targetLeague = leagues.find(l => l.id === id);
        if (targetLeague) {
          const updatedData = { ...targetLeague, name, season, durationDays: Number(durationDays), description };
          if (typeof updateLeague === 'function') { await updateLeague(updatedData); AlertService.showSuccess('Liga actualizada correctamente.'); }
        }
      } else {
        const sport = sportSelect.value; 
        const mode = modeSelect.value;
        const createdLeague = await createLeague({ name, sport, season, mode, durationDays: Number(durationDays), description, isActive: true });
        localStorage.setItem('active_sport_id', sport);
        if (createdLeague && createdLeague.id) localStorage.setItem('caimanada_active_league', createdLeague.id);
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

    const league = leagues.find(l => l.id === leagueId);

    if (target.classList.contains('btn-set-active')) {
      await setActiveLeague(leagueId);
      localStorage.setItem('caimanada_active_league', leagueId);
      if (league && league.sport) localStorage.setItem('active_sport_id', league.sport);
      AlertService.showSuccess(`Liga ${league.name} activada.`, 'LIGA ACTIVA');
      setTimeout(() => window.location.hash = '#dashboard', 800);
      return;
    }

    if (target.classList.contains('btn-import-teams')) {
      openImportTeamScanner(league);
      return;
    }

    if (target.classList.contains('btn-export-league')) {
      if (league) openShareLeagueModal(league, 'initial');
      return;
    }

    if (target.classList.contains('btn-export-update')) {
      if (league) openShareLeagueModal(league, 'update');
      return;
    }

    if (target.classList.contains('btn-final-results')) {
      if (league) openFinalResultsModal(league);
      return;
    }

    if (target.classList.contains('btn-guest-update')) {
      openGuestUpdateScanner(league);
      return;
    }

    if (target.classList.contains('btn-gen-fixture')) {
      const mode = target.dataset.mode;
      handleGenerateFixture(league, mode);      
      return;
    }

    if (target.classList.contains('btn-edit-league')) {
      if (!league) return;
      document.getElementById('league-id').value = league.id;
      document.getElementById('league-name').value = league.name;
      document.getElementById('league-season').value = league.season || '';
      document.getElementById('league-duration').value = league.durationDays || 7;
      document.getElementById('league-description').value = league.description || '';
      const sportSelect = document.getElementById('league-sport');
      const modeSelect = document.getElementById('league-mode');
      sportSelect.value = league.sport; modeSelect.value = league.mode;
      sportSelect.disabled = true; modeSelect.disabled = true;
      document.getElementById('modal-title').textContent = 'Editar Liga';
      document.getElementById('league-modal').classList.remove('is-hidden');
      return;
    }

    if (target.classList.contains('btn-delete-league')) {
      showConfirmDialog(`¿Estás seguro de que deseas eliminar la liga <strong>"${escapeHTML(league.name)}"</strong>?<br><br>ESTA ACCIÓN BORRARÁ TODOS SUS EQUIPOS Y PARTIDOS ASOCIADOS.`,
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
            } else { localStorage.removeItem('caimanada_active_league'); }
            AlertService.showWarning('Liga eliminada correctamente.', 'LIGA BORRADA');
            renderLeaguesView();
          } catch (err) { AlertService.showError('Error al eliminar la liga.'); }
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
        <p style="color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.6; font-size: 0.95rem;">${messageHTML}</p>
        <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: center;">
          <button type="button" id="dyn-confirm-cancel" class="btn btn--secondary">Cancelar</button>
          <button type="button" id="dyn-confirm-accept" class="btn btn--danger">Sí, Eliminar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-confirm-modal');
  document.getElementById('dyn-confirm-cancel').onclick = () => modalEl.remove();
  modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.remove(); };
  document.getElementById('dyn-confirm-accept').onclick = async () => { modalEl.remove(); if (onConfirmCallback) await onConfirmCallback(); };
}

function openImportLeagueModal() {
  document.getElementById('dynamic-import-league-modal')?.remove();

  const modalHTML = `
    <div id="dynamic-import-league-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 420px;">
        <h2 class="modal-card__title">Importar Liga</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; text-align: center;">
          Escanea el código QR inicial de la liga (o de actualización) o sube el archivo JSON que te envió el organizador.
        </p>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <button id="btn-scan-league-qr" class="btn btn--primary" style="width: 100%;">📱 Escanear QR de Liga</button>
          
          <div style="text-align: center; color: #64748b; font-size: 0.8rem; margin: 0.5rem 0;">- O -</div>

          <button id="btn-upload-league-json" class="btn btn--secondary" style="width: 100%;">📁 Subir Archivo JSON</button>
          <input type="file" id="league-json-input" accept=".json" style="display: none;">

          <div id="qr-league-video-container" style="display: none; border-radius: 8px; overflow: hidden; margin-top: 1rem;">
            <video id="qr-league-video" style="width: 100%; height: auto;" autoplay muted playsinline></video>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 2rem; text-align: right;">
          <button type="button" id="dyn-import-league-cancel" class="btn btn--secondary">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-import-league-modal');
  const videoEl = document.getElementById('qr-league-video');
  const videoContainer = document.getElementById('qr-league-video-container');
  const fileInput = document.getElementById('league-json-input');

  document.getElementById('dyn-import-league-cancel').onclick = () => {
    stopQRScanner();
    modalEl.remove();
  };

  document.getElementById('btn-scan-league-qr').onclick = async () => {
    videoContainer.style.display = 'block';
    await startQRScanner(videoEl, async (rawData) => {
      try {
        const result = await handleImportData(rawData);
        if (result.success) {
          if (result.league && result.league.sport) {
            localStorage.setItem('active_sport_id', result.league.sport);
            const sportSelect = document.getElementById('active-sport-selector');
            if (sportSelect) sportSelect.value = result.league.sport;
          }
          AlertService.showChampion(result.message || '¡Liga importada/actualizada!', '¡SINCRONIZADO!');
          stopQRScanner();
          modalEl.remove();
          renderLeaguesView(); 
        }
      } catch (err) {
        AlertService.showError(err.message, 'ERROR DE QR');
        stopQRScanner();
        videoContainer.style.display = 'none';
      }
    }, (err) => {
      AlertService.showError('No se pudo acceder a la cámara. Usa Subir JSON en su lugar.', 'ERROR DE CÁMARA');
    });
  };

  document.getElementById('btn-upload-league-json').onclick = () => fileInput.click();

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const result = await importLeagueFromJsonFile(file);
      if (result.success) {
        AlertService.showChampion(result.message || '¡Liga importada!', '¡LIGA IMPORTADA!');
        modalEl.remove();
        renderLeaguesView(); 
      }
    } catch (err) {
      AlertService.showError(err.message, 'ERROR DE ARCHIVO');
    }
  };
}

function openImportTeamScanner(leagueData) {
  document.getElementById('dynamic-import-modal')?.remove();

  const modalHTML = `
    <div id="dynamic-import-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 420px;">
        <h2 class="modal-card__title">Importar Equipos a ${escapeHTML(leagueData.name)}</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; text-align: center;">
          Pide a cada capitán que abra el QR de su equipo y apunta la cámara aquí. Puedes escanear varios seguidos.
        </p>
        <div id="qr-import-container" style="border-radius: 8px; overflow: hidden; margin-bottom: 1rem;">
          <video id="qr-import-video" style="width: 100%; height: auto;" autoplay muted playsinline></video>
        </div>
        <div class="modal-actions" style="text-align: right;">
          <button type="button" id="dyn-import-cancel" class="btn btn--secondary">Finalizar Importación</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-import-modal');
  const videoEl = document.getElementById('qr-import-video');

  document.getElementById('dyn-import-cancel').onclick = async () => {
    stopQRScanner();
    modalEl.remove();
    renderLeaguesView(); 
  };

  const handleScanSuccess = async (rawData) => {
    try {
      let parsed = JSON.parse(rawData);
      if (parsed.app !== 'CaimanaDa' || parsed.type !== 'IMPORT_TEAM') {
        throw new Error('Este QR no pertenece a un equipo.');
      }
      
      parsed.payload.leagueId = leagueData.id;
      const result = await handleImportData(JSON.stringify(parsed));
      
      if (result.success) {
        AlertService.showSuccess(result.message, 'EQUIPO AÑADIDO');
        stopQRScanner(); 
        
        setTimeout(() => {
          if (document.getElementById('dynamic-import-modal')) {
            startQRScanner(videoEl, handleScanSuccess, (err) => {
              AlertService.showError('No se pudo reanudar la cámara.', 'ERROR DE CÁMARA');
              modalEl.remove();
            });
          }
        }, 1500);
      }
    } catch (err) {
      AlertService.showError(err.message, 'ERROR DE QR');
      stopQRScanner();
      modalEl.remove(); 
    }
  };

  startQRScanner(videoEl, handleScanSuccess, (err) => {
    AlertService.showError('No se pudo acceder a la cámara.', 'ERROR DE CÁMARA');
    modalEl.remove();
  });
}

async function openShareLeagueModal(leagueData, exportType) {
  document.getElementById('dynamic-share-modal')?.remove();
  const titleText = exportType === 'update' ? 'Exportar Actualización' : 'Exportar Liga Inicial';
  const subtitleText = exportType === 'update' ? 'Genera este QR después de cada jornada para que los invitados actualicen sus resultados.' : 'Genera este QR solo cuando todos los equipos estén registrados con sus jugadores.';

  const modalHTML = `
    <div id="dynamic-share-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 420px;">
        <h2 class="modal-card__title">${titleText}</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; text-align: center;">${subtitleText}</p>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <button id="btn-show-qr" class="btn btn--primary" style="width: 100%;">📱 Generar Código QR</button>
          <div id="qr-display-container" style="display: none; flex-direction: column; align-items: center; margin-top: 1rem; padding: 1rem; background: #fff; border-radius: 8px;">
            <img id="qr-image" src="" alt="Código QR" style="width: 100%; height: auto; max-width: 350px;" />
            <p style="font-size: 0.75rem; color: #0f172a; margin-top: 0.5rem; font-weight: bold;">Escanea para sincronizar</p>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 2rem; text-align: right;">
          <button type="button" id="dyn-share-cancel" class="btn btn--secondary">Cerrar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-share-modal');
  document.getElementById('dyn-share-cancel').onclick = () => modalEl.remove();

  document.getElementById('btn-show-qr').onclick = async () => {
    const matches = await getMatchesByLeague(leagueData.id);
    let payload = {
      leagueId: leagueData.id,
      leagueName: leagueData.name,
      sport: leagueData.sport,
      mode: leagueData.mode
    };

    if (exportType === 'initial') {
      const teams = await getTeamsByLeague(leagueData.id);
      
      const teamsWithPlayers = await Promise.all(teams.map(async (t) => {
        const players = await getPlayersByTeam(t.id);
        return {
          id: t.id,
          name: t.name,
          sportId: t.sportId,
          delegate: t.delegate,
          color: t.color,
          players: players.map(p => ({
            id: p.id,
            name: p.name,
            number: p.number,
            position: p.position
          }))
        };
      }));

      payload.teams = teamsWithPlayers;
      
      // Payload de partidos ligero (SIN EVENTOS en el inicial para no saturar el QR)
      payload.matches = matches.map(m => ({ 
        id: m.id, 
        status: m.status, 
        scoreHome: m.scoreHome, 
        scoreAway: m.scoreAway, 
        homeTeamId: m.homeTeamId, 
        awayTeamId: m.awayTeamId, 
        date: m.date, 
        round: m.round || 1,
        slot: m.slot || null,                       
        winnerGoesToMatchId: m.winnerGoesToMatchId  
      }));
    } else {
      // EN LAS ACTUALIZACIONES (SYNC), SÍ MANDAMOS LOS EVENTOS
      payload.matches = await Promise.all(matches.map(async (m) => {
        const events = m.status === 'completed' ? await MatchEventRepository.getEventsByMatch(m.id) : [];
        return { id: m.id, status: m.status, scoreHome: m.scoreHome, scoreAway: m.scoreAway, events: events || [] };
      }));
    }

    const qrPayload = buildQRPayload(exportType === 'update' ? 'LEAGUE_UPDATE' : 'LINK_LEAGUE', payload);
    // AUMENTAMOS EL TAMAÑO A 500x500 PARA MEJORAR LA LECTURA
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrPayload)}`;
    document.getElementById('qr-image').src = qrApiUrl;
    document.getElementById('qr-display-container').style.display = 'flex';
  };
}

async function openFinalResultsModal(leagueData) {
  document.getElementById('dynamic-share-modal')?.remove();
  const modalHTML = `
    <div id="dynamic-share-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 420px;">
        <h2 class="modal-card__title">Última Sincronización</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; text-align: center;">Genera este QR para que los invitados actualicen los resultados y estadísticas finales de la liga.</p>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <button id="btn-show-qr" class="btn btn--primary" style="width: 100%;">📱 Generar Código QR Final</button>
          <div id="qr-display-container" style="display: none; flex-direction: column; align-items: center; margin-top: 1rem; padding: 1rem; background: #fff; border-radius: 8px;">
            <img id="qr-image" src="" alt="Código QR" style="width: 100%; height: auto; max-width: 350px;" />
            <p style="font-size: 0.75rem; color: #0f172a; margin-top: 0.5rem; font-weight: bold;">Escanea para sincronizar</p>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 2rem; text-align: right;">
          <button type="button" id="dyn-share-cancel" class="btn btn--secondary">Cerrar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-share-modal');
  
  // Al cerrar, recargamos la vista para que la tarjeta muestre "FINALIZADA"
  document.getElementById('dyn-share-cancel').onclick = async () => {
    modalEl.remove();
    await renderLeaguesView(); 
  };

  document.getElementById('btn-show-qr').onclick = async () => {
    const matches = await getMatchesByLeague(leagueData.id);
    let payload = {
      leagueId: leagueData.id,
      leagueName: leagueData.name,
      sport: leagueData.sport,
      mode: leagueData.mode
    };

    // MANDAMOS TODOS LOS PARTIDOS CON SUS EVENTOS PARA EL ÚLTIMO SYNC
    payload.matches = await Promise.all(matches.map(async (m) => {
      const events = m.status === 'completed' ? await MatchEventRepository.getEventsByMatch(m.id) : [];
      return { id: m.id, status: m.status, scoreHome: m.scoreHome, scoreAway: m.scoreAway, events: events || [] };
    }));

    const qrPayload = buildQRPayload('LEAGUE_UPDATE', payload); // Usamos LEAGUE_UPDATE
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrPayload)}`;
    document.getElementById('qr-image').src = qrApiUrl;
    document.getElementById('qr-display-container').style.display = 'flex';
    
    // Marcamos la liga como finalizada en la base de datos local
    if (!leagueData.isFinished) {
      await updateLeague({ ...leagueData, isFinished: true });
    }
  };
}

function openGuestUpdateScanner(league) {
  document.getElementById('dynamic-guest-scan-modal')?.remove();
  const modalHTML = `
    <div id="dynamic-guest-scan-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 420px;">
        <h2 class="modal-card__title">Actualizar Liga</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; text-align: center;">Pide al organizador que te muestre el QR de Actualización o Resultados Finales y escanéalo aquí.</p>
        <div id="qr-guest-video-container" style="border-radius: 8px; overflow: hidden; margin-bottom: 1rem;">
          <video id="qr-guest-video" style="width: 100%; height: auto;" autoplay muted playsinline></video>
        </div>
        <div class="modal-actions" style="text-align: right;">
          <button type="button" id="dyn-guest-scan-cancel" class="btn btn--secondary">Cancelar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-guest-scan-modal');
  const videoEl = document.getElementById('qr-guest-video');
  document.getElementById('dyn-guest-scan-cancel').onclick = () => { stopQRScanner(); modalEl.remove(); };

  startQRScanner(videoEl, async (rawData) => {
    try {
      const result = await handleImportData(rawData);
      if (result.success) {
        AlertService.showChampion(result.message, '¡SINCRONIZADO!');
        stopQRScanner(); modalEl.remove();
        renderLeaguesView();
      }
    } catch (err) {
      AlertService.showError(err.message, 'ERROR DE QR');
      stopQRScanner();
    }
  }, (err) => { AlertService.showError('No se pudo acceder a la cámara.', 'ERROR DE CÁMARA'); });
}

async function handleGenerateFixture(league, mode) {
  const isLiga = mode.includes('Liga');
  const isIdaYVuelta = mode.includes('Ida y vuelta');
  let requiredTeams = 2;
  if (!isLiga) {
    if (mode.includes('4')) requiredTeams = 4;
    else if (mode.includes('8')) requiredTeams = 8;
    else if (mode.includes('16')) requiredTeams = 16;
  }
  const teams = await getTeamsByLeague(league.id);
  const realTeamCount = teams.length;
  if (isLiga && realTeamCount < 2) { AlertService.showError('Se necesitan al menos 2 equipos para generar una Liga.'); return; }
  if (!isLiga && realTeamCount !== requiredTeams) { AlertService.showError(`Eliminación directa de ${requiredTeams} requiere EXACTAMENTE ${requiredTeams} equipos. Tienes ${realTeamCount}.`); return; }

  let generatedMatches = [];
  if (isLiga) generatedMatches = generateLeagueFixture(league.id, teams, isIdaYVuelta);
  else generatedMatches = generateEliminationBracket(league.id, teams, requiredTeams);

  openFixtureConfigModal(generatedMatches, teams);
}

function openFixtureConfigModal(matches, teamsList) {
  document.getElementById('dynamic-fixture-modal')?.remove();
  const teamsObj = Object.fromEntries(teamsList.map(t => [t.id, t.name]));
  let matchesHTML = '';
  matches.forEach((m, index) => {
    const homeName = m.homeTeamId === 'TBD' ? 'Por definir' : (teamsObj[m.homeTeamId] || 'Eliminado');
    const awayName = m.awayTeamId === 'TBD' ? 'Por definir' : (teamsObj[m.awayTeamId] || 'Eliminado');
    const d = new Date(m.date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); 
    const dateVal = d.toISOString().slice(0, 16);
    matchesHTML += `
      <div class="info-card" style="padding: 0.75rem; display: flex; align-items: center; gap: 10px; margin-bottom: 0.5rem;">
        <span style="flex:1; text-align:right; font-weight:bold; font-size:0.85rem;">${homeName}</span>
        <span style="color:#64748b; font-weight:bold;">VS</span>
        <span style="flex:1; text-align:left; font-weight:bold; font-size:0.85rem;">${awayName}</span>
        <input type="datetime-local" class="form-control fixture-date-input" data-index="${index}" value="${dateVal}" style="width: 180px; padding: 0.3rem; font-size: 0.8rem;" />
      </div>`;
  });

  const modalHTML = `
    <div id="dynamic-fixture-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
        <h2 class="modal-card__title">Organizar Calendario</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1rem;">Ajusta las fechas y horas de los encuentros. Al guardar, se crearán en el sistema.</p>
        <div id="fixture-list-container">${matchesHTML}</div>
        <div class="modal-actions" style="margin-top: 1.5rem; justify-content: flex-end;">
          <button type="button" id="btn-cancel-fixture" class="btn btn--secondary">Cancelar</button>
          <button type="button" id="btn-save-fixture" class="btn btn--primary">💾 Guardar Todo el Fixture</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-fixture-modal');
  document.getElementById('btn-cancel-fixture').onclick = () => modalEl.remove();
  modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.remove(); };

  document.getElementById('btn-save-fixture').onclick = async () => {
    const dateInputs = document.querySelectorAll('.fixture-date-input');
    dateInputs.forEach(input => {
      const idx = parseInt(input.dataset.index);
      if (input.value) matches[idx].date = new Date(input.value).toISOString();
    });
    try {
      await bulkInsertFullMatches(matches);
      AlertService.showChampion(`¡Se guardaron ${matches.length} partidos exitosamente!`, 'FIXTURE LISTO');
      modalEl.remove();
      renderLeaguesView(); 
    } catch (error) {
      console.error('Error guardando fixture:', error);
      AlertService.showError('Ocurrió un error al guardar los partidos en la base de datos.');
    }
  };
}