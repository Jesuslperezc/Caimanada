import { 
  getAllLeagues, 
  getActiveLeague, 
  createLeague, 
  setActiveLeague, 
  deleteLeague,
  updateLeague
} from '../db/repositories/leagues.js';
import { getTeamsByLeague } from '../db/repositories/teams.js';
import { getMatchesByLeague } from '../db/repositories/matches.js';

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
                <option value="Fútbol">Fútbol</option>
                <option value="Futbolito / Futsal">Futbolito / Futsal</option>
                <option value="Baloncesto">Baloncesto</option>
                <option value="Pádel">Pádel</option>
                <option value="Ping-Pong">Ping-Pong</option>
                <option value="Ajedrez">Ajedrez</option>
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
  `;

  await renderLeaguesCards(leagues, activeLeague);
  setupModalEvents(leagues);
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
    const safeSport = escapeHTML(league.sport || 'Fútbol');
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

        // Usa updateLeague del repositorio en lugar de la transacción directa
        if (typeof updateLeague === 'function') {
          await updateLeague(updatedData);
        } else {
          // Fallback en caso de que no exista export explícito de update
          await createLeague(updatedData);
        }
      }
    } else {
      const sport = sportSelect.value;
      const mode = modeSelect.value;

      await createLeague({
        name,
        sport,
        season,
        mode,
        durationDays: Number(durationDays),
        description,
        isActive: true
      });
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
      await setActiveLeague(leagueId);
      localStorage.setItem('caimanada_active_league', leagueId);
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
          await setActiveLeague(remainingLeagues[0].id);
          localStorage.setItem('caimanada_active_league', remainingLeagues[0].id);
        }
      } else {
        localStorage.removeItem('caimanada_active_league');
      }

      renderLeaguesView();
    }
  });
}