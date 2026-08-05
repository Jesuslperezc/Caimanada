let activeCharts = {};

function destroyChart(id) {
  if (activeCharts[id]) {
    activeCharts[id].destroy();
    delete activeCharts[id];
  }
}

// Para la vista de Ligas: Comparación general de ligas registradas
export function renderLeagueStatsChart(canvasId, leaguesData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  destroyChart(canvasId);

  const labels = leaguesData.map(l => l.name);
  const counts = leaguesData.map(l => l.teamsCount || 0);

  activeCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: ['#00A86B', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#FFFFFF' } } }
    }
  });
}

// Para la vista de Equipos: Rendimiento (Puntos y Goles)
export function renderTeamStatsChart(canvasId, teamsData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  destroyChart(canvasId);

  const labels = teamsData.map(t => t.name);
  const points = teamsData.map(t => t.stats?.pts || 0);

  activeCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Puntos Acumulados',
        data: points,
        backgroundColor: '#00A86B',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#FFFFFF' } } },
      scales: {
        x: { ticks: { color: '#94A3B8' } },
        y: { ticks: { color: '#94A3B8' }, beginAtZero: true }
      }
    }
  });
}