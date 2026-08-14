import { renderLeaguesView } from '../views/leagues.js';
import { renderTeamsView } from '../views/teams.js';
import { renderMatchesView } from '../views/matches.js';
import { renderDashboardView } from '../views/dashboard.js'; 
import { renderHelpView } from '../views/help.js';
import { renderFlashView } from '../views/flash.js'; 

function updateSportSelectorLock(isMatchesView) {
  const selector = document.getElementById('active-sport-selector');
  const badgeContainer = document.getElementById('active-sport-badge'); // Capturamos el contenedor visual
  
  if (!selector) return;

  if (isMatchesView) {
    selector.disabled = true;
    if (badgeContainer) badgeContainer.classList.add('is-locked'); // Bloqueo visual del custom dropdown
    selector.title = 'El deporte está bloqueado mientras ves los Partidos de la liga activa.';
  } else {
    selector.disabled = false;
    if (badgeContainer) badgeContainer.classList.remove('is-locked'); // Desbloqueo visual
    selector.title = 'Seleccionar deporte';
  }
}

export function handleRoute() {
  const rawHash = window.location.hash.trim();
  const currentHash = (rawHash && rawHash !== '#') ? rawHash : '#dashboard';
  
const baseHash = currentHash.split('?')[0].split('/')[0];
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
  } else if (cleanName === 'dashboard') {
    renderDashboardView().catch(err => console.error('Error renderizando dashboard:', err));
  } else if (cleanName === 'help') {
    renderHelpView().catch(err => console.error('Error renderizando ayuda:', err));
  } else if (cleanName === 'flash') { // <--- NUEVA CONDICIÓN
    renderFlashView().catch(err => console.error('Error renderizando flash:', err));
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}