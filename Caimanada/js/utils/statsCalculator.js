export function calculateStandings(teams, matches) {
  const statsMap = {};

  // Inicializar estadisticas por equipo
  teams.forEach(team => {
    statsMap[team.id] = {
      id: team.id,
      name: team.name,
      pj: 0,
      pg: 0,
      pe: 0,
      pp: 0,
      gf: 0,
      gc: 0,
      dg: 0,
      pts: 0
    };
  });

  // Procesar partidos completados
  matches.forEach(match => {
    if (match.status !== 'completed' || match.scoreHome === null || match.scoreAway === null) {
      return;
    }

    const home = statsMap[match.homeTeamId];
    const away = statsMap[match.awayTeamId];

    if (!home || !away) return;

    home.pj += 1;
    away.pj += 1;

    home.gf += match.scoreHome;
    home.gc += match.scoreAway;
    away.gf += match.scoreAway;
    away.gc += match.scoreHome;

    if (match.scoreHome > match.scoreAway) {
      home.pg += 1;
      home.pts += 3;
      away.pp += 1;
    } else if (match.scoreHome < match.scoreAway) {
      away.pg += 1;
      away.pts += 3;
      home.pp += 1;
    } else {
      home.pe += 1;
      home.pts += 1;
      away.pe += 1;
      away.pts += 1;
    }
  });

  // Calcular diferencia de goles y ordenar la tabla de posiciones
  return Object.values(statsMap)
    .map(team => ({
      ...team,
      dg: team.gf - team.gc
    }))
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
}