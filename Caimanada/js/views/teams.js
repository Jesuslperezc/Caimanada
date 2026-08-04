export function initTeamsView() {
  const container = document.getElementById('teams-content-target');
  const searchInput = document.getElementById('teams-search-input');
  const addBtn = document.getElementById('btn-add-team');

  if (!container) return;
  function render(teams) {
    if (teams.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No se encontraron equipos registrados.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="teams-grid">
        ${teams.map(team => `
          <article class="info-card team-card" style="border-left: 4px solid ${team.color}">
            <header class="info-card__header">
              <span class="info-card__label">Club Registrado</span>
              <h2 class="info-card__highlight">${team.name}</h2>
            </header>
            <div class="info-card__body">
              <p class="info-card__subtext"><strong>Delegado:</strong> ${team.delegate}</p>
              <p class="info-card__subtext"><strong>Jugadores:</strong> ${team.playersCount}</p>
            </div>
            <footer class="info-card__footer">
              <button class="btn btn--secondary btn--sm" onclick="alert('Ver plantilla de ${team.name}')">
                Ver Plantilla
              </button>
            </footer>
          </article>
        `).join('')}
      </div>
    `;
  }

  // Busqueda
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const filtered = teamsData.filter(team => 
        team.name.toLowerCase().includes(query) || 
        team.delegate.toLowerCase().includes(query)
      );
      render(filtered);
    });
  }

  // Boton registrar 
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      console.log('Abrir modal o formulario de registro de equipo');
    });
  }
  render(teamsData);
}