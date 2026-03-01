/**
 * ANIMATIONS.JS - Animaciones Premium v3.0
 * Proyecto: Las Gambusinas — Panel Admin Premium
 * 
 * Módulos:
 * - Count-up animation para números
 * - Slide-up fade para cards
 * - Pulse animation para alertas
 * - Shimmer para skeleton loaders
 * - Chart animations
 * - Mesa tile animations
 * - Progress bar animations
 * - Ripple effect
 * - Modal animations (NUEVO)
 * - Table row animations (NUEVO)
 * - KPI animations (NUEVO)
 * - Sidebar animations (NUEVO)
 * - Notification animations (NUEVO)
 * - Socket update animations (NUEVO)
 * - Lottie animations helper (NUEVO)
 * - Empty state animations (NUEVO)
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
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.animate(entry.target);
                        this.observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            
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
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const current = Math.floor(start + (target - start) * easeOut);
                
                element.textContent = current.toLocaleString('es-PE');
                
                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    element.textContent = target.toLocaleString('es-PE');
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
            const cards = document.querySelectorAll('.kpi-card, .iq-card, .bg-bg-card');
            cards.forEach((card, index) => {
                card.style.animationDelay = `${index * 100}ms`;
                card.classList.add('animate__animated', 'animate__fadeInUp');
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
                case 'kpi':
                    skeleton.innerHTML = `
                        <div class="bg-bg-card border border-[rgba(212,175,55,0.25)] rounded-xl p-4">
                            <div class="skeleton" style="width: 80px; height: 11px; margin-bottom: 8px;"></div>
                            <div class="skeleton" style="width: 60px; height: 28px; margin-bottom: 4px;"></div>
                            <div class="skeleton" style="width: 100px; height: 12px;"></div>
                        </div>
                    `;
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
                        legend: { display: false },
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
                                    return `S/. ${context.raw.toLocaleString('es-PE')}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10 } } },
                        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10 }, callback: (v) => 'S/.' + v } }
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
            document.querySelectorAll('.mesa-tile').forEach(t => {
                t.style.transform = '';
                t.style.boxShadow = '';
            });
            
            tile.style.transform = 'scale(1.1)';
            tile.style.boxShadow = '0 0 20px rgba(212, 175, 55, 0.5)';
        },
        
        updateState(tile, newState) {
            tile.classList.remove('libre', 'ocupada', 'pagando', 'reservada', 'pedido', 'preparado');
            tile.classList.add(newState);
            
            // Añadir animación de actualización
            tile.classList.add('animate__animated', 'animate__pulse');
            setTimeout(() => tile.classList.remove('animate__pulse'), 500);
        },
        
        gridStagger(container) {
            const tiles = container.querySelectorAll('.mesa-tile');
            tiles.forEach((tile, index) => {
                tile.style.opacity = '0';
                tile.style.transform = 'scale(0.8)';
                
                setTimeout(() => {
                    tile.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
                    tile.style.opacity = '1';
                    tile.style.transform = 'scale(1)';
                }, index * 50);
            });
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
            document.querySelectorAll('.btn, .mesa-tile, .nav-item a, button').forEach(element => {
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

    // ============================================
    // MODAL ANIMATIONS (NUEVO)
    // ============================================
    const ModalAnimations = {
        open(modalEl) {
            if (!modalEl) return;
            
            const backdrop = modalEl;
            backdrop.style.opacity = '0';
            
            const content = modalEl.querySelector('.bg-bg-card, [class*="rounded-2xl"]');
            if (content) {
                content.style.transform = 'scale(0.9) translateY(-20px)';
                content.style.opacity = '0';
            }
            
            requestAnimationFrame(() => {
                backdrop.style.transition = 'opacity 200ms ease-out';
                backdrop.style.opacity = '1';
                
                if (content) {
                    content.style.transition = 'transform 400ms ease-out, opacity 400ms ease-out';
                    content.style.transform = 'scale(1) translateY(0)';
                    content.style.opacity = '1';
                }
            });
        },
        
        close(modalEl, callback) {
            if (!modalEl) return;
            
            const backdrop = modalEl;
            const content = modalEl.querySelector('.bg-bg-card, [class*="rounded-2xl"]');
            
            if (content) {
                content.style.transition = 'transform 300ms ease-in, opacity 300ms ease-in';
                content.style.transform = 'scale(0.95) translateY(-10px)';
                content.style.opacity = '0';
            }
            
            backdrop.style.transition = 'opacity 300ms ease-in';
            backdrop.style.opacity = '0';
            
            setTimeout(() => {
                if (callback) callback();
            }, 300);
        },
        
        success(modalEl) {
            const content = modalEl.querySelector('.bg-bg-card, [class*="rounded-2xl"]');
            if (content) {
                content.classList.add('animate__animated', 'animate__pulse');
                content.style.boxShadow = '0 0 30px rgba(46, 204, 113, 0.3)';
                
                setTimeout(() => {
                    content.classList.remove('animate__pulse');
                    content.style.boxShadow = '';
                }, 500);
            }
        },
        
        error(modalEl) {
            const content = modalEl.querySelector('.bg-bg-card, [class*="rounded-2xl"]');
            if (content) {
                content.classList.add('animate__animated', 'animate__headShake');
                
                setTimeout(() => {
                    content.classList.remove('animate__headShake');
                }, 500);
            }
        }
    };

    // ============================================
    // TABLE ROW ANIMATIONS (NUEVO)
    // ============================================
    const TableAnimations = {
        animateRows(tableEl) {
            if (!tableEl) return;
            
            const rows = tableEl.querySelectorAll('tbody tr');
            rows.forEach((row, index) => {
                row.style.opacity = '0';
                row.style.transform = 'translateY(10px)';
                
                setTimeout(() => {
                    row.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
                    row.style.opacity = '1';
                    row.style.transform = 'translateY(0)';
                }, index * 50);
            });
        },
        
        newRow(rowEl) {
            if (!rowEl) return;
            
            rowEl.style.opacity = '0';
            rowEl.style.transform = 'translateY(-20px)';
            rowEl.style.backgroundColor = 'rgba(46, 204, 113, 0.1)';
            
            requestAnimationFrame(() => {
                rowEl.style.transition = 'all 400ms ease-out';
                rowEl.style.opacity = '1';
                rowEl.style.transform = 'translateY(0)';
                
                setTimeout(() => {
                    rowEl.style.backgroundColor = '';
                }, 1000);
            });
        },
        
        updateRow(rowEl) {
            if (!rowEl) return;
            
            const originalBg = rowEl.style.backgroundColor;
            rowEl.style.backgroundColor = 'rgba(255, 165, 2, 0.2)';
            
            rowEl.classList.add('animate__animated', 'animate__headShake');
            
            setTimeout(() => {
                rowEl.style.backgroundColor = originalBg || '';
                rowEl.classList.remove('animate__headShake');
            }, 500);
        },
        
        deleteRow(rowEl, callback) {
            if (!rowEl) return;
            
            rowEl.style.transition = 'all 300ms ease-in';
            rowEl.style.opacity = '0';
            rowEl.style.transform = 'translateX(-20px)';
            
            setTimeout(() => {
                rowEl.remove();
                if (callback) callback();
            }, 300);
        }
    };

    // ============================================
    // KPI ANIMATIONS (NUEVO)
    // ============================================
    const KPIAnimations = {
        animateCards(containerEl) {
            if (!containerEl) return;
            
            const cards = containerEl.querySelectorAll('.bg-bg-card');
            cards.forEach((card, index) => {
                card.style.opacity = '0';
                card.style.transform = 'translateY(20px)';
                
                setTimeout(() => {
                    card.style.transition = 'opacity 400ms ease-out, transform 400ms ease-out';
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }, index * 100);
            });
        },
        
        counterUp(element, target, duration = 1500, prefix = '', suffix = '') {
            if (!element) return;
            
            const start = 0;
            const startTime = performance.now();
            
            const step = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const current = Math.floor(start + (target - start) * easeOut);
                
                element.textContent = prefix + current.toLocaleString('es-PE') + suffix;
                
                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    element.textContent = prefix + target.toLocaleString('es-PE') + suffix;
                }
            };
            
            requestAnimationFrame(step);
        },
        
        pulse(cardEl) {
            if (!cardEl) return;
            cardEl.classList.add('animate__animated', 'animate__pulse');
            setTimeout(() => cardEl.classList.remove('animate__pulse'), 500);
        },
        
        highlight(cardEl, color = 'gold') {
            if (!cardEl) return;
            
            const colors = {
                gold: 'rgba(212, 175, 55, 0.2)',
                green: 'rgba(46, 204, 113, 0.2)',
                red: 'rgba(255, 71, 87, 0.2)',
                yellow: 'rgba(255, 165, 2, 0.2)'
            };
            
            const originalBorder = cardEl.style.borderColor;
            cardEl.style.borderColor = colors[color] || colors.gold;
            cardEl.style.boxShadow = `0 0 20px ${colors[color] || colors.gold}`;
            
            setTimeout(() => {
                cardEl.style.borderColor = originalBorder || '';
                cardEl.style.boxShadow = '';
            }, 1000);
        }
    };

    // ============================================
    // SIDEBAR ANIMATIONS (NUEVO)
    // ============================================
    const SidebarAnimations = {
        open(sidebarEl) {
            if (!sidebarEl) return;
            
            sidebarEl.style.transition = 'width 300ms ease-out, transform 300ms ease-out';
            
            const items = sidebarEl.querySelectorAll('.sidebar-item, nav button');
            items.forEach((item, index) => {
                item.style.opacity = '0';
                item.style.transform = 'translateX(-10px)';
                
                setTimeout(() => {
                    item.style.transition = 'opacity 200ms ease-out, transform 200ms ease-out';
                    item.style.opacity = '1';
                    item.style.transform = 'translateX(0)';
                }, 300 + index * 30);
            });
        },
        
        close(sidebarEl) {
            // Animación manejada por CSS transition
        },
        
        toggle(sidebarEl, isOpen) {
            if (isOpen) {
                this.open(sidebarEl);
            }
        }
    };

    // ============================================
    // NOTIFICATION ANIMATIONS (NUEVO)
    // ============================================
    const NotificationAnimations = {
        show(message, type = 'success', duration = 3000) {
            const container = this.getOrCreateContainer();
            
            const notif = document.createElement('div');
            notif.className = `px-4 py-3 rounded-xl text-sm font-medium shadow-xl flex items-center gap-2 animate__animated animate__slideInRight ${
                type === 'error' ? 'bg-st-pagado text-white' : 
                type === 'warning' ? 'bg-st-esperando text-white' :
                'bg-st-preparado text-white'
            }`;
            
            const icon = type === 'error' ? '✕' : type === 'warning' ? '⚠' : '✓';
            notif.innerHTML = `<span>${icon}</span><span>${message}</span>`;
            
            container.appendChild(notif);
            
            setTimeout(() => {
                notif.classList.remove('animate__slideInRight');
                notif.classList.add('animate__slideOutRight');
                setTimeout(() => notif.remove(), 300);
            }, duration);
        },
        
        getOrCreateContainer() {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.className = 'fixed bottom-6 right-6 z-[9999] space-y-2';
                document.body.appendChild(container);
            }
            return container;
        }
    };

    // ============================================
    // SOCKET UPDATE ANIMATIONS (NUEVO)
    // ============================================
    const SocketAnimations = {
        throttleTimers: {},
        
        mesaUpdate(mesaEl, newState) {
            if (!mesaEl) return;
            
            // Throttle para evitar múltiples animaciones
            const id = mesaEl.dataset?.id || mesaEl.textContent;
            if (this.throttleTimers[id]) return;
            
            this.throttleTimers[id] = true;
            setTimeout(() => delete this.throttleTimers[id], 100);
            
            // Flash con el nuevo color
            mesaEl.classList.add('animate__animated', 'animate__pulse');
            
            setTimeout(() => {
                mesaEl.classList.remove('animate__pulse');
            }, 500);
        },
        
        comandaNueva(listEl, highlight = true) {
            if (highlight && listEl) {
                listEl.classList.add('socket-highlight');
                setTimeout(() => listEl.classList.remove('socket-highlight'), 1000);
            }
        },
        
        platoListo(element) {
            if (!element) return;
            
            element.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            element.classList.add('animate__animated', 'animate__bounce');
            
            setTimeout(() => {
                element.style.backgroundColor = '';
                element.classList.remove('animate__bounce');
            }, 1000);
        }
    };

    // ============================================
    // LOTTIE ANIMATIONS HELPER (NUEVO)
    // ============================================
    const LottieAnimations = {
        players: {},
        
        init(containerId, animationUrl, options = {}) {
            const container = document.getElementById(containerId);
            if (!container) return null;
            
            const player = document.createElement('lottie-player');
            player.setAttribute('src', animationUrl);
            player.setAttribute('background', 'transparent');
            player.setAttribute('speed', options.speed || '1');
            player.setAttribute('style', `width: ${options.width || '100px'}; height: ${options.height || '100px'};`);
            
            if (options.loop !== false) {
                player.setAttribute('loop', '');
            }
            if (options.autoplay !== false) {
                player.setAttribute('autoplay', '');
            }
            
            container.innerHTML = '';
            container.appendChild(player);
            this.players[containerId] = player;
            
            return player;
        },
        
        success(containerId) {
            return this.init(containerId, 'https://assets2.lottiefiles.com/packages/lf20_3brrejcn.json', {
                width: '80px',
                height: '80px',
                loop: false,
                autoplay: true
            });
        },
        
        loading(containerId) {
            return this.init(containerId, 'https://assets9.lottiefiles.com/packages/lf20_usmfx6bp.json', {
                width: '60px',
                height: '60px',
                loop: true,
                autoplay: true
            });
        },
        
        empty(containerId, type = 'default') {
            const urls = {
                default: 'https://assets10.lottiefiles.com/packages/lf20_t24tpvcu.json',
                mesa: 'https://assets10.lottiefiles.com/packages/lf20_xyadoh9h.json',
                plato: 'https://assets10.lottiefiles.com/packages/lf20_fspxxlhy.json',
                search: 'https://assets10.lottiefiles.com/packages/lf20_1pxqjpsx.json'
            };
            
            return this.init(containerId, urls[type] || urls.default, {
                width: '150px',
                height: '150px'
            });
        },
        
        destroy(containerId) {
            if (this.players[containerId]) {
                this.players[containerId].destroy();
                delete this.players[containerId];
            }
        }
    };

    // ============================================
    // EMPTY STATE ANIMATIONS (NUEVO)
    // ============================================
    const EmptyStateAnimations = {
        show(container, type = 'default', message = 'Sin datos disponibles', icon = null) {
            if (!container) return;
            
            const icons = {
                default: '📭',
                mesa: '🪑',
                plato: '🍽️',
                comanda: '📋',
                cliente: '👥',
                search: '🔍',
                error: '⚠️'
            };
            
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 animate__animated animate__fadeIn">
                    <div class="text-6xl mb-4 empty-state-icon">${icon || icons[type] || icons.default}</div>
                    <p class="text-txt-muted text-sm">${message}</p>
                </div>
            `;
        },
        
        showWithLottie(container, type = 'default', message = 'Sin datos disponibles') {
            if (!container) return;
            
            const containerId = 'empty-state-' + Date.now();
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 animate__animated animate__fadeIn">
                    <div id="${containerId}"></div>
                    <p class="text-txt-muted text-sm mt-4">${message}</p>
                </div>
            `;
            
            LottieAnimations.empty(containerId, type);
        }
    };

    // ============================================
    // PAGE TRANSITIONS (NUEVO)
    // ============================================
    const PageTransitions = {
        fadeOut(callback) {
            document.body.style.transition = 'opacity 300ms ease-out';
            document.body.style.opacity = '0';
            
            setTimeout(() => {
                if (callback) callback();
            }, 300);
        },
        
        fadeIn() {
            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 300ms ease-out';
            
            requestAnimationFrame(() => {
                document.body.style.opacity = '1';
            });
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
        
        // Inicializar AOS si está disponible
        if (typeof AOS !== 'undefined') {
            AOS.init({
                duration: 600,
                easing: 'ease-out-cubic',
                once: true,
                offset: 50
            });
        }
        
        console.log('🎬 Animations v3.0 initialized');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================
    // EXPORT FOR EXTERNAL USE
    // ============================================
    window.Animations = {
        CountUp,
        SlideUpFade,
        UrgentPulse,
        SkeletonLoader,
        ChartAnimations,
        MesaAnimations,
        ProgressAnimations,
        RippleEffect,
        Modal: ModalAnimations,
        Table: TableAnimations,
        KPI: KPIAnimations,
        Sidebar: SidebarAnimations,
        Notification: NotificationAnimations,
        Socket: SocketAnimations,
        Lottie: LottieAnimations,
        EmptyState: EmptyStateAnimations,
        Page: PageTransitions
    };

})();
