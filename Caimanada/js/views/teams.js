import { getActiveLeague, getAllLeagues } from '../db/repositories/leagues.js';
import { getTeamsBySport, addTeam, updateTeam, deleteTeam } from '../db/repositories/teams.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { getPlayersByTeam, addPlayer, deletePlayer } from '../db/repositories/players.js';
import { calculateStandings } from '../utils/statsCalculator.js';
import { AlertService } from '../components/alert.js';
import { getMaxPlayersForSport, getPositionsForSport } from '../utils/sport-terms.js';
import { startQRScanner, stopQRScanner, buildQRPayload } from '../utils/qr.js';
import { handleImportData } from '../utils/export-import.js';
import { getCurrentUser } from '../utils/session.js';

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

export async function renderTeamsView() {
  const container = document.getElementById('teams-content-target');
  const searchInput = document.getElementById('teams-search-input');
  const addBtn = document.getElementById('btn-add-team');

  if (!container) return;
  container.innerHTML = `<loading-state message="Cargando equipos..."></loading-state>`;

  try {
    const activeSportId = getActiveSport();
    const activeLeague = await getActiveLeague();
    const teamsData = await getTeamsBySport(activeSportId);

    const playersCountMap = {};
    await Promise.all(teamsData.map(async (team) => {
      const players = await getPlayersByTeam(team.id);
      playersCountMap[team.id] = players ? players.length : 0;
    }));

    let statsMap = {};
    if (activeLeague) {
      const matchesData = await getMatchesByLeague(activeLeague.id);
      const standings = calculateStandings(teamsData, matchesData);
      statsMap = Object.fromEntries(standings.map(s => [s.id, s]));
    }

    function render(teams) {
      if (!teams || teams.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <p class="empty-state__title">No hay equipos registrados en ${SPORT_DISPLAY_NAMES[activeSportId] || 'este deporte'}.</p>
            <p class="empty-state__subtitle">Presiona "Registrar Equipo" para agregar el primero.</p>
          </div>`;
        return;
      }

      container.innerHTML = `
        <div class="teams-grid">
          ${teams.map(team => {
            const safeName = escapeHTML(team.name);
            const safeDelegate = escapeHTML(team.delegate || 'Sin asignar');
            const safeColor = team.color ? escapeHTML(team.color) : 'var(--accent-primary, #00A86B)';
            const playersCount = playersCountMap[team.id] || 0;
            const safeId = escapeHTML(team.id);
            const st = statsMap[team.id] || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };

            return `
              <article class="info-card team-card" style="border-left: 4px solid ${safeColor}">
                <header class="info-card__header">
                  <span class="info-card__label">${team.leagueId ? 'En competición' : 'Club Independiente'}</span>
                  <h2 class="info-card__highlight">${safeName}</h2>
                </header>
                <div class="info-card__body">
                  <p class="info-card__subtext"><strong>Delegado:</strong> ${safeDelegate}</p>
                  <p class="info-card__subtext"><strong>Jugadores:</strong> ${playersCount}</p>
                  <hr class="card-divider" />
                  <div class="team-stats-summary" style="display: flex; justify-content: space-between; text-align: center; font-size: 0.85rem; margin-top: 0.5rem;">
                    <div><strong>PTS</strong><br/>${st.pts}</div>
                    <div><strong>PJ</strong><br/>${st.pj}</div>
                    <div><strong>G/E/P</strong><br/>${st.pg}/${st.pe}/${st.pp}</div>
                    <div><strong>DG</strong><br/>${st.dg > 0 ? `+${st.dg}` : st.dg}</div>
                  </div>
                </div>
                <footer class="info-card__footer" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 1rem;">
                  <button class="btn btn--secondary btn--sm btn-view-roster" data-id="${safeId}" data-name="${safeName}">Plantilla</button>
                  <button class="btn btn--primary btn--sm btn-add-player" data-id="${safeId}" data-name="${safeName}">+ Jugador</button>
                  <button class="btn btn--secondary btn--sm btn-share-team" data-id="${safeId}" data-name="${safeName}">Compartir QR</button>
                  <button class="btn btn--danger btn--sm btn-delete-team" data-id="${safeId}" data-name="${safeName}">Eliminar</button>
                </footer>
              </article>`;
          }).join('')}
        </div>`;
    }

    if (searchInput) {
      searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = teamsData.filter(t => (t.name && t.name.toLowerCase().includes(query)) || (t.delegate && t.delegate.toLowerCase().includes(query)));
        render(filtered);
      };
    }

    if (addBtn) {
      addBtn.onclick = () => { openAddTeamModal(activeSportId, async () => { await renderTeamsView(); }); };
    }

    container.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const safeId = btn.dataset.id;
      const safeName = btn.dataset.name;

      if (btn.classList.contains('btn-add-player')) {
        const currentPlayers = playersCountMap[safeId] || 0;
        const maxPlayers = getMaxPlayersForSport(activeSportId);
        if (currentPlayers >= maxPlayers) {
          AlertService.showError(`No puedes agregar más jugadores. El límite para ${SPORT_DISPLAY_NAMES[activeSportId]} es de ${maxPlayers}.`, 'PLANTILLA LLENA');
          return;
        }
        openAddPlayerModal(safeId, safeName, activeSportId, currentPlayers, maxPlayers, async () => { await renderTeamsView(); });
      }

      if (btn.classList.contains('btn-view-roster')) {
        openRosterModal(safeId, safeName, async () => { await renderTeamsView(); });
      }

      if (btn.classList.contains('btn-delete-team')) {
        showConfirmDialog(`¿Deseas eliminar el equipo <strong>"${escapeHTML(safeName)}"</strong>?`, async () => {
          await deleteTeam(safeId);
          AlertService.showWarning('Equipo eliminado.', 'EQUIPO BORRADO');
          await renderTeamsView();
        });
      }

      if (btn.classList.contains('btn-share-team')) {
        const team = teamsData.find(t => t.id === safeId);
        if (team) openShareTeamModal(team);
      }
    };

    render(teamsData);
    setupScanTeamButton();
  } catch (error) {
    console.error('Error al renderizar equipos:', error);
    container.innerHTML = '';
    const errComp = document.createElement('error-state');
    errComp.setError('Hubo un problema al cargar los equipos.', () => renderTeamsView());
    container.appendChild(errComp);
  }
}

function openAddTeamModal(defaultSportId, onSaveCallback) {
  document.getElementById('dynamic-team-modal')?.remove();
  const currentUser = getCurrentUser();
  const modalHTML = `
    <div id="dynamic-team-modal" class="modal-overlay">
      <div class="modal-card">
        <h2 class="modal-card__title">Registrar Nuevo Club</h2>
        <form id="dynamic-team-form">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-group__label">Nombre del Equipo *</label>
            <input type="text" id="dyn-team-name" required placeholder="Ej: Deportivo Maracaibo" class="form-control" style="width: 100%; padding: 0.5rem;" />
          </div>
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-group__label">Deporte *</label>
            <select id="dyn-team-sport" required class="form-control" style="width: 100%; padding: 0.5rem;">
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
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-group__label">Delegado / Capitán</label>
            <input type="text" id="dyn-team-delegate" value="${currentUser ? escapeHTML(currentUser.name) : ''}" readonly class="form-control" style="width: 100%; padding: 0.5rem; background: rgba(255,255,255,0.05); cursor: not-allowed;" />
          </div>
          <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
            <button type="button" id="dyn-team-cancel" class="btn btn--secondary">Cancelar</button>
            <button type="submit" class="btn btn--primary">Registrar</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-team-modal');
  const sportSelect = document.getElementById('dyn-team-sport');
  if (sportSelect) sportSelect.value = defaultSportId;
  document.getElementById('dyn-team-cancel').onclick = () => modalEl.remove();
  document.getElementById('dynamic-team-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('dyn-team-name').value.trim();
    const sportId = document.getElementById('dyn-team-sport').value;
    const delegate = document.getElementById('dyn-team-delegate').value.trim();
    if (!name) return;
    localStorage.setItem('active_sport_id', sportId);
    await addTeam({ sportId, leagueId: null, name, delegate }); 
    AlertService.showSuccess('Equipo registrado exitosamente. Escanea su QR para unirlo a una liga.', '¡EQUIPO LISTO!');
    modalEl.remove();
    if (onSaveCallback) await onSaveCallback();
  };
}

async function openAddPlayerModal(teamId, teamName, sportId, currentCount, maxCount, onSaveCallback) {
  document.getElementById('dynamic-player-modal')?.remove();
  let availableSpots = maxCount - currentCount;
  const existingPlayers = await getPlayersByTeam(teamId);
  const maxNumberUsed = existingPlayers.reduce((max, p) => Math.max(max, Number(p.number) || 0), 0);
  const suggestedNumber = maxNumberUsed + 1;
  const positions = getPositionsForSport(sportId);

  const modalHTML = `
    <div id="dynamic-player-modal" class="modal-overlay">
      <div class="modal-card">
        <h2 class="modal-card__title">Agregar Jugador</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.5rem;">Equipo: <strong>${escapeHTML(teamName)}</strong></p>
        <p id="available-spots-text" style="font-size: 0.8rem; color: #10b981; margin-bottom: 1.5rem; font-weight: bold;">📋 Cupos disponibles: ${availableSpots} de ${maxCount}</p>
        <form id="dyn-player-form">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-group__label">Nombre Completo *</label>
            <input type="text" id="dyn-player-name" required placeholder="Ej: Roberto Carlos" class="form-control" style="width: 100%; padding: 0.5rem;" autofocus />
          </div>
          <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
            <div class="form-group" style="flex: 1;">
              <label class="form-group__label">Dorsal *</label>
              <input type="number" id="dyn-player-number" min="0" max="99" required value="${suggestedNumber}" class="form-control" style="width: 100%; padding: 0.5rem;" />
            </div>
            <div class="form-group" style="flex: 2;">
              <label class="form-group__label">Posición *</label>
              <select id="dyn-player-position" required class="form-control" style="width: 100%; padding: 0.5rem;">
                ${positions.map(pos => `<option value="${pos}">${pos}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: space-between; margin-top: 1.5rem;">
            <button type="button" id="dyn-player-cancel" class="btn btn--secondary">Cerrar</button>
            <button type="submit" class="btn btn--primary">+ Agregar y Seguir</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-player-modal');
  const nameInput = document.getElementById('dyn-player-name');
  const numberInput = document.getElementById('dyn-player-number');
  const spotsText = document.getElementById('available-spots-text');

  document.getElementById('dyn-player-cancel').onclick = async () => { modalEl.remove(); if (onSaveCallback) await onSaveCallback(); };
  document.getElementById('dyn-player-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const number = numberInput.value;
    const position = document.getElementById('dyn-player-position').value;
    if (!name || !number) return;
    await addPlayer({ teamId, name, number, position });
    currentCount++;
    availableSpots = maxCount - currentCount;
    if (availableSpots <= 0) {
      AlertService.showSuccess('Jugador agregado. ¡Plantilla completa!', 'LÍMITE ALCANZADO');
      modalEl.remove();
      if (onSaveCallback) await onSaveCallback();
    } else {
      AlertService.showSuccess(`${name} agregado correctamente.`, '¡REFUERZO LISTO!');
      nameInput.value = '';
      numberInput.value = Number(number) + 1;
      nameInput.focus();
      spotsText.textContent = `📋 Cupos disponibles: ${availableSpots} de ${maxCount}`;
    }
  };
}

function openRosterModal(teamId, teamName, onCloseCallback) {
  document.getElementById('dynamic-roster-modal')?.remove();
  const modalHTML = `
    <div id="dynamic-roster-modal" class="modal-overlay">
      <div class="modal-card">
        <h2 class="modal-card__title">Plantilla: ${escapeHTML(teamName)}</h2>
        <div id="dyn-players-list" style="max-height: 350px; overflow-y: auto; margin: 1rem 0;"></div>
        <div class="modal-actions" style="text-align: right;">
          <button type="button" id="dyn-roster-close" class="btn btn--secondary">Cerrar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-roster-modal');
  document.getElementById('dyn-roster-close').onclick = () => { modalEl.remove(); if (onCloseCallback) onCloseCallback(); };

  const loadPlayers = async () => {
    const list = document.getElementById('dyn-players-list');
    list.innerHTML = `<loading-state message="Cargando plantilla..."></loading-state>`;
    const players = await getPlayersByTeam(teamId);
    if (!players || players.length === 0) {
      list.innerHTML = `<p style="color: #94a3b8; font-size: 0.85rem; text-align: center; padding: 1rem;">Sin jugadores registrados.</p>`;
      return;
    }
    list.innerHTML = players.map(p => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem; background: rgba(255,255,255,0.05); margin-bottom: 0.4rem; border-radius: 6px;">
        <div style="display: flex; align-items: center; gap: 0.8rem;">
          <span style="background: #10b981; color: #fff; font-weight: bold; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">#${escapeHTML(p.number)}</span>
          <div>
            <span style="font-weight: 500; color: #e2e8f0;">${escapeHTML(p.name)}</span><br>
            <span style="font-size: 0.75rem; color: #10b981;">${escapeHTML(p.position || 'Sin posición')}</span>
          </div>
        </div>
        <button class="btn btn--danger btn--sm btn-del-p" data-id="${p.id}">X</button>
      </div>`).join('');
    list.querySelectorAll('.btn-del-p').forEach(btn => {
      btn.onclick = async () => { await deletePlayer(btn.dataset.id); AlertService.showWarning('Jugador eliminado.', 'JUGADOR BORRADO'); await loadPlayers(); };
    });
  };
  loadPlayers();
}
async function openShareTeamModal(teamData) {
  document.getElementById('dynamic-share-team-modal')?.remove();
  const activeSportId = getActiveSport();
  const modalHTML = `
    <div id="dynamic-share-team-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 420px;">
        <h2 class="modal-card__title">Compartir Equipo</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; text-align: center;">Muestra este código QR al Organizador de la liga para que tu equipo quede registrado en su dispositivo.</p>
        <div style="display: flex; flex-direction: column; align-items: center; margin-top: 1rem;">
          <div id="qr-team-display" style="padding: 1rem; background: #fff; border-radius: 8px;">
            <img id="qr-team-image" src="" alt="Código QR de Equipo" style="width: 220px; height: 220px;" />
          </div>
          <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.5rem; font-weight: bold;">Equipo: ${escapeHTML(teamData.name)}</p>
        </div>
        <div class="modal-actions" style="margin-top: 2rem; text-align: right;">
          <button type="button" id="dyn-share-team-cancel" class="btn btn--secondary">Cerrar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-share-team-modal');
  document.getElementById('dyn-share-team-cancel').onclick = () => modalEl.remove();

  const qrPayload = buildQRPayload('IMPORT_TEAM', {
    id: teamData.id, // <--- ESTO ES VITAL PARA QUE NO CRASHEE INDEXEDDB
    name: teamData.name,
    leagueId: teamData.leagueId, 
    delegate: teamData.delegate,
    sportId: activeSportId,
    color: teamData.color // <--- Mantenemos el color original del equipo
  });
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}`;
  document.getElementById('qr-team-image').src = qrApiUrl;
}
export async function setupScanTeamButton() {
  const addBtn = document.getElementById('btn-add-team');
  let scanBtn = document.getElementById('btn-scan-team');
  if (addBtn && !scanBtn) {
    scanBtn = document.createElement('button');
    scanBtn.id = 'btn-scan-team';
    scanBtn.className = 'btn btn--secondary';
    scanBtn.innerHTML = '📷 Escanear Equipo';
    scanBtn.style.marginLeft = '0.5rem';
    addBtn.parentNode.insertBefore(scanBtn, addBtn.nextSibling);
  }
  if (scanBtn) {
    scanBtn.onclick = () => {
      document.getElementById('dynamic-scan-team-modal')?.remove();
      const modalHTML = `
        <div id="dynamic-scan-team-modal" class="modal-overlay">
          <div class="modal-card" style="max-width: 420px;">
            <h2 class="modal-card__title">Escanear Equipo Invitado</h2>
            <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem; text-align: center;">Pide al capitán que abra el QR de su equipo y apunta la cámara aquí.</p>
            <div id="qr-team-video-container" style="border-radius: 8px; overflow: hidden; margin-bottom: 1rem;">
              <video id="qr-team-video" style="width: 100%; height: auto;" autoplay muted playsinline></video>
            </div>
            <div class="modal-actions" style="text-align: right;">
              <button type="button" id="dyn-scan-team-cancel" class="btn btn--secondary">Cancelar</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      const modalEl = document.getElementById('dynamic-scan-team-modal');
      const videoEl = document.getElementById('qr-team-video');
      document.getElementById('dyn-scan-team-cancel').onclick = () => { stopQRScanner(); modalEl.remove(); };
      startQRScanner(videoEl, async (rawData) => {
        try {
          const result = await handleImportData(rawData);
          if (result.success) {
            AlertService.showChampion(result.message, '¡EQUIPO REGISTRADO!');
            stopQRScanner();
            modalEl.remove();
            await renderTeamsView(); 
          }
        } catch (err) {
          AlertService.showError(err.message, 'ERROR DE QR');
          stopQRScanner();
        }
      }, (err) => { AlertService.showError('No se pudo acceder a la cámara.', 'ERROR DE CÁMARA'); });
    };
  }
}