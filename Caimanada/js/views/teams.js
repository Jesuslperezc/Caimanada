import { getActiveLeague } from '../db/repositories/leagues.js';
import { getTeamsBySport, addTeam, updateTeam, deleteTeam } from '../db/repositories/teams.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { getPlayersByTeam, addPlayer, deletePlayer } from '../db/repositories/players.js';
import { calculateStandings } from '../utils/statsCalculator.js';

const SPORT_DISPLAY_NAMES = {
  futbol_sala: 'Futbolito / Futsal',
  futbol_campo: 'Fútbol Campo',
  basketball: 'Baloncesto',
  baseball: 'Béisbol',
  kickingball: 'Kickingball',
  volleyball: 'Voleibol',
  padel: 'Pádel',
  ping_pong: 'Ping-Pong',
  ajedrez: 'Ajedrez'
};

function getActiveSport() {
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
  const activeLeague = await getActiveLeague();

  const teamsData = await getTeamsBySport(activeSportId);

  const playersCountMap = {};
  await Promise.all(
    teamsData.map(async (team) => {
      const players = await getPlayersByTeam(team.id);
      playersCountMap[team.id] = players ? players.length : 0;
    })
  );

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
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="teams-grid">
        ${teams.map(team => {
          const safeName = escapeHTML(team.name);
          const safeDelegate = escapeHTML(team.delegate || 'Sin asignar');
          const safeColor = team.color ? escapeHTML(team.color) : 'var(--accent-primary, #00A86B)';
          const playersCount = playersCountMap[team.id] || 0;
          const safeId = escapeHTML(team.id);
          const st = statsMap[team.id] || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 };

          const isInActiveLeague = activeLeague && team.leagueId === activeLeague.id;
          const canJoinActiveLeague = activeLeague && !team.leagueId;

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
                
                <div class="team-stats-summary" style="display: flex; justify-content: space-between; text-align: center; font-size: 0.85rem; margin-top: 0.5rem;">
                  <div><strong>PTS</strong><br/>${st.pts}</div>
                  <div><strong>PJ</strong><br/>${st.pj}</div>
                  <div><strong>G/E/P</strong><br/>${st.pg}/${st.pe}/${st.pp}</div>
                  <div><strong>DG</strong><br/>${st.dg > 0 ? `+${st.dg}` : st.dg}</div>
                </div>
              </div>

              <footer class="info-card__footer" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 1rem;">
                <button class="btn btn--secondary btn--sm btn-view-roster" data-id="${safeId}" data-name="${safeName}">
                  Plantilla
                </button>
                <button class="btn btn--primary btn--sm btn-add-player" data-id="${safeId}" data-name="${safeName}">
                  + Jugador
                </button>

                ${canJoinActiveLeague ? `
                  <button class="btn btn--secondary btn--sm btn-toggle-league" data-id="${safeId}" data-action="join">
                    + Vincular
                  </button>
                ` : ''}

                ${isInActiveLeague ? `
                  <button class="btn btn--secondary btn--sm btn-toggle-league" data-id="${safeId}" data-action="leave">
                    Desvincular
                  </button>
                ` : ''}

                <button class="btn btn--danger btn--sm btn-delete-team" data-id="${safeId}" data-name="${safeName}">
                  Eliminar
                </button>
              </footer>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  // Búsqueda
  if (searchInput) {
    searchInput.oninput = (e) => {
      const query = e.target.value.toLowerCase().trim();
      const filtered = teamsData.filter(t => 
        (t.name && t.name.toLowerCase().includes(query)) ||
        (t.delegate && t.delegate.toLowerCase().includes(query))
      );
      render(filtered);
    };
  }

  // Registrar Equipo
  if (addBtn) {
    addBtn.onclick = () => {
      openAddTeamModal(activeSportId, async () => {
        await renderTeamsView();
      });
    };
  }

  // Delegación de eventos para acciones en las tarjetas
  container.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const safeId = btn.dataset.id;
    const safeName = btn.dataset.name;

    if (btn.classList.contains('btn-add-player')) {
      openAddPlayerModal(safeId, safeName, async () => {
        await renderTeamsView();
      });
    }

    if (btn.classList.contains('btn-view-roster')) {
      openRosterModal(safeId, safeName, async () => {
        await renderTeamsView();
      });
    }

    if (btn.classList.contains('btn-toggle-league')) {
      const action = btn.dataset.action;
      const team = teamsData.find(t => t.id === safeId);
      if (team) {
        team.leagueId = action === 'join' ? (activeLeague ? activeLeague.id : null) : null;
        await updateTeam(team);
        await renderTeamsView();
      }
    }

    if (btn.classList.contains('btn-delete-team')) {
      if (confirm(`¿Deseas eliminar el equipo "${safeName}"?`)) {
        await deleteTeam(safeId);
        await renderTeamsView();
      }
    }
  };

  render(teamsData);
}

// Modal de Creación con Selección de Deporte
function openAddTeamModal(defaultSportId, onSaveCallback) {
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
            <label class="form-group__label">Deporte *</label>
            <select id="dyn-team-sport" required class="form-control" style="width: 100%; padding: 0.5rem;">
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
  const sportSelect = document.getElementById('dyn-team-sport');
  if (sportSelect) sportSelect.value = defaultSportId;

  document.getElementById('dyn-team-cancel').onclick = () => modalEl.remove();

  document.getElementById('dynamic-team-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('dyn-team-name').value.trim();
    const sportId = document.getElementById('dyn-team-sport').value;
    const delegate = document.getElementById('dyn-team-delegate').value.trim();

    if (!name) return;

    // Sincronizar el deporte activo seleccionado para renderizar la vista correcta
    localStorage.setItem('active_sport_id', sportId);

    const activeLeague = await getActiveLeague();
    const leagueId = activeLeague ? activeLeague.id : null;

    await addTeam({ sportId, leagueId, name, delegate });
    modalEl.remove();
    if (onSaveCallback) await onSaveCallback();
  };
}

function openAddPlayerModal(teamId, teamName, onSaveCallback) {
  document.getElementById('dynamic-player-modal')?.remove();

  const modalHTML = `
    <div id="dynamic-player-modal" class="modal-overlay">
      <div class="modal-card">
        <h2 class="modal-card__title">Agregar Jugador</h2>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1rem;">
          Equipo: <strong>${escapeHTML(teamName)}</strong>
        </p>
        <form id="dyn-player-form">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-group__label">Nombre Completo *</label>
            <input type="text" id="dyn-player-name" required placeholder="Ej: Roberto Carlos" class="form-control" style="width: 100%; padding: 0.5rem;" />
          </div>
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-group__label">Número / Dorsal *</label>
            <input type="number" id="dyn-player-number" min="0" max="99" required placeholder="10" class="form-control" style="width: 100%; padding: 0.5rem;" />
          </div>
          <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button type="button" id="dyn-player-cancel" class="btn btn--secondary">Cancelar</button>
            <button type="submit" class="btn btn--primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modalEl = document.getElementById('dynamic-player-modal');
  document.getElementById('dyn-player-cancel').onclick = () => modalEl.remove();

  document.getElementById('dyn-player-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('dyn-player-name').value.trim();
    const number = document.getElementById('dyn-player-number').value;

    if (!name || !number) return;

    await addPlayer({ teamId, name, number, position: 'Jugador' });
    modalEl.remove();
    if (onSaveCallback) await onSaveCallback();
  };
}

function openRosterModal(teamId, teamName, onCloseCallback) {
  document.getElementById('dynamic-roster-modal')?.remove();

  const modalHTML = `
    <div id="dynamic-roster-modal" class="modal-overlay">
      <div class="modal-card">
        <h2 class="modal-card__title">Plantilla: ${escapeHTML(teamName)}</h2>
        <div id="dyn-players-list" style="max-height: 250px; overflow-y: auto; margin: 1rem 0;"></div>
        <div class="modal-actions" style="text-align: right;">
          <button type="button" id="dyn-roster-close" class="btn btn--secondary">Cerrar</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modalEl = document.getElementById('dynamic-roster-modal');
  document.getElementById('dyn-roster-close').onclick = () => {
    modalEl.remove();
    if (onCloseCallback) onCloseCallback();
  };

  const loadPlayers = async () => {
    const list = document.getElementById('dyn-players-list');
    const players = await getPlayersByTeam(teamId);

    if (!players || players.length === 0) {
      list.innerHTML = `<p style="color: #94a3b8; font-size: 0.85rem; text-align: center;">Sin jugadores registrados.</p>`;
      return;
    }

    list.innerHTML = players.map(p => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: rgba(255,255,255,0.05); margin-bottom: 0.3rem; border-radius: 4px;">
        <span><strong>#${escapeHTML(p.number)}</strong> ${escapeHTML(p.name)}</span>
        <button class="btn btn--danger btn--sm btn-del-p" data-id="${p.id}">X</button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-del-p').forEach(btn => {
      btn.onclick = async () => {
        await deletePlayer(btn.dataset.id);
        await loadPlayers();
      };
    });
  };

  loadPlayers();
}