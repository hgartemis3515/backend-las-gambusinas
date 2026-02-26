/**
 * Las Gambusinas - charts.js
 * Funciones para gráficos Chart.js
 */

const LasGambusinasCharts = {
  // ============================================
  // GRÁFICO VENTAS DEL DÍA (Dashboard) - Datos ejemplo/desarrollo
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
  // GRÁFICO VACÍO - Estado sin datos
  // ============================================
  drawEmptyChart: function(canvasId, message) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    
    if (el._chart) el._chart.destroy();
    
    // Crear un placeholder visual sin datos
    el._chart = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: [''],
        datasets: [{
          data: [0],
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      },
      plugins: [{
        id: 'emptyMessage',
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          const width = chart.width;
          const height = chart.height;
          
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '14px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#5a5a7a';
          ctx.fillText(message || 'Sin datos disponibles', width / 2, height / 2 - 10);
          ctx.font = '12px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#3a3a4a';
          ctx.fillText('Los datos aparecerán cuando haya ventas', width / 2, height / 2 + 15);
          ctx.restore();
        }
      }]
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
  },

  // ============================================
  // GRÁFICO VENTAS CON DATOS DINÁMICOS
  // ============================================
  drawDashChartWithData: function(canvasId, labels, data) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    
    // Verificar si hay datos reales
    const hasData = data && Array.isArray(data) && data.length > 0 && data.some(v => v > 0);
    
    if (!hasData) {
      return this.drawEmptyChart(canvasId, 'Sin ventas registradas hoy');
    }
    
    const ctx = el.getContext('2d');
    if (el._chart) el._chart.destroy();
    
    // Formatear labels de horas
    const formattedLabels = labels.map(l => {
      const hour = typeof l === 'number' ? l : parseInt(l);
      return isNaN(hour) ? l : hour + 'h';
    });
    
    el._chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: formattedLabels,
        datasets: [{
          label: 'Ventas',
          data: data,
          borderColor: '#d4af37',
          backgroundColor: 'rgba(212,175,55,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#d4af37',
          pointBorderColor: '#1a1a28',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#d4af37',
          pointHoverBorderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a28',
            titleColor: '#ffffff',
            bodyColor: '#d4af37',
            borderColor: 'rgba(212,175,55,0.25)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
              label: function(context) {
                return 'S/.' + context.raw.toLocaleString('es-PE');
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#a0a0b8', font: { size: 10 } },
            grid: { color: 'rgba(212,175,55,0.06)' }
          },
          y: {
            beginAtZero: true,
            ticks: { 
              color: '#a0a0b8', 
              font: { size: 10 },
              callback: v => 'S/.' + v.toLocaleString('es-PE')
            },
            grid: { color: 'rgba(212,175,55,0.06)' }
          }
        }
      }
    });
    
    return el._chart;
  }
};

// Exponer globalmente
window.LasGambusinasCharts = LasGambusinasCharts;
