import { getAllLeagues, getActiveLeague, setActiveLeague } from '../db/repositories/leagues.js';

export async function renderLeaguesView() {
  const container = document.getElementById('leagues-content-target') || document.getElementById('leagues-section');
  if (!container) return;

  const leagues = await getAllLeagues();
  const activeLeague = await getActiveLeague();

  if (leagues.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay ligas creadas en la base de datos.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="teams-grid">
      ${leagues.map(league => {
        const isActive = activeLeague && activeLeague.id === league.id;
        return `
          <article class="info-card" style="border: ${isActive ? '2px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-card)'}">
            <header class="info-card__header">
              <span class="info-card__label">${league.sport || 'Deporte'}</span>
              <h2 class="info-card__highlight">${league.name}</h2>
            </header>
            <div class="info-card__body">
              <p class="info-card__subtext"><strong>Modalidad:</strong> ${league.mode || 'Liga'}</p>
            </div>
            <footer class="info-card__footer">
              ${isActive 
                ? '<span style="color: var(--accent-primary, #3b82f6); font-weight: bold; font-size: 0.85rem;">✓ LIGA ACTIVA</span>' 
                : `<button class="btn btn--secondary btn--sm btn-set-active" data-id="${league.id}">Activar Liga</button>`
              }
            </footer>
          </article>
        `;
      }).join('')}
    </div>
  `;

  // Asignar evento para cambiar de liga activa
  container.querySelectorAll('.btn-set-active').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setActiveLeague(btn.dataset.id);
      renderLeaguesView(); 
    });
  });
}