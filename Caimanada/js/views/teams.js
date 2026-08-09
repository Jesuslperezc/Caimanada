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
      <div class="modal-card modal-card--confirm">
        <h2 class="modal-card__title">Confirmar Acción</h2>
        <p class="modal-subtitle">${messageHTML}</p>
        <div class="modal-actions">
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
          const safeColor = team.color ? escapeHTML(team.color) : '#00ff9d';
          const playersCount = playersCountMap[team.id] || 0;
          const safeId = escapeHTML(team.id);
          const st = statsMap[team.id] || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
          const dgClass = st.dg > 0 ? 'team-stats-dg--positive' : (st.dg < 0 ? 'team-stats-dg--negative' : '');
          return `
            <article class="info-card team-card" style="--team-accent: ${safeColor};">
              <header class="info-card__header">
                <span class="info-card__label">${team.leagueId ? 'En competición' : 'Club Independiente'}</span>
                <h2 class="info-card__highlight">${safeName}</h2>
              </header>
              <div class="info-card__body">
                <p class="info-card__subtext"><strong>Delegado:</strong> ${safeDelegate}</p>
                <p class="info-card__subtext"><strong>Jugadores:</strong> ${playersCount}</p>
                <hr class="card-divider" />
                <div class="team-stats-summary">
                  <div><strong>PTS</strong><br/><span>${st.pts}</span></div>
                  <div><strong>PJ</strong><br/><span>${st.pj}</span></div>
                  <div><strong>G/E/P</strong><br/><span>${st.pg}/${st.pe}/${st.pp}</span></div>
                  <div><strong>DG</strong><br/><span class="${dgClass}">${st.dg > 0 ? `+${st.dg}` : st.dg}</span></div>
                </div>
              </div>
              <footer class="info-card__footer">
                <button class="btn btn--secondary btn--sm btn-view-roster" data-id="${safeId}" data-name="${safeName}">Plantilla</button>
                <button class="btn btn--primary btn--sm btn-add-player" data-id="${safeId}" data-name="${safeName}"><i class="fa-solid fa-user-plus"></i> Jugador</button>
                <button class="btn btn--secondary btn--sm btn-share-team" data-id="${safeId}" data-name="${safeName}"><i class="fa-solid fa-qrcode"></i> Compartir QR</button>
                <button class="btn btn--danger btn--sm btn-delete-team" data-id="${safeId}" data-name="${safeName}"><i class="fa-solid fa-trash"></i> Eliminar</button>
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
      <div class="modal-card modal-card--form">
        <h2 class="modal-card__title">Registrar Nuevo Club</h2>
        <form id="dynamic-team-form">
          <div class="form-group">
            <label class="form-group__label">Nombre del Equipo *</label>
            <input type="text" id="dyn-team-name" required placeholder="Ej: Deportivo Maracaibo" class="form-control" />
          </div>
          <div class="form-group">
            <label class="form-group__label">Deporte *</label>
            <select id="dyn-team-sport" required class="form-control">
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
            <label class="form-group__label">Delegado / Capitán</label>
            <input type="text" id="dyn-team-delegate" value="${currentUser ? escapeHTML(currentUser.name) : ''}" readonly class="form-control input-readonly" />
          </div>
          <div class="modal-actions form-flex--end">
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
      <div class="modal-card modal-card--form">
        <h2 class="modal-card__title">Agregar Jugador</h2>
        <p class="modal-subtitle modal-subtitle--left">Equipo: <strong>${escapeHTML(teamName)}</strong></p>
        <p id="available-spots-text" class="modal-highlight">Cupos disponibles: ${availableSpots} de ${maxCount}</p>
        <form id="dyn-player-form">
          <div class="form-group">
            <label class="form-group__label">Nombre Completo *</label>
            <input type="text" id="dyn-player-name" required placeholder="Ej: Roberto Carlos" class="form-control" autofocus />
          </div>
          <div class="form-flex">
            <div class="form-group">
              <label class="form-group__label">Dorsal *</label>
              <input type="number" id="dyn-player-number" min="0" max="99" required value="${suggestedNumber}" class="form-control" />
            </div>
            <div class="form-group form-group--double">
              <label class="form-group__label">Posición *</label>
              <select id="dyn-player-position" required class="form-control">
                ${positions.map(pos => `<option value="${pos}">${pos}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal-actions form-flex--between">
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
      spotsText.textContent = `Cupos disponibles: ${availableSpots} de ${maxCount}`;
    }
  };
}

function openRosterModal(teamId, teamName, onCloseCallback) {
  document.getElementById('dynamic-roster-modal')?.remove();
  const modalHTML = `
    <div id="dynamic-roster-modal" class="modal-overlay">
      <div class="modal-card modal-card--form">
        <h2 class="modal-card__title">Plantilla: ${escapeHTML(teamName)}</h2>
        <div id="dyn-players-list" class="roster-list"></div>
        <div class="modal-actions form-flex--end">
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
      list.innerHTML = `<p class="modal-subtitle">Sin jugadores registrados.</p>`;
      return;
    }
    list.innerHTML = players.map(p => `
      <div class="roster-player-row">
        <div class="roster-player-info">
          <span class="roster-player-number">#${escapeHTML(p.number)}</span>
          <div>
            <span class="roster-player-name">${escapeHTML(p.name)}</span><br>
            <span class="roster-player-position">${escapeHTML(p.position || 'Sin posición')}</span>
          </div>
        </div>
        <button class="roster-delete-btn btn-del-p" data-id="${p.id}">X</button>
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
  const players = await getPlayersByTeam(teamData.id);

  const modalHTML = `
    <div id="dynamic-share-team-modal" class="modal-overlay">
      <div class="modal-card modal-card--form">
        <h2 class="modal-card__title">Compartir Equipo</h2>
        <p class="modal-subtitle">Muestra este código QR al Organizador de la liga para que tu equipo quede registrado en su dispositivo.</p>
        <div class="qr-image-container">
          <div class="qr-white-box">
            <img id="qr-team-image" src="" alt="Código QR de Equipo" />
          </div>
          <p class="qr-team-caption">Equipo: ${escapeHTML(teamData.name)} (${players.length} jugadores)</p>
        </div>
        <div class="modal-actions form-flex--end">
          <button type="button" id="dyn-share-team-cancel" class="btn btn--secondary">Cerrar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-share-team-modal');
  document.getElementById('dyn-share-team-cancel').onclick = () => modalEl.remove();

  const qrPayload = buildQRPayload('IMPORT_TEAM', {
    id: teamData.id, name: teamData.name, leagueId: teamData.leagueId, 
    delegate: teamData.delegate, sportId: activeSportId, color: teamData.color,
    players: players.map(p => ({ id: p.id, name: p.name, number: p.number, position: p.position }))
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
        scanBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Escanear Equipo';
    addBtn.parentNode.insertBefore(scanBtn, addBtn.nextSibling);
  }
  if (scanBtn) {
    scanBtn.onclick = () => {
      document.getElementById('dynamic-scan-team-modal')?.remove();
      const modalHTML = `
        <div id="dynamic-scan-team-modal" class="modal-overlay">
          <div class="modal-card modal-card--form">
            <h2 class="modal-card__title">Escanear Equipo Invitado</h2>
            <p class="modal-subtitle">Pide al capitán que abra el QR de su equipo y apunta la cámara aquí.</p>
            <div class="qr-video-container">
              <video id="qr-team-video" autoplay muted playsinline></video>
            </div>
            <div class="modal-actions form-flex--end">
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