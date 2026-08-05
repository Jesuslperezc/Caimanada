let activeCharts = {};

function destroyChart(id) {
  if (activeCharts[id]) {
    activeCharts[id].destroy();
    delete activeCharts[id];
  }
}

export function renderLeagueStatsChart(canvasId, leaguesData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  destroyChart(canvasId);

  const labels = leaguesData.map(l => l.name);
  const teamsCounts = leaguesData.map(l => l.teamsCount || 0);
  const topWinsCounts = leaguesData.map(l => l.topTeamWins || 0);
  const topTeamNames = leaguesData.map(l => l.topTeamName || 'Sin definir');

  activeCharts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Total de Equipos',
          data: teamsCounts,
          backgroundColor: '#00A86B' 
        },
        {
          label: 'Máx. Victorias de un Equipo',
          data: topWinsCounts,
          backgroundColor: '#F59E0B' 
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: '#FFFFFF'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        x: {
          ticks: {
            color: '#FFFFFF'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: '#FFFFFF'
          }
        },
        tooltip: {
          callbacks: {
            afterBody: function(context) {
              const dataIndex = context[0].dataIndex;
              const teamName = topTeamNames[dataIndex];
              const wins = topWinsCounts[dataIndex];
              if (wins > 0) {
                return `Líder: ${teamName} (${wins} PG)`;
              }
              return 'Sin partidos jugados aún';
            }
          }
        }
      }
    }
  });
}
