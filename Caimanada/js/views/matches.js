import { getActiveLeague } from '../db/repositories/leagues.js';
import { getMatchesByLeague, saveMatchResult } from '../db/repositories/matches.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { calculateStandings } from '../utils/statsCalculator.js';

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function renderMatchesView() {
  const container = document.getElementById('matches-section');
  if (!container) return;

  const activeLeague = await getActiveLeague();

  if (!activeLeague) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">No hay ninguna liga activa.</p>
        <p class="empty-state__subtitle">Selecciona o crea una en la pestaña "Ligas".</p>
      </div>
    `;
    return;
  }

  const matches = await getMatchesByLeague(activeLeague.id);
  const teams = await getTeamsByLeague(activeLeague.id);
  const teamsMap = Object.fromEntries(teams.map(t => [t.id, t.name]));

  container.innerHTML = `
    <header class="matches-header" style="margin-bottom: 1.5rem;">
      <h1 class="view-title">Partidos y Resultados</h1>
      <p class="view-subtitle">Liga: ${escapeHTML(activeLeague.name)}</p>
    </header>

    <!-- Lista de Partidos -->
    <section class="matches-list-section" style="margin-bottom: 2.5rem;">
      <h2 style="margin-bottom: 1rem;">Calendario de Encuentros</h2>
      <div id="matches-grid" class="matches-grid"></div>
    </section>

    <!-- Tabla de Posiciones y Estadísticas de Equipos -->
    <section class="standings-section">
      <h2 style="margin-bottom: 1rem;">Tabla de Posiciones</h2>
      <div id="standings-table-container"></div>
    </section>
  `;

  renderMatchesList(matches, teamsMap);
  renderStandingsTable(teams, matches);
  setupScoreFormEvents(teams, activeLeague.id);
}

function renderMatchesList(matches, teamsMap) {
  const grid = document.getElementById('matches-grid');
  if (!grid) return;

  if (matches.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">No hay partidos registrados en esta liga.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = matches.map(match => {
    const homeName = escapeHTML(teamsMap[match.homeTeamId] || 'Equipo Local');
    const awayName = escapeHTML(teamsMap[match.awayTeamId] || 'Equipo Visitante');
    const isCompleted = match.status === 'completed';

    return `
      <article class="info-card match-card" style="padding: 1rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
          <span style="flex: 1; text-align: right; font-weight: bold;">${homeName}</span>
          
          <form class="match-score-form" data-match-id="${escapeHTML(match.id)}" style="display: flex; gap: 0.5rem; align-items: center;">
            <input type="number" min="0" value="${match.scoreHome ?? ''}" class="form-control score-home" style="width: 50px; text-align: center;" required />
            <span>-</span>
            <input type="number" min="0" value="${match.scoreAway ?? ''}" class="form-control score-away" style="width: 50px; text-align: center;" required />
            <button type="submit" class="btn btn--secondary btn--sm">
              ${isCompleted ? 'Actualizar' : 'Guardar'}
            </button>
          </form>

          <span style="flex: 1; text-align: left; font-weight: bold;">${awayName}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderStandingsTable(teams, matches) {
  const container = document.getElementById('standings-table-container');
  if (!container) return;

  const standings = calculateStandings(teams, matches);

  if (standings.length === 0) {
    container.innerHTML = `<p class="empty-state">No hay datos de equipos disponibles.</p>`;
    return;
  }

  container.innerHTML = `
    <div style="overflow-x: auto;">
      <table class="data-table" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #ccc; text-align: left;">
            <th style="padding: 8px;">#</th>
            <th style="padding: 8px;">Equipo</th>
            <th style="padding: 8px; text-align: center;">PJ</th>
            <th style="padding: 8px; text-align: center;">PG</th>
            <th style="padding: 8px; text-align: center;">PE</th>
            <th style="padding: 8px; text-align: center;">PP</th>
            <th style="padding: 8px; text-align: center;">GF</th>
            <th style="padding: 8px; text-align: center;">GC</th>
            <th style="padding: 8px; text-align: center;">DG</th>
            <th style="padding: 8px; text-align: center;">PTS</th>
          </tr>
        </thead>
        <tbody>
          ${standings.map((st, index) => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px;">${index + 1}</td>
              <td style="padding: 8px; font-weight: bold;">${escapeHTML(st.name)}</td>
              <td style="padding: 8px; text-align: center;">${st.pj}</td>
              <td style="padding: 8px; text-align: center;">${st.pg}</td>
              <td style="padding: 8px; text-align: center;">${st.pe}</td>
              <td style="padding: 8px; text-align: center;">${st.pp}</td>
              <td style="padding: 8px; text-align: center;">${st.gf}</td>
              <td style="padding: 8px; text-align: center;">${st.gc}</td>
              <td style="padding: 8px; text-align: center;">${st.dg > 0 ? `+${st.dg}` : st.dg}</td>
              <td style="padding: 8px; text-align: center; font-weight: bold;">${st.pts}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function setupScoreFormEvents(teams, leagueId) {
  const container = document.getElementById('matches-grid');
  if (!container) return;

  container.addEventListener('submit', async (e) => {
    if (!e.target.classList.contains('match-score-form')) return;
    e.preventDefault();

    const form = e.target;
    const matchId = form.dataset.matchId;
    const scoreHome = form.querySelector('.score-home').value;
    const scoreAway = form.querySelector('.score-away').value;

    await saveMatchResult(matchId, scoreHome, scoreAway);
    
    // Recargar vista para refrescar resultados y la tabla de posiciones
    const updatedMatches = await getMatchesByLeague(leagueId);
    renderStandingsTable(teams, updatedMatches);
  });
}
