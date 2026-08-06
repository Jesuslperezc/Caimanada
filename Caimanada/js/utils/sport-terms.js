// js/utils/sports-terms.js

export const SPORT_LIMITS = {
  futbol_sala: 14,   
  futbol_campo: 23,  
  basketball: 12,    
  baseball: 25,      
  kickingball: 16,   
  volleyball: 12,    
  padel: 2,          
  ping_pong: 4,      
  ajedrez: 1         
};

export const SPORT_POSITIONS = {
  futbol_sala: ['Arquero', 'Ala Derecha', 'Ala Izquierda', 'Pivote', 'Cierre'],
  futbol_campo: ['Portero', 'Defensa', 'Mediocampista', 'Delantero'],
  basketball: ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'],
  baseball: ['Lanzador', 'Receptor', 'Primera Base', 'Segunda Base', 'Campocorto', 'Tercera Base', 'Jardín Izquierdo', 'Jardín Central', 'Jardín Derecho'],
  kickingball: ['Lanzadora', 'Receptora', 'Primera Base', 'Segunda Base', 'Campocorto', 'Tercera Base', 'Jardinera'],
  volleyball: ['Armador', 'Opuesto', 'Atacante Exterior', 'Central', 'Libero'],
  padel: ['Drive', 'Revés'],
  ping_pong: ['Titular', 'Sustituto'],
  ajedrez: ['Tablero 1', 'Tablero 2', 'Tablero 3', 'Tablero 4']
};

export function getMaxPlayersForSport(sportId) {
  return SPORT_LIMITS[sportId] || 15;
}

export function getPositionsForSport(sportId) {
  return SPORT_POSITIONS[sportId] || ['Jugador'];
}