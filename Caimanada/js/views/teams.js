import { getActiveLeague } from '../db/repositories/leagues.js';
import { getTeamsBySport, addTeam, deleteTeam } from '../db/repositories/teams.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { getPlayersByTeam, addPlayer, deletePlayer } from '../db/repositories/players.js';
import { calculateStandings } from '../utils/statsCalculator.js';

// Límites configurables por deporte
const SPORT_ROSTER_LIMITS = {
  futbol_sala: 12,
  futbol_campo: 22,
  basketball: 12,
  baseball: 25,
  kickingball: 20,
  volleyball: 14,
  default: 15
};

function getActiveSport() {
  // Obtiene el deporte guardado globalmente en tu app o retorna un fallback
  return localStorage.getItem('active_sport_id') || 'futbol_sala';
}

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

  const activeSportId = getActiveSport();
  const activeLeague = await getActiveLeague(); // Puede ser null si el equipo aún no está suscrito a ninguna liga

  // Cargar equipos del Deporte Activo (Independiente de si hay liga activa o no)
  const rawTeamsData = await getTeamsBySport(activeSportId);
  const teamsData = Array.isArray(rawTeamsData) ? rawTeamsData : [];

  // Recopilar estadísticas si existe una liga activa
  let statsMap = {};
  if (activeLeague) {
    const matchesData = await getMatchesByLeague(activeLeague.id);
    const standings = calculateStandings(teamsData, matchesData);
    statsMap = Object.fromEntries(standings.map(s => [s.id, s]));
  }

  function render(teams) {
    if (teams.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">No hay equipos registrados en este deporte.</p>
          <p class="empty-state__subtitle">Presiona "Registrar Equipo" para crear el primero.</p>
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
                
                <div class="team-stats-summary">
                  <div><strong>PTS</strong><br/>${st.pts}</div>
                  <div><strong>PJ</strong><br/>${st.pj}</div>
                  <div><strong>G/E/P</strong><br/>${st.pg}/${st.pe}/${st.pp}</div>
                  <div><strong>DG</strong><br/>${st.dg > 0 ? `+${st.dg}` : st.dg}</div>
                </div>

                <div class="team-chart-container">
                  <canvas class="team-chart-canvas" data-pg="${st.pg}" data-pe="${st.pe}" data-pp="${st.pp}"></canvas>
                </div>
              </div>

              <footer class="info-card__footer">
                <button class="btn btn--secondary btn--sm btn-view-roster" data-id="${safeId}" data-name="${safeName}">
                  Ver Plantilla
                </button>
                <button class="btn btn--danger btn--sm btn-delete-team" data-id="${safeId}" data-name="${safeName}">
                  Eliminar
                </button>
              </footer>
            </article>
          `;
        }).join('')}
      </div>
    `;

    renderTeamCharts();
  }

  // Buscador en tiempo real
  if (searchInput) {
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    newSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const filtered = teamsData.filter(team => {
        const matchName = team.name ? team.name.toLowerCase().includes(query) : false;
        const matchDelegate = team.delegate ? team.delegate.toLowerCase().includes(query) : false;
        return matchName || matchDelegate;
      });
      render(filtered);
    });
  }

  // Registrar equipo
  if (addBtn) {
    addBtn.onclick = () => {
      openAddTeamModal(activeSportId, activeLeague?.id || null, () => renderTeamsView());
    };
  }

  // Eventos de tarjetas
  container.onclick = async (e) => {
    const target = e.target;
    const safeId = target.dataset.id;
    const safeName = target.dataset.name;

    if (target.classList.contains('btn-view-roster')) {
      openRosterModal(safeId, safeName, activeSportId, () => renderTeamsView());
    }

    if (target.classList.contains('btn-delete-team')) {
      if (confirm(`¿Deseas eliminar al equipo "${safeName}"?`)) {
        await deleteTeam(safeId);
        renderTeamsView();
      }
    }
  };

  render(teamsData);
}

// ==========================================
// MODAL DE REGISTRO DE EQUIPO
// ==========================================
function openAddTeamModal(sportId, leagueId, onSaveCallback) {
  document.getElementById('dynamic-team-modal')?.remove();

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
            <label class="form-group__label">Delegado / Capitán</label>
            <input type="text" id="dyn-team-delegate" placeholder="Ej: Carlos Pérez" class="form-control" style="width: 100%; padding: 0.5rem;" />
          </div>

          <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
            <button type="button" id="dyn-team-cancel" class="btn btn--secondary">Cancelar</button>
            <button type="submit" class="btn btn--primary">Registrar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modalEl = document.getElementById('dynamic-team-modal');
  const formEl = document.getElementById('dynamic-team-form');

  document.getElementById('dyn-team-cancel').onclick = () => modalEl.remove();

  formEl.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('dyn-team-name').value.trim();
    const delegate = document.getElementById('dyn-team-delegate').value.trim();

    if (!name) return;

    await addTeam({ sportId, leagueId, name, delegate });
    modalEl.remove();
    if (onSaveCallback) onSaveCallback();
  };
}

// ==========================================
// MODAL DE PLANTILLA CON CONTROL DE LÍMITE
// ==========================================
function openRosterModal(teamId, teamName, sportId, onCloseCallback) {
  document.getElementById('dynamic-roster-modal')?.remove();

  const maxPlayers = SPORT_ROSTER_LIMITS[sportId] || SPORT_ROSTER_LIMITS.default;

  const modalHTML = `
    <div id="dynamic-roster-modal" class="modal-overlay">
      <div class="modal-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2 class="modal-card__title">Plantilla: ${escapeHTML(teamName)}</h2>
          <span id="dyn-roster-counter" style="font-size: 0.85rem; font-weight: bold; color: var(--text-muted, #94a3b8);">
            0 / ${maxPlayers}
          </span>
        </div>
        
        <div id="dyn-players-list" class="players-list" style="max-height: 220px; overflow-y: auto; margin: 1rem 0; padding-right: 0.25rem;"></div>

        <form id="dyn-player-form" style="display: flex; gap: 0.5rem; align-items: center;">
          <input type="text" id="dyn-player-name" placeholder="Nombre jugador" required class="form-control" style="flex: 2; padding: 0.4rem;" />
          <input type="number" id="dyn-player-number" placeholder="#" min="0" max="99" required class="form-control" style="flex: 1; padding: 0.4rem;" />
          <button type="submit" id="dyn-btn-add-player" class="btn btn--primary">+</button>
        </form>
        <p id="dyn-roster-warning" style="color: #ef4444; font-size: 0.8rem; margin-top: 0.4rem; display: none;">
          Límite máximo de plantilla alcanzado (${maxPlayers} jugadores).
        </p>

        <div class="modal-actions" style="margin-top: 1.25rem; text-align: right;">
          <button type="button" id="dyn-roster-close" class="btn btn--secondary">Cerrar</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modalEl = document.getElementById('dynamic-roster-modal');
  const formEl = document.getElementById('dyn-player-form');
  const addBtn = document.getElementById('dyn-btn-add-player');
  const warningEl = document.getElementById('dyn-roster-warning');
  const counterEl = document.getElementById('dyn-roster-counter');

  const closeModal = () => {
    modalEl.remove();
    if (onCloseCallback) onCloseCallback();
  };

  document.getElementById('dyn-roster-close').onclick = closeModal;

  const refreshPlayers = async () => {
    const listContainer = document.getElementById('dyn-players-list');
    if (!listContainer) return;

    const players = await getPlayersByTeam(teamId);
    const count = players.length;

    counterEl.textContent = `${count} / ${maxPlayers}`;

    // Evaluación del límite de la plantilla
    if (count >= maxPlayers) {
      addBtn.disabled = true;
      warningEl.style.display = 'block';
    } else {
      addBtn.disabled = false;
      warningEl.style.display = 'none';
    }

    if (count === 0) {
      listContainer.innerHTML = `<p style="color: #94a3b8; font-size: 0.85rem; text-align: center;">Sin jugadores inscritos.</p>`;
      return;
    }

    listContainer.innerHTML = players.map(p => `
      <div class="player-item" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; background: var(--bg-main, #0f172a); padding: 0.4rem 0.6rem; border-radius: 6px;">
        <span><strong>#${escapeHTML(p.number)}</strong> ${escapeHTML(p.name)}</span>
        <button class="btn btn--sm btn-danger btn-delete-dyn-player" data-id="${p.id}" style="padding: 0.1rem 0.4rem;">✕</button>
      </div>
    `).join('');

    listContainer.querySelectorAll('.btn-delete-dyn-player').forEach(btn => {
      btn.onclick = async () => {
        await deletePlayer(btn.dataset.id);
        await refreshPlayers();
      };
    });
  };

  formEl.onsubmit = async (e) => {
    e.preventDefault();
    const currentPlayers = await getPlayersByTeam(teamId);

    if (currentPlayers.length >= maxPlayers) return;

    const name = document.getElementById('dyn-player-name').value.trim();
    const number = document.getElementById('dyn-player-number').value;

    await addPlayer({ teamId, name, number, position: 'Jugador' });
    formEl.reset();
    await refreshPlayers();
  };

  refreshPlayers();
}

function renderTeamCharts() {
  const canvases = document.querySelectorAll('.team-chart-canvas');
  if (typeof Chart === 'undefined') return;

  canvases.forEach(canvas => {
    const pg = parseInt(canvas.dataset.pg, 10) || 0;
    const pe = parseInt(canvas.dataset.pe, 10) || 0;
    const pp = parseInt(canvas.dataset.pp, 10) || 0;
    const total = pg + pe + pp;

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Ganados', 'Empatados', 'Perdidos'],
        datasets: [{
          data: total === 0 ? [0, 0, 1] : [pg, pe, pp],
          backgroundColor: total === 0 ? ['#334155', '#334155', '#334155'] : ['#22c55e', '#eab308', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: total > 0 } },
        cutout: '70%'
      }
    });
  });
}