// js/components/sportSwitcher.js
import { AlertService } from './alert.js'; // Ajusta la ruta si es necesario

const SPORTS = [
  { id: 'futbol_sala', name: 'Fútbol Sala' },
  { id: 'futbol_campo', name: 'Fútbol Campo' },
  { id: 'basketball', name: 'Baloncesto' },
  { id: 'baseball', name: 'Béisbol' },
  { id: 'kickingball', name: 'Kickingball' },
  { id: 'volleyball', name: 'Voleibol' },
  { id: 'padel', name: 'Pádel' },
  { id: 'ping_pong', name: 'Ping-Pong' },
  { id: 'ajedrez', name: 'Ajedrez' }
];

export function initSportSwitcher() {
  const selectElement = document.getElementById('active-sport-selector');
  const badgeElement = document.getElementById('active-sport-badge');
  
  if (!selectElement) return; // Si no existe el select en el navbar, no hace nada

  // 1. Llenar el select con los deportes
  selectElement.innerHTML = '';
  SPORTS.forEach(sport => {
    const option = document.createElement('option');
    option.value = sport.id;
    option.textContent = sport.name;
    selectElement.appendChild(option);
  });

  // 2. Sincronizar con el deporte activo en LocalStorage
  const currentSport = localStorage.getItem('active_sport_id') || 'futbol_sala';
  selectElement.value = currentSport;

  // 3. Escuchar cambios
  selectElement.addEventListener('change', (e) => {
    const newSport = e.target.value;
    const sportName = e.target.options[e.target.selectedIndex].text;
    
    localStorage.setItem('active_sport_id', newSport);
    AlertService.showSuccess(`Contexto cambiado a ${sportName}`, 'DEPORTE ACTUALIZADO');
    
    // Forzar la recarga de la vista actual para que refleje el cambio
    setTimeout(() => {
      const currentHash = window.location.hash || '#dashboard';
      window.location.hash = '#reload'; // Truco para forzar recarga
      window.location.hash = currentHash;
    }, 500);
  });
}