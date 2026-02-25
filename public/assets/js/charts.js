/**
 * Chart.js inicializadores reutilizables — Las Gambusinas
 */
(function (window) {
  const gold = 'rgba(212,175,55,0.8)';
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  function chartVentasHora(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return null;
    return new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['08h', '10h', '12h', '14h', '16h', '18h'],
        datasets: [{
          label: 'Ventas',
          data: [120, 340, 580, 720, 650, 430],
          borderColor: gold,
          backgroundColor: 'rgba(212,175,55,0.1)',
          fill: true
        }]
      },
      options: defaultOptions
    });
  }

  function chartVentasPeriodo(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return null;
    return new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['08h', '10h', '12h', '14h', '16h'],
        datasets: [{
          label: 'Ventas',
          data: [1200, 2800, 4200, 5800, 7200],
          borderColor: gold,
          fill: true,
          backgroundColor: 'rgba(212,175,55,0.15)'
        }]
      },
      options: defaultOptions
    });
  }

  function chartDonut(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return null;
    return new Chart(el.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Ceviches', 'Arroces', 'Carnes', 'Bebidas', 'Otros'],
        datasets: [{
          data: [30, 22, 18, 15, 15],
          backgroundColor: [gold, '#3498db', '#2ecc71', '#ffa502', '#5352ed']
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
  }

  window.LasGambusinasCharts = {
    chartVentasHora,
    chartVentasPeriodo,
    chartDonut
  };
})(window);
