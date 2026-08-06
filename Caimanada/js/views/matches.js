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
    // NUEVO: Detectar si es un partido por definir (Eliminación directa)
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
          <!-- NUEVO: Clase 'match-card__team--tbd' si está pendiente de definir -->
          <span class="match-card__team match-card__team--home ${isTBD ? 'match-card__team--tbd' : ''}">${homeName}</span>
          
          <!-- NUEVO: Solo se puede jugar si NO es TBD -->
          ${isPending && !isTBD 
            ? `<div class="match-card__score match-card__score--active" onclick="window.openLiveMatch('${match.id}', '${league.id}', '${league.sport}')">VS</div>`
            : isCompleted 
              ? `<div class="match-card__score match-card__score--finished">${match.scoreHome ?? 0} - ${match.scoreAway ?? 0}</div>`
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

    // NUEVA REGLA: Validar que tengan jugadores mínimos para jugar
    // Si el deporte requiere 2 (Pádel), exige 2. Si requiere 25 (Béisbol), exige al menos 2 para no bloquear pruebas.
    const sportLimit = getMaxPlayersForSport(sportId);
    const minRequired = Math.min(sportLimit, 2); 
    
    if (homePlayers.length < minRequired || awayPlayers.length < minRequired) {
      AlertService.showError(`Cada equipo debe tener al menos ${minRequired} jugadores registrados para jugar este deporte.`);
      return;
    }

    // ... (El HTML del modal se queda exactamente igual, no lo borres, esta función continua igual hasta inicializar el cronómetro) ...
    document.body.insertAdjacentHTML('beforeend', `
      <div id="live-match-modal" class="live-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 9999; overflow-y: auto; display: flex; justify-content: center; padding: 2rem 1rem;">
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
            <button id="btn-next-period" class="btn btn--secondary" onclick="window.nextPeriod()">⏭ ${sportConfig.hasClock ? 'Descanso' : 'Siguiente Set'}</button>
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
            <div style="display: flex; gap: 10px; flex-wrap: wrap;" id="events-buttons-container">
              <button class="btn btn--primary" style="flex:1; background: #10b981; min-width: 100px;" onclick="window.addLiveEvent('point')">⭐ ${sportConfig.pointsLabel}</button>
              ${sportConfig.hasCards ? `
              <button class="btn btn--secondary" style="flex:1; background: #eab308; color:#000; min-width: 80px;" onclick="window.addLiveEvent('warning')">🟨 Amarilla</button>
              <button class="btn btn--danger" style="flex:1; min-width: 80px;" onclick="window.addLiveEvent('expulsion')">🟥 Roja</button>` : ''}
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
    if(sportConfig.hasClock) document.getElementById('live-clock').textContent = activeChronometer.formattedTime;

  } catch (error) {
    console.error('Error al abrir el partido en vivo:', error);
    if (activeChronometer) { activeChronometer.destroy(); activeChronometer = null; }
    document.getElementById('live-match-modal')?.remove();
    AlertService.showError('Ocurrió un error al cargar los datos del partido.');
  }
};

// --- FINALIZAR PARTIDO (CON INTEGRIDAD DE ELIMINACIÓN DIRECTA) ---
window.finishLiveMatch = async function(matchId, leagueId) {
  if (!activeChronometer) return;
  
  const scoreHome = window._liveData.scoreHome;
  const scoreAway = window._liveData.scoreAway;
  const eventsToSave = [...liveMatchEvents];

  // 1. VALIDACIÓN DE EMPATE EN ELIMINACIÓN DIRECTA
  if (scoreHome === scoreAway) {
    // Si el partido tiene un enlace a una siguiente ronda, es eliminatoria directa
    const currentMatchData = (await getMatchesByLeague(leagueId)).find(m => m.id === matchId);
    if (currentMatchData && currentMatchData.winnerGoesToMatchId) {
      AlertService.showError('En eliminación directa no puede haber empate. Debe haber un ganador.');
      return; // No destruimos el cronómetro, el usuario debe corregir el marcador
    }
  }

  // 2. DETERMINAR GANADOR
  let winnerTeamId = null;
  if (scoreHome > scoreAway) winnerTeamId = window._liveData.homeTeam.id;
  else if (scoreAway > scoreHome) winnerTeamId = window._liveData.awayTeam.id;

  // 3. DESTRUIR CRONÓMETRO Y CERRAR MODAL
  activeChronometer.pause(); 
  activeChronometer.destroy(); 
  activeChronometer = null;

  try {
    // 4. TRANSACCIÓN DE INTEGRIDAD TOTAL
    await executeTransaction(['matches', 'events'], 'readwrite', async (tx) => {
      const matchStore = tx.objectStore('matches');
      
      // A. Actualizar partido actual
      const match = await new Promise((res, rej) => { 
        const req = matchStore.get(matchId); 
        req.onsuccess = () => res(req.result); 
        req.onerror = () => rej(req.error); 
      });
      
      match.status = 'completed'; 
      match.scoreHome = scoreHome; 
      match.scoreAway = scoreAway;
      matchStore.put(match);

      // B. Guardar eventos en Repositories/matchEvent (Usando tu función existente)
      if (eventsToSave.length > 0) {
        await MatchEventRepository.addEventsInTransaction(tx, eventsToSave);
      }

      // C. AVANZAR GANADOR EN ELIMINACIÓN DIRECTA (Sección 4.8.3 del PDF)
      if (winnerTeamId && match.winnerGoesToMatchId) {
        const nextMatch = await new Promise((res, rej) => { 
          const req = matchStore.get(match.winnerGoesToMatchId); 
          req.onsuccess = () => res(req.result); 
          req.onerror = () => rej(req.error); 
        });
        
        if (nextMatch) {
          // Si el slot del partido actual era 'home', el ganador va como local en la siguiente ronda
          if (match.slot === 'home') {
            nextMatch.homeTeamId = winnerTeamId;
          } else if (match.slot === 'away') {
            nextMatch.awayTeamId = winnerTeamId;
          }
          matchStore.put(nextMatch); // Guardar el partido de la siguiente ronda actualizado
        }
      }
    });
    
    document.getElementById('live-match-modal')?.remove();
    AlertService.showChampion('¡Partido Finalizado!', `${scoreHome} - ${scoreAway}`);
    renderMatchesView(); // Recarga la vista, el partido "BLOQUEADO" ahora mostrará los equipos reales
    
  } catch (error) {
    console.error(error);
    AlertService.showError('Error crítico al guardar. La transacción fue revertida.');
  }
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

window.closeLiveMatch = function() {
  if (activeChronometer) { activeChronometer.destroy(); activeChronometer = null; }
  document.getElementById('live-match-modal')?.remove(); liveMatchEvents = [];
};

function updateClockUI(state) {
  const clockEl = document.getElementById('live-clock');
  if(clockEl) clockEl.textContent = state.formattedTime;
  const periodEl = document.getElementById('live-period-name');
  if(periodEl) periodEl.textContent = state.currentPeriodName;
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