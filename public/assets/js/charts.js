/**
 * Las Gambusinas - charts.js
 * Funciones para gráficos Chart.js
 */

const LasGambusinasCharts = {
  // ============================================
  // GRÁFICO VENTAS DEL DÍA (Dashboard)
  // ============================================
  drawDashChart: function(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    
    const ctx = el.getContext('2d');
    if (el._chart) el._chart.destroy();
    
    el._chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['8h', '9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h'],
        datasets: [{
          label: 'Ventas',
          data: [120, 280, 450, 680, 1200, 1800, 2100, 2300, 2450],
          borderColor: '#d4af37',
          backgroundColor: 'rgba(212,175,55,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#d4af37'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: '#a0a0b8', font: { size: 10 } },
            grid: { color: 'rgba(212,175,55,0.06)' }
          },
          y: {
            ticks: { 
              color: '#a0a0b8', 
              font: { size: 10 },
              callback: v => 'S/.' + v
            },
            grid: { color: 'rgba(212,175,55,0.06)' }
          }
        }
      }
    });
    
    return el._chart;
  },

  // ============================================
  // GRÁFICO BARRAS HORIZONTALES (Reportes - Top Platos)
  // ============================================
  drawReportBarChart: function(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    
    const ctx = el.getContext('2d');
    if (el._chart) el._chart.destroy();
    
    el._chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Ceviche', 'Paella', 'Lomo', 'Arroz Mar.', 'Tiradito', 'Ají', 'Anticuchos', 'Chicharrón'],
        datasets: [{
          data: [12, 9, 8, 7, 6, 5, 4, 3],
          backgroundColor: [
            '#d4af37', '#3498db', '#2ecc71', '#ffa502',
            '#5352ed', '#ff4757', '#00d4aa', '#f1c40f'
          ],
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: '#a0a0b8', font: { size: 10 } },
            grid: { color: 'rgba(212,175,55,0.06)' }
          },
          y: {
            ticks: { color: '#a0a0b8', font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
    
    return el._chart;
  },

  // ============================================
  // GRÁFICO DONUT (Reportes - Por Categoría)
  // ============================================
  drawReportDonutChart: function(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    
    const ctx = el.getContext('2d');
    if (el._chart) el._chart.destroy();
    
    el._chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Ceviches', 'Arroces', 'Carnes', 'Bebidas', 'Otros'],
        datasets: [{
          data: [30, 22, 18, 15, 15],
          backgroundColor: ['#d4af37', '#3498db', '#2ecc71', '#ffa502', '#5352ed'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#a0a0b8',
              font: { size: 11 },
              padding: 12
            }
          }
        }
      }
    });
    
    return el._chart;
  },

  // ============================================
  // INICIALIZAR GRÁFICOS POR PÁGINA
  // ============================================
  initForPage: function(pageName) {
    if (pageName === 'dashboard') {
      this.drawDashChart('chartVentasDia');
    }
    if (pageName === 'reportes') {
      this.drawReportBarChart('chartReportes1');
      this.drawReportDonutChart('chartReportes2');
    }
  }
};

// Exponer globalmente
window.LasGambusinasCharts = LasGambusinasCharts;
