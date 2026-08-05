import { getAllLeagues, getActiveLeague, createLeague, setActiveLeague, deleteLeague, updateLeague } from '../db/repositories/leagues.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';
import { renderLeagueStatsChart } from '../components/statsChart.js';
import { startQRScanner, stopQRScanner } from '../utils/qr.js';
import { handleImportData } from '../utils/export-import.js';

// Mapeo para mostrar nombres amigables en las tarjetas visuales
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

export async function renderLeaguesView() {
  const container = document.getElementById('leagues-section');
  if (!container) return;

  const leagues = await getAllLeagues();
  const activeLeague = await getActiveLeague();

  container.innerHTML = `
    <header class="leagues-header">
      <div>
        <h1 class="view-title">Gestión de Ligas</h1>
        <p class="view-subtitle">Crea, administra y activa los torneos de CaimanaDa</p>
      </div>
      <button id="btn-open-create-modal" class="btn btn--primary">+ Crear Nueva Liga</button>
    </header>

    <!-- Modal de Liga -->
    <div id="league-modal" class="modal-overlay is-hidden">
      <div class="modal-card">
        <h2 id="modal-title" class="modal-card__title">Crear Liga</h2>
        <form id="league-form">
          <input type="hidden" id="league-id" />
          
          <div class="form-group">
            <label class="form-group__label">Nombre de la Liga *</label>
            <input type="text" id="league-name" required placeholder="Ej: Torneo Verano 2026" class="form-control" />
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-group__label">Deporte *</label>
              <select id="league-sport" required class="form-control">
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

            <div class="form-group">
              <label class="form-group__label">Temporada *</label>
              <input type="text" id="league-season" required placeholder="Ej: 2026-I" class="form-control" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-group__label">Modalidad *</label>
            <select id="league-mode" required class="form-control">
              <option value="Liga - Una vuelta">Liga (Todos contra todos - Una vuelta)</option>
              <option value="Liga - Ida y vuelta">Liga (Todos contra todos - Ida y vuelta)</option>
              <option value="Eliminación directa - 4 equipos">Eliminación directa (4 equipos)</option>
              <option value="Eliminación directa - 8 equipos">Eliminación directa (8 equipos)</option>
              <option value="Eliminación directa - 16 equipos">Eliminación directa (16 equipos)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-group__label">Duración estimada (días) *</label>
            <input type="number" id="league-duration" min="1" value="7" required class="form-control" />
          </div>

          <div class="form-group form-group--last">
            <label class="form-group__label">Descripción (Opcional)</label>
            <textarea id="league-description" rows="2" placeholder="Reglas especiales, sede, etc." class="form-control"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" id="btn-close-modal" class="btn btn--secondary">Cancelar</button>
            <button type="submit" class="btn btn--primary">Guardar Liga</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Grilla de Ligas -->
    <div id="leagues-grid" class="leagues-grid"></div>

    <!-- Contenedor del Gráfico de Estadísticas -->
    <div id="league-stats-container" style="margin-top: 2rem;"></div>
  `;

  await renderLeaguesCards(leagues, activeLeague);
  await renderLeagueChartSection(leagues);
  setupModalEvents(leagues);
}

async function renderLeagueChartSection(leagues) {
  const statsContainer = document.getElementById('league-stats-container');
  if (!statsContainer) return;

  if (leagues.length === 0) {
    statsContainer.innerHTML = '';
    return;
  }

  const leaguesDataWithTopWins = await Promise.all(leagues.map(async (league) => {
    const teams = await getTeamsByLeague(league.id);
    const matches = await getMatchesByLeague(league.id);

    const winsMap = {};
    teams.forEach(t => { winsMap[t.id] = 0; });

    matches.forEach(match => {
      if (match.status === 'completed' && match.scoreHome !== null && match.scoreAway !== null) {
        if (match.scoreHome > match.scoreAway) {
          winsMap[match.homeTeamId] = (winsMap[match.homeTeamId] || 0) + 1;
        } else if (match.scoreAway > match.scoreHome) {
          winsMap[match.awayTeamId] = (winsMap[match.awayTeamId] || 0) + 1;
        }
      }
    });

    let topTeamName = 'Sin datos';
    let maxWins = 0;

    teams.forEach(t => {
      const wins = winsMap[t.id] || 0;
      if (wins > maxWins) {
        maxWins = wins;
        topTeamName = t.name;
      }
    });

    return {
      ...league,
      teamsCount: teams.length,
      topTeamName: maxWins > 0 ? topTeamName : 'Sin definir',
      topTeamWins: maxWins
    };
  }));

  statsContainer.innerHTML = `
    <article class="info-card">
      <header class="info-card__header">
        <h3 class="info-card__label" style="margin-bottom: 1rem;">Equipos Registrados vs. Líder en Victorias por Liga</h3>
      </header>
      <div class="chart-wrapper" style="position: relative; height: 320px; width: 100%;">
        <canvas id="canvas-league-stats"></canvas>
      </div>
    </article>
  `;

  renderLeagueStatsChart('canvas-league-stats', leaguesDataWithTopWins);
}

async function renderLeaguesCards(leagues, activeLeague) {
  const grid = document.getElementById('leagues-grid');
  if (!grid) return;

  if (leagues.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">No hay ligas registradas en el sistema.</p>
        <p class="empty-state__subtitle">Presiona "+ Crear Nueva Liga" para empezar tu torneo.</p>
      </div>
    `;
    return;
  }

  const cardsHTML = await Promise.all(leagues.map(async (league) => {
    const isActive = activeLeague && activeLeague.id === league.id;
    const teams = await getTeamsByLeague(league.id);
    const matches = await getMatchesByLeague(league.id);

    const safeName = escapeHTML(league.name);
    // Traducción del identificador interno al nombre amigable del deporte
    const displaySportName = SPORT_DISPLAY_NAMES[league.sport] || league.sport || 'Fútbol';
    const safeSport = escapeHTML(displaySportName);
    const safeSeason = escapeHTML(league.season || '2026');
    const safeMode = escapeHTML(league.mode);
    const safeDescription = escapeHTML(league.description);
    const safeId = escapeHTML(league.id);

    return `
      <article class="league-card ${isActive ? 'league-card--active' : ''}">
        <header class="league-card__header">
          <div class="league-card__meta">
            <span class="league-card__badge">${safeSport}</span>
            <span class="league-card__season">${safeSeason}</span>
          </div>
          <h2 class="league-card__title">${safeName}</h2>
        </header>

        <div class="league-card__body">
          <p><strong>Modalidad:</strong> ${safeMode}</p>
          <p><strong>Equipos:</strong> ${teams.length} registrados</p>
          <p><strong>Partidos:</strong> ${matches.length} programados</p>
          ${safeDescription ? `<p class="league-card__description">"${safeDescription}"</p>` : ''}
        </div>

        <footer class="league-card__footer">
          <div>
            ${isActive 
              ? '<span class="league-card__active-label">✓ LIGA ACTIVA</span>' 
              : `<button class="btn btn--secondary btn--sm btn-set-active" data-id="${safeId}">Activar</button>`
            }
          </div>
          <div class="league-card__actions">
            <button class="btn btn--secondary btn--sm btn-edit-league" data-id="${safeId}">Editar</button>
            <button class="btn btn--sm btn-danger btn-delete-league" data-id="${safeId}">Borrar</button>
          </div>
        </footer>
      </article>
    `;
  }));

  grid.innerHTML = cardsHTML.join('');
  setupCardEvents(leagues);
}

function setupModalEvents(leagues) {
  const modal = document.getElementById('league-modal');
  const btnOpen = document.getElementById('btn-open-create-modal');
  const btnClose = document.getElementById('btn-close-modal');
  const form = document.getElementById('league-form');
  const modalTitle = document.getElementById('modal-title');
  const sportSelect = document.getElementById('league-sport');
  const modeSelect = document.getElementById('league-mode');

  btnOpen?.addEventListener('click', () => {
    form.reset();
    document.getElementById('league-id').value = '';
    modalTitle.textContent = 'Crear Nueva Liga';
    
    // Auto-seleccionar el deporte activo actual en el desplegable
    sportSelect.value = getActiveSport();

    sportSelect.disabled = false;
    modeSelect.disabled = false;
    modal.classList.remove('is-hidden');
  });

  btnClose?.addEventListener('click', () => {
    modal.classList.add('is-hidden');
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('league-id').value;
    const name = document.getElementById('league-name').value.trim();
    const season = document.getElementById('league-season').value.trim();
    const durationDays = document.getElementById('league-duration').value;
    const description = document.getElementById('league-description').value.trim();

    const isDuplicate = leagues.some(l => l.name.toLowerCase() === name.toLowerCase() && l.id !== id);
    if (isDuplicate) {
      alert(`Ya existe una liga con el nombre "${name}". Por favor usa otro.`);
      return;
    }

    if (id) {
      const targetLeague = leagues.find(l => l.id === id);
      if (targetLeague) {
        const updatedData = {
          ...targetLeague,
          name,
          season,
          durationDays: Number(durationDays),
          description
        };

        if (typeof updateLeague === 'function') {
          await updateLeague(updatedData);
        } else {
          await createLeague(updatedData);
        }
      }
    } else {
      const sport = sportSelect.value;
      const mode = modeSelect.value;

      const createdLeague = await createLeague({
        name,
        sport,
        season,
        mode,
        durationDays: Number(durationDays),
        description,
        isActive: true
      });

      // Al crear una liga, sincronizamos de inmediato el deporte activo global
      localStorage.setItem('active_sport_id', sport);
      if (createdLeague && createdLeague.id) {
        localStorage.setItem('caimanada_active_league', createdLeague.id);
      }
    }

    modal.classList.add('is-hidden');
    renderLeaguesView();
  });
}

function setupCardEvents(leagues) {
  const container = document.getElementById('leagues-grid');
  if (!container) return;

  container.addEventListener('click', async (e) => {
    const target = e.target;
    const leagueId = target.dataset.id;
    if (!leagueId) return;

    if (target.classList.contains('btn-set-active')) {
      const league = leagues.find(l => l.id === leagueId);

      await setActiveLeague(leagueId);
      localStorage.setItem('caimanada_active_league', leagueId);

      // Sincronizar deporte activo global al activar una liga
      if (league && league.sport) {
        localStorage.setItem('active_sport_id', league.sport);
      }

      window.location.hash = '#dashboard';
      return;
    }

    if (target.classList.contains('btn-edit-league')) {
      const league = leagues.find(l => l.id === leagueId);
      if (!league) return;

      document.getElementById('league-id').value = league.id;
      document.getElementById('league-name').value = league.name;
      document.getElementById('league-season').value = league.season || '';
      document.getElementById('league-duration').value = league.durationDays || 7;
      document.getElementById('league-description').value = league.description || '';

      const sportSelect = document.getElementById('league-sport');
      const modeSelect = document.getElementById('league-mode');

      sportSelect.value = league.sport;
      modeSelect.value = league.mode;

      sportSelect.disabled = true;
      modeSelect.disabled = true;

      document.getElementById('modal-title').textContent = 'Editar Liga';
      document.getElementById('league-modal').classList.remove('is-hidden');
      return;
    }

    if (target.classList.contains('btn-delete-league')) {
      const league = leagues.find(l => l.id === leagueId);
      const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar la liga "${league.name}"?\n\nESTA ACCIÓN BORRARÁ TODOS SUS EQUIPOS Y PARTIDOS ASOCIADOS.`);

      if (!confirmDelete) return;

      await deleteLeague(leagueId);

      const remainingLeagues = await getAllLeagues();
      if (remainingLeagues.length > 0) {
        const hasActive = remainingLeagues.some(l => l.isActive);
        if (!hasActive) {
          const nextLeague = remainingLeagues[0];
          await setActiveLeague(nextLeague.id);
          localStorage.setItem('caimanada_active_league', nextLeague.id);
          localStorage.setItem('active_sport_id', nextLeague.sport || 'futbol_sala');
        }
      } else {
        localStorage.removeItem('caimanada_active_league');
      }

      renderLeaguesView();
    }
  });
}