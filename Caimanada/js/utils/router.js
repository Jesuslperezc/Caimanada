import { renderDashboard } from '../views/dashboard.js';
import { renderLeagues } from '../views/leagues.js';
import { renderTeams } from '../views/teams.js';
import { renderMatches } from '../views/matches.js';
import { renderStats } from '../views/stats.js';

// Rutas asociadas
const routes = {
  '#dashboard': renderDashboard,
  '#leagues': renderLeagues,
  '#teams': renderTeams,
  '#matches': renderMatches,
  '#stats': renderStats,
};

// Detecta el hash y ejecuta la vista
export function handleRoute() {
  const appContainer = document.getElementById('app');
  const hash = window.location.hash || '#dashboard';

  const renderView = routes[hash] || routes['#dashboard'];

  if (appContainer && typeof renderView === 'function') {
    appContainer.innerHTML = '';
    renderView(appContainer);
  }
}

// Inicializa el enrutador
export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}