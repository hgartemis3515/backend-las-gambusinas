/**
 * Layout Editor - Editor profesional de layout de mesas estilo OrderPin
 * Sistema completo: selección, drag, resize, snap, publicación por sección
 */

// ==================== ESTADO GLOBAL ====================
const LayoutEditor = {
    // Configuración
    GRID_SIZE: 25,
    MIN_SIZE: 50,
    MAX_SIZE: 200,
    HANDLE_SIZE: 10,

    // Estado del editor
    state: {
        secciones: [],
        seccionSeleccionada: null,
        mesasMapa: [],
        mesasSinPosicionar: [],
        layoutItems: [],
        elementoSeleccionado: null,
        tipoSeleccion: null, // 'mesa' | 'item'
        modoEdicion: false,
        zoom: 1,
        tieneCambios: false,
        guardando: false,
        cargando: false,
        sidebarTab: 'mesas',
        canvasRect: null,
        isDragging: false,
        isResizing: false
    },

    // Elementos disponibles
    elementosEstructura: [
        { tipo: 'barrier', nombre: 'Barrera', icono: '━', width: 100, height: 8, color: '#555' },
        { tipo: 'wall', nombre: 'Pared', icono: '█', width: 120, height: 16, color: '#777' },
        { tipo: 'door', nombre: 'Puerta', icono: '▯', width: 60, height: 12, color: '#8B4513' },
        { tipo: 'zone', nombre: 'Zona', icono: '▢', width: 200, height: 150, color: '#2a4a6a', opacity: 0.25 }
    ],

    etiquetasPredefinidas: [
        { texto: 'Caja', icono: '💰' },
        { texto: 'Puerta', icono: '🚪' },
        { texto: 'Pasillo', icono: '➡️' },
        { texto: 'Terraza', icono: '🌿' },
        { texto: 'No usar', icono: '⛔' },
        { texto: 'Reservas', icono: '📅' },
        { texto: 'Bar', icono: '🍸' },
        { texto: 'Cocina', icono: '👨‍🍳' }
    ]
};

// ==================== UTILIDADES ====================

function snapToGrid(value, gridSize = LayoutEditor.GRID_SIZE) {
    return Math.round(value / gridSize) * gridSize;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getCanvasBounds() {
    const canvas = document.getElementById('layout-canvas');
    if (!canvas) return { width: 1200, height: 800 };
    return {
        width: canvas.offsetWidth,
        height: canvas.offsetHeight
    };
}

// ==================== API ====================

async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
    const baseUrl = '/api';

    try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...options.headers
            }
        });
        return await response.json();
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        return { success: false, error: error.message };
    }
}

// ==================== CARGA DE DATOS ====================

async function cargarSecciones() {
    try {
        const data = await apiRequest('/layout-sections');
        console.log('Respuesta del servidor:', data);
        if (data && data.success) {
            LayoutEditor.state.secciones = data.secciones || [];
        } else {
            console.error('Error al cargar secciones:', data);
            showToast('Error al cargar secciones: ' + (data?.error || 'Error desconocido'), 'error');
        }
        return LayoutEditor.state.secciones;
    } catch (e) {
        console.error('Error en cargarSecciones:', e);
        showToast('Error de conexión al cargar secciones', 'error');
        return [];
    }
}

async function cargarDatosSeccion(sectionId) {
    LayoutEditor.state.cargando = true;
    try {
        const data = await apiRequest(`/layout-sections/${sectionId}/completo`);

        if (data.success) {
            LayoutEditor.state.seccionSeleccionada = data.seccion;
            LayoutEditor.state.mesasMapa = (data.mesas || []).filter(m => m.mapaConfig?.x != null);
            LayoutEditor.state.mesasSinPosicionar = (data.mesasAreaSinSeccion || []).filter(m => m.mapaConfig?.x == null);
            LayoutEditor.state.layoutItems = data.items || [];
            LayoutEditor.state.tieneCambios = false;
        } else {
            console.error('Error al cargar datos de sección:', data);
            showToast('Error al cargar la sección', 'error');
        }
    } catch (e) {
        console.error('Error en cargarDatosSeccion:', e);
    }

    LayoutEditor.state.cargando = false;
    return LayoutEditor.state.seccionSeleccionada;
}

async function guardarCambios() {
    if (!LayoutEditor.state.seccionSeleccionada) return;

    LayoutEditor.state.guardando = true;

    try {
        // Guardar items
        const itemsData = LayoutEditor.state.layoutItems.map(item => ({
            id: item._id,
            tipo: item.tipo,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            rotation: item.rotation || 0,
            zIndex: item.zIndex || 1,
            texto: item.texto,
            color: item.color,
            opacity: item.opacity,
            locked: item.locked,
            visible: item.visible
        }));

        // Guardar mesas
        const mesasData = LayoutEditor.state.mesasMapa.map(m => ({
            mesaId: m._id,
            x: m.mapaConfig?.x || 0,
            y: m.mapaConfig?.y || 0,
            width: m.mapaConfig?.width || 80,
            height: m.mapaConfig?.height || 80,
            shape: m.mapaConfig?.shape || 'rect',
            rotation: m.mapaConfig?.rotation || 0,
            zIndex: m.mapaConfig?.zIndex || 10,
            locked: m.mapaConfig?.locked || false,
            sectionId: LayoutEditor.state.seccionSeleccionada._id
        }));

        await Promise.all([
            apiRequest('/layout-items/bulk', {
                method: 'PUT',
                body: JSON.stringify({
                    sectionId: LayoutEditor.state.seccionSeleccionada._id,
                    items: itemsData
                })
            }),
            apiRequest('/mesas/mapa/bulk', {
                method: 'PUT',
                body: JSON.stringify({ mesas: mesasData })
            })
        ]);

        LayoutEditor.state.tieneCambios = false;
        showToast('Cambios guardados correctamente', 'success');

    } catch (error) {
        console.error('Error al guardar:', error);
        showToast('Error al guardar cambios', 'error');
    }

    LayoutEditor.state.guardando = false;
}

async function publicarSeccion() {
    if (!LayoutEditor.state.seccionSeleccionada) return;

    await guardarCambios();

    const data = await apiRequest(`/layout-sections/${LayoutEditor.state.seccionSeleccionada._id}/publicar`, {
        method: 'POST'
    });

    if (data.success) {
        LayoutEditor.state.seccionSeleccionada.publicado = true;
        showToast('Layout publicado para mozos', 'success');
        // Emitir evento socket para actualizar app de mozos
        if (window.socketAdmin) {
            window.socketAdmin.emit('layout-publicado', {
                sectionId: LayoutEditor.state.seccionSeleccionada._id
            });
        }
    }
}

async function crearSeccion(nombre, areaId = null, canvasWidth = 1600, canvasHeight = 1200) {
    const data = await apiRequest('/layout-sections', {
        method: 'POST',
        body: JSON.stringify({ nombre, areaId, canvasWidth, canvasHeight })
    });

    if (data.success) {
        LayoutEditor.state.secciones.push(data.seccion);
        return data.seccion;
    }
    console.error('Error al crear sección:', data);
    return null;
}

// ==================== COMPONENTE ALPINE ====================

function layoutEditorComponent() {
    return {
        // Estado
        get state() { return LayoutEditor.state; },
        get elementosEstructura() { return LayoutEditor.elementosEstructura; },
        get etiquetasPredefinidas() { return LayoutEditor.etiquetasPredefinidas; },

        // Estado local del componente
        mostrarModalNuevaSeccion: false,
        nuevaSeccion: { nombre: '', canvasWidth: 1600, canvasHeight: 1200, areaId: '' },
        nuevaEtiqueta: '',
        areasDisponibles: [],

        GRID_SIZE: LayoutEditor.GRID_SIZE,

        // Referencias
        interactInstances: [],

        // ==================== INICIALIZACIÓN ====================

        async init() {
            await this.cargarSecciones();
            await this.cargarAreas();
            this.$nextTick(() => this.inicializarInteract());
        },

        async cargarSecciones() {
            await cargarSecciones();
        },

        async cargarAreas() {
            const data = await apiRequest('/areas');
            this.areasDisponibles = Array.isArray(data) ? data : (data.areas || []);
        },

        async seleccionarSeccion(sectionId) {
            if (!sectionId) {
                this.state.seccionSeleccionada = null;
                this.state.mesasMapa = [];
                this.state.mesasSinPosicionar = [];
                this.state.layoutItems = [];
                return;
            }

            await cargarDatosSeccion(sectionId);
            this.$nextTick(() => this.inicializarInteract());
        },

        // ==================== MODO EDICIÓN ====================

        toggleModoEdicion() {
            this.state.modoEdicion = !this.state.modoEdicion;

            if (this.state.modoEdicion) {
                this.$nextTick(() => this.inicializarInteract());
            } else {
                this.deseleccionarTodo();
                if (this.state.tieneCambios && this.state.seccionSeleccionada?._id) {
                    cargarDatosSeccion(this.state.seccionSeleccionada._id);
                }
            }
        },

        // ==================== INTERACT.JS ====================

        inicializarInteract() {
            if (!this.state.modoEdicion) return;

            // Limpiar instancias anteriores
            this.interactInstances.forEach(instance => instance.unset && instance.unset());
            this.interactInstances = [];

            const canvas = document.getElementById('layout-canvas');
            if (!canvas) return;

            // Actualizar bounds
            this.state.canvasRect = {
                width: canvas.offsetWidth,
                height: canvas.offsetHeight
            };

            // Draggable para items del sidebar
            interact('.sidebar-item-draggable')
                .draggable({
                    inertia: false,
                    manualStart: false,
                    autoScroll: false,
                    onstart: (event) => {
                        event.target.style.opacity = '0.6';
                    },
                    onend: (event) => {
                        event.target.style.opacity = '1';
                    }
                });

            // Dropzone en canvas
            interact(canvas)
                .dropzone({
                    accept: '.sidebar-item-draggable, .layout-element',
                    overlap: 0.01,
                    ondrop: (event) => this.handleDrop(event)
                });

            // Draggable + Resizable para mesas en canvas
            interact('.mesa-canvas-item')
                .draggable({
                    inertia: false,
                    modifiers: [
                        interact.modifiers.snap({
                            targets: [interact.snappers.grid({ x: this.GRID_SIZE, y: this.GRID_SIZE })],
                            range: Infinity,
                            relativePoints: [{ x: 0, y: 0 }]
                        }),
                        interact.modifiers.restrict({
                            restriction: canvas,
                            elementRect: { top: 0, left: 0, bottom: 1, right: 1 },
                            endOnly: false
                        })
                    ],
                    listeners: {
                        start: (event) => this.onDragStart(event),
                        move: (event) => this.onDragMove(event),
                        end: (event) => this.onDragEnd(event)
                    }
                })
                .resizable({
                    edges: { left: true, right: true, bottom: true, top: true },
                    modifiers: [
                        interact.modifiers.snapSize({
                            targets: [interact.snappers.grid({ width: this.GRID_SIZE, height: this.GRID_SIZE })],
                            range: Infinity
                        }),
                        interact.modifiers.restrictSize({
                            min: { width: LayoutEditor.MIN_SIZE, height: LayoutEditor.MIN_SIZE },
                            max: { width: LayoutEditor.MAX_SIZE, height: LayoutEditor.MAX_SIZE }
                        })
                    ],
                    listeners: {
                        start: (event) => this.onResizeStart(event),
                        move: (event) => this.onResizeMove(event),
                        end: (event) => this.onResizeEnd(event)
                    }
                });

            // Draggable + Resizable para layout items
            interact('.layout-item-element')
                .draggable({
                    inertia: false,
                    modifiers: [
                        interact.modifiers.snap({
                            targets: [interact.snappers.grid({ x: this.GRID_SIZE, y: this.GRID_SIZE })],
                            range: Infinity
                        }),
                        interact.modifiers.restrict({
                            restriction: canvas,
                            elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
                        })
                    ],
                    listeners: {
                        start: (event) => this.onItemDragStart(event),
                        move: (event) => this.onItemDragMove(event),
                        end: (event) => this.onItemDragEnd(event)
                    }
                })
                .resizable({
                    edges: { right: true, bottom: true },
                    modifiers: [
                        interact.modifiers.snapSize({
                            targets: [interact.snappers.grid({ width: this.GRID_SIZE, height: this.GRID_SIZE })]
                        })
                    ],
                    listeners: {
                        move: (event) => this.onItemResize(event)
                    }
                });
        },

        // ==================== DRAG HANDLERS ====================

        onDragStart(event) {
            if (!this.state.modoEdicion) return;

            const mesaId = event.target.dataset.mesaId;
            const mesa = this.state.mesasMapa.find(m => m._id === mesaId);

            if (mesa?.mapaConfig?.locked) {
                event.interaction.stop();
                return;
            }

            this.state.isDragging = true;
            event.target.style.zIndex = '100';
            event.target.classList.add('dragging');

            this.seleccionarMesa(mesa);
        },

        onDragMove(event) {
            const mesaId = event.target.dataset.mesaId;
            const mesa = this.state.mesasMapa.find(m => m._id === mesaId);
            if (!mesa) return;

            const x = (parseFloat(event.target.dataset.x) || 0) + event.dx;
            const y = (parseFloat(event.target.dataset.y) || 0) + event.dy;

            // Snap en tiempo real
            const snappedX = snapToGrid(x);
            const snappedY = snapToGrid(y);

            event.target.style.left = `${snappedX}px`;
            event.target.style.top = `${snappedY}px`;
            event.target.dataset.x = snappedX;
            event.target.dataset.y = snappedY;

            // Actualizar modelo
            if (mesa.mapaConfig) {
                mesa.mapaConfig.x = snappedX;
                mesa.mapaConfig.y = snappedY;
            }
        },

        onDragEnd(event) {
            this.state.isDragging = false;
            event.target.style.zIndex = '';
            event.target.classList.remove('dragging');
            this.marcarCambios();
        },

        // ==================== RESIZE HANDLERS ====================

        onResizeStart(event) {
            if (!this.state.modoEdicion) return;

            const mesaId = event.target.dataset.mesaId;
            const mesa = this.state.mesasMapa.find(m => m._id === mesaId);

            if (mesa?.mapaConfig?.locked) {
                event.interaction.stop();
                return;
            }

            this.state.isResizing = true;
            event.target.classList.add('resizing');
            this.seleccionarMesa(mesa);
        },

        onResizeMove(event) {
            const mesaId = event.target.dataset.mesaId;
            const mesa = this.state.mesasMapa.find(m => m._id === mesaId);
            if (!mesa) return;

            let x = parseFloat(event.target.dataset.x) || 0;
            let y = parseFloat(event.target.dataset.y) || 0;

            // Actualizar posición y tamaño
            x += event.deltaRect.left;
            y += event.deltaRect.top;

            const width = event.rect.width;
            const height = event.rect.height;

            // Snap
            const snappedX = snapToGrid(x);
            const snappedY = snapToGrid(y);
            const snappedW = snapToGrid(width);
            const snappedH = snapToGrid(height);

            event.target.style.left = `${snappedX}px`;
            event.target.style.top = `${snappedY}px`;
            event.target.style.width = `${snappedW}px`;
            event.target.style.height = `${snappedH}px`;

            event.target.dataset.x = snappedX;
            event.target.dataset.y = snappedY;

            // Actualizar modelo
            if (mesa.mapaConfig) {
                mesa.mapaConfig.x = snappedX;
                mesa.mapaConfig.y = snappedY;
                mesa.mapaConfig.width = snappedW;
                mesa.mapaConfig.height = snappedH;
            }
        },

        onResizeEnd(event) {
            this.state.isResizing = false;
            event.target.classList.remove('resizing');
            this.marcarCambios();
        },

        // ==================== ITEM HANDLERS ====================

        onItemDragStart(event) {
            if (!this.state.modoEdicion) return;
            this.seleccionarItem(event.target.dataset.itemId);
        },

        onItemDragMove(event) {
            const itemId = event.target.dataset.itemId;
            const item = this.state.layoutItems.find(i => i._id === itemId);
            if (!item) return;

            const x = (parseFloat(event.target.dataset.x) || 0) + event.dx;
            const y = (parseFloat(event.target.dataset.y) || 0) + event.dy;

            const snappedX = snapToGrid(x);
            const snappedY = snapToGrid(y);

            event.target.style.left = `${snappedX}px`;
            event.target.style.top = `${snappedY}px`;
            event.target.dataset.x = snappedX;
            event.target.dataset.y = snappedY;

            item.x = snappedX;
            item.y = snappedY;
        },

        onItemDragEnd(event) {
            this.marcarCambios();
        },

        onItemResize(event) {
            const itemId = event.target.dataset.itemId;
            const item = this.state.layoutItems.find(i => i._id === itemId);
            if (!item) return;

            const width = snapToGrid(event.rect.width);
            const height = snapToGrid(event.rect.height);

            event.target.style.width = `${width}px`;
            event.target.style.height = `${height}px`;

            item.width = width;
            item.height = height;
            this.marcarCambios();
        },

        // ==================== DROP HANDLER ====================

        handleDrop(event) {
            if (!this.state.modoEdicion || !this.state.seccionSeleccionada) return;

            const canvas = document.getElementById('layout-canvas');
            const rect = canvas.getBoundingClientRect();

            const dropX = event.dragEvent.clientX - rect.left;
            const dropY = event.dragEvent.clientY - rect.top;

            const snappedX = snapToGrid(dropX);
            const snappedY = snapToGrid(dropY);

            const dragData = event.dragEvent.target.dataset.dragData;
            if (!dragData) return;

            try {
                const data = JSON.parse(dragData);

                if (data.tipo === 'mesa') {
                    this.agregarMesaAlCanvas(data.mesaId, snappedX, snappedY);
                } else if (data.tipo === 'elemento') {
                    this.agregarElementoAlCanvas(data.elemento, snappedX, snappedY);
                }
            } catch (e) {
                console.error('Error parsing drag data:', e);
            }
        },

        // ==================== SELECCIÓN ====================

        seleccionarMesa(mesa) {
            this.state.elementoSeleccionado = mesa;
            this.state.tipoSeleccion = 'mesa';
        },

        seleccionarItem(itemId) {
            const item = this.state.layoutItems.find(i => i._id === itemId);
            if (item) {
                this.state.elementoSeleccionado = item;
                this.state.tipoSeleccion = 'item';
            }
        },

        deseleccionarTodo() {
            this.state.elementoSeleccionado = null;
            this.state.tipoSeleccion = null;
        },

        estaSeleccionado(elemento) {
            return this.state.elementoSeleccionado?._id === elemento._id;
        },

        // ==================== ACCIONES ====================

        agregarMesaAlCanvas(mesaId, x, y) {
            const mesa = this.state.mesasSinPosicionar.find(m => m._id === mesaId);
            if (!mesa) return;

            if (!mesa.mapaConfig) {
                mesa.mapaConfig = { width: 80, height: 80, shape: 'rect', visible: true };
            }

            mesa.mapaConfig.x = x;
            mesa.mapaConfig.y = y;
            mesa.mapaConfig.sectionId = this.state.seccionSeleccionada._id;

            this.state.mesasMapa.push(mesa);
            this.state.mesasSinPosicionar = this.state.mesasSinPosicionar.filter(m => m._id !== mesaId);

            this.seleccionarMesa(mesa);
            this.marcarCambios();

            this.$nextTick(() => this.inicializarInteract());
        },

        agregarElementoAlCanvas(elemento, x, y) {
            const nuevoItem = {
                _id: 'item_' + Date.now(),
                tipo: elemento.tipo,
                x: x,
                y: y,
                width: elemento.width || 100,
                height: elemento.height || 20,
                rotation: 0,
                zIndex: this.state.layoutItems.length + 1,
                texto: elemento.texto || '',
                color: elemento.color || '#555555',
                opacity: elemento.opacity || 1,
                locked: false,
                visible: true,
                fontSize: 14
            };

            this.state.layoutItems.push(nuevoItem);
            this.seleccionarItem(nuevoItem._id);
            this.marcarCambios();

            this.$nextTick(() => this.inicializarInteract());
        },

        removerMesaDelCanvas(mesa) {
            if (!mesa) return;

            mesa.mapaConfig.x = null;
            mesa.mapaConfig.y = null;
            delete mesa.mapaConfig.sectionId;

            this.state.mesasMapa = this.state.mesasMapa.filter(m => m._id !== mesa._id);
            this.state.mesasSinPosicionar.push(mesa);
            this.deseleccionarTodo();
            this.marcarCambios();
        },

        eliminarItem(item) {
            if (!item) return;

            this.state.layoutItems = this.state.layoutItems.filter(i => i._id !== item._id);
            this.deseleccionarTodo();
            this.marcarCambios();
        },

        toggleMesaLock(mesa) {
            if (!mesa?.mapaConfig) return;
            mesa.mapaConfig.locked = !mesa.mapaConfig.locked;
            this.marcarCambios();
        },

        toggleMesaShape(mesa) {
            if (!mesa?.mapaConfig) return;
            mesa.mapaConfig.shape = mesa.mapaConfig.shape === 'round' ? 'rect' : 'round';
            this.marcarCambios();
        },

        marcarCambios() {
            this.state.tieneCambios = true;
        },

        // ==================== GUARDADO Y PUBLICACIÓN ====================

        async guardarTodo() {
            await guardarCambios();
        },

        async publicarLayout() {
            await publicarSeccion();
        },

        async crearNuevaSeccion() {
            const seccion = await crearSeccion(
                this.nuevaSeccion.nombre, 
                this.nuevaSeccion.areaId || null,
                this.nuevaSeccion.canvasWidth || 1600,
                this.nuevaSeccion.canvasHeight || 1200
            );
            if (seccion) {
                this.state.seccionSeleccionada = seccion;
                await this.seleccionarSeccion(seccion._id);
                this.mostrarModalNuevaSeccion = false;
                this.nuevaSeccion = { nombre: '', canvasWidth: 1600, canvasHeight: 1200, areaId: '' };
                showToast('Sección creada correctamente', 'success');
            } else {
                showToast('Error al crear la sección', 'error');
            }
        },

        // ==================== ZOOM ====================

        zoomIn() {
            this.state.zoom = Math.min(1.5, this.state.zoom + 0.1);
        },

        zoomOut() {
            this.state.zoom = Math.max(0.5, this.state.zoom - 0.1);
        },

        resetZoom() {
            this.state.zoom = 1;
        },

        // ==================== ESTILOS ====================

        getMesaStyle(mesa) {
            const config = mesa.mapaConfig || {};
            const isSelected = this.estaSeleccionado(mesa);

            return {
                left: `${config.x || 0}px`,
                top: `${config.y || 0}px`,
                width: `${config.width || 80}px`,
                height: `${config.height || 80}px`,
                borderRadius: config.shape === 'round' ? '50%' : '12px',
                transform: `scale(${this.state.zoom})`,
                transformOrigin: 'top left',
                borderWidth: isSelected ? '3px' : '2px',
                borderColor: isSelected ? '#d4af37' : 'rgba(212,175,55,0.3)',
                boxShadow: isSelected ? '0 0 20px rgba(212,175,55,0.4)' : 'none',
                cursor: this.state.modoEdicion ? (config.locked ? 'not-allowed' : 'move') : 'pointer',
                opacity: config.locked ? 0.7 : 1
            };
        },

        getItemStyle(item) {
            const isSelected = this.estaSeleccionado(item);

            return {
                left: `${item.x || 0}px`,
                top: `${item.y || 0}px`,
                width: `${item.width || 100}px`,
                height: `${item.height || 20}px`,
                backgroundColor: item.tipo === 'label' ? 'transparent' : (item.color || '#555'),
                color: item.color || '#ffffff',
                opacity: item.opacity || 1,
                zIndex: item.zIndex || 1,
                borderRadius: item.tipo === 'zone' ? '8px' : '4px',
                transform: `scale(${this.state.zoom})`,
                transformOrigin: 'top left',
                borderWidth: isSelected ? '2px' : '0',
                borderColor: isSelected ? '#d4af37' : 'transparent',
                borderStyle: 'solid'
            };
        },

        getEstadoColor(estado) {
            const colores = {
                'libre': '#00d4aa',
                'esperando': '#ffa502',
                'ocupada': '#ffa502',
                'pedido': '#3498db',
                'preparado': '#2ecc71',
                'pagado': '#ff4757',
                'reservado': '#5352ed'
            };
            return colores[estado?.toLowerCase()] || '#666';
        },

        getEstadoBg(estado) {
            const color = this.getEstadoColor(estado);
            return `${color}22`;
        },

        estadoNormalizado(estado) {
            const map = {
                'libre': 'Libre',
                'ocupada': 'Ocupada',
                'esperando': 'Ocupada',
                'pedido': 'Pedido',
                'preparado': 'Preparado',
                'pagado': 'Pagado',
                'reservado': 'Reservado'
            };
            return map[estado?.toLowerCase()] || estado || 'Libre';
        },

        // ==================== HELPERS ====================

        getMesasPorEstado(estado) {
            return this.state.mesasMapa.filter(m => m.estado?.toLowerCase() === estado?.toLowerCase());
        },

        detectarColision(mesa) {
            if (!this.state.modoEdicion || !mesa?.mapaConfig) return false;

            const m1 = mesa.mapaConfig;
            return this.state.mesasMapa.some(other => {
                if (other._id === mesa._id) return false;
                const m2 = other.mapaConfig;
                if (!m2) return false;

                return !(m1.x + m1.width <= m2.x || m2.x + m2.width <= m1.x ||
                         m1.y + m1.height <= m2.y || m2.y + m2.height <= m1.y);
            });
        },

        agregarEtiquetaPersonalizada() {
            if (!this.nuevaEtiqueta.trim()) return;

            LayoutEditor.etiquetasPredefinidas.push({
                texto: this.nuevaEtiqueta.trim(),
                icono: '🏷️'
            });

            this.nuevaEtiqueta = '';
        }
    };
}

// ==================== TOAST ====================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-xl text-sm font-medium shadow-xl animate__animated animate__slideInRight ${
        type === 'error' ? 'bg-st-pagado text-white' : 'bg-st-preparado text-white'
    }`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('animate__slideInRight');
        toast.classList.add('animate__slideOutRight');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== EXPORTAR ====================

window.LayoutEditor = LayoutEditor;
window.layoutEditorComponent = layoutEditorComponent;
window.showToast = showToast;
