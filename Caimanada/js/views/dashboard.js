import { getActiveLeague } from '../db/repositories/leagues.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { calculateStandings } from '../utils/statsCalculator.js';
import { MatchEventRepository } from '../db/repositories/matchEvent.js';
import { getTimerConfig } from '../utils/sport-terms.js';
import { AlertService } from '../components/alert.js';

const SPORT_DISPLAY_NAMES = {
  futbol_sala: 'Futbolito / Futsal', futbol_campo: 'Fútbol Campo', basketball: 'Baloncesto',
  baseball: 'Béisbol', kickingball: 'Kickingball', volleyball: 'Voleibol',
  padel: 'Pádel', ping_pong: 'Ping-Pong', ajedrez: 'Ajedrez'
};

let dashboardChart = null;

export async function renderDashboardView() {
  const currentSportId = localStorage.getItem('active_sport_id') || 'futbol_sala';
  const activeLeague = await getActiveLeague();
  
  const emptyContainer = document.getElementById('empty-league-container');
  const activeInfoContainer = document.getElementById('active-league-info');
  const bracketCard = document.getElementById('card-bracket-path');

  if (dashboardChart) { dashboardChart.destroy(); dashboardChart = null; }

  // LÓGICA CORREGIDA: Si no hay liga o no coincide con el deporte, mostramos estado vacío
  if (!activeLeague || activeLeague.sport !== currentSportId) {
    if (emptyContainer) emptyContainer.style.display = 'flex';
    if (activeInfoContainer) activeInfoContainer.style.display = 'none';
    
    const sportName = SPORT_DISPLAY_NAMES[currentSportId] || 'este deporte';
    const titleEl = document.getElementById('active-league-title');
    const modeEl = document.getElementById('active-league-mode');
    if (titleEl) titleEl.textContent = `No hay liga de ${sportName} activa`;
    if (modeEl) modeEl.textContent = `Crea una nueva liga de ${sportName} o inicia una Caimana Flash.`;
    
  } else {
    // SI HAY LIGA ACTIVA Y COINCIDE, MOSTRAMOS LOS DATOS
    if (emptyContainer) emptyContainer.style.display = 'none';
    if (activeInfoContainer) activeInfoContainer.style.display = 'block';
    
    const sportConfig = getTimerConfig(activeLeague.sport) || {};
    const pointsLabel = (sportConfig.pointsLabel || 'Punto').toLowerCase();
    const pointsPlural = pointsLabel + 's';
    const leagueMode = activeLeague.mode || 'Liga';
    const matchWord = leagueMode.includes('Liga') ? 'Jornada' : 'Fase';

    document.getElementById('dash-league-name').textContent = activeLeague.name || 'Liga Activa';
    document.getElementById('dash-league-mode').textContent = leagueMode;
    document.getElementById('mvp-title-label').textContent = `El Rey de la Caimana (${pointsPlural})`;
    document.getElementById('leader-label').textContent = leagueMode.includes('Liga') ? 'Líder de la Tabla' : 'Favorito al Título';
    document.getElementById('next-match-label').textContent = 'Próximo Enfrentamiento';

    if (leagueMode.includes('Eliminación')) {
      if (bracketCard) bracketCard.style.display = 'flex';
    } else {
      if (bracketCard) bracketCard.style.display = 'none';
    }

    const teams = await getTeamsByLeague(activeLeague.id) || [];
    const matches = await getMatchesByLeague(activeLeague.id) || [];
    const standings = calculateStandings(teams, matches) || [];
    const completedMatches = matches.filter(m => m.status === 'completed');

    const now = new Date();
    const upcomingMatches = matches
      .filter(m => m.status === 'pending' && (!m.date || new Date(m.date) >= now))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const nextMatch = upcomingMatches[0];
    const homeEl = document.getElementById('next-match-home');
    const awayEl = document.getElementById('next-match-away');
    const timeEl = document.getElementById('next-match-time');

    if (nextMatch) {
      const homeTeam = teams.find(t => t.id === nextMatch.homeTeamId);
      const awayTeam = teams.find(t => t.id === nextMatch.awayTeamId);
      homeEl.textContent = homeTeam ? homeTeam.name : 'Por definir';
      awayEl.textContent = awayTeam ? awayTeam.name : 'Por definir';
      if (nextMatch.date) {
        const d = new Date(nextMatch.date);
        timeEl.textContent = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      } else {
        timeEl.textContent = 'Fecha por confirmar';
      }
    } else {
      homeEl.textContent = 'Temporada';
      awayEl.textContent = 'Finalizada';
      timeEl.textContent = 'No hay próximos encuentros';
    }

    const leaderTeamNameEl = document.getElementById('leader-team-name');
    const leaderTeamStatsEl = document.getElementById('leader-team-stats');
    if (standings.length > 0) {
      const leader = standings[0];
      leaderTeamNameEl.textContent = leader.name;
      leaderTeamStatsEl.textContent = `${leader.pts} Puntos | ${leader.pg} G | ${leader.pe} E | ${leader.pp} P`;
    } else {
      leaderTeamNameEl.textContent = 'Sin datos';
      leaderTeamStatsEl.textContent = `Aún no hay partidos jugados`;
    }

    const hotTeamNameEl = document.getElementById('hot-team-name');
    const hotTeamStatsEl = document.getElementById('hot-team-stats');
    const coldTeamNameEl = document.getElementById('cold-team-name');
    const coldTeamStatsEl = document.getElementById('cold-team-stats');

    if (completedMatches.length >= 2) {
      const teamForms = {};
      teams.forEach(t => teamForms[t.id] = []);
      matches.filter(m => m.status === 'completed').sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(m => {
        if (teamForms[m.homeTeamId]) teamForms[m.homeTeamId].push(m.scoreHome > m.scoreAway ? 'W' : (m.scoreHome < m.scoreAway ? 'L' : 'D'));
        if (teamForms[m.awayTeamId]) teamForms[m.awayTeamId].push(m.scoreHome > m.scoreAway ? 'L' : (m.scoreHome < m.scoreAway ? 'W' : 'D'));
      });
      let bestStreak = { team: null, wins: -1 };
      let worstStreak = { team: null, losses: -1 };
      Object.keys(teamForms).forEach(teamId => {
        const form = teamForms[teamId].slice(0, 3);
        const wins = form.filter(r => r === 'W').length;
        const losses = form.filter(r => r === 'L').length;
        if (wins > bestStreak.wins) bestStreak = { team: teams.find(t => t.id === teamId), wins };
        if (losses > worstStreak.losses) worstStreak = { team: teams.find(t => t.id === teamId), losses };
      });
      if (bestStreak.team && bestStreak.wins > 0) {
        hotTeamNameEl.textContent = bestStreak.team.name;
        hotTeamStatsEl.textContent = `${bestStreak.wins} victorias en últimas 3`;
      } else {
        hotTeamNameEl.textContent = 'Pendiente'; hotTeamStatsEl.textContent = 'Sin racha positiva';
      }
      if (worstStreak.team && worstStreak.losses > 0) {
        coldTeamNameEl.textContent = worstStreak.team.name;
        coldTeamStatsEl.textContent = `${worstStreak.losses} derrotas en últimas 3`;
      } else {
        coldTeamNameEl.textContent = 'Pendiente'; coldTeamStatsEl.textContent = 'Sin racha negativa';
      }
    } else {
      hotTeamNameEl.textContent = 'Pendiente'; hotTeamStatsEl.textContent = 'Se necesita 1 jornada más';
      coldTeamNameEl.textContent = 'Pendiente'; coldTeamStatsEl.textContent = 'Se necesita 1 jornada más';
    }

    const mvpNameEl = document.getElementById('mvp-player-name');
    const mvpStatsEl = document.getElementById('mvp-player-stats');
    if (completedMatches.length > 0) {
      const lastMatch = matches.filter(m => m.status === 'completed').sort((a,b) => new Date(b.date) - new Date(a.date))[0];
      const recentMatches = matches.filter(m => m.status === 'completed' && m.round === lastMatch.round);
      let playerPoints = {};
      for (const m of recentMatches) {
        const events = await MatchEventRepository.getEventsByMatch(m.id);
        events.forEach(ev => {
          if (ev.type === 'point') {
            if (!playerPoints[ev.playerId]) playerPoints[ev.playerId] = { name: ev.playerName, count: 0 };
            playerPoints[ev.playerId].count++;
          }
        });
      }
      let mvp = null;
      Object.keys(playerPoints).forEach(pid => {
        if (!mvp || playerPoints[pid].count > mvp.count) mvp = playerPoints[pid];
      });
      if (mvp) {
        mvpNameEl.textContent = mvp.name;
        mvpStatsEl.textContent = `${mvp.count} ${pointsPlural} en la última ${matchWord}`;
      } else {
        mvpNameEl.textContent = 'Sin registros';
        mvpStatsEl.textContent = `No se registraron ${pointsPlural} en la última ${matchWord}`;
      }
    }

    if (leagueMode.includes('Eliminación')) {
      const bracketContainer = document.getElementById('bracket-path-container');
      if (bracketContainer) {
        bracketContainer.innerHTML = '';
        const finalMatch = matches.find(m => !m.winnerGoesToMatchId);
        if (finalMatch) {
          const homeTeam = teams.find(t => t.id === finalMatch.homeTeamId);
          const awayTeam = teams.find(t => t.id === finalMatch.awayTeamId);
          const homeName = homeTeam ? homeTeam.name : 'Por definir';
          const awayName = awayTeam ? awayTeam.name : 'Por definir';
          let winnerName = 'Campeón por definir';
          if (finalMatch.status === 'completed') {
            winnerName = finalMatch.scoreHome > finalMatch.scoreAway ? homeName : awayName;
          }
          bracketContainer.innerHTML = `
            <div class="bracket-match">
              <p class="bracket-round-label">FINAL</p>
              <p class="bracket-team-name">${homeName}</p>
              <p class="bracket-vs">VS</p>
              <p class="bracket-team-name">${awayName}</p>
            </div>
            <div class="bracket-arrow">➜</div>
            <div class="bracket-winner">
              <p class="bracket-champ-label"><i class="fa-solid fa-crown"></i> CAMPEÓN</p>
              <p class="bracket-champ-name">${winnerName}</p>
            </div>
          `;
        }
      }
    }

    const ctx = document.getElementById('canvas-dashboard-stats');
    const chartWrapper = ctx ? ctx.parentElement : null;
    if (ctx && chartWrapper) {
      const existingMsg = document.getElementById('no-data-dashboard-msg');
      if (existingMsg) existingMsg.remove();
      if (standings.length > 0 && standings.some(s => s.pts > 0 || s.pj > 0)) {
        ctx.style.display = 'block';
        dashboardChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: standings.map(s => s.name),
            datasets: [{
              label: 'Puntos Totales',
              data: standings.map(s => s.pts),
              backgroundColor: 'rgba(0, 255, 157, 0.6)',
              borderColor: 'rgba(0, 255, 157, 1)',
              borderWidth: 1, borderRadius: 6
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
              x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
          }
        });
      } else {
        ctx.style.display = 'none';
        const msg = document.createElement('p');
        msg.id = 'no-data-dashboard-msg';
        msg.className = 'info-card__subtext empty-chart-msg';
        msg.textContent = 'No hay datos registrados';
        chartWrapper.appendChild(msg);
      }
    }
  } // CIERRA EL ELSE DE LIGA ACTIVA

  // --- HISTORIAL CAIMANA FLASH (Siempre se ejecuta) ---
  const flashHistoryContainer = document.getElementById('flash-history-container');
  if (flashHistoryContainer) {
    const history = JSON.parse(localStorage.getItem('caimanada_flash_history') || '[]');
    if (history.length === 0) {
      flashHistoryContainer.innerHTML = `<p class="info-card__subtext" style="text-align: center;">Aún no has realizado ninguna Caimana Flash.</p>`;
    } else {
      flashHistoryContainer.innerHTML = history.slice(0, 5).map((f, idx) => {
        const matchCount = f.matchHistory ? f.matchHistory.length : 0;
        const date = new Date(f.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        return `
          <div onclick="window.openFlashDetail(${idx})" style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem; border-left: 3px solid var(--accent-primary);">
            <div>
              <p style="margin: 0; font-weight: bold; color: var(--text-primary);">${date} <span style="color: var(--text-muted); font-weight: normal; font-size: 0.8rem;">(${matchCount} partidos)</span></p>
            </div>
            <i class="fa-solid fa-chevron-right" style="color: var(--text-muted);"></i>
          </div>
        `;
      }).join('');
    }
  }
}

// --- FUNCIONES DEL MODAL DE DETALLE FLASH ---
window.openFlashDetail = (idx) => {
  const history = JSON.parse(localStorage.getItem('caimanada_flash_history') || '[]');
  const photos = JSON.parse(localStorage.getItem('caimanada_flash_photos') || '{}');
  const session = history[idx];
  if (!session) return;

  const sessionPhoto = photos[session.id];
  const dateStr = new Date(session.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

  document.getElementById('dynamic-flash-detail-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="dynamic-flash-detail-modal" class="modal-overlay">
      <div class="modal-card modal-card--summary">
        <h2 class="modal-card__title"><i class="fa-solid fa-bolt"></i> Detalle Caimana Flash</h2>
        <p class="modal-subtitle">${new Date(session.date).toLocaleString('es-ES')}</p>
        
        <div id="flash-photo-container" style="margin-bottom: 1.5rem; text-align: center;">
          ${sessionPhoto ? `
            <div style="position: relative; width: 100%; max-width: 300px; margin: 0 auto 1rem; border-radius: 12px; overflow: hidden; border: 1px solid var(--accent-primary);">
              <img src="${sessionPhoto}" id="caimana-memory-img" style="width: 100%; display: block;">
              <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(0deg, rgba(2,17,10,0.95) 0%, transparent 100%); padding: 1.5rem 1rem 0.5rem; text-align: center;">
                <p style="margin: 0; font-weight: 900; color: var(--accent-primary); text-shadow: 0 0 10px var(--accent-primary);">CAIMANADA</p>
                <p style="margin: 0; font-size: 0.8rem; color: #fff;">${dateStr}</p>
              </div>
            </div>
            <button onclick="window.shareCaimanaPhoto('${session.id}')" class="btn btn--secondary btn-full" style="margin-bottom: 0.5rem;">
              <i class="fa-brands fa-whatsapp"></i> Compartir Foto #SoyCaiman
            </button>
          ` : `
            <div style="width: 100%; max-width: 300px; margin: 0 auto 1rem; border: 2px dashed var(--border-card); border-radius: 12px; padding: 2rem 1rem; background: rgba(0,0,0,0.2);">
              <p style="color: var(--text-muted); margin: 0 0 1rem 0;"><i class="fa-solid fa-camera"></i> No hay foto de recuerdo</p>
              <label class="btn btn--secondary" style="cursor: pointer; margin: 0;">
                <i class="fa-solid fa-upload"></i> Subir Foto Ahora
                <input type="file" id="detail-photo-input" accept="image/*" capture="environment" style="display: none;">
              </label>
            </div>
          `}
        </div>

        <div style="text-align: left; max-height: 40vh; overflow-y: auto; margin-bottom: 1rem;">
          ${session.matchHistory.map((m, i) => `
            <div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 8px; margin-bottom: 0.5rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.25rem;">
                <span><strong>${i+1}.</strong> ${m.team1} ${m.score1} - ${m.score2} ${m.team2}</span>
              </div>
              ${m.events.map(ev => `
                <div style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.8rem; margin-top: 0.25rem; color: var(--text-secondary);">
                  <span style="color: var(--text-muted); min-width: 50px;">[${new Date(ev.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}]</span>
                  <span style="min-width: 80px;">${ev.playerName}</span>
                  <input type="text" class="form-control" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; flex: 1;" placeholder="Pegar Link Beelup" oninput="window.updateBeelupLink(${idx}, '${m.id}', '${ev.id}', this.value)" value="${ev.beelupUrl || ''}" />
                </div>
              `).join('') || '<p style="font-size:0.8rem; color:var(--text-muted);">Sin goles registrados</p>'}
            </div>
          `).join('')}
        </div>

        <div class="modal-actions" style="flex-direction: column; gap: 0.5rem;">
          <button onclick="window.shareFlashHistory(${idx})" class="btn btn--primary btn-full">
            <i class="fa-solid fa-share-nodes"></i> Compartir Historial (URL)
          </button>
          <button onclick="document.getElementById('dynamic-flash-detail-modal').remove()" class="btn btn--secondary btn-full">Cerrar</button>
        </div>
      </div>
    </div>
  `);

  const detailPhotoInput = document.getElementById('detail-photo-input');
  if (detailPhotoInput) {
    detailPhotoInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target.result;
          let photosObj = JSON.parse(localStorage.getItem('caimanada_flash_photos') || '{}');
          photosObj[session.id] = base64;
          localStorage.setItem('caimanada_flash_photos', JSON.stringify(photosObj));
          AlertService.showSuccess('Foto guardada', 'Ahora puedes compartirla');
          window.openFlashDetail(idx);
        };
        reader.readAsDataURL(file);
      }
    };
  }
};

window.updateBeelupLink = (idx, matchId, evId, url) => {
  let history = JSON.parse(localStorage.getItem('caimanada_flash_history') || '[]');
  const session = history[idx];
  if (!session) return;
  const match = session.matchHistory.find(m => m.id === matchId);
  if (match) {
    const ev = match.events.find(e => e.id === evId);
    if (ev) {
      ev.beelupUrl = url;
      localStorage.setItem('caimanada_flash_history', JSON.stringify(history));
    }
  }
};

window.shareFlashHistory = (idx) => {
  let history = JSON.parse(localStorage.getItem('caimanada_flash_history') || '[]');
  const session = history[idx];
  if (!session) return;
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(session));
  const shareUrl = `${window.location.origin}${window.location.pathname}#flash?data=${compressed}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    AlertService.showSuccess('¡Enlace copiado!', 'Pégalo en tu grupo de WhatsApp para que otros sincronicen sus videos.');
  }).catch(() => AlertService.showError('No se pudo copiar el enlace'));
};

window.shareCaimanaPhoto = async (sessionId) => {
  const photos = JSON.parse(localStorage.getItem('caimanada_flash_photos') || '{}');
  const base64 = photos[sessionId];
  if (!base64) return;
  try {
    const response = await fetch(base64);
    const blob = await response.blob();
    const file = new File([blob], 'caimanada.jpg', { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        text: '¡Qué Caimanada la de hoy! 🐊🏆 #SoyCaiman',
        files: [file]
      });
    } else {
      AlertService.showError('Tu navegador no permite compartir fotos directamente.');
    }
  } catch (err) {
    console.error('Error compartiendo:', err);
  }
};