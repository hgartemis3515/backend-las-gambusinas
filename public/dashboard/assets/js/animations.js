/**
 * ANIMATIONS.JS - Animaciones Premium v2.0
 * Proyecto: Las Gambusinas — Panel Admin Premium
 * 
 * Contiene:
 * - Count-up animation para números
 * - Slide-up fade para cards
 * - Pulse animation para alertas
 * - Shimmer para skeleton loaders
 * - Chart animations
 */

(function() {
    'use strict';

    // ============================================
    // COUNT-UP ANIMATION
    // ============================================
    const CountUp = {
        duration: 2000,
        delay: 10,
        observer: null,
        
        init() {
            // Use Intersection Observer for performance
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.animate(entry.target);
                        this.observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            
            // Observe all counters
            document.querySelectorAll('.counter').forEach(counter => {
                this.observer.observe(counter);
            });
        },
        
        animate(element) {
            const target = parseInt(element.getAttribute('data-target')) || 0;
            if (target === 0) return;
            
            const start = 0;
            const startTime = performance.now();
            
            const step = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / this.duration, 1);
                
                // Easing function (ease-out)
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const current = Math.floor(start + (target - start) * easeOut);
                
                element.textContent = current.toLocaleString();
                
                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    element.textContent = target.toLocaleString();
                }
            };
            
            requestAnimationFrame(step);
        },
        
        refresh() {
            document.querySelectorAll('.counter').forEach(counter => {
                this.observer.observe(counter);
            });
        }
    };

    // ============================================
    // SLIDE-UP FADE ANIMATION
    // ============================================
    const SlideUpFade = {
        init() {
            const cards = document.querySelectorAll('.kpi-card, .iq-card');
            cards.forEach((card, index) => {
                card.style.animationDelay = `${index * 100}ms`;
            });
        }
    };

    // ============================================
    // PULSE ANIMATION FOR URGENT ITEMS
    // ============================================
    const UrgentPulse = {
        elements: [],
        
        init() {
            this.elements = document.querySelectorAll('.mesa-tile.pagando, .alertas-urgentes-badge.has-alertas');
        },
        
        add(element) {
            if (!element.classList.contains('pulse-active')) {
                element.classList.add('pulse-active');
                this.elements.push(element);
            }
        },
        
        remove(element) {
            element.classList.remove('pulse-active');
            this.elements = this.elements.filter(el => el !== element);
        }
    };

    // ============================================
    // SKELETON LOADER
    // ============================================
    const SkeletonLoader = {
        create(type) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton';
            
            switch(type) {
                case 'card':
                    skeleton.innerHTML = `
                        <div class="skeleton-card">
                            <div class="skeleton skeleton-text" style="width: 60%; height: 12px; margin-bottom: 8px;"></div>
                            <div class="skeleton skeleton-title" style="width: 40%; height: 24px; margin-bottom: 8px;"></div>
                            <div class="skeleton skeleton-text" style="width: 80%; height: 12px;"></div>
                        </div>
                    `;
                    break;
                case 'table':
                    skeleton.innerHTML = `
                        <div class="skeleton-row" style="display: flex; gap: 16px; padding: 12px 0;">
                            <div class="skeleton" style="width: 60px; height: 16px;"></div>
                            <div class="skeleton" style="width: 120px; height: 16px;"></div>
                            <div class="skeleton" style="width: 80px; height: 16px;"></div>
                            <div class="skeleton" style="width: 100px; height: 16px;"></div>
                        </div>
                    `;
                    break;
                case 'text':
                    skeleton.style.width = '100%';
                    skeleton.style.height = '16px';
                    break;
            }
            
            return skeleton;
        },
        
        show(container, type = 'card', count = 1) {
            container.innerHTML = '';
            for (let i = 0; i < count; i++) {
                container.appendChild(this.create(type));
            }
        },
        
        hide(container) {
            container.innerHTML = '';
        }
    };

    // ============================================
    // CHART ANIMATIONS
    // ============================================
    const ChartAnimations = {
        salesChart: null,
        
        init() {
            this.initSalesChart();
        },
        
        initSalesChart() {
            const ctx = document.getElementById('ventasChart');
            if (!ctx) return;
            
            const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
            gradient.addColorStop(0, 'rgba(212, 175, 55, 0.5)');
            gradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)');
            
            this.salesChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm'],
                    datasets: [{
                        label: 'Ventas S/.',
                        data: [150, 280, 420, 380, 520, 450, 380, 290],
                        backgroundColor: gradient,
                        borderColor: '#d4af37',
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 1500,
                        easing: 'easeOutQuart'
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(26, 26, 40, 0.95)',
                            titleColor: '#d4af37',
                            bodyColor: '#ffffff',
                            borderColor: 'rgba(212, 175, 55, 0.3)',
                            borderWidth: 1,
                            padding: 12,
                            displayColors: false,
                            callbacks: {
                                label: function(context) {
                                    return `S/. ${context.raw.toLocaleString()}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                color: 'rgba(255, 255, 255, 0.5)',
                                font: {
                                    size: 10
                                }
                            }
                        },
                        y: {
                            grid: {
                                color: 'rgba(255, 255, 255, 0.05)'
                            },
                            ticks: {
                                color: 'rgba(255, 255, 255, 0.5)',
                                font: {
                                    size: 10
                                },
                                callback: function(value) {
                                    return 'S/.' + value;
                                }
                            }
                        }
                    }
                }
            });
        },
        
        updateData(data) {
            if (this.salesChart) {
                this.salesChart.data.datasets[0].data = data;
                this.salesChart.update('active');
            }
        }
    };

    // ============================================
    // MESA TILE ANIMATIONS
    // ============================================
    const MesaAnimations = {
        init() {
            document.querySelectorAll('.mesa-tile').forEach(tile => {
                tile.addEventListener('click', () => {
                    this.selectMesa(tile);
                });
            });
        },
        
        selectMesa(tile) {
            // Remove selection from all tiles
            document.querySelectorAll('.mesa-tile').forEach(t => {
                t.style.transform = '';
                t.style.boxShadow = '';
            });
            
            // Add selection to clicked tile
            tile.style.transform = 'scale(1.1)';
            tile.style.boxShadow = '0 0 20px rgba(212, 175, 55, 0.5)';
        },
        
        updateState(tile, state) {
            // Remove all state classes
            tile.classList.remove('libre', 'ocupada', 'pagando', 'reservada');
            // Add new state
            tile.classList.add(state);
        }
    };

    // ============================================
    // PROGRESS BAR ANIMATIONS
    // ============================================
    const ProgressAnimations = {
        init() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.animate(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            
            document.querySelectorAll('.kpi-progress-bar, .progress-bar-premium').forEach(bar => {
                observer.observe(bar);
            });
        },
        
        animate(bar) {
            const width = bar.style.width || bar.getAttribute('aria-valuenow') + '%';
            bar.style.width = '0%';
            bar.style.transition = 'width 1.5s ease-out';
            
            setTimeout(() => {
                bar.style.width = width;
            }, 100);
        }
    };

    // ============================================
    // RIPPLE EFFECT
    // ============================================
    const RippleEffect = {
        init() {
            document.querySelectorAll('.btn, .mesa-tile, .nav-item a').forEach(element => {
                element.addEventListener('click', (e) => {
                    this.create(e, element);
                });
            });
        },
        
        create(event, element) {
            const ripple = document.createElement('span');
            const rect = element.getBoundingClientRect();
            
            const size = Math.max(rect.width, rect.height);
            const x = event.clientX - rect.left - size / 2;
            const y = event.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
            `;
            
            element.style.position = 'relative';
            element.style.overflow = 'hidden';
            element.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        }
    };

    // Add ripple keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    // ============================================
    // INITIALIZE ON DOM READY
    // ============================================
    const init = () => {
        CountUp.init();
        SlideUpFade.init();
        UrgentPulse.init();
        ChartAnimations.init();
        MesaAnimations.init();
        ProgressAnimations.init();
        RippleEffect.init();
        
        console.log('Animations initialized');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for external use
    window.Animations = {
        CountUp,
        SlideUpFade,
        UrgentPulse,
        SkeletonLoader,
        ChartAnimations,
        MesaAnimations,
        ProgressAnimations
    };

})();
