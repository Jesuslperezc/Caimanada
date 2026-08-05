import { getActiveLeague } from '../db/repositories/leagues.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
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

export async function renderTeamsView() {
  const container = document.getElementById('teams-content-target');
  const searchInput = document.getElementById('teams-search-input');
  const addBtn = document.getElementById('btn-add-team');

  if (!container) return;

  const activeLeague = await getActiveLeague();

  if (!activeLeague) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">No hay ninguna liga activa.</p>
        <p class="empty-state__subtitle">Selecciona o crea una en la pestaña "Ligas" para gestionar sus equipos.</p>
      </div>
    `;
    return;
  }

  // Cargar equipos y partidos de la liga activa
  const rawTeamsData = await getTeamsByLeague(activeLeague.id);
  const teamsData = Array.isArray(rawTeamsData) ? rawTeamsData : [];
  const matchesData = await getMatchesByLeague(activeLeague.id);

  // Calcular estadísticas dinámicas para cada equipo
  const standings = calculateStandings(teamsData, matchesData);
  const statsMap = Object.fromEntries(standings.map(s => [s.id, s]));

  function render(teams) {
    if (teams.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">No se encontraron equipos registrados en ${escapeHTML(activeLeague.name)}.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="teams-grid">
        ${teams.map(team => {
          const safeName = escapeHTML(team.name);
          const safeDelegate = escapeHTML(team.delegate || 'Sin asignar');
          const safeColor = team.color ? escapeHTML(team.color) : 'var(--accent-primary, #3b82f6)';
          const playersCount = Array.isArray(team.players) ? team.players.length : 0;
          const safeId = escapeHTML(team.id);

          // Recuperar métricas calculadas o valores en cero por defecto
          const st = statsMap[team.id] || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };

          return `
            <article class="info-card team-card" style="border-left: 4px solid ${safeColor}">
              <header class="info-card__header">
                <span class="info-card__label">Club Registrado</span>
                <h2 class="info-card__highlight">${safeName}</h2>
              </header>
              
              <div class="info-card__body">
                <p class="info-card__subtext"><strong>Delegado:</strong> ${safeDelegate}</p>
                <p class="info-card__subtext"><strong>Jugadores:</strong> ${playersCount}</p>
                
                <hr style="border: 0; border-top: 1px solid var(--border-card, #334155); margin: 0.75rem 0;" />
                
                <!-- Estadísticas del Equipo -->
                <div class="team-stats-summary" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; text-align: center; font-size: 0.85rem;">
                  <div><strong>PTS</strong><br/>${st.pts}</div>
                  <div><strong>PJ</strong><br/>${st.pj}</div>
                  <div><strong>G/E/P</strong><br/>${st.pg}/${st.pe}/${st.pp}</div>
                  <div><strong>DG</strong><br/>${st.dg > 0 ? `+${st.dg}` : st.dg}</div>
                </div>
              </div>

              <footer class="info-card__footer" style="margin-top: 1rem;">
                <button class="btn btn--secondary btn--sm btn-view-roster" data-id="${safeId}" data-name="${safeName}">
                  Ver Plantilla
                </button>
              </footer>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  container.onclick = (e) => {
    const target = e.target;
    if (target.classList.contains('btn-view-roster')) {
      const teamName = target.dataset.name;
      alert(`Ver plantilla de ${teamName}`);
    }
  };

  if (searchInput) {
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    newSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const filtered = teamsData.filter(team => 
        (team.name && team.name.toLowerCase().includes(query)) || 
        (team.delegate && team.delegate.toLowerCase().includes(query))
      );
      render(filtered);
    });
  }

  if (addBtn) {
    addBtn.onclick = () => {
      console.log('Abrir modal o formulario de registro de equipo');
    };
  }

  render(teamsData);
}