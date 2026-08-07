import { renderLeaguesView } from '../views/leagues.js';
import { renderTeamsView } from '../views/teams.js';
import { renderMatchesView } from '../views/matches.js';

// Función auxiliar para bloquear el selector de deporte en la vista de partidos
function updateSportSelectorLock(isMatchesView) {
  const selector = document.getElementById('active-sport-selector');
  if (!selector) return;

  if (isMatchesView) {
    selector.disabled = true;
    selector.style.opacity = '0.6';
    selector.style.cursor = 'not-allowed';
    selector.title = 'El deporte está bloqueado mientras ves los Partidos de la liga activa.';
  } else {
    selector.disabled = false;
    selector.style.opacity = '1';
    selector.style.cursor = 'pointer';
    selector.title = 'Seleccionar deporte';
  }
}

export function handleRoute() {
  const rawHash = window.location.hash.trim();
  const currentHash = (rawHash && rawHash !== '#') ? rawHash : '#dashboard';
  
  const baseHash = currentHash.split('/')[0];
  const cleanName = baseHash.replace('#', '');
  const targetSectionId = `${cleanName}-section`;

  // --- LÓGICA DE BLOQUEO DEL SELECTOR ---
  updateSportSelectorLock(cleanName === 'matches');
  // ----------------------------------------

  const sections = document.querySelectorAll('.view-section');
  let found = false;

  sections.forEach((section) => {
    if (section.id === targetSectionId) {
      section.classList.remove('is-hidden');
      found = true;
    } else {
      section.classList.add('is-hidden');
    }
  });

  if (!found) {
    const defaultSection = document.getElementById('dashboard-section');
    if (defaultSection) {
      defaultSection.classList.remove('is-hidden');
    }
  }

  if (cleanName === 'leagues') {
    renderLeaguesView().catch(err => console.error('Error renderizando ligas:', err));
  } else if (cleanName === 'teams') {
    renderTeamsView().catch(err => console.error('Error renderizando equipos:', err));
  } else if (cleanName === 'matches') { 
    renderMatchesView().catch(err => console.error('Error renderizando partidos:', err));
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}