import { getActiveLeague } from '../db/repositories/leagues.js';
import { getMatchesByLeague, updateMatch, deleteMatch } from '../db/repositories/matches.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getPlayersByTeam } from '../db/repositories/players.js';
import { calculateStandings } from '../utils/statsCalculator.js';
import { MatchChronometer } from '../utils/match-chronometer.js';
import { getTimerConfig, getMaxPlayersForSport } from '../utils/sport-terms.js';
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
  document.getElementById('dyn-confirm-accept').onclick = async () => { 
    modalEl.remove(); 
    if (onConfirmCallback) await onConfirmCallback(); 
  };
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
    if (!newDate) { 
      AlertService.showError('Selecciona una fecha.'); 
      return; 
    }
    
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
    // Detectar si es un partido por definir (Eliminación directa)
    const isTBD = match.homeTeamId === 'TBD' || match.awayTeamId === 'TBD';
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
            ${isPending && !isTBD ? `
              <button class="btn btn--secondary btn--sm btn-edit-match" data-id="${match.id}" title="Editar fecha">✏️</button>
              <button class="btn btn--danger btn--sm btn-delete-match" data-id="${match.id}" title="Eliminar partido">🗑️</button>
            ` : ''}
            ${isCompleted ? '<span style="font-size:0.8rem; color:#10b981; font-weight:bold;">FINALIZADO</span>' : ''}
            ${isTBD ? '<span style="font-size:0.8rem; color:#f59e0b; font-weight:bold;">BLOQUEADO</span>' : ''}
          </div>
        </div>
        
        <div class="match-card__body">
          <span class="match-card__team match-card__team--home ${isTBD ? 'match-card__team--tbd' : ''}">${homeName}</span>
          
          ${isPending && !isTBD 
            ? `<div class="match-card__score match-card__score--active" onclick="window.openLiveMatch('${match.id}', '${league.id}', '${league.sport}')">VS</div>`
            : isCompleted 
              ? `<div class="match-card__score match-card__score--finished" style="cursor: pointer;" onclick="window.showMatchSummary('${match.id}')">${match.scoreHome ?? 0} - ${match.scoreAway ?? 0} <br><span style="font-size:0.7rem; color:#94a3b8;">Ver Resumen</span></div>`
              : `<div class="match-card__score">- - -</div>`
          }
          <span class="match-card__team match-card__team--away ${isTBD ? 'match-card__team--tbd' : ''}">${awayName}</span>
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

// --- PARTIDO EN VIVO DINÁMICO ---
window.openLiveMatch = async function(matchId, leagueId, sportId) {
  if (activeChronometer) { 
    activeChronometer.destroy(); 
    activeChronometer = null; 
    document.getElementById('live-match-modal')?.remove();
  }
  
  liveMatchEvents = [];
  const sportConfig = getTimerConfig(sportId);

  try {
    const match = (await getMatchesByLeague(leagueId)).find(m => m.id === matchId);
    const teams = await getTeamsByLeague(leagueId);
    const homeTeam = teams.find(t => t.id === match.homeTeamId);
    const awayTeam = teams.find(t => t.id === match.awayTeamId);
    
    if (!homeTeam || !awayTeam) {
      AlertService.showError('Uno de los equipos ya no existe. Elimina este partido.');
      return;
    }

    const homePlayers = await getPlayersByTeam(homeTeam.id);
    const awayPlayers = await getPlayersByTeam(awayTeam.id);

    const sportLimit = getMaxPlayersForSport(sportId);
    const minRequired = Math.min(sportLimit, 2); 
    
    if (homePlayers.length < minRequired || awayPlayers.length < minRequired) {
      AlertService.showError(`Cada equipo debe tener al menos ${minRequired} jugadores para jugar.`);
      return;
    }

    const scoringButtonsHTML = sportConfig.scoringOptions.map(opt => 
      `<button class="btn btn--primary" style="flex:1; background: #10b981; min-width: 90px; font-size: 0.8rem; padding: 8px;" onclick="window.addLiveEvent('point', ${opt.value})">⭐ ${opt.label}</button>`
    ).join('');

    const cardsButtonsHTML = sportConfig.hasCards ? `
      <button class="btn btn--secondary" style="flex:1; background: #eab308; color:#000; min-width: 80px; font-size: 0.8rem; padding: 8px;" onclick="window.addLiveEvent('warning')">🟨 Amarilla</button>
      <button class="btn btn--danger" style="flex:1; min-width: 80px; font-size: 0.8rem; padding: 8px;" onclick="window.addLiveEvent('expulsion')">🟥 Roja</button>` : '';

    document.body.insertAdjacentHTML('beforeend', `
      <div id="live-match-modal" class="live-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 9999; overflow-y: auto; display: flex; justify-content: center; padding: 1rem;">
        <div class="live-modal__container" style="width: 100%; max-width: 550px; max-height: 95vh; overflow-y: auto; background: #0f172a; border: 1px solid #334155; border-radius: 16px; padding: 1.5rem; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
          
          <div id="live-period-name" style="text-align: center; margin-bottom: 1.5rem;">
            <span style="background: #00A86B; color: #fff; padding: 0.4rem 1.2rem; border-radius: 20px; font-weight: 800; font-size: 0.95rem; letter-spacing: 1px; text-transform: uppercase; box-shadow: 0 4px 10px rgba(0, 168, 107, 0.3);">${sportConfig.periodNames[0]}</span>
          </div>
          
          <div style="display: flex; align-items: center; justify-content: center; gap: 1.5rem; margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid #334155;">
            <div style="flex: 1; text-align: right;">
              <div style="font-size: 1.3rem; font-weight: 800; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${escapeHTML(homeTeam.name)}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 15px; background: rgba(0,0,0,0.3); padding: 10px 25px; border-radius: 12px; border: 1px solid #475569;">
              <span id="live-score-home" style="font-size: 3.5rem; font-weight: 900; color: #fff; font-family: 'Arial Black', sans-serif; min-width: 60px; text-align: center;">0</span>
              <span style="font-size: 2rem; color: #64748b; font-weight: bold;">-</span>
              <span id="live-score-away" style="font-size: 3.5rem; font-weight: 900; color: #fff; font-family: 'Arial Black', sans-serif; min-width: 60px; text-align: center;">0</span>
            </div>
            <div style="flex: 1; text-align: left;">
              <div style="font-size: 1.3rem; font-weight: 800; color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${escapeHTML(awayTeam.name)}</div>
            </div>
          </div>

          <div style="text-align: center; margin-bottom: 2rem; padding: 1.5rem; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid #334155;">
            <div id="live-clock" style="font-size: 4rem; font-weight: 900; font-family: monospace; color: #fff; letter-spacing: 2px;">00:00</div>
            ${!sportConfig.hasClock ? '<div style="color: #94a3b8; font-size: 0.8rem; margin-top: 0.5rem;">⏱ Tiempo cronometrado (Sin límite)</div>' : ''}
          </div>

          <div class="live-modal__controls">
            <button id="btn-play-pause" class="btn btn--primary" onclick="window.togglePlayPause()">▶ Iniciar</button>
            <button id="btn-next-period" class="btn btn--secondary" onclick="window.nextPeriod()">⏭ ${sportConfig.hasClock ? 'Descanso' : 'Siguiente Periodo'}</button>
            <button class="btn btn--danger" onclick="window.finishLiveMatch('${matchId}', '${leagueId}')">🛑 Finalizar</button>
          </div>

          <div id="live-modal__events-panel" style="margin-bottom: 1.5rem; transition: opacity 0.3s;">
            <h3 style="margin-bottom: 1rem; font-size: 0.9rem; color: #fff;">Registrar Evento</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
              <select id="live-team-select" class="form-control" onchange="window.updatePlayerSelect()">
                <option value="home">${escapeHTML(homeTeam.name)}</option>
                <option value="away">${escapeHTML(awayTeam.name)}</option>
              </select>
              <select id="live-player-select" class="form-control"></select>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${scoringButtonsHTML}
              ${cardsButtonsHTML}
            </div>
          </div>

          <div style="display: flex; gap: 0px; margin-bottom: 1rem; border-bottom: 2px solid #334155;">
            <button id="tab-events" onclick="window.switchTab('events')" style="flex:1; padding: 10px; background: transparent; border: none; color: #fff; font-weight: bold; cursor: pointer; border-bottom: 2px solid #00A86B; margin-bottom: -2px;">Eventos</button>
            <button id="tab-lineup" onclick="window.switchTab('lineup')" style="flex:1; padding: 10px; background: transparent; border: none; color: #94a3b8; font-weight: bold; cursor: pointer;">Alineación y Cambios</button>
          </div>

          <div id="panel-events">
            <div class="live-modal__events-log" id="live-events-log" style="max-height: 200px; overflow-y: auto;"><p style="color: #64748b; text-align: center;">Sin eventos aún</p></div>
          </div>

          <div id="panel-lineup" style="display: none; max-height: 300px; overflow-y: auto;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div>
                <h4 style="color: #00A86B; margin-bottom: 0.5rem; font-size: 0.9rem;">${escapeHTML(homeTeam.name)} (Local)</h4>
                <div id="lineup-home"></div>
              </div>
              <div>
                <h4 style="color: #3b82f6; margin-bottom: 0.5rem; font-size: 0.9rem;">${escapeHTML(awayTeam.name)} (Visitante)</h4>
                <div id="lineup-away"></div>
              </div>
            </div>
          </div>

          <div style="text-align: right; margin-top: 2rem;">
            <button class="btn btn--secondary" onclick="window.closeLiveMatch()">Cerrar (Cancelar)</button>
          </div>
        </div>
      </div>
    `);

    window._liveData = { 
      matchId, 
      leagueId, 
      homeTeam, 
      awayTeam, 
      homePlayers, 
      awayPlayers, 
      scoreHome: 0, 
      scoreAway: 0,
      sportId
    };

    // Inicializar quiénes están en cancha
    const startersNeeded = sportConfig.startersCount || 1;
    window._liveData.homePlayers.forEach((p, i) => p._isPlaying = i < startersNeeded);
    window._liveData.awayPlayers.forEach((p, i) => p._isPlaying = i < startersNeeded);

    window.updatePlayerSelect();
    window.renderLineupUI('home');
    window.renderLineupUI('away');
    
    activeChronometer = new MatchChronometer(sportId);
    activeChronometer.onTick = (state) => updateClockUI(state);
    activeChronometer.onPeriodChange = (state) => updateClockUI(state);
    if(sportConfig.hasClock) document.getElementById('live-clock').textContent = activeChronometer.formattedTime;

  } catch (error) {
    console.error('Error al abrir el partido en vivo:', error);
    if (activeChronometer) { 
      activeChronometer.destroy(); 
      activeChronometer = null; 
    }
    document.getElementById('live-match-modal')?.remove();
    AlertService.showError('Ocurrió un error al cargar los datos del partido.');
  }
};

window.updatePlayerSelect = function() {
  const t = document.getElementById('live-team-select').value;
  const s = document.getElementById('live-player-select');
  const p = t === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  if (p.length === 0) { 
    s.innerHTML = `<option value="" disabled selected>Sin jugadores</option>`; 
    s.disabled = true; 
  } else { 
    s.innerHTML = p.map(pl => `<option value="${pl.id}">#${pl.number} - ${escapeHTML(pl.name)}</option>`).join(''); 
    s.disabled = false; 
  }
};

window.addLiveEvent = function(type, pointsValue = 1) {
  const ps = document.getElementById('live-player-select'); 
  if (ps.disabled || !ps.value) { 
    AlertService.showError('No hay jugadores.'); 
    return; 
  }
  const t = document.getElementById('live-team-select').value;
  const p = (t === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers).find(pl => pl.id === ps.value);
  if (!p) return;
  
  liveMatchEvents.push({
    id: `ev_${Date.now()}`, 
    matchId: window._liveData.matchId,
    teamId: t === 'home' ? window._liveData.homeTeam.id : window._liveData.awayTeam.id, 
    playerId: p.id, 
    playerName: p.name, 
    playerNumber: p.number, 
    type, 
    minute: activeChronometer ? activeChronometer.formattedTime : '00:00', 
    pointsValue: pointsValue 
  });
  
  if (type === 'point') { 
    if (t === 'home') {
      window._liveData.scoreHome += pointsValue;
    } else {
      window._liveData.scoreAway += pointsValue; 
    }
    document.getElementById('live-score-home').textContent = window._liveData.scoreHome; 
    document.getElementById('live-score-away').textContent = window._liveData.scoreAway; 
  }
  renderEventsLog();
};

window.togglePlayPause = function() { 
  if (!activeChronometer) return; 
  if (activeChronometer.isRunning) {
    activeChronometer.pause(); 
  } else { 
    activeChronometer.start(); 
  }
  updatePlayPauseBtn(); 
};

window.nextPeriod = function() { 
  if (!activeChronometer) return; 
  if (!activeChronometer.config.hasClock) { 
    activeChronometer.nextPeriod(); 
  } else { 
    activeChronometer.startBreak(activeChronometer.currentPeriodIndex === 1); 
  } 
  updatePlayPauseBtn(); 
};

window.finishLiveMatch = async function(matchId, leagueId) {
  if (!activeChronometer) return;
  
  const scoreHome = window._liveData.scoreHome;
  const scoreAway = window._liveData.scoreAway;
  const evts = [...liveMatchEvents];
  
  // Validar empate en eliminación directa
  if (scoreHome === scoreAway) {
    const currentMatchData = (await getMatchesByLeague(leagueId)).find(m => m.id === matchId);
    if (currentMatchData && currentMatchData.winnerGoesToMatchId) { 
      AlertService.showError('En eliminación directa no puede haber empate.'); 
      return; 
    }
  }
  
  // Determinar ganador
  let winnerTeamId = null;
  if (scoreHome > scoreAway) winnerTeamId = window._liveData.homeTeam.id;
  else if (scoreAway > scoreHome) winnerTeamId = window._liveData.awayTeam.id;
  
  // Destruir cronómetro y cerrar modal
  activeChronometer.pause(); 
  activeChronometer.destroy(); 
  activeChronometer = null;

  try {
    // Transacción de integridad
    await executeTransaction(['matches', 'events'], 'readwrite', async (tx) => {
      const matchStore = tx.objectStore('matches');
      
      // 1. Actualizar estado y marcador del partido actual
      const match = await new Promise((resolve, reject) => { 
        const req = matchStore.get(matchId); 
        req.onsuccess = (e) => resolve(e.target.result); 
        req.onerror = (e) => reject(e.target.error); 
      });
      
      match.status = 'completed'; 
      match.scoreHome = scoreHome; 
      match.scoreAway = scoreAway;
      matchStore.put(match);
      
      // 2. Guardar eventos en repositorio
      if (evts.length > 0) {
        await MatchEventRepository.addEventsInTransaction(tx, evts);
      }

      // 3. Si hay ganador y es eliminatoria directa, avanzar de ronda
      if (winnerTeamId && match.winnerGoesToMatchId) {
        const nextMatch = await new Promise((resolve, reject) => { 
          const req = matchStore.get(match.winnerGoesToMatchId); 
          req.onsuccess = (e) => resolve(e.target.result); 
          req.onerror = (e) => reject(e.target.error); 
        });
        
        if (nextMatch) { 
          if (match.slot === 'home') {
            nextMatch.homeTeamId = winnerTeamId;
          } else if (match.slot === 'away') {
            nextMatch.awayTeamId = winnerTeamId; 
          }
          matchStore.put(nextMatch); 
        }
      }
    });
    
    document.getElementById('live-match-modal')?.remove(); 
    AlertService.showChampion('¡Partido Finalizado!', `${scoreHome} - ${scoreAway}`); 
    renderMatchesView();
    
  } catch (error) { 
    console.error('Error al finalizar partido:', error); 
    AlertService.showError('Error crítico al guardar la transacción.'); 
  }
};

window.closeLiveMatch = function() { 
  if (activeChronometer) { 
    activeChronometer.destroy(); 
    activeChronometer = null; 
  } 
  document.getElementById('live-match-modal')?.remove(); 
  liveMatchEvents = []; 
};

function updateClockUI(state) {
  const c = document.getElementById('live-clock'); 
  if(c) c.textContent = state.formattedTime;
  const p = document.getElementById('live-period-name'); 
  if(p) p.textContent = state.currentPeriodName;
  
  const eventsPanel = document.getElementById('live-modal__events-panel');
  if (eventsPanel) {
    eventsPanel.style.opacity = state.isBreak ? '0.3' : '1';
    eventsPanel.style.pointerEvents = state.isBreak ? 'none' : 'auto';
  }
  updatePlayPauseBtn();
}

function updatePlayPauseBtn() {
  const b = document.getElementById('btn-play-pause'); 
  if (!b || !activeChronometer) return;
  b.textContent = activeChronometer.isRunning ? '⏸ Pausar' : '▶ Iniciar';
  b.style.background = activeChronometer.isRunning ? '#f59e0b' : ''; 
  b.style.color = activeChronometer.isRunning ? '#000' : '';
}

function renderEventsLog() {
  const l = document.getElementById('live-events-log');
  if (liveMatchEvents.length === 0) { 
    l.innerHTML = `<p style="color: #64748b; text-align: center;">Sin eventos aún</p>`; 
    return; 
  }
  
  l.innerHTML = liveMatchEvents.slice().reverse().map(e => { 
    let text = '', icon = '⭐', color = '#10b981';
    if (e.type === 'point') { 
      text = `${e.pointsValue > 1 ? `(+${e.pointsValue})` : ''} #${e.playerNumber} ${escapeHTML(e.playerName)}`; 
    } else if (e.type === 'warning') { 
      icon = '🟨'; 
      color = '#eab308'; 
      text = `Amarilla para #${e.playerNumber} ${escapeHTML(e.playerName)}`; 
    } else if (e.type === 'expulsion') { 
      icon = '🟥'; 
      color = '#ef4444'; 
      text = `Roja para #${e.playerNumber} ${escapeHTML(e.playerName)}`; 
    } else if (e.type === 'substitution') { 
      icon = '🔄'; 
      color = '#3b82f6'; 
      text = `Entra #${e.playerNumber} ${escapeHTML(e.playerName)} por #${e.outPlayerNumber} ${escapeHTML(e.outPlayerName)}`; 
    }
    return `<div style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: ${color};">
      <span>${icon} ${text}</span>
      <span style="color: #fff;">${e.minute}</span>
    </div>`;
  }).join('');
}

// --- SISTEMA DE BANCA Y CAMBIOS ---
window.switchTab = function(tabName) {
  document.getElementById('panel-events').style.display = tabName === 'events' ? 'block' : 'none';
  document.getElementById('panel-lineup').style.display = tabName === 'lineup' ? 'block' : 'none';
  document.getElementById('tab-events').style.color = tabName === 'events' ? '#fff' : '#94a3b8';
  document.getElementById('tab-events').style.borderBottom = tabName === 'events' ? '2px solid #00A86B' : 'none';
  document.getElementById('tab-lineup').style.color = tabName === 'lineup' ? '#fff' : '#94a3b8';
  document.getElementById('tab-lineup').style.borderBottom = tabName === 'lineup' ? '2px solid #3b82f6' : 'none';
  if (tabName === 'lineup') { 
    window.renderLineupUI('home'); 
    window.renderLineupUI('away'); 
  }
};

window.renderLineupUI = function(teamKey) {
  const c = document.getElementById(`lineup-${teamKey}`); 
  if (!c) return;
  const players = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const sportConfig = getTimerConfig(window._liveData.sportId || 'futbol_sala');
  const starters = players.filter(p => p._isPlaying === true);
  const bench = players.filter(p => p._isPlaying !== true); 
  let html = `<div style="margin-bottom: 10px; font-size: 0.8rem; color: #10b981; font-weight: bold; text-transform: uppercase;">En Cancha</div>`;
  starters.forEach(p => { 
    p._isPlaying = true; 
    html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: rgba(16, 185, 129, 0.1); border-radius: 4px; margin-bottom: 4px; border-left: 3px solid #10b981;"><span style="color: #e2e8f0; font-size: 0.85rem;"><strong>#${p.number}</strong> ${escapeHTML(p.name)}</span><span style="font-size: 0.7rem; color: #64748b;">${escapeHTML(p.position || '')}</span></div>`; 
  });
  if (bench.length > 0) {
    html += `<div style="margin: 10px 0 10px 0; font-size: 0.8rem; color: #f59e0b; font-weight: bold; text-transform: uppercase;">Banca</div>`;
    bench.forEach(p => { 
      p._isPlaying = false; 
      html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: rgba(255,255,255,0.02); border-radius: 4px; margin-bottom: 4px; border-left: 3px solid #475569;"><span style="color: #94a3b8; font-size: 0.85rem;"><strong>#${p.number}</strong> ${escapeHTML(p.name)}</span><button class="btn btn--primary" style="padding: 2px 8px; font-size: 0.7rem;" onclick="window.showSubModal('${teamKey}', '${p.id}')">Cambiar</button></div>`; 
    });
  }
  c.innerHTML = html;
};

window.showSubModal = function(teamKey, inPlayerId) {
  document.getElementById('dynamic-sub-modal')?.remove();
  const players = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const inPlayer = players.find(p => p.id === inPlayerId); // El jugador de la banca que ENTRA
  const playersOnField = players.filter(p => p._isPlaying === true); // Solo los que están en cancha
  
  if (playersOnField.length === 0) { 
    AlertService.showWarning('No hay jugadores en cancha para sacar.'); 
    return; 
  }
  
  document.body.insertAdjacentHTML('beforeend', `
    <div id="dynamic-sub-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 350px;">
        <h2 class="modal-card__title">Realizar Cambio</h2>
        <p style="text-align:center; margin-bottom:1rem; color: #10b981; font-weight: bold;">Entra: #${inPlayer.number} ${escapeHTML(inPlayer.name)} (Banca)</p>
        <div class="form-group" style="margin-bottom: 1.5rem;">
          <label class="form-group__label">¿Quién sale de cancha?</label>
          <select id="sub-out-player" class="form-control">${playersOnField.map(p => `<option value="${p.id}">#${p.number} - ${escapeHTML(p.name)}</option>`).join('')}</select>
        </div>
        <div class="modal-actions">
          <button type="button" id="sub-cancel" class="btn btn--secondary">Cancelar</button>
          <button type="button" id="sub-confirm" class="btn btn--primary">Confirmar Cambio</button>
        </div>
      </div>
    </div>`);
    
  document.getElementById('sub-cancel').onclick = () => document.getElementById('dynamic-sub-modal').remove();
  document.getElementById('sub-confirm').onclick = () => {
    const outPlayerId = document.getElementById('sub-out-player').value;
    window.makeSubstitution(teamKey, outPlayerId, inPlayerId);
    document.getElementById('dynamic-sub-modal').remove();
  };
};

window.makeSubstitution = function(teamKey, outPlayerId, inPlayerId) {
  const players = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const outPlayer = players.find(p => p.id === outPlayerId);
  const inPlayer = players.find(p => p.id === inPlayerId);
  if (!outPlayer || !inPlayer) return;
  
  liveMatchEvents.push({
    id: `ev_sub_${Date.now()}`, 
    matchId: window._liveData.matchId, 
    teamId: teamKey === 'home' ? window._liveData.homeTeam.id : window._liveData.awayTeam.id, 
    playerId: inPlayer.id, 
    playerName: inPlayer.name, 
    playerNumber: inPlayer.number, 
    type: 'substitution', 
    minute: activeChronometer ? activeChronometer.formattedTime : '00:00', 
    outPlayerId: outPlayer.id, 
    outPlayerName: outPlayer.name, 
    outPlayerNumber: outPlayer.number 
  });
  
  outPlayer._isPlaying = false; 
  inPlayer._isPlaying = true;
  window.renderLineupUI(teamKey);
  renderEventsLog();
  AlertService.showSuccess(`Cambio: Entra #${inPlayer.number}, Sale #${outPlayer.number}`);
};

// --- RESUMEN DEL PARTIDO (POST-PARTIDO) ---
window.showMatchSummary = async function(matchId) {
  document.getElementById('dynamic-summary-modal')?.remove();
  
  // Mostrar spinner temporalmente
  document.body.insertAdjacentHTML('beforeend', `
    <div id="dynamic-summary-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
        <div style="text-align: center; padding: 2rem; color: #94a3b8;">Cargando resumen...</div>
      </div>
    </div>
  `);

  try {
    // 1. Obtener la liga activa usando tu función importada
    const activeLeague = await getActiveLeague();
    if (!activeLeague) throw new Error("No hay liga activa");

    // 2. Buscar el partido y los equipos en la base de datos
    const matches = await getMatchesByLeague(activeLeague.id);
    const matchData = matches.find(m => m.id === matchId);
    if (!matchData) throw new Error("Partido no encontrado");

    const teams = await getTeamsByLeague(activeLeague.id);
    const homeTeam = teams.find(t => t.id === matchData.homeTeamId);
    const awayTeam = teams.find(t => t.id === matchData.awayTeamId);

    // 3. Obtener eventos usando el nombre correcto de tu repositorio
    const events = await MatchEventRepository.getEventsByMatch(matchId);
    
    const modalEl = document.getElementById('dynamic-summary-modal');
    if (!modalEl) return;

    // Agrupar eventos por equipo
    const homeEvents = events.filter(e => e.teamId === matchData.homeTeamId).sort((a,b) => (a.minute || '').localeCompare(b.minute || ''));
    const awayEvents = events.filter(e => e.teamId === matchData.awayTeamId).sort((a,b) => (a.minute || '').localeCompare(b.minute || ''));

    const renderEventList = (evts) => {
      if (evts.length === 0) return '<p style="color: #64748b; font-size: 0.85rem; text-align:center;">Sin eventos registrados</p>';
      return evts.map(e => {
        let text = '', icon = '⭐', color = '#10b981';
        if (e.type === 'point') { 
          text = `+${e.pointsValue > 1 ? e.pointsValue + 'pts ' : ''} #${e.playerNumber} ${escapeHTML(e.playerName)}`; 
        } else if (e.type === 'warning') { 
          icon = '🟨'; color = '#eab308'; text = `Amarilla #${e.playerNumber} ${escapeHTML(e.playerName)}`; 
        } else if (e.type === 'expulsion') { 
          icon = '🟥'; color = '#ef4444'; text = `Roja #${e.playerNumber} ${escapeHTML(e.playerName)}`; 
        } else if (e.type === 'substitution') { 
          icon = '🔄'; color = '#3b82f6'; text = `Entra #${e.playerNumber} ${escapeHTML(e.playerName)} por #${e.outPlayerNumber} ${escapeHTML(e.outPlayerName)}`; 
        }
        return `<div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: ${color}; font-size: 0.9rem;">
          <span>${icon} ${text}</span>
          <span style="color: #fff; font-weight: bold; min-width: 45px; text-align: right;">${e.minute}</span>
        </div>`;
      }).join('');
    };

    // Usamos los datos obtenidos de la DB (matchData.scoreHome)
    modalEl.innerHTML = `
      <div class="modal-card" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
        <h2 class="modal-card__title" style="text-align: center; margin-bottom: 1rem;">Resumen del Partido</h2>
        
        <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 2rem; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 8px;">
          <div style="flex:1; text-align: right; font-weight: 800; color: #e2e8f0;">${escapeHTML(homeTeam?.name || 'Local')}</div>
          <div style="font-size: 2rem; font-weight: 900; color: #fff; font-family: 'Arial Black', sans-serif;">${matchData.scoreHome ?? 0} - ${matchData.scoreAway ?? 0}</div>
          <div style="flex:1; text-align: left; font-weight: 800; color: #e2e8f0;">${escapeHTML(awayTeam?.name || 'Visitante')}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <h4 style="color: #00A86B; margin-bottom: 0.5rem; text-align: center; border-bottom: 1px solid #334155; padding-bottom: 5px;">Local</h4>
            ${renderEventList(homeEvents)}
          </div>
          <div>
            <h4 style="color: #3b82f6; margin-bottom: 0.5rem; text-align: center; border-bottom: 1px solid #334155; padding-bottom: 5px;">Visitante</h4>
            ${renderEventList(awayEvents)}
          </div>
        </div>

        <div style="text-align: center; margin-top: 2rem;">
          <button type="button" class="btn btn--secondary" onclick="document.getElementById('dynamic-summary-modal').remove()">Cerrar</button>
        </div>
      </div>
    `;

    // Cerrar si se hace clic fuera
    modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.remove(); };

  } catch (error) {
    console.error('Error al cargar resumen:', error);
    const modalEl = document.getElementById('dynamic-summary-modal');
    if(modalEl) modalEl.innerHTML = `<div class="modal-card" style="max-width: 400px; text-align: center; color: #ef4444; padding: 2rem;">Error al cargar los eventos del partido.</div>`;
  }
};