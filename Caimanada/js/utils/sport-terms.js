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

// Configuración por deporte
export const SPORT_TIMER_CONFIG = {
  futbol_sala: {
    periods: 2, periodDuration: 20 * 60, breakDuration: 5 * 60, 
    hasClock: true, periodNames: ['1er Tiempo', '2do Tiempo'],
    hasCards: true, startersCount: 5, isRedCardPermanent: true,
    scoringOptions: [{ label: 'Gol', value: 1 }]
  },
  futbol_campo: {
    periods: 2, periodDuration: 45 * 60, breakDuration: 15 * 60, 
    hasClock: true, periodNames: ['1er Tiempo', '2do Tiempo'],
    hasCards: true, startersCount: 11, isRedCardPermanent: true,
    scoringOptions: [{ label: 'Gol', value: 1 }]
  },
  basketball: {
    periods: 4, periodDuration: 10 * 60, breakDuration: 2 * 60, breakDurationLong: 15 * 60,
    hasClock: true, periodNames: ['1er Cuarto', '2do Cuarto', '3er Cuarto', '4to Cuarto'],
    hasCards: false, startersCount: 5,
    scoringOptions: [
      { label: 'Tiro Libre (1)', value: 1 },
      { label: 'Canasta (2)', value: 2 },
      { label: 'Triple (3)', value: 3 }
    ]
  },
  volleyball: {
    periods: 5, periodDuration: 0, breakDuration: 3 * 60, // DESCANSO 3 MIN
    hasClock: false, periodNames: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'],
    hasCards: 'volleyball', startersCount: 6, 
    isSetBased: true, pointsToWinSet: 25, pointsToWinLastSet: 15, winBy: 2, autoBreakOnSetWin: true,
    scoringOptions: [{ label: 'Punto', value: 1 }]
  },
  padel: {
    periods: 3, periodDuration: 0, breakDuration: 0, 
    hasClock: false, periodNames: ['1er Set', '2do Set', '3er Set'],
    hasCards: false, startersCount: 2,
    hasGameMilestone: true, milestoneEvery: 4, 
    scoringOptions: [{ label: 'Punto', value: 1 }]
  },
  ping_pong: {
    periods: 5, periodDuration: 0, breakDuration: 1 * 60,
    hasClock: false, periodNames: ['1er Juego', '2do Juego', '3er Juego', '4to Juego', '5er Juego'],
    hasCards: false, startersCount: 1,
    isSetBased: true, pointsToWinSet: 11, pointsToWinLastSet: 11, winBy: 2, autoBreakOnSetWin: true,
    scoringOptions: [{ label: 'Punto', value: 1 }]
  },
  ajedrez: {
    periods: 1, periodDuration: 0, breakDuration: 0, 
    hasClock: false, periodNames: ['Partida'],
    hasCards: false, startersCount: 1,
    hideNextPeriodBtn: true, hideLineupTab: true, // Solo oculta "Siguiente Periodo" y "Alineación"
    scoringOptions: [{ label: 'Victoria', value: 1 }]
  },
  baseball: {
    periods: 9, periodDuration: 0, breakDuration: 0, 
    hasClock: false, periodNames: ['Inning 1', 'Inning 2', 'Inning 3', 'Inning 4', 'Inning 5', 'Inning 6', 'Inning 7', 'Inning 8', 'Inning 9'],
    hasCards: false, startersCount: 9,
    scoringOptions: [{ label: 'Carrera', value: 1 }],
    extraButtons: [
      { label: 'Out', value: 0, type: 'out' },
      { label: 'Strike', value: 0, type: 'strike' },
      { label: 'Foul', value: 0, type: 'foul' }
    ]
  },
  kickingball: {
    periods: 7, periodDuration: 0, breakDuration: 0, 
    hasClock: false, periodNames: ['Inning 1', 'Inning 2', 'Inning 3', 'Inning 4', 'Inning 5', 'Inning 6', 'Inning 7'],
    hasCards: false, startersCount: 7,
    scoringOptions: [{ label: 'Carrera', value: 1 }],
    extraButtons: [
      { label: 'Out', value: 0, type: 'out' },
      { label: 'Strike', value: 0, type: 'strike' },
      { label: 'Foul', value: 0, type: 'foul' }
    ]
  }
};

export function getTimerConfig(sportId) {
  return SPORT_TIMER_CONFIG[sportId] || SPORT_TIMER_CONFIG.futbol_sala;
}