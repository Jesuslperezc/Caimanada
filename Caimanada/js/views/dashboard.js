import { getActiveLeague } from '../db/repositories/leagues.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { calculateStandings } from '../utils/statsCalculator.js';
import { MatchEventRepository } from '../db/repositories/matchEvent.js';
import { getTimerConfig } from '../utils/sport-terms.js';

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

  if (!activeLeague || activeLeague.sport !== currentSportId) {
    if (emptyContainer) emptyContainer.style.display = 'flex';
    if (activeInfoContainer) activeInfoContainer.style.display = 'none';
    
    const sportName = SPORT_DISPLAY_NAMES[currentSportId] || 'este deporte';
    const titleEl = document.getElementById('active-league-title');
    const modeEl = document.getElementById('active-league-mode');
    if (titleEl) titleEl.textContent = `No hay liga de ${sportName} activa`;
    if (modeEl) modeEl.textContent = `Crea una nueva liga de ${sportName} o activa una existente en la pestaña de Ligas.`;
    return;
  }

  if (emptyContainer) emptyContainer.style.display = 'none';
  if (activeInfoContainer) activeInfoContainer.style.display = 'block';
  
  // --- ADAPTACIÓN CONTEXTUAL (Con defensiva) ---
  const sportConfig = getTimerConfig(activeLeague.sport) || {};
  const pointsLabel = (sportConfig.pointsLabel || 'Punto').toLowerCase();
  const pointsPlural = pointsLabel + 's';
  const leagueMode = activeLeague.mode || 'Liga';
  const matchWord = leagueMode.includes('Liga') ? 'Jornada' : 'Fase';

  // Pintar los datos básicos de la liga activa SIEMPRE
  document.getElementById('dash-league-name').textContent = activeLeague.name || 'Liga Activa';
  document.getElementById('dash-league-mode').textContent = leagueMode;
  document.getElementById('mvp-title-label').textContent = `El Rey de la CaimanaDa 🐊 (${pointsPlural})`;
  document.getElementById('leader-label').textContent = leagueMode.includes('Liga') ? 'Líder de la Tabla' : 'Favorito al Título';
  document.getElementById('next-match-label').textContent = 'Próximo Enfrentamiento';

  // Ocultar o mostrar tarjeta de Bracket
  if (leagueMode.includes('Eliminación')) {
    if (bracketCard) bracketCard.style.display = 'block';
  } else {
    if (bracketCard) bracketCard.style.display = 'none';
  }

  // Obtener datos de la BD
  const teams = await getTeamsByLeague(activeLeague.id) || [];
  const matches = await getMatchesByLeague(activeLeague.id) || [];
  const standings = calculateStandings(teams, matches) || [];

  // Partidos ya jugados (necesario para Termómetro y MVP)
  const completedMatches = matches.filter(m => m.status === 'completed');

  // --- Próximo Partido ---
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

  // --- Líder de la Tabla ---
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

  // --- Idea 2: Termómetro de Rachas ---
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

  // --- Idea 4: MVP de la Jornada ---
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

  // --- Idea 5: Ruta al Título (Eliminación Directa) ---
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
            <p style="font-size: 0.75rem; color: #94a3b8; margin:0 0 0.5rem 0;">FINAL</p>
            <p style="font-weight: bold; margin: 0.25rem 0; color: #e2e8f0;">${homeName}</p>
            <p style="font-size: 0.7rem; color: #64748b; margin:0;">VS</p>
            <p style="font-weight: bold; margin: 0.25rem 0; color: #e2e8f0;">${awayName}</p>
          </div>
          <div class="bracket-arrow">➜</div>
          <div class="bracket-winner">
            <p style="font-size: 0.75rem; color: var(--accent-primary, #00A86B); margin:0 0 0.5rem 0;">👑 CAMPEÓN</p>
            <p style="font-weight: 800; margin: 0.25rem 0; font-size: 1.1rem;">${winnerName}</p>
          </div>
        `;
      }
    }
  }

  const ctx = document.getElementById('canvas-dashboard-stats');
  if (ctx && standings.length > 0) {
    dashboardChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: standings.map(s => s.name),
        datasets: [{
          label: 'Puntos Totales',
          data: standings.map(s => s.pts),
          backgroundColor: 'rgba(0, 168, 107, 0.6)',
          borderColor: 'rgba(0, 168, 107, 1)',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
          x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
        }
      }
    });
  }
}