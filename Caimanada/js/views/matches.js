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
let lastPeriodIndex = 0;

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
          <button type="button" id="dyn-confirm-accept" class="btn btn--danger"><i class="fa-solid fa-trash"></i> Sí, Eliminar</button>
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
  if (!activeLeague) { container.innerHTML = `<div class="empty-state"><p class="empty-state__title">No hay liga activa.</p></div>`; return; }
  const matches = await getMatchesByLeague(activeLeague.id);
  const teams = await getTeamsByLeague(activeLeague.id);
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t]));
  container.innerHTML = `
    <header class="matches-header">
      <div><h1 class="view-title">Partidos y Resultados</h1><p class="view-subtitle">${escapeHTML(activeLeague.name)} (${escapeHTML(activeLeague.mode)})</p></div>
    </header>
    <section class="matches-calendar-section">
      <h2 class="section-title">Calendario</h2>
      <div id="matches-grid" class="matches-calendar-grid"></div>
    </section>
    <section class="standings-section">
      <h2 class="section-title">Tabla de Posiciones</h2>
      <div id="standings-table-container"></div>
    </section>`;
  renderMatchesList(matches, teamsMap, activeLeague);
  renderStandingsTable(teams, matches);
}

function openEditMatchModal(match, teamsMap, league) {
  document.getElementById('dynamic-edit-match-modal')?.remove();
  const formatToLocalInput = (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const leagueStart = new Date(league.startDate);
  const leagueEnd = new Date(league.endDate);
  const minDateStr = formatToLocalInput(leagueStart);
  const maxDateStr = formatToLocalInput(leagueEnd);
  let dateVal = formatToLocalInput(match.date || league.startDate);
  const homeName = teamsMap[match.homeTeamId]?.name || 'Por definir';
  const awayName = teamsMap[match.awayTeamId]?.name || 'Por definir';
  
  document.body.insertAdjacentHTML('beforeend', `
    <div id="dynamic-edit-match-modal" class="modal-overlay">
      <div class="modal-card modal-card--edit">
        <h2 class="modal-card__title">Editar Fecha/Hora</h2>
        <p class="modal-text-center">${escapeHTML(homeName)} vs ${escapeHTML(awayName)}</p>
        <div class="form-group">
          <label class="form-group__label">Nueva Fecha y Hora</label>
          <input type="datetime-local" id="edit-match-date" required class="form-control" value="${dateVal}" min="${minDateStr}" max="${maxDateStr}" />
          <p class="date-hint">Debe estar entre ${leagueStart.toLocaleDateString()} y ${leagueEnd.toLocaleDateString()}.</p>
        </div>
        <div class="modal-actions">
          <button type="button" id="edit-match-cancel" class="btn btn--secondary">Cancelar</button>
          <button type="button" id="edit-match-save" class="btn btn--primary">Guardar</button>
        </div>
      </div>
    </div>`);
  const modalEl = document.getElementById('dynamic-edit-match-modal');
  document.getElementById('edit-match-cancel').onclick = () => modalEl.remove();
  modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.remove(); };
  document.getElementById('edit-match-save').onclick = async () => {
    const newDate = document.getElementById('edit-match-date').value;
    if (!newDate) { AlertService.showError('Selecciona una fecha.'); return; }
    const chosenDate = new Date(newDate);
    if (chosenDate < leagueStart || chosenDate > leagueEnd) { AlertService.showError('La fecha seleccionada está fuera de la duración de la liga.'); return; }
    await updateMatch({ ...match, date: chosenDate.toISOString() });
    AlertService.showSuccess('Fecha actualizada.'); 
    modalEl.remove(); 
    renderMatchesView();
  };
}

function renderMatchesList(matches, teamsMap, league) {
  const grid = document.getElementById('matches-grid');
  if (!grid) return;
  if (matches.length === 0) { grid.innerHTML = `<div class="empty-state"><p class="empty-state__title">Calendario vacío.</p></div>`; return; }
  matches.sort((a, b) => new Date(a.date) - new Date(b.date));
  grid.innerHTML = matches.map(match => {
    const isTBD = match.homeTeamId === 'TBD' || match.awayTeamId === 'TBD';
    const homeName = escapeHTML(teamsMap[match.homeTeamId]?.name || 'TBD');
    const awayName = escapeHTML(teamsMap[match.awayTeamId]?.name || 'TBD');
    const isPending = match.status === 'pending';
    const isCompleted = match.status === 'completed';
    let dateFormatted = 'Sin fecha', timeFormatted = '--:--';
    if (match.date) { const d = new Date(match.date); dateFormatted = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' }); timeFormatted = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
    return `
      <article class="match-card">
        <div class="match-card__header">
          <div class="match-card__date"><span>${dateFormatted}</span><span><i class="fa-solid fa-clock"></i> ${timeFormatted}</span></div>
          <div class="match-card__actions">
            ${isPending && !isTBD ? `<button class="btn btn--secondary btn--sm btn-edit-match" data-id="${match.id}" title="Editar fecha"><i class="fa-solid fa-pen"></i></button><button class="btn btn--danger btn--sm btn-delete-match" data-id="${match.id}" title="Eliminar partido"><i class="fa-solid fa-trash"></i></button>` : ''}
            ${isCompleted ? '<span class="match-status--finished"><i class="fa-solid fa-flag-checkered"></i> FINALIZADO</span>' : ''}
            ${isTBD ? '<span class="match-status--locked"><i class="fa-solid fa-lock"></i> BLOQUEADO</span>' : ''}
          </div>
        </div>
        <div class="match-card__body">
          <span class="match-card__team match-card__team--home ${isTBD ? 'match-card__team--tbd' : ''}">${homeName}</span>
          ${isPending && !isTBD ? `<div class="match-card__score match-card__score--active" onclick="window.openLiveMatch('${match.id}', '${league.id}', '${league.sport}')">VS</div>` : isCompleted ? `<div class="match-card__score match-card__score--finished" onclick="window.showMatchSummary('${match.id}')">${match.scoreHome ?? 0} - ${match.scoreAway ?? 0} <br><span class="match-card__score-resume">Ver Resumen</span></div>` : `<div class="match-card__score">- - -</div>`}
          <span class="match-card__team match-card__team--away ${isTBD ? 'match-card__team--tbd' : ''}">${awayName}</span>
        </div>
      </article>`;
  }).join('');
  grid.querySelectorAll('.btn-edit-match').forEach(btn => { 
    btn.onclick = (e) => { 
      e.stopPropagation(); 
      const match = matches.find(m => m.id === btn.dataset.id); 
      if(match) openEditMatchModal(match, teamsMap, league); 
    }; 
  });
  grid.querySelectorAll('.btn-delete-match').forEach(btn => { btn.onclick = (e) => { e.stopPropagation(); showConfirmDialog('¿Estás seguro de eliminar este partido?', async () => { await deleteMatch(btn.dataset.id); AlertService.showWarning('Partido eliminado.'); renderMatchesView(); }); }; });
}

function renderStandingsTable(teams, matches) {
  const container = document.getElementById('standings-table-container');
  if (!container) return;
  const standings = calculateStandings(teams, matches);
  container.innerHTML = `
    <div class="standings-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>PTS</th>
          </tr>
        </thead>
        <tbody>
          ${standings.length === 0 ? `<tr><td colspan="10" class="empty-state">Sin datos</td></tr>` : standings.map((st, i) => `
            <tr>
              <td class="standings-pos">${i + 1}</td>
              <td>${escapeHTML(st.name)}</td>
              <td>${st.pj}</td>
              <td class="standings-g">${st.pg}</td>
              <td class="standings-e">${st.pe}</td>
              <td class="standings-p">${st.pp}</td>
              <td>${st.gf}</td>
              <td>${st.gc}</td>
              <td class="${st.dg > 0 ? 'standings-dg--pos' : ''}">${st.dg > 0 ? '+' : ''}${st.dg}</td>
              <td class="standings-pts">${st.pts}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

window.openLiveMatch = async function(matchId, leagueId, sportId) {
  if (activeChronometer) { activeChronometer.destroy(); activeChronometer = null; document.getElementById('live-match-modal')?.remove(); }
  liveMatchEvents = []; lastPeriodIndex = 0;
  const sportConfig = getTimerConfig(sportId);
  try {
    const match = (await getMatchesByLeague(leagueId)).find(m => m.id === matchId);
    const teams = await getTeamsByLeague(leagueId);
    const homeTeam = teams.find(t => t.id === match.homeTeamId);
    const awayTeam = teams.find(t => t.id === match.awayTeamId);
    if (!homeTeam || !awayTeam) { AlertService.showError('Uno de los equipos ya no existe.'); return; }
    const homePlayers = await getPlayersByTeam(homeTeam.id);
    const awayPlayers = await getPlayersByTeam(awayTeam.id);
    const sportLimit = getMaxPlayersForSport(sportId);
    const minRequired = Math.min(sportLimit, 2); 
    if (homePlayers.length < minRequired || awayPlayers.length < minRequired) { AlertService.showError(`Cada equipo debe tener al menos ${minRequired} jugadores.`); return; }

    const scoringButtonsHTML = sportConfig.scoringOptions.map(opt => `<button class="btn btn--primary" onclick="window.addLiveEvent('point', ${opt.value})"><i class="fa-solid fa-star"></i> ${opt.label}</button>`).join('');
    const extraButtonsHTML = (sportConfig.extraButtons || []).map(opt => `<button class="btn btn--secondary" onclick="window.addLiveEvent('${opt.type}', ${opt.value})">${opt.label}</button>`).join('');
    
    let cardsButtonsHTML = '';
    if (sportConfig.hasCards === true) {
      cardsButtonsHTML = `
      <button class="btn btn--secondary" onclick="window.addLiveEvent('warning')"><i class="fa-solid fa-square" style="color: #eab308;"></i> Amarilla</button>
      <button class="btn btn--danger" onclick="window.addLiveEvent('expulsion')"><i class="fa-solid fa-square" style="color: #ef4444;"></i> Roja Directa</button>`;
    } else if (sportConfig.hasCards === 'volleyball') {
      cardsButtonsHTML = `
      <button class="btn btn--secondary" onclick="window.addLiveEvent('warning')"><i class="fa-solid fa-square" style="color: #eab308;"></i> Amarilla</button>
      <button class="btn btn--danger" onclick="window.addLiveEvent('volleyball_red')"><i class="fa-solid fa-square" style="color: #ef4444;"></i> Roja</button>
      <button class="btn btn--danger" style="background: #a855f7;" onclick="window.addLiveEvent('volleyball_set_expulsion')"><i class="fa-solid fa-ban"></i> Expulsión Set</button>
      <button class="btn btn--danger" style="background: #000; border: 1px solid #ef4444;" onclick="window.addLiveEvent('volleyball_disqualification')"><i class="fa-solid fa-circle-xmark"></i> Descalificación</button>`;
    }

    document.body.insertAdjacentHTML('beforeend', `
      <div id="live-match-modal" class="live-modal">
        <div class="live-modal__container">
          <div class="live-period-name">
            <span class="live-period-badge">${sportConfig.periodNames[0]}</span>
          </div>
          <div class="live-scoreboard">
            <div class="live-team-name">${escapeHTML(homeTeam.name)}</div>
            <div class="live-score-box">
              <span id="live-score-home" class="live-score-number">0</span>
              <span class="live-score-separator">-</span>
              <span id="live-score-away" class="live-score-number">0</span>
            </div>
            <div class="live-team-name">${escapeHTML(awayTeam.name)}</div>
          </div>
          <div class="live-clock-container">
            <div id="live-clock" class="live-clock">00:00</div>
            ${!sportConfig.hasClock ? '<div class="live-clock-hint"><i class="fa-solid fa-stopwatch"></i> Tiempo cronometrado</div>' : ''}
          </div>
          <div class="live-controls">
            <button id="btn-play-pause" class="btn btn--primary" onclick="window.togglePlayPause()"><i class="fa-solid fa-play"></i> Iniciar</button>
            <button id="btn-next-period" class="btn btn--secondary" onclick="window.nextPeriod()" style="${sportConfig.hideNextPeriodBtn ? 'display:none;' : ''}"><i class="fa-solid fa-forward"></i> ${sportConfig.hasClock ? 'Descanso' : 'Siguiente Periodo'}</button>
            <button id="btn-skip-break" class="btn btn--primary is-hidden" style="background: #3b82f6;" onclick="window.skipBreak()"><i class="fa-solid fa-forward"></i> Saltar Descanso</button>
            <button class="btn btn--danger" onclick="window.finishLiveMatch('${matchId}', '${leagueId}')"><i class="fa-solid fa-flag-checkered"></i> Finalizar</button>
          </div>
          <div id="live-modal__events-panel" class="live-events-panel">
            <h3>Registrar Evento</h3>
            <div class="live-form-grid">
              <select id="live-team-select" class="form-control" onchange="window.updatePlayerSelect()">
                <option value="home">${escapeHTML(homeTeam.name)}</option>
                <option value="away">${escapeHTML(awayTeam.name)}</option>
              </select>
              <select id="live-player-select" class="form-control"></select>
            </div>
            <div class="live-buttons-row">
              ${scoringButtonsHTML}
              ${extraButtonsHTML}
              ${cardsButtonsHTML}
            </div>
          </div>
          <div id="tabs-container" class="live-tabs" style="${sportConfig.hideLineupTab ? 'display: none;' : ''}">
            <button id="tab-events" class="live-tab-btn live-tab-btn--active" onclick="window.switchTab('events')">Eventos</button>
            <button id="tab-lineup" class="live-tab-btn" onclick="window.switchTab('lineup')">Alineación y Cambios</button>
          </div>
          <div id="panel-events"><div class="live-events-log" id="live-events-log"><p class="modal-subtitle">Sin eventos aún</p></div></div>
          <div id="panel-lineup" class="is-hidden">
            <div class="live-lineup-grid">
              <div><h4 class="live-lineup-title">${escapeHTML(homeTeam.name)}</h4><div id="lineup-home"></div></div>
              <div><h4 class="live-lineup-title" style="color: #3b82f6;">${escapeHTML(awayTeam.name)}</h4><div id="lineup-away"></div></div>
            </div>
          </div>
          <div class="live-modal-close"><button class="btn btn--secondary" onclick="window.closeLiveMatch()">Cerrar (Cancelar)</button></div>
        </div>
      </div>`);

    window._liveData = { matchId, leagueId, homeTeam, awayTeam, homePlayers, awayPlayers, scoreHome: 0, scoreAway: 0, sportId };
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
    console.error('Error al abrir partido:', error);
    if (activeChronometer) { activeChronometer.destroy(); activeChronometer = null; }
    document.getElementById('live-match-modal')?.remove();
    AlertService.showError('Ocurrió un error al cargar los datos del partido.');
  }
};

window.updatePlayerSelect = function() {
  const t = document.getElementById('live-team-select').value;
  const s = document.getElementById('live-player-select');
  const allPlayers = t === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const availablePlayers = allPlayers.filter(p => !p._isExpelled && !p._isBannedCurrentSet);
  if (availablePlayers.length === 0) { 
    s.innerHTML = `<option value="" disabled selected>Sin jugadores habilitados</option>`; 
    s.disabled = true; 
  } else { 
    s.innerHTML = availablePlayers.map(pl => `<option value="${pl.id}">#${pl.number} - ${escapeHTML(pl.name)}</option>`).join(''); 
    s.disabled = false; 
  }
};

function checkSetWin(config) {
  const sH = window._liveData.scoreHome;
  const sA = window._liveData.scoreAway;
  const currentSet = activeChronometer.currentPeriodIndex + 1;
  const isLastSet = currentSet === config.periods;
  const target = isLastSet ? config.pointsToWinLastSet : config.pointsToWinSet;
  let setWonBy = null;
  if (sH >= target && (sH - sA) >= config.winBy) setWonBy = 'home';
  else if (sA >= target && (sA - sH) >= config.winBy) setWonBy = 'away';
  if (setWonBy) {
    if (activeChronometer.isRunning) activeChronometer.pause();
    const winnerName = setWonBy === 'home' ? window._liveData.homeTeam.name : window._liveData.awayTeam.name;
    if (activeChronometer.currentPeriodIndex < config.periods - 1) {
      if (config.autoBreakOnSetWin) { AlertService.showSuccess(`¡Set ganado por ${winnerName}! Iniciando descanso.`); activeChronometer.startBreak(false); } 
      else { activeChronometer.nextPeriod(); }
    } else {
      AlertService.showChampion('¡Partido Finalizado!', `${sH} - ${sA}`);
      window.finishLiveMatch(window._liveData.matchId, window._liveData.leagueId);
    }
  }
}

window.addLiveEvent = function(type, pointsValue = 1) {
  if (!activeChronometer || !activeChronometer.isRunning || activeChronometer.isBreak) { AlertService.showWarning('No se pueden registrar eventos si el tiempo no está corriendo.'); return; }
  const ps = document.getElementById('live-player-select'); 
  if (ps.disabled || !ps.value) { AlertService.showError('Selecciona un jugador.'); return; }
  const t = document.getElementById('live-team-select').value;
  const rival = t === 'home' ? 'away' : 'home';
  const p = (t === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers).find(pl => pl.id === ps.value);
  if (!p) return;
  const sportConfig = getTimerConfig(window._liveData.sportId);

  if (sportConfig.isRedCardPermanent && type === 'expulsion') {
    p._isExpelled = true; p._isPlaying = false;
    window.renderLineupUI('home'); window.renderLineupUI('away'); window.updatePlayerSelect();
  }
  if (type === 'volleyball_red') {
    if (rival === 'home') window._liveData.scoreHome += 1; else window._liveData.scoreAway += 1;
    document.getElementById('live-score-home').textContent = window._liveData.scoreHome; 
    document.getElementById('live-score-away').textContent = window._liveData.scoreAway;
    AlertService.showWarning('Punto y saque para el equipo rival.');
  }
  if (type === 'volleyball_set_expulsion') {
    p._isBannedCurrentSet = true; p._isPlaying = false;
    window.renderLineupUI('home'); window.renderLineupUI('away'); window.updatePlayerSelect();
    AlertService.showError(`${p.name} expulsado del set actual. Debe ser reemplazado.`);
    window.forceSubstitution(t, p.id); 
  }
  if (type === 'volleyball_disqualification') {
    p._isExpelled = true; p._isPlaying = false;
    window.renderLineupUI('home'); window.renderLineupUI('away'); window.updatePlayerSelect();
    AlertService.showError(`${p.name} descalificado. Debe ser reemplazado.`);
    window.forceSubstitution(t, p.id); 
  }

  liveMatchEvents.push({
    id: `ev_${Date.now()}`, matchId: window._liveData.matchId,
    teamId: t === 'home' ? window._liveData.homeTeam.id : window._liveData.awayTeam.id, 
    playerId: p.id, playerName: p.name, playerNumber: p.number, type, 
    minute: activeChronometer ? activeChronometer.formattedTime : '00:00', pointsValue: pointsValue 
  });
  
  if (type === 'point') { 
    if (t === 'home') {
      window._liveData.scoreHome += pointsValue;
      if (sportConfig.hasGameMilestone && window._liveData.scoreHome % sportConfig.milestoneEvery === 0) {
        liveMatchEvents.push({ id: `ev_game_${Date.now()}`, matchId: window._liveData.matchId, teamId: window._liveData.homeTeam.id, playerId: null, playerName: 'Sistema', playerNumber: 0, type: 'game_milestone', minute: activeChronometer ? activeChronometer.formattedTime : '00:00', pointsValue: 0 });
      }
    } else {
      window._liveData.scoreAway += pointsValue;
      if (sportConfig.hasGameMilestone && window._liveData.scoreAway % sportConfig.milestoneEvery === 0) {
        liveMatchEvents.push({ id: `ev_game_${Date.now()}`, matchId: window._liveData.matchId, teamId: window._liveData.awayTeam.id, playerId: null, playerName: 'Sistema', playerNumber: 0, type: 'game_milestone', minute: activeChronometer ? activeChronometer.formattedTime : '00:00', pointsValue: 0 });
      }
    }
    document.getElementById('live-score-home').textContent = window._liveData.scoreHome; 
    document.getElementById('live-score-away').textContent = window._liveData.scoreAway; 
    if (sportConfig.isSetBased) checkSetWin(sportConfig);
    if (window._liveData.sportId === 'ajedrez') {
      if (activeChronometer.isRunning) activeChronometer.pause();
      AlertService.showChampion('¡Partida Finalizada!', `${window._liveData.scoreHome} - ${window._liveData.scoreAway}`);
      window.finishLiveMatch(window._liveData.matchId, window._liveData.leagueId);
      return; 
    }
  }
  renderEventsLog();
};

window.togglePlayPause = function() { if (!activeChronometer) return; if (activeChronometer.isRunning) activeChronometer.pause(); else activeChronometer.start(); updatePlayPauseBtn(); };
window.nextPeriod = function() { if (!activeChronometer) return; if (!activeChronometer.config.hasClock) activeChronometer.nextPeriod(); else activeChronometer.startBreak(activeChronometer.currentPeriodIndex === 1); updatePlayPauseBtn(); };
window.skipBreak = function() {
  if (!activeChronometer || !activeChronometer.isBreak) return;
  activeChronometer.pause(); activeChronometer.isBreak = false; activeChronometer.nextPeriod(); updatePlayPauseBtn();
};

window.finishLiveMatch = async function(matchId, leagueId) {
  if (!activeChronometer) return;
  const scoreHome = window._liveData.scoreHome; const scoreAway = window._liveData.scoreAway; const evts = [...liveMatchEvents];
  if (scoreHome === scoreAway) { const currentMatchData = (await getMatchesByLeague(leagueId)).find(m => m.id === matchId); if (currentMatchData && currentMatchData.winnerGoesToMatchId) { AlertService.showError('En eliminación directa no puede haber empate.'); return; } }
  let winnerTeamId = null;
  if (scoreHome > scoreAway) winnerTeamId = window._liveData.homeTeam.id;
  else if (scoreAway > scoreHome) winnerTeamId = window._liveData.awayTeam.id;
  activeChronometer.pause(); activeChronometer.destroy(); activeChronometer = null;
  try {
    await executeTransaction(['matches', 'events'], 'readwrite', async (tx) => {
      const matchStore = tx.objectStore('matches');
      const match = await new Promise((resolve, reject) => { const req = matchStore.get(matchId); req.onsuccess = (e) => resolve(e.target.result); req.onerror = (e) => reject(e.target.error); });
      match.status = 'completed'; match.scoreHome = scoreHome; match.scoreAway = scoreAway; matchStore.put(match);
      if (evts.length > 0) await MatchEventRepository.addEventsInTransaction(tx, evts);
      if (winnerTeamId && match.winnerGoesToMatchId) {
        const nextMatch = await new Promise((resolve, reject) => { const req = matchStore.get(match.winnerGoesToMatchId); req.onsuccess = (e) => resolve(e.target.result); req.onerror = (e) => reject(e.target.error); });
        if (nextMatch) { if (match.slot === 'home') nextMatch.homeTeamId = winnerTeamId; else if (match.slot === 'away') nextMatch.awayTeamId = winnerTeamId; matchStore.put(nextMatch); }
      }
    });
    document.getElementById('live-match-modal')?.remove(); AlertService.showChampion('¡Partido Finalizado!', `${scoreHome} - ${scoreAway}`); renderMatchesView();
  } catch (error) { console.error('Error al finalizar partido:', error); AlertService.showError('Error crítico al guardar.'); }
};

window.closeLiveMatch = function() { if (activeChronometer) { activeChronometer.destroy(); activeChronometer = null; } document.getElementById('live-match-modal')?.remove(); liveMatchEvents = []; };

function updateClockUI(state) {
  const c = document.getElementById('live-clock'); if(c) c.textContent = state.formattedTime;
  const p = document.getElementById('live-period-name'); if(p) p.textContent = state.currentPeriodName;
  const eventsPanel = document.getElementById('live-modal__events-panel');
  if (eventsPanel) {
    const isBlocked = !state.isRunning || state.isBreak;    
    eventsPanel.classList.toggle('is-active', !isBlocked);
  }
  const skipBtn = document.getElementById('btn-skip-break');
  if (skipBtn) { skipBtn.classList.toggle('is-hidden', !state.isBreak); }
  updatePlayPauseBtn();
  const config = getTimerConfig(window._liveData.sportId);
  if (config.isSetBased && state.currentPeriodIndex !== lastPeriodIndex && !state.isBreak) {
    lastPeriodIndex = state.currentPeriodIndex;
    window._liveData.scoreHome = 0; window._liveData.scoreAway = 0;
    document.getElementById('live-score-home').textContent = '0'; document.getElementById('live-score-away').textContent = '0';
    if (window._liveData.sportId === 'volleyball') {
      [...window._liveData.homePlayers, ...window._liveData.awayPlayers].forEach(p => {
        if (p._isBannedCurrentSet && !p._isExpelled) { p._isBannedCurrentSet = false; p._isPlaying = true; }
      });
      window.renderLineupUI('home'); window.renderLineupUI('away'); window.updatePlayerSelect();
    }
  }
}

function updatePlayPauseBtn() {
  const b = document.getElementById('btn-play-pause'); if (!b || !activeChronometer) return;
  b.innerHTML = activeChronometer.isRunning ? '<i class="fa-solid fa-pause"></i> Pausar' : '<i class="fa-solid fa-play"></i> Iniciar';
  b.classList.toggle('btn--running', activeChronometer.isRunning);
}

function renderEventsLog() {
  const l = document.getElementById('live-events-log');
  if (liveMatchEvents.length === 0) { l.innerHTML = `<p class="modal-subtitle">Sin eventos aún</p>`; return; }
  l.innerHTML = liveMatchEvents.slice().reverse().map(e => { 
    let text = '', icon = '<i class="fa-solid fa-star"></i>', color = '#10b981';
    if (e.type === 'point') { text = `${e.pointsValue > 1 ? `(+${e.pointsValue})` : ''} #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
    else if (e.type === 'warning') { icon = '<i class="fa-solid fa-square" style="color: #eab308;"></i>'; color = '#eab308'; text = `Amarilla #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
    else if (e.type === 'expulsion') { icon = '<i class="fa-solid fa-square" style="color: #ef4444;"></i>'; color = '#ef4444'; text = `Roja #${e.playerNumber} ${escapeHTML(e.playerName)} (SANCIONADO)`; }
    else if (e.type === 'substitution') { icon = '<i class="fa-solid fa-arrows-rotate"></i>'; color = '#3b82f6'; text = `Entra #${e.playerNumber} ${escapeHTML(e.playerName)} por #${e.outPlayerNumber} ${escapeHTML(e.outPlayerName)}`; }
    else if (e.type === 'out') { icon = '<i class="fa-solid fa-ban"></i>'; color = '#94a3b8'; text = `Out (${escapeHTML(e.playerName)})`; }
    else if (e.type === 'strike') { icon = '<i class="fa-solid fa-bolt"></i>'; color = '#f59e0b'; text = `Strike (${escapeHTML(e.playerName)})`; }
    else if (e.type === 'foul') { icon = '<i class="fa-solid fa-circle" style="color: #fb923c;"></i>'; color = '#fb923c'; text = `Foul (${escapeHTML(e.playerName)})`; }
    else if (e.type === 'volleyball_red') { icon = '<i class="fa-solid fa-square" style="color: #ef4444;"></i>'; color = '#ef4444'; text = `Roja Directa #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
    else if (e.type === 'volleyball_set_expulsion') { icon = '<i class="fa-solid fa-ban" style="color: #a855f7;"></i>'; color = '#a855f7'; text = `Expulsión del Set #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
    else if (e.type === 'volleyball_disqualification') { icon = '<i class="fa-solid fa-circle-xmark"></i>'; color = '#000'; text = `Descalificación #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
    else if (e.type === 'game_milestone') { icon = '<i class="fa-solid fa-trophy"></i>'; color = '#fbbf24'; text = `¡Juego!`; }
    return `<div class="live-log-item" style="color: ${color};"><span>${icon} ${text}</span><span class="live-log-time">${e.minute}</span></div>`;
  }).join('');
}

window.switchTab = function(tabName) {
  document.getElementById('panel-events').classList.toggle('is-hidden', tabName !== 'events');
  document.getElementById('panel-lineup').classList.toggle('is-hidden', tabName !== 'lineup');
  document.getElementById('tab-events').classList.toggle('live-tab-btn--active', tabName === 'events');
  document.getElementById('tab-lineup').classList.toggle('live-tab-btn--active', tabName === 'lineup');
  if (tabName === 'lineup') { window.renderLineupUI('home'); window.renderLineupUI('away'); }
};

window.renderLineupUI = function(teamKey) {
  const c = document.getElementById(`lineup-${teamKey}`); if (!c) return;
  const players = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const starters = players.filter(p => p._isPlaying === true && !p._isBannedCurrentSet);
  const bench = players.filter(p => p._isPlaying !== true || p._isBannedCurrentSet || p._isExpelled); 
  let html = `<div class="live-lineup-group">En Cancha</div>`;
  starters.forEach(p => { 
    html += `<div class="live-player-row live-player-row--starter"><span class="live-player-name"><strong>#${p.number}</strong> ${escapeHTML(p.name)}</span><span class="live-player-pos">${escapeHTML(p.position || '')}</span></div>`; 
  });
  if (bench.length > 0) {
    html += `<div class="live-lineup-group live-lineup-group--bench">Banca / Sancionados</div>`;
    bench.forEach(p => { 
      if (p._isExpelled) {
        html += `<div class="live-player-row live-player-row--expelled"><span class="live-player-name" style="color: #ef4444; text-decoration: line-through;"><strong>#${p.number}</strong> ${escapeHTML(p.name)} (EXPULSADO)</span></div>`;
      } else if (p._isBannedCurrentSet) {
        html += `<div class="live-player-row live-player-row--banned"><span class="live-player-name" style="color: #a855f7;"><strong>#${p.number}</strong> ${escapeHTML(p.name)} (FUERA DEL SET)</span></div>`;
      } else {
        html += `<div class="live-player-row live-player-row--bench"><span class="live-player-name" style="color: #94a3b8;"><strong>#${p.number}</strong> ${escapeHTML(p.name)}</span><button class="btn btn--primary btn--sm" onclick="window.showSubModal('${teamKey}', '${p.id}')">Cambiar</button></div>`; 
      }
    });
  }
  c.innerHTML = html;
};

window.showSubModal = function(teamKey, inPlayerId) {
  document.getElementById('dynamic-sub-modal')?.remove();
  const players = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const inPlayer = players.find(p => p.id === inPlayerId);
  const playersOnField = players.filter(p => p._isPlaying === true && !p._isBannedCurrentSet);
  if (playersOnField.length === 0) { AlertService.showWarning('No hay jugadores en cancha para sacar.'); return; }
  document.body.insertAdjacentHTML('beforeend', `
    <div id="dynamic-sub-modal" class="modal-overlay">
      <div class="modal-card modal-card--sub">
        <h2 class="modal-card__title">Realizar Cambio</h2>
        <p class="modal-text-center" style="color: #10b981;">Entra: #${inPlayer.number} ${escapeHTML(inPlayer.name)}</p>
        <div class="form-group">
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
  document.getElementById('sub-confirm').onclick = () => { const outPlayerId = document.getElementById('sub-out-player').value; window.makeSubstitution(teamKey, outPlayerId, inPlayerId); document.getElementById('dynamic-sub-modal').remove(); };
};

window.forceSubstitution = function(teamKey, outPlayerId) {
  document.getElementById('dynamic-sub-modal')?.remove();
  const players = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const outPlayer = players.find(p => p.id === outPlayerId);
  const availableBench = players.filter(p => !p._isPlaying && !p._isExpelled && !p._isBannedCurrentSet && p.id !== outPlayerId);
  if (availableBench.length === 0) { AlertService.showWarning('No hay jugadores en banca disponibles para reemplazar. El equipo jugará con menos.'); return; }
  document.body.insertAdjacentHTML('beforeend', `
    <div id="dynamic-sub-modal" class="modal-overlay">
      <div class="modal-card modal-card--sub">
        <h2 class="modal-card__title">Sanción - Reemplazo Obligatorio</h2>
        <p class="modal-text-center" style="color: #ef4444;">Sale sancionado: #${outPlayer.number} ${escapeHTML(outPlayer.name)}</p>
        <div class="form-group">
          <label class="form-group__label">¿Quién entra de la banca?</label>
          <select id="sub-in-player" class="form-control">${availableBench.map(p => `<option value="${p.id}">#${p.number} - ${escapeHTML(p.name)}</option>`).join('')}</select>
        </div>
        <div class="modal-actions">
          <button type="button" id="sub-confirm" class="btn btn--primary">Confirmar Reemplazo</button>
        </div>
      </div>
    </div>`);
  document.getElementById('sub-confirm').onclick = () => {
    const inPlayerId = document.getElementById('sub-in-player').value;
    window.makeSubstitution(teamKey, outPlayerId, inPlayerId);
    document.getElementById('dynamic-sub-modal').remove();
  };
};

window.makeSubstitution = function(teamKey, outPlayerId, inPlayerId) {
  const players = teamKey === 'home' ? window._liveData.homePlayers : window._liveData.awayPlayers;
  const outPlayer = players.find(p => p.id === outPlayerId);
  const inPlayer = players.find(p => p.id === inPlayerId);
  if (!outPlayer || !inPlayer) return;
  liveMatchEvents.push({ id: `ev_sub_${Date.now()}`, matchId: window._liveData.matchId, teamId: teamKey === 'home' ? window._liveData.homeTeam.id : window._liveData.awayTeam.id, playerId: inPlayer.id, playerName: inPlayer.name, playerNumber: inPlayer.number, type: 'substitution', minute: activeChronometer ? activeChronometer.formattedTime : '00:00', outPlayerId: outPlayer.id, outPlayerName: outPlayer.name, outPlayerNumber: outPlayer.number });
  outPlayer._isPlaying = false; inPlayer._isPlaying = true;
  window.renderLineupUI(teamKey); renderEventsLog();
  AlertService.showSuccess(`Cambio: Entra #${inPlayer.number}, Sale #${outPlayer.number}`);
};

window.showMatchSummary = async function(matchId) {
  document.getElementById('dynamic-summary-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div id="dynamic-summary-modal" class="modal-overlay"><div class="modal-card modal-card--summary"><div class="modal-subtitle">Cargando resumen...</div></div></div>`);
  try {
    const activeLeague = await getActiveLeague(); if (!activeLeague) throw new Error("No hay liga activa");
    const matches = await getMatchesByLeague(activeLeague.id);
    const matchData = matches.find(m => m.id === matchId); if (!matchData) throw new Error("Partido no encontrado");
    const teams = await getTeamsByLeague(activeLeague.id);
    const homeTeam = teams.find(t => t.id === matchData.homeTeamId);
    const awayTeam = teams.find(t => t.id === matchData.awayTeamId);
    const events = await MatchEventRepository.getEventsByMatch(matchId);
    const modalEl = document.getElementById('dynamic-summary-modal'); if (!modalEl) return;
    const homeEvents = events.filter(e => e.teamId === matchData.homeTeamId).sort((a,b) => (a.minute || '').localeCompare(b.minute || ''));
    const awayEvents = events.filter(e => e.teamId === matchData.awayTeamId).sort((a,b) => (a.minute || '').localeCompare(b.minute || ''));

    const renderEventList = (evts) => {
      if (evts.length === 0) return '<p class="modal-subtitle">Sin eventos registrados</p>';
      return evts.map(e => {
        let text = '', icon = '<i class="fa-solid fa-star"></i>', color = '#10b981';
        if (e.type === 'point') { text = `+${e.pointsValue > 1 ? e.pointsValue + 'pts ' : ''} #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
        else if (e.type === 'warning') { icon = '<i class="fa-solid fa-square" style="color: #eab30852;"></i>'; color = '#eab30852'; text = `Amarilla #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
        else if (e.type === 'expulsion') { icon = '<i class="fa-solid fa-square" style="color: #ef44446b;"></i>'; color = '#ef44446b'; text = `Roja #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
        else if (e.type === 'substitution') { icon = '<i class="fa-solid fa-arrows-rotate" style="color: #3b83f65e;"></i>'; color = '#3b83f65e'; text = `Entra #${e.playerNumber} ${escapeHTML(e.playerName)} por #${e.outPlayerNumber} ${escapeHTML(e.outPlayerName)}`; }
        else if (e.type === 'out') { icon = '<i class="fa-solid fa-ban" style="color: #94a3b88f;"></i>'; color = '#94a3b88f'; text = `Out (${escapeHTML(e.playerName)})`; }
        else if (e.type === 'strike') { icon = '<i class="fa-solid fa-bolt" style="color: #f59f0b54;"></i>'; color = '#f59f0b54'; text = `Strike (${escapeHTML(e.playerName)})`; }
        else if (e.type === 'foul') { icon = '<i class="fa-solid fa-circle" style="color: #fb923c91;"></i>'; color = '#fb923c91'; text = `Foul (${escapeHTML(e.playerName)})`; }
        else if (e.type === 'volleyball_red') { icon = '<i class="fa-solid fa-square" style="color: #ef444481;"></i>'; color = '#ef444481'; text = `Roja Directa #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
        else if (e.type === 'volleyball_set_expulsion') { icon = '<i class="fa-solid fa-ban" style="color: #a955f77e;"></i>'; color = '#a955f77e'; text = `Expulsión Set #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
        else if (e.type === 'volleyball_disqualification') { icon = '<i class="fa-solid fa-circle-xmark"></i>'; color = '#000'; text = `Descalificación #${e.playerNumber} ${escapeHTML(e.playerName)}`; }
        else if (e.type === 'game_milestone') { icon = '<i class="fa-solid fa-trophy"></i>'; color = '#fbbf24'; text = `¡Juego!`; }
        return `<div class="summary-event-item" style="color: ${color};"><span>${icon} ${text}</span><span class="summary-event-time">${e.minute}</span></div>`;
      }).join('');
    };

    modalEl.innerHTML = `
      <div class="modal-card modal-card--summary">
        <h2 class="modal-card__title modal-text-center">Resumen del Partido</h2>
        <div class="summary-scoreboard">
          <div class="summary-team summary-team--home">${escapeHTML(homeTeam?.name || 'Local')}</div>
          <div class="summary-score">${matchData.scoreHome ?? 0} - ${matchData.scoreAway ?? 0}</div>
          <div class="summary-team summary-team--away">${escapeHTML(awayTeam?.name || 'Visitante')}</div>
        </div>
        <div class="summary-events-grid">
          <div><h4 class="summary-col-title">Local</h4>${renderEventList(homeEvents)}</div>
          <div><h4 class="summary-col-title" style="color: #3b82f6;">Visitante</h4>${renderEventList(awayEvents)}</div>
        </div>
        <div class="modal-text-center live-modal-close"><button type="button" class="btn btn--secondary" onclick="document.getElementById('dynamic-summary-modal').remove()">Cerrar</button></div>
      </div>`;
    modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.remove(); };
  } catch (error) {
    console.error('Error al cargar resumen:', error);
    const modalEl = document.getElementById('dynamic-summary-modal');
    if(modalEl) modalEl.innerHTML = `<div class="modal-card modal-card--confirm" style="color: #ef4444;">Error al cargar los eventos.</div>`;
  }
};