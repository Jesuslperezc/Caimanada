// views/matches.js
import { getActiveLeague } from '../db/repositories/leagues.js';
import { getMatchesByLeague, updateMatch, deleteMatch } from '../db/repositories/matches.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getPlayersByTeam } from '../db/repositories/players.js';
import { calculateStandings } from '../utils/statsCalculator.js';
import { MatchChronometer } from '../utils/match-chronometer.js';
import { executeTransaction } from '../db/db.js';
import { MatchEventRepository } from '../db/repositories/matchEvent.js';
import { AlertService } from '../components/alert.js';

let activeChronometer = null;
let liveMatchEvents = [];

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

export async function renderMatchesView() {
  const container = document.getElementById('matches-content-target');
  if (!container) return;

  container.innerHTML = `<loading-state message="Cargando partidos..."></loading-state>`;

  let activeLeague = await getActiveLeague();

  if (activeLeague) {
    const currentGlobalSport = localStorage.getItem('active_sport_id');
    if (currentGlobalSport !== activeLeague.sport) {
      localStorage.setItem('active_sport_id', activeLeague.sport);
      const sportSelect = document.getElementById('active-sport-selector');
      if (sportSelect) sportSelect.value = activeLeague.sport;
    }
  }

  if (!activeLeague) {
    container.innerHTML = `<div class="empty-state"><p class="empty-state__title">No hay liga activa.</p></div>`;
    return;
  }

  const matches = await getMatchesByLeague(activeLeague.id);
  const teams = await getTeamsByLeague(activeLeague.id);
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]));

  container.innerHTML = `
    <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
      <div>
        <h1 class="view-title">Partidos y Resultados</h1>
        <p class="view-subtitle">${escapeHTML(activeLeague.name)} (${escapeHTML(activeLeague.mode)})</p>
      </div>
    </header>

    <section style="margin-bottom: 2.5rem;">
      <h2 style="margin-bottom: 1rem; border-bottom: 2px solid var(--accent-primary); padding-bottom: 0.5rem; display:inline-block;">Calendario</h2>
      <div id="matches-grid" class="matches-calendar-grid"></div>
    </section>

    <section class="standings-section">
      <h2 style="margin-bottom: 1rem; border-bottom: 2px solid var(--accent-primary); padding-bottom: 0.5rem; display:inline-block;">Tabla de Posiciones</h2>
      <div id="standings-table-container"></div>
    </section>
  `;

  renderMatchesList(matches, teamsMap, activeLeague);
  renderStandingsTable(teams, matches);
}

// --- MODAL PARA EDITAR FECHA DE PARTIDO ---
function openEditMatchModal(match, teamsMap) {
  document.getElementById('dynamic-edit-match-modal')?.remove();
  let dateVal = '';
  if (match.date) {
    const d = new Date(match.date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    dateVal = d.toISOString().slice(0, 16);
  }

  const homeName = teamsMap[match.homeTeamId]?.name || 'Por definir';
  const awayName = teamsMap[match.awayTeamId]?.name || 'Por definir';

  const modalHTML = `
    <div id="dynamic-edit-match-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 400px;">
        <h2 class="modal-card__title">Editar Fecha/Hora</h2>
        <p style="text-align:center; margin-bottom:1rem; font-weight:bold;">${escapeHTML(homeName)} vs ${escapeHTML(awayName)}</p>
        <div class="form-group" style="margin-bottom: 1.5rem;">
          <label class="form-group__label">Nueva Fecha y Hora</label>
          <input type="datetime-local" id="edit-match-date" required class="form-control" value="${dateVal}" />
        </div>
        <div class="modal-actions">
          <button type="button" id="edit-match-cancel" class="btn btn--secondary">Cancelar</button>
          <button type="button" id="edit-match-save" class="btn btn--primary">Guardar</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-edit-match-modal');

  document.getElementById('edit-match-cancel').onclick = () => modalEl.remove();
  modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.remove(); };

  document.getElementById('edit-match-save').onclick = async () => {
    const newDate = document.getElementById('edit-match-date').value;
    if (!newDate) { AlertService.showError('Selecciona una fecha.'); return; }
    
    await updateMatch({ ...match, date: new Date(newDate).toISOString() });
    AlertService.showSuccess('Fecha actualizada.');
    modalEl.remove();
    renderMatchesView();
  };
}

// --- LISTA DE PARTIDOS CON BOTONES ---
function renderMatchesList(matches, teamsMap, league) {
  const grid = document.getElementById('matches-grid');
  if (!grid) return;

  if (matches.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p class="empty-state__title">Calendario vacío.</p><p class="empty-state__subtitle">Genera el fixture desde la vista de Ligas.</p></div>`;
    return;
  }

  matches.sort((a, b) => new Date(a.date) - new Date(b.date));

  grid.innerHTML = matches.map(match => {
    const homeName = escapeHTML(teamsMap[match.homeTeamId]?.name || 'TBD');
    const awayName = escapeHTML(teamsMap[match.awayTeamId]?.name || 'TBD');
    const isPending = match.status === 'pending';
    const isCompleted = match.status === 'completed';
    
    let dateFormatted = 'Sin fecha';
    let timeFormatted = '--:--';
    if (match.date) {
      const d = new Date(match.date);
      dateFormatted = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
      timeFormatted = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

    return `
      <article class="match-card">
        <div class="match-card__header">
          <div class="match-card__date">
            <span>${dateFormatted}</span>
            <span>🕐 ${timeFormatted}</span>
          </div>
          <div class="match-card__actions">
            ${isPending ? `
              <button class="btn btn--secondary btn--sm btn-edit-match" data-id="${match.id}" title="Editar fecha">✏️</button>
              <button class="btn btn--danger btn--sm btn-delete-match" data-id="${match.id}" title="Eliminar partido">🗑️</button>
            ` : ''}
            ${isCompleted ? '<span style="font-size:0.8rem; color:#10b981; font-weight:bold;">FINALIZADO</span>' : ''}
          </div>
        </div>
        
        <div class="match-card__body">
          <span class="match-card__team match-card__team--home">${homeName}</span>
          
          ${isPending 
            ? `<div class="match-card__score match-card__score--active" onclick="window.openLiveMatch('${match.id}', '${league.id}', '${league.sport}')">VS</div>`
            : `<div class="match-card__score match-card__score--finished">${match.scoreHome ?? 0} - ${match.scoreAway ?? 0}</div>`
          }
          
          <span class="match-card__team match-card__team--away">${awayName}</span>
        </div>
      </article>`;
  }).join('');

  // Eventos de Editar y Eliminar
  grid.querySelectorAll('.btn-edit-match').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const match = matches.find(m => m.id === btn.dataset.id);
      if(match) openEditMatchModal(match, teamsMap);
    };
  });

  grid.querySelectorAll('.btn-delete-match').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      showConfirmDialog('¿Estás seguro de eliminar este partido del calendario?', async () => {
        await deleteMatch(btn.dataset.id);
        AlertService.showWarning('Partido eliminado.');
        renderMatchesView();
      });
    };
  });
}

function renderStandingsTable(teams, matches) {
  const container = document.getElementById('standings-table-container');
  if (!container) return;
  const standings = calculateStandings(teams, matches);

  container.innerHTML = `
    <div style="overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-card);">
      <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        <thead style="background: rgba(255,255,255,0.05);">
          <tr>
            <th style="padding: 10px; text-align: left;">#</th>
            <th style="padding: 10px; text-align: left;">Equipo</th>
            <th style="padding: 10px; text-align: center;">PJ</th>
            <th style="padding: 10px; text-align: center;">G</th>
            <th style="padding: 10px; text-align: center;">E</th>
            <th style="padding: 10px; text-align: center;">P</th>
            <th style="padding: 10px; text-align: center;">GF</th>
            <th style="padding: 10px; text-align: center;">GC</th>
            <th style="padding: 10px; text-align: center;">DG</th>
            <th style="padding: 10px; text-align: center; color: var(--accent-primary);">PTS</th>
          </tr>
        </thead>
        <tbody>
          ${standings.length === 0 ? `<tr><td colspan="10" style="padding:20px; text-align:center; color:#64748b;">Sin datos</td></tr>` : 
          standings.map((st, i) => `
            <tr style="border-top: 1px solid var(--border-card);">
              <td style="padding: 10px; font-weight: bold;">${i + 1}</td>
              <td style="padding: 10px;">${escapeHTML(st.name)}</td>
              <td style="padding: 10px; text-align: center;">${st.pj}</td>
              <td style="padding: 10px; text-align: center; color: #10b981;">${st.pg}</td>
              <td style="padding: 10px; text-align: center; color: #f59e0b;">${st.pe}</td>
              <td style="padding: 10px; text-align: center; color: #ef4444;">${st.pp}</td>
              <td style="padding: 10px; text-align: center;">${st.gf}</td>
              <td style="padding: 10px; text-align: center;">${st.gc}</td>
              <td style="padding: 10px; text-align: center;">${st.dg > 0 ? '+' : ''}${st.dg}</td>
              <td style="padding: 10px; text-align: center; font-weight: 900; font-size: 1.1rem;">${st.pts}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// --- PARTIDO EN VIVO ---
window.openLiveMatch = async function(matchId, leagueId, sportId) {
  if (activeChronometer) { AlertService.showError('Ya hay un partido en vivo.'); return; }
  liveMatchEvents = [];
  const match = (await getMatchesByLeague(leagueId)).find(m => m.id === matchId);
  const teams = await getTeamsByLeague(leagueId);
  const homeTeam = teams.find(t => t.id === match.homeTeamId);
  const awayTeam = teams.find(t => t.id === match.awayTeamId);
  const homePlayers = await getPlayersByTeam(homeTeam.id);
  const awayPlayers = await getPlayersByTeam(awayTeam.id);

  document.body.insertAdjacentHTML('beforeend', `
    <div id="live-match-modal" class="live-modal">
      <div class="live-modal__container">
        <div class="live-modal__period" id="live-period-name">Sin Iniciar</div>
        <div class="live-modal__scoreboard">
          <div class="live-modal__team-name live-modal__team-name--left">${escapeHTML(homeTeam.name)}</div>
          <div class="live-modal__numbers">
            <span class="live-modal__score-num" id="live-score-home">0</span>
            <span class="live-modal__dash">-</span>
            <span class="live-modal__score-num" id="live-score-away">0</span>
          </div>
          <div class="live-modal__team-name live-modal__team-name--right">${escapeHTML(awayTeam.name)}</div>
        </div>
        <div class="live-modal__clock-container">
          <div class="live-modal__clock" id="live-clock">00:00</div>
        </div>
        <div class="live-modal__controls">
          <button id="btn-play-pause" class="btn btn--primary" onclick="window.togglePlayPause()">▶ Iniciar</button>
          <button id="btn-next-period" class="btn btn--secondary" onclick="window.nextPeriod()">⏭ Periodo</button>
          <button class="btn btn--danger" onclick="window.finishLiveMatch('${matchId}', '${leagueId}')">🛑 Finalizar</button>
        </div>
        <div class="live-modal__events-panel">
          <h3 style="margin-bottom: 1rem; font-size: 0.9rem; color: #fff;">Registrar Evento</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
            <select id="live-team-select" class="form-control" onchange="window.updatePlayerSelect()">
              <option value="home">${escapeHTML(homeTeam.name)}</option>
              <option value="away">${escapeHTML(awayTeam.name)}</option>
            </select>
            <select id="live-player-select" class="form-control"></select>
          </div>
          <div style="display: flex; gap: 10px;" id="events-buttons-container">
            <button class="btn btn--primary" style="flex:1; background: #10b981;" onclick="window.addLiveEvent('point')">⭐ Punto</button>
            <button class="btn btn--secondary" style="flex:1; background: #eab308; color:#000;" onclick="window.addLiveEvent('warning')">🟨 Amarilla</button>
            <button class="btn btn--danger" style="flex:1;" onclick="window.addLiveEvent('expulsion')">🟥 Roja</button>
          </div>
        </div>
        <div class="live-modal__events-log" id="live-events-log"><p style="color: #64748b; text-align: center;">Sin eventos aún</p></div>
        <div style="text-align: right; margin-top: 2rem;">
          <button class="btn btn--secondary" onclick="window.closeLiveMatch()">Cerrar (Cancelar)</button>
        </div>
      </div>
    </div>
  `);

  window._liveData = { matchId, leagueId, homeTeam, awayTeam, homePlayers, awayPlayers, scoreHome: 0, scoreAway: 0 };
  window.updatePlayerSelect();
  activeChronometer = new MatchChronometer(sportId);
  activeChronometer.onTick = (state) => updateClockUI(state);
  activeChronometer.onPeriodChange = (state) => updateClockUI(state);
};

window.updatePlayerSelect = function() {
  const teamKey = document.getElementById('live-team-select').value;
  const select = document.getElementById('live-player-select');
  const players = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const btnContainer = document.getElementById('events-buttons-container');
  if (players.length === 0) {
    select.innerHTML = `<option value="" disabled selected>Sin jugadores</option>`;
    select.disabled = true; btnContainer.style.opacity = '0.4'; btnContainer.style.pointerEvents = 'none';
  } else {
    select.innerHTML = players.map(p => `<option value="${p.id}">#${p.number} - ${escapeHTML(p.name)}</option>`).join('');
    select.disabled = false; btnContainer.style.opacity = '1'; btnContainer.style.pointerEvents = 'auto';
  }
};

window.addLiveEvent = function(type) {
  const playerSelect = document.getElementById('live-player-select');
  if (playerSelect.disabled || !playerSelect.value) { AlertService.showError('No hay jugadores.'); return; }
  const teamKey = document.getElementById('live-team-select').value;
  const playerId = playerSelect.value;
  const playersList = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const player = playersList.find(p => p.id === playerId);
  if (!player) return;

  liveMatchEvents.push({
    id: `event_${Date.now()}`, matchId: window._liveData.matchId,
    teamId: teamKey === 'home' ? window._liveData.homeTeam.id : window._liveData.awayTeam.id,
    playerId: player.id, playerName: player.name, playerNumber: player.number,
    type: type, minute: activeChronometer ? activeChronometer.formattedTime : '00:00'
  });

  if (type === 'point') {
    if (teamKey === 'home') window._liveData.scoreHome++; else window._liveData.scoreAway++;
    document.getElementById('live-score-home').textContent = window._liveData.scoreHome;
    document.getElementById('live-score-away').textContent = window._liveData.scoreAway;
  }
  renderEventsLog();
};

window.togglePlayPause = function() {
  if (!activeChronometer) return;
  if (activeChronometer.isRunning) activeChronometer.pause(); else activeChronometer.start();
  updatePlayPauseBtn();
};

window.nextPeriod = function() {
  if (!activeChronometer) return;
  activeChronometer.startBreak(activeChronometer.currentPeriodIndex === 1);
  updatePlayPauseBtn();
};

window.finishLiveMatch = async function(matchId, leagueId) {
  if (!activeChronometer) return;
  activeChronometer.pause(); activeChronometer.destroy(); activeChronometer = null;
  const scoreHome = window._liveData.scoreHome;
  const scoreAway = window._liveData.scoreAway;
  const eventsToSave = [...liveMatchEvents];

  try {
    await executeTransaction(['matches', 'events'], 'readwrite', async (tx) => {
      const matchStore = tx.objectStore('matches');
      const match = await new Promise((res, rej) => { const req = matchStore.get(matchId); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      match.status = 'completed'; match.scoreHome = scoreHome; match.scoreAway = scoreAway;
      matchStore.put(match);
      if (eventsToSave.length > 0) await MatchEventRepository.addEventsInTransaction(tx, eventsToSave);
    });
    document.getElementById('live-match-modal')?.remove();
    AlertService.showChampion('¡Partido Finalizado!', `${scoreHome} - ${scoreAway}`);
    renderMatchesView();
  } catch (error) {
    console.error(error);
    AlertService.showError('Error al guardar.');
  }
};

window.closeLiveMatch = function() {
  if (activeChronometer) { activeChronometer.destroy(); activeChronometer = null; }
  document.getElementById('live-match-modal')?.remove(); liveMatchEvents = [];
};

function updateClockUI(state) {
  document.getElementById('live-clock').textContent = state.formattedTime;
  document.getElementById('live-period-name').textContent = state.currentPeriodName;
  updatePlayPauseBtn();
}

function updatePlayPauseBtn() {
  const btn = document.getElementById('btn-play-pause');
  if (!btn || !activeChronometer) return;
  btn.textContent = activeChronometer.isRunning ? '⏸ Pausar' : '▶ Reanudar';
  btn.style.background = activeChronometer.isRunning ? '#f59e0b' : '';
  btn.style.color = activeChronometer.isRunning ? '#000' : '';
}

function renderEventsLog() {
  const log = document.getElementById('live-events-log');
  if (liveMatchEvents.length === 0) { log.innerHTML = `<p style="color: #64748b; text-align: center;">Sin eventos aún</p>`; return; }
  log.innerHTML = liveMatchEvents.slice().reverse().map(ev => {
    const icon = ev.type === 'point' ? '⭐' : ev.type === 'warning' ? '🟨' : '🟥';
    return `<div class="live-log__item live-log__item--${ev.type}">
      <span>${icon} #${ev.playerNumber} ${escapeHTML(ev.playerName)}</span>
      <span style="color: #fff;">${ev.minute}</span>
    </div>`;
  }).join('');
}