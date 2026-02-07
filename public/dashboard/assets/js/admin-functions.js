/**
 * ADMIN FUNCTIONS - Clon funcional de admin.html
 * Todas las funciones extraídas de admin.html para usar en el nuevo dashboard
 * NO MODIFICAR admin.html - Este es un clon funcional
 */

const API_BASE = '/api';
let editingId = null;

// Obtener token de autenticación
function getAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
    };
}

// ========== FUNCIONES DE NAVEGACIÓN ==========
function showTab(tabName, clickedElement) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const clickedTab = clickedElement || (window.event ? window.event.target : document.querySelector(`[onclick*="showTab('${tabName}')"]`));
    if (clickedTab) {
        clickedTab.classList.add('active');
    }
    
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
    }
    
    try {
        if (tabName === 'mesas') loadMesas();
        else if (tabName === 'areas') loadAreas();
        else if (tabName === 'mozos') loadMozos();
        else if (tabName === 'platos') loadPlatos();
        else if (tabName === 'comandas') loadComandas();
        else if (tabName === 'bouchers') loadBouchers();
        else if (tabName === 'clientes') loadClientes();
        else if (tabName === 'auditoria') loadAuditoria();
        else if (tabName === 'platos-eliminados') loadPlatosEliminados();
        else if (tabName === 'cierre-caja') loadCierresCaja();
    } catch (error) {
        console.error(`Error cargando datos para ${tabName}:`, error);
    }
}

// ========== FUNCIONES DE MESAS ==========
async function loadMesas() {
    try {
        const response = await fetch(`${API_BASE}/mesas`, {
            headers: getAuthHeaders()
        });
        const mesas = await response.json();
        displayMesas(mesas);
    } catch (error) {
        const container = document.getElementById('mesas-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar mesas: ${error.message}</div>`;
        }
    }
}

async function activarModoLibreTotal() {
    if (!confirm('⚠️ ¿Estás seguro de activar el MODO LIBRE TOTAL?\n\nEsto convertirá TODAS las mesas existentes al estado "libre", sin importar su estado actual.\n\nEsta acción no se puede deshacer.')) {
        return;
    }

    try {
                const response = await fetch(`${API_BASE}/mesas/liberar-todas`, {
                    method: 'PUT',
                    headers: getAuthHeaders()
                });

        if (response.ok) {
            const resultado = await response.json();
            showAlert(`✅ ${resultado.message}`, 'success');
            loadMesas();
        } else {
            const errorData = await response.json();
            showAlert('Error: ' + (errorData.error || 'No se pudo activar el Modo Libre Total'), 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

function displayMesas(mesas) {
    const container = document.getElementById('mesas-list');
    if (!container) return;
    
    if (mesas.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay mesas registradas</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Número de Mesa</th>
                        <th>Área</th>
                        <th>Estado Mesa</th>
                        <th>Activa</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${mesas.map(mesa => `
                        <tr>
                            <td>${mesa.mesasId || mesa._id}</td>
                            <td>${mesa.nummesa}</td>
                            <td>${mesa.area?.nombre || 'Sin área'}</td>
                            <td>
                                <span class="badge badge-info">
                                    ${mesa.estado || 'libre'}
                                </span>
                            </td>
                            <td>
                                <span class="badge ${mesa.isActive ? 'badge-success' : 'badge-danger'}">
                                    ${mesa.isActive ? 'Activa' : 'Inactiva'}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-primary" style="margin-right: 5px;" onclick="editMesa('${mesa._id}')">Editar</button>
                                <button class="btn btn-danger" onclick="deleteMesa('${mesa._id}')">Eliminar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function editMesa(id) {
    try {
        const response = await fetch(`${API_BASE}/mesas`, {
            headers: getAuthHeaders()
        });
        const mesas = await response.json();
        const mesa = mesas.find(m => m._id === id);
        if (!mesa) {
            showAlert('Mesa no encontrada', 'error');
            return;
        }
        editingId = id;
        openModal('mesa', mesa);
    } catch (error) {
        showAlert('Error al cargar la mesa: ' + error.message, 'error');
    }
}

async function saveMesa(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const id = formData.get('id');
    const data = {
        nummesa: parseInt(formData.get('nummesa')),
        area: formData.get('area'),
        estado: formData.get('estado') || 'libre',
        isActive: formData.get('isActive') === 'true'
    };

    try {
        const url = id ? `${API_BASE}/mesas/${id}` : `${API_BASE}/mesas`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal();
            loadMesas();
            showAlert(id ? 'Mesa actualizada exitosamente' : 'Mesa creada exitosamente', 'success');
        } else {
            const errorData = await response.json();
            showAlert('Error: ' + (errorData.error || (id ? 'Error al actualizar la mesa' : 'Error al crear la mesa')), 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

async function deleteMesa(id) {
    if (!confirm('¿Estás seguro de eliminar esta mesa?')) return;

    try {
        const response = await fetch(`${API_BASE}/mesas/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            loadMesas();
            showAlert('Mesa eliminada exitosamente', 'success');
        } else {
            showAlert('Error al eliminar la mesa', 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

// ========== FUNCIONES DE ÁREAS ==========
async function loadAreas() {
    try {
        const response = await fetch(`${API_BASE}/areas`, {
            headers: getAuthHeaders()
        });
        const areas = await response.json();
        displayAreas(areas);
    } catch (error) {
        const container = document.getElementById('areas-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar áreas: ${error.message}</div>`;
        }
    }
}

function displayAreas(areas) {
    const container = document.getElementById('areas-list');
    if (!container) return;
    
    if (areas.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay áreas registradas</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Descripción</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${areas.map(area => `
                        <tr>
                            <td>${area.areaId || area._id}</td>
                            <td>${area.nombre}</td>
                            <td>${area.descripcion || '-'}</td>
                            <td>
                                <span class="badge ${area.isActive ? 'badge-success' : 'badge-danger'}">
                                    ${area.isActive ? 'Activa' : 'Inactiva'}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-primary" style="margin-right: 5px;" onclick="editArea('${area._id}')">Editar</button>
                                <button class="btn btn-danger" onclick="deleteArea('${area._id}')">Eliminar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function editArea(id) {
    try {
        const response = await fetch(`${API_BASE}/areas`, {
            headers: getAuthHeaders()
        });
        const areas = await response.json();
        const area = areas.find(a => a._id === id);
        if (!area) {
            showAlert('Área no encontrada', 'error');
            return;
        }
        editingId = id;
        openModal('area', area);
    } catch (error) {
        showAlert('Error al cargar el área: ' + error.message, 'error');
    }
}

async function saveArea(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const id = formData.get('id');
    const data = {
        nombre: formData.get('nombre'),
        descripcion: formData.get('descripcion') || '',
        isActive: formData.get('isActive') === 'true'
    };

    try {
        const url = id ? `${API_BASE}/areas/${id}` : `${API_BASE}/areas`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal();
            loadAreas();
            showAlert(id ? 'Área actualizada exitosamente' : 'Área creada exitosamente', 'success');
        } else {
            const errorData = await response.json();
            showAlert('Error: ' + (errorData.error || (id ? 'Error al actualizar el área' : 'Error al crear el área')), 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

async function deleteArea(id) {
    if (!confirm('¿Está seguro de eliminar esta área?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/areas/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            loadAreas();
            showAlert('Área eliminada exitosamente', 'success');
        } else {
            const errorData = await response.json();
            showAlert('Error: ' + (errorData.error || 'Error al eliminar el área'), 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

async function loadAreasForSelect() {
    try {
        const response = await fetch(`${API_BASE}/areas`, {
            headers: getAuthHeaders()
        });
        const areas = await response.json();
        const activeAreas = areas.filter(a => a.isActive !== false);
        return activeAreas.map(area => 
            `<option value="${area._id}">${area.nombre}</option>`
        ).join('');
    } catch (error) {
        console.error('Error al cargar áreas:', error);
        return '<option value="">Error al cargar áreas</option>';
    }
}

// ========== FUNCIONES DE MOZOS ==========
async function loadMozos() {
    try {
        const response = await fetch(`${API_BASE}/mozos`, {
            headers: getAuthHeaders()
        });
        const mozos = await response.json();
        displayMozos(mozos);
    } catch (error) {
        const container = document.getElementById('mozos-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar mozos: ${error.message}</div>`;
        }
    }
}

function displayMozos(mozos) {
    const container = document.getElementById('mozos-list');
    if (!container) return;
    
    if (mozos.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay mozos registrados</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>DNI</th>
                        <th>Teléfono</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${mozos.map(mozo => `
                        <tr>
                            <td>${mozo.mozoId || mozo._id}</td>
                            <td>${mozo.name}</td>
                            <td>${mozo.DNI}</td>
                            <td>${mozo.phoneNumber}</td>
                            <td>
                                <button class="btn btn-primary" style="margin-right: 5px;" onclick="editMozo('${mozo._id}')">Editar</button>
                                <button class="btn btn-danger" onclick="deleteMozo('${mozo._id}')">Eliminar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function editMozo(id) {
    try {
        const response = await fetch(`${API_BASE}/mozos`, {
            headers: getAuthHeaders()
        });
        const mozos = await response.json();
        const mozo = mozos.find(m => m._id === id);
        if (!mozo) {
            showAlert('Mozo no encontrado', 'error');
            return;
        }
        editingId = id;
        openModal('mozo', mozo);
    } catch (error) {
        showAlert('Error al cargar el mozo: ' + error.message, 'error');
    }
}

async function saveMozo(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const id = formData.get('id');
    const data = {
        name: formData.get('name'),
        DNI: parseInt(formData.get('DNI')),
        phoneNumber: parseInt(formData.get('phoneNumber'))
    };

    try {
        const url = id ? `${API_BASE}/mozos/${id}` : `${API_BASE}/mozos`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal();
            loadMozos();
            showAlert(id ? 'Mozo actualizado exitosamente' : 'Mozo creado exitosamente', 'success');
        } else {
            const errorData = await response.json();
            showAlert('Error: ' + (errorData.error || (id ? 'Error al actualizar el mozo' : 'Error al crear el mozo')), 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

async function deleteMozo(id) {
    if (!confirm('¿Estás seguro de eliminar este mozo?')) return;

    try {
        const response = await fetch(`${API_BASE}/mozos/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            loadMozos();
            showAlert('Mozo eliminado exitosamente', 'success');
        } else {
            showAlert('Error al eliminar el mozo', 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

// ========== FUNCIONES DE PLATOS ==========
async function loadPlatos() {
    try {
        const response = await fetch(`${API_BASE}/platos`, {
            headers: getAuthHeaders()
        });
        const platos = await response.json();
        displayPlatos(platos);
    } catch (error) {
        const container = document.getElementById('platos-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar platos: ${error.message}</div>`;
        }
    }
}

function displayPlatos(platos) {
    const container = document.getElementById('platos-list');
    if (!container) return;
    
    if (platos.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay platos registrados</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Precio</th>
                        <th>Stock</th>
                        <th>Categoría</th>
                        <th>Tipo</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${platos.map((plato, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${plato.id || plato._id}</td>
                            <td>${plato.nombre}</td>
                            <td>S/. ${plato.precio.toFixed(2)}</td>
                            <td>
                                <span class="badge ${plato.stock > 0 ? 'badge-success' : 'badge-danger'}">
                                    ${plato.stock}
                                </span>
                            </td>
                            <td>${plato.categoria}</td>
                            <td>
                                <span class="badge ${plato.tipo === 'platos-desayuno' ? 'badge-warning' : 'badge-success'}">
                                    ${plato.tipo || 'N/A'}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-primary" style="margin-right: 5px;" onclick="editPlato('${plato._id}')">Editar</button>
                                <button class="btn btn-danger" onclick="deletePlato('${plato._id}')">Eliminar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function editPlato(id) {
    try {
        const response = await fetch(`${API_BASE}/platos`, {
            headers: getAuthHeaders()
        });
        const platos = await response.json();
        const plato = platos.find(p => p._id === id);
        if (!plato) {
            showAlert('Plato no encontrado', 'error');
            return;
        }
        editingId = id;
        openModal('plato', plato);
    } catch (error) {
        showAlert('Error al cargar el plato: ' + error.message, 'error');
    }
}

async function savePlato(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const id = formData.get('id');
    const data = {
        nombre: formData.get('nombre'),
        precio: parseFloat(formData.get('precio')),
        stock: parseInt(formData.get('stock')),
        categoria: formData.get('categoria'),
        tipo: formData.get('tipo')
    };

    try {
        const url = id ? `${API_BASE}/platos/${id}` : `${API_BASE}/platos`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal();
            loadPlatos();
            showAlert(id ? 'Plato actualizado exitosamente' : 'Plato creado exitosamente', 'success');
        } else {
            const errorData = await response.json();
            showAlert('Error: ' + (errorData.error || (id ? 'Error al actualizar el plato' : 'Error al crear el plato')), 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

async function deletePlato(id) {
    if (!confirm('¿Estás seguro de eliminar este plato?')) return;

    try {
        const response = await fetch(`${API_BASE}/platos/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            loadPlatos();
            showAlert('Plato eliminado exitosamente', 'success');
        } else {
            showAlert('Error al eliminar el plato', 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

// ========== FUNCIONES DE COMANDAS ==========
async function loadComandas() {
    try {
        const response = await fetch(`${API_BASE}/comanda`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        let comandas = [];
        if (Array.isArray(data)) {
            comandas = data;
        } else if (data && Array.isArray(data.comandas)) {
            comandas = data.comandas;
        } else if (data && data.message) {
            throw new Error(data.message);
        } else {
            console.warn('Respuesta inesperada del API:', data);
            comandas = [];
        }
        
        displayComandas(comandas);
    } catch (error) {
        console.error('Error al cargar comandas:', error);
        const container = document.getElementById('comandas-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar comandas: ${error.message}</div>`;
        }
    }
}

function displayComandas(comandas) {
    const container = document.getElementById('comandas-list');
    if (!container) return;
    
    if (!Array.isArray(comandas)) {
        console.error('displayComandas recibió un valor que no es array:', comandas);
        container.innerHTML = '<div class="alert alert-error">Error: Los datos recibidos no son válidos</div>';
        return;
    }
    
    if (comandas.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay comandas registradas</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>N°</th>
                        <th>Mozo</th>
                        <th>Mesa</th>
                        <th>Platos</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                    </tr>
                </thead>
                <tbody>
                    ${comandas.map(comanda => `
                        <tr>
                            <td>${comanda.comandaNumber || '-'}</td>
                            <td>${comanda.mozos?.name || 'N/A'}</td>
                            <td>${comanda.mesas?.nummesa || 'N/A'}</td>
                            <td>${comanda.platos?.length || 0} plato(s)</td>
                            <td>
                                <span class="badge ${comanda.status === 'ingresante' ? 'badge-warning' : 'badge-success'}">
                                    ${comanda.status || 'N/A'}
                                </span>
                            </td>
                            <td>${comanda.createdAt ? new Date(comanda.createdAt).toLocaleDateString() : 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ========== FUNCIONES DE BOUCHERS ==========
async function loadBouchers() {
    try {
        const response = await fetch(`${API_BASE}/boucher`, {
            headers: getAuthHeaders()
        });
        const bouchers = await response.json();
        displayBouchers(bouchers);
    } catch (error) {
        const container = document.getElementById('bouchers-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar bouchers: ${error.message}</div>`;
        }
    }
}

async function loadBouchersPorFecha() {
    const fechaInput = document.getElementById('boucher-fecha');
    const fecha = fechaInput?.value;
    
    if (!fecha) {
        alert('Por favor selecciona una fecha');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/boucher/fecha/${fecha}`, {
            headers: getAuthHeaders()
        });
        const bouchers = await response.json();
        displayBouchers(bouchers);
    } catch (error) {
        const container = document.getElementById('bouchers-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar bouchers: ${error.message}</div>`;
        }
    }
}

function displayBouchers(bouchers) {
    const container = document.getElementById('bouchers-list');
    if (!container) return;
    
    if (bouchers.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay bouchers registrados</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>N° Boucher</th>
                        <th>Mesa</th>
                        <th>Mozo</th>
                        <th>Comandas</th>
                        <th>Platos</th>
                        <th>Subtotal</th>
                        <th>IGV</th>
                        <th>Total</th>
                        <th>Fecha Pago</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${bouchers.map(boucher => `
                        <tr>
                            <td><strong>#${boucher.boucherNumber || boucher._id.slice(-6)}</strong></td>
                            <td>${boucher.numMesa || boucher.mesa?.nummesa || 'N/A'}</td>
                            <td>${boucher.nombreMozo || boucher.mozo?.name || 'N/A'}</td>
                            <td>${boucher.comandasNumbers?.join(', ') || boucher.comandas?.length || 0}</td>
                            <td>${boucher.platos?.length || 0}</td>
                            <td>S/. ${(boucher.subtotal || 0).toFixed(2)}</td>
                            <td>S/. ${(boucher.igv || 0).toFixed(2)}</td>
                            <td><strong>S/. ${(boucher.total || 0).toFixed(2)}</strong></td>
                            <td>${boucher.fechaPagoString || new Date(boucher.fechaPago).toLocaleString('es-PE')}</td>
                            <td>
                                <button class="btn btn-primary" style="margin-right: 5px;" onclick="verBoucher('${boucher._id}')">👁️ Ver</button>
                                <button class="btn btn-primary" style="margin-right: 5px;" onclick="imprimirBoucher('${boucher._id}')">🖨️ Imprimir</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function verBoucher(boucherId) {
    try {
        const response = await fetch(`${API_BASE}/boucher/${boucherId}`, {
            headers: getAuthHeaders()
        });
        const boucher = await response.json();
        
        const platosHTML = boucher.platos?.map(plato => `
            <tr>
                <td>${plato.nombre || 'Plato'}</td>
                <td>${plato.cantidad || 1}</td>
                <td>S/. ${(plato.precio || 0).toFixed(2)}</td>
                <td>S/. ${(plato.subtotal || 0).toFixed(2)}</td>
                ${plato.comandaNumber ? `<td>C#${plato.comandaNumber}</td>` : '<td>-</td>'}
            </tr>
        `).join('') || '<tr><td colspan="5">No hay platos</td></tr>';

        const modalBody = `
            <div style="max-width: 800px;">
                <h3>Boucher #${boucher.boucherNumber || boucher._id.slice(-6)}</h3>
                <div style="margin: 20px 0;">
                    <p><strong>Mesa:</strong> ${boucher.numMesa || boucher.mesa?.nummesa || 'N/A'}</p>
                    <p><strong>Mozo:</strong> ${boucher.nombreMozo || boucher.mozo?.name || 'N/A'}</p>
                    ${boucher.cliente ? `<p><strong>Cliente:</strong> ${boucher.cliente?.nombre || 'N/A'}</p>` : ''}
                    <p><strong>Comandas:</strong> ${boucher.comandasNumbers?.join(', ') || boucher.comandas?.map(c => c.comandaNumber || c._id?.slice(-6)).join(', ') || 'N/A'}</p>
                    <p><strong>Fecha de Pago:</strong> ${boucher.fechaPagoString || new Date(boucher.fechaPago).toLocaleString('es-PE')}</p>
                    ${boucher.observaciones ? `<p><strong>Observaciones:</strong> ${boucher.observaciones}</p>` : ''}
                </div>
                <h4>Platos:</h4>
                <table style="width: 100%; margin: 20px 0;">
                    <thead>
                        <tr>
                            <th>Plato</th>
                            <th>Cantidad</th>
                            <th>Precio Unit.</th>
                            <th>Subtotal</th>
                            <th>Comanda</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${platosHTML}
                    </tbody>
                </table>
                <div style="margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
                    <p><strong>Subtotal:</strong> S/. ${(boucher.subtotal || 0).toFixed(2)}</p>
                    <p><strong>IGV (18%):</strong> S/. ${(boucher.igv || 0).toFixed(2)}</p>
                    <p style="font-size: 1.2em; font-weight: bold;"><strong>TOTAL:</strong> S/. ${(boucher.total || 0).toFixed(2)}</p>
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <button class="btn btn-primary" onclick="imprimirBoucher('${boucher._id}')">🖨️ Imprimir Boucher</button>
                </div>
            </div>
        `;
        
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBodyEl = document.getElementById('modal-body');
        
        if (modal && modalTitle && modalBodyEl) {
            modalTitle.textContent = 'Detalle del Boucher';
            modalBodyEl.innerHTML = modalBody;
            modal.classList.add('active');
        }
    } catch (error) {
        alert('Error al cargar el boucher: ' + error.message);
    }
}

async function imprimirBoucher(boucherId) {
    try {
        const response = await fetch(`${API_BASE}/boucher/${boucherId}`, {
            headers: getAuthHeaders()
        });
        const boucher = await response.json();
        
        const platosHTML = boucher.platos?.map(plato => `
            <tr>
                <td>${plato.nombre || 'Plato'}</td>
                <td>${plato.cantidad || 1}</td>
                <td>S/. ${(plato.precio || 0).toFixed(2)}</td>
                <td>S/. ${(plato.subtotal || 0).toFixed(2)}</td>
            </tr>
        `).join('') || '';

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Boucher #${boucher.boucherNumber || boucher._id.slice(-6)}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        text-align: center;
                        border-bottom: 2px solid #333;
                        padding-bottom: 20px;
                        margin-bottom: 20px;
                    }
                    .info {
                        margin: 15px 0;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    th, td {
                        padding: 8px;
                        text-align: left;
                        border-bottom: 1px solid #ddd;
                    }
                    th {
                        background-color: #f5f5f5;
                    }
                    .total {
                        margin-top: 20px;
                        padding: 15px;
                        background: #f5f5f5;
                        border-radius: 8px;
                    }
                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        margin: 5px 0;
                    }
                    .total-final {
                        font-size: 1.3em;
                        font-weight: bold;
                        border-top: 2px solid #333;
                        padding-top: 10px;
                        margin-top: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🍽️ Las Gambusinas</h1>
                    <h2>BOUCHER DE PAGO</h2>
                    <p>N° ${boucher.boucherNumber || boucher._id.slice(-6)}</p>
                </div>
                <div class="info">
                    <p><strong>Mesa:</strong> ${boucher.numMesa || boucher.mesa?.nummesa || 'N/A'}</p>
                    <p><strong>Mozo:</strong> ${boucher.nombreMozo || boucher.mozo?.name || 'N/A'}</p>
                    ${boucher.cliente ? `<p><strong>Cliente:</strong> ${boucher.cliente?.nombre || 'N/A'}</p>` : ''}
                    <p><strong>Comandas:</strong> ${boucher.comandasNumbers?.join(', ') || boucher.comandas?.map(c => c.comandaNumber || c._id?.slice(-6)).join(', ') || 'N/A'}</p>
                    <p><strong>Fecha:</strong> ${boucher.fechaPagoString || new Date(boucher.fechaPago).toLocaleString('es-PE')}</p>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Plato</th>
                            <th>Cant.</th>
                            <th>Precio</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${platosHTML}
                    </tbody>
                </table>
                <div class="total">
                    <div class="total-row">
                        <span>Subtotal:</span>
                        <span>S/. ${(boucher.subtotal || 0).toFixed(2)}</span>
                    </div>
                    <div class="total-row">
                        <span>IGV (18%):</span>
                        <span>S/. ${(boucher.igv || 0).toFixed(2)}</span>
                    </div>
                    <div class="total-row total-final">
                        <span>TOTAL:</span>
                        <span>S/. ${(boucher.total || 0).toFixed(2)}</span>
                    </div>
                </div>
                ${boucher.observaciones ? `<p><strong>Observaciones:</strong> ${boucher.observaciones}</p>` : ''}
                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                    <p>¡Gracias por su visita!</p>
                </div>
            </body>
            </html>
        `;
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 250);
    } catch (error) {
        alert('Error al imprimir el boucher: ' + error.message);
    }
}

// ========== FUNCIONES DE CLIENTES ==========
async function loadClientes() {
    const container = document.getElementById('clientes-list');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Cargando clientes...</div>';

    try {
        const filtros = {
            tipo: document.getElementById('filtro-tipo')?.value || '',
            nombre: document.getElementById('filtro-nombre')?.value || '',
            dni: document.getElementById('filtro-dni')?.value || '',
            fechaDesde: document.getElementById('filtro-fecha-desde')?.value || '',
            fechaHasta: document.getElementById('filtro-fecha-hasta')?.value || ''
        };

        let url = `${API_BASE}/clientes?`;
        const params = [];
        if (filtros.tipo) params.push(`tipo=${filtros.tipo}`);
        if (filtros.nombre) params.push(`nombre=${encodeURIComponent(filtros.nombre)}`);
        if (filtros.dni) params.push(`dni=${filtros.dni}`);
        if (filtros.fechaDesde) params.push(`fechaDesde=${filtros.fechaDesde}`);
        if (filtros.fechaHasta) params.push(`fechaHasta=${filtros.fechaHasta}`);
        
        url += params.join('&');

        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        const clientes = await response.json();
        displayClientes(clientes);
    } catch (error) {
        container.innerHTML = `<div class="alert alert-error">Error al cargar clientes: ${error.message}</div>`;
    }
}

function displayClientes(clientes) {
    const container = document.getElementById('clientes-list');
    if (!container) return;
    
    if (clientes.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay clientes registrados</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Teléfono</th>
                        <th>DNI</th>
                        <th>Tipo</th>
                        <th>Total Consumido</th>
                        <th>Visitas</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${clientes.map(cliente => `
                        <tr style="cursor: pointer;" onclick="verDetalleCliente('${cliente._id}')">
                            <td>${cliente.clienteId || cliente._id.slice(-6)}</td>
                            <td>${cliente.nombre || '-'}</td>
                            <td>${cliente.telefono || '-'}</td>
                            <td>${cliente.dni || '-'}</td>
                            <td>
                                <span class="badge ${cliente.tipo === 'registrado' ? 'badge-success' : 'badge-warning'}">
                                    ${cliente.tipo === 'registrado' ? 'Registrado' : 'Invitado'}
                                </span>
                            </td>
                            <td>S/. ${(cliente.totalConsumido || 0).toFixed(2)}</td>
                            <td>${cliente.visitas || 0}</td>
                            <td>
                                <button class="btn btn-primary" style="margin-right: 5px;" onclick="event.stopPropagation(); verDetalleCliente('${cliente._id}')">Ver Detalle</button>
                                ${cliente.tipo === 'registrado' ? `
                                    <button class="btn btn-secondary" onclick="event.stopPropagation(); editarCliente('${cliente._id}')">Editar</button>
                                ` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function verDetalleCliente(clienteId) {
    try {
        const response = await fetch(`${API_BASE}/clientes/${clienteId}`, {
            headers: getAuthHeaders()
        });
        const cliente = await response.json();

        const comandasHTML = cliente.comandas && cliente.comandas.length > 0 ? `
            <h3 style="margin-top: 20px; margin-bottom: 10px;">Comandas (${cliente.comandas.length})</h3>
            <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                <table>
                    <thead>
                        <tr>
                            <th>N° Comanda</th>
                            <th>Fecha</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cliente.comandas.map(comanda => `
                            <tr>
                                <td>#${comanda.comandaNumber || comanda._id?.slice(-6) || 'N/A'}</td>
                                <td>${comanda.createdAt ? new Date(comanda.createdAt).toLocaleDateString('es-PE') : 'N/A'}</td>
                                <td>S/. ${(comanda.total || 0).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<p style="color: #999; margin-top: 20px;">No hay comandas registradas</p>';

        const bouchersHTML = cliente.bouchers && cliente.bouchers.length > 0 ? `
            <h3 style="margin-top: 20px; margin-bottom: 10px;">Bouchers (${cliente.bouchers.length})</h3>
            <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>N° Boucher</th>
                            <th>Fecha Uso</th>
                            <th>Total</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cliente.bouchers.map(boucher => `
                            <tr>
                                <td><strong>${boucher.boucherNumber ? `BOU-${boucher.boucherNumber}` : boucher._id?.slice(-6) || 'N/A'}</strong></td>
                                <td>#${boucher.boucherNumber || boucher._id?.slice(-6) || 'N/A'}</td>
                                <td>${boucher.fechaUso ? new Date(boucher.fechaUso).toLocaleDateString('es-PE') : (boucher.fechaPago ? new Date(boucher.fechaPago).toLocaleDateString('es-PE') : 'N/A')}</td>
                                <td>S/. ${(boucher.total || 0).toFixed(2)}</td>
                                <td>
                                    <button class="btn btn-primary" style="margin-right: 5px; padding: 5px 10px; font-size: 12px;" onclick="event.stopPropagation(); verBoucher('${boucher._id}')">👁️ Ver</button>
                                    <button class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;" onclick="event.stopPropagation(); imprimirBoucher('${boucher._id}')">📄 PDF</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<p style="color: #999; margin-top: 20px;">No hay bouchers registrados</p>';

        const modalBody = `
            <div style="padding: 20px; max-width: 900px;">
                <div style="margin-bottom: 20px;">
                    <h3 style="color: #333; margin-bottom: 15px;">Información del Cliente</h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                        <div>
                            <strong>ID:</strong> ${cliente.clienteId || cliente._id.slice(-6)}
                        </div>
                        <div>
                            <strong>Nombre:</strong> ${cliente.nombre || '-'}
                        </div>
                        <div>
                            <strong>DNI:</strong> ${cliente.dni || '-'}
                        </div>
                        <div>
                            <strong>Teléfono:</strong> ${cliente.telefono || '-'}
                        </div>
                        <div>
                            <strong>Email:</strong> ${cliente.email || '-'}
                        </div>
                        <div>
                            <strong>Tipo:</strong> 
                            <span class="badge ${cliente.tipo === 'registrado' ? 'badge-success' : 'badge-warning'}">
                                ${cliente.tipo === 'registrado' ? 'Registrado' : 'Invitado'}
                            </span>
                        </div>
                        <div>
                            <strong>Total Consumido:</strong> S/. ${(cliente.totalConsumido || 0).toFixed(2)}
                        </div>
                        <div>
                            <strong>Visitas:</strong> ${cliente.visitas || 0}
                        </div>
                    </div>
                </div>
                ${comandasHTML}
                ${bouchersHTML}
            </div>
        `;

        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBodyEl = document.getElementById('modal-body');
        
        if (modal && modalTitle && modalBodyEl) {
            modalTitle.textContent = `Detalle Cliente: ${cliente.nombre || 'Invitado'}`;
            modalBodyEl.innerHTML = modalBody;
            modal.classList.add('active');
        }
    } catch (error) {
        alert('Error al cargar detalle del cliente: ' + error.message);
    }
}

async function editarCliente(clienteId) {
    try {
        const response = await fetch(`${API_BASE}/clientes/${clienteId}`, {
            headers: getAuthHeaders()
        });
        const cliente = await response.json();

        if (cliente.tipo === 'invitado') {
            alert('Los clientes invitados no se pueden editar directamente. Puede convertirlos a registrados desde el detalle.');
            return;
        }

        const modalBody = `
            <form id="cliente-form" style="padding: 20px;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nombre:</label>
                    <input type="text" id="cliente-nombre" value="${cliente.nombre || ''}" required style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">DNI (solo lectura):</label>
                    <input type="text" id="cliente-dni" value="${cliente.dni || ''}" readonly style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px; background: #f5f5f5;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Teléfono:</label>
                    <input type="text" id="cliente-telefono" value="${cliente.telefono || ''}" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Email:</label>
                    <input type="email" id="cliente-email" value="${cliente.email || ''}" style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 8px;">
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button type="submit" class="btn btn-primary" style="flex: 1;">Guardar Cambios</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()" style="flex: 1;">Cancelar</button>
                </div>
            </form>
        `;

        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBodyEl = document.getElementById('modal-body');
        
        if (modal && modalTitle && modalBodyEl) {
            modalTitle.textContent = 'Editar Cliente';
            modalBodyEl.innerHTML = modalBody;

            document.getElementById('cliente-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const response = await fetch(`${API_BASE}/clientes/${clienteId}`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                            nombre: document.getElementById('cliente-nombre').value,
                            telefono: document.getElementById('cliente-telefono').value,
                            email: document.getElementById('cliente-email').value
                        })
                    });

                    if (response.ok) {
                        showAlert('Cliente actualizado exitosamente', 'success');
                        closeModal();
                        loadClientes();
                    } else {
                        const error = await response.json();
                        alert('Error: ' + (error.message || 'No se pudo actualizar el cliente'));
                    }
                } catch (error) {
                    alert('Error al actualizar cliente: ' + error.message);
                }
            });

            modal.style.display = 'block';
        }
    } catch (error) {
        alert('Error al cargar cliente: ' + error.message);
    }
}

function exportarClientesCSV() {
    alert('Función de exportación CSV próximamente disponible');
}

// ========== FUNCIONES DE AUDITORÍA ==========
async function loadAuditoria() {
    try {
        const fecha = document.getElementById('auditoria-fecha')?.value || '';
        const accion = document.getElementById('filtro-accion')?.value || '';
        
        let url = `${API_BASE}/auditoria/comandas`;
        const params = [];
        if (fecha) params.push(`fecha=${fecha}`);
        if (accion) params.push(`accion=${accion}`);
        if (params.length > 0) url += '?' + params.join('&');
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        displayAuditoria(data.auditorias || []);
    } catch (error) {
        const container = document.getElementById('auditoria-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar auditoría: ${error.message}</div>`;
        }
    }
}

function displayAuditoria(auditorias) {
    const container = document.getElementById('auditoria-list');
    if (!container) return;
    
    if (auditorias.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay registros de auditoría</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Fecha/Hora</th>
                        <th>Acción</th>
                        <th>Usuario</th>
                        <th>Comanda #</th>
                        <th>Motivo</th>
                        <th>IP</th>
                        <th>Detalles</th>
                    </tr>
                </thead>
                <tbody>
                    ${auditorias.map(aud => {
                        let accionNombre = aud.accion;
                        if (aud.accion === 'ELIMINAR_ULTIMA_COMANDA') accionNombre = '🗑️ Última Comanda';
                        else if (aud.accion === 'ELIMINAR_TODAS_COMANDAS') accionNombre = '🗑️ Todas las Comandas';
                        else if (aud.accion === 'ELIMINAR_COMANDA_INDIVIDUAL') accionNombre = '🗑️ Comanda Individual';
                        
                        const totalEliminado = aud.metadata?.totalEliminado;
                        const cantidadComandas = aud.metadata?.cantidadComandas;
                        const infoAdicional = totalEliminado ? ` (S/. ${totalEliminado.toFixed(2)})` : '';
                        const comandaInfo = cantidadComandas > 1 
                            ? `${cantidadComandas} comandas` 
                            : (aud.metadata?.comandaNumber || 'N/A');
                        
                        return `
                        <tr>
                            <td>${new Date(aud.timestamp).toLocaleString('es-PE')}</td>
                            <td><span style="padding: 4px 8px; border-radius: 4px; background: ${getAccionColor(aud.accion)}; color: white; font-size: 12px;">${accionNombre}</span></td>
                            <td>${aud.usuario?.name || 'Sistema'}</td>
                            <td>${comandaInfo}${infoAdicional}</td>
                            <td>${aud.motivo || '-'}</td>
                            <td>${aud.ip || '-'}</td>
                            <td><button class="btn btn-sm" onclick="verDetalleAuditoria('${aud._id}')">Ver</button></td>
                        </tr>
                    `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function getAccionColor(accion) {
    const colors = {
        'comanda_eliminada': '#DC2626',
        'ELIMINAR_ULTIMA_COMANDA': '#DC2626',
        'ELIMINAR_TODAS_COMANDAS': '#B91C1C',
        'ELIMINAR_COMANDA_INDIVIDUAL': '#DC2626',
        'comanda_editada': '#F59E0B',
        'plato_eliminado': '#EF4444',
        'plato_modificado': '#10B981',
        'comanda_creada': '#3B82F6'
    };
    return colors[accion] || '#6B7280';
}

async function verDetalleAuditoria(auditoriaId) {
    try {
        const response = await fetch(`${API_BASE}/auditoria/comandas?id=${auditoriaId}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        let aud = data.auditorias?.[0];
        
        if (!aud) {
            const response2 = await fetch(`${API_BASE}/auditoria/comandas?entidadId=${auditoriaId}`, {
                headers: getAuthHeaders()
            });
            const data2 = await response2.json();
            aud = data2.auditorias?.[0];
            
            if (!aud) {
                alert('No se encontró el registro de auditoría');
                return;
            }
        }

        const modalBody = `
            <div style="padding: 20px;">
                <div style="margin-bottom: 15px;">
                    <strong>Acción:</strong> <span style="padding: 4px 8px; border-radius: 4px; background: ${getAccionColor(aud.accion)}; color: white; font-size: 12px;">${aud.accion}</span><br>
                    <strong>Fecha:</strong> ${new Date(aud.timestamp).toLocaleString('es-PE')}<br>
                    <strong>Usuario:</strong> ${aud.usuario?.name || 'Sistema'}<br>
                    <strong>Motivo:</strong> ${aud.motivo || 'N/A'}<br>
                    <strong>IP:</strong> ${aud.ip || 'N/A'}<br>
                </div>
                <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; font-weight: bold; margin-bottom: 10px;">Metadata Completa</summary>
                    <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; max-height: 200px;">${JSON.stringify(aud.metadata, null, 2)}</pre>
                </details>
            </div>
        `;

        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBodyEl = document.getElementById('modal-body');
        
        if (modal && modalTitle && modalBodyEl) {
            modalTitle.textContent = 'Detalle de Auditoría';
            modalBodyEl.innerHTML = modalBody;
            modal.style.display = 'block';
            modal.classList.add('active');
        }
    } catch (error) {
        alert('Error al cargar detalle: ' + error.message);
    }
}

async function loadReporteCompleto() {
    try {
        const fechaInicio = prompt('Fecha inicio (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
        if (!fechaInicio) return;
        
        const fechaFin = prompt('Fecha fin (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
        if (!fechaFin) return;
        
        const response = await fetch(`${API_BASE}/auditoria/reporte-completo?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();
        
        const modalBody = `
            <div style="padding: 20px; max-height: 600px; overflow-y: auto;">
                <h3>Resumen del Período</h3>
                <p><strong>Desde:</strong> ${data.periodo.fechaInicio}</p>
                <p><strong>Hasta:</strong> ${data.periodo.fechaFin}</p>
                <hr>
                <h3>Estadísticas</h3>
                <p><strong>Total de Acciones:</strong> ${data.resumen.totalAcciones}</p>
                <p><strong>Comandas Eliminadas:</strong> ${data.resumen.comandasEliminadas}</p>
            </div>
        `;

        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBodyEl = document.getElementById('modal-body');
        
        if (modal && modalTitle && modalBodyEl) {
            modalTitle.textContent = 'Reporte Completo de Auditoría';
            modalBodyEl.innerHTML = modalBody;
            modal.style.display = 'block';
        }
    } catch (error) {
        alert('Error al cargar reporte: ' + error.message);
    }
}

// ========== FUNCIONES DE PLATOS ELIMINADOS ==========
async function loadPlatosEliminados() {
    try {
        const fecha = document.getElementById('platos-eliminados-fecha')?.value || '';
        let url = `${API_BASE}/auditoria/platos-eliminados`;
        if (fecha) url += `?fecha=${fecha}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        displayPlatosEliminados(data.platosEliminados || []);
    } catch (error) {
        const container = document.getElementById('platos-eliminados-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar platos eliminados: ${error.message}</div>`;
        }
    }
}

function displayPlatosEliminados(platos) {
    const container = document.getElementById('platos-eliminados-list');
    if (!container) return;
    
    if (platos.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay platos eliminados registrados</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Fecha/Hora</th>
                        <th>Comanda #</th>
                        <th>Plato</th>
                        <th>Cantidad Original</th>
                        <th>Estado</th>
                        <th>Motivo</th>
                        <th>Usuario</th>
                    </tr>
                </thead>
                <tbody>
                    ${platos.map(plato => `
                        <tr style="${plato.estado?.includes('eliminado') ? 'background-color: #fee;' : ''}">
                            <td>${new Date(plato.timestamp).toLocaleString('es-PE')}</td>
                            <td>#${plato.comandaNumber || plato.comandaId?.slice(-6) || 'N/A'}</td>
                            <td><strong>${plato.nombreOriginal || 'Plato desconocido'}</strong></td>
                            <td>${plato.cantidadOriginal || 0}</td>
                            <td>
                                <span class="badge ${plato.estado?.includes('eliminado') ? 'badge-danger' : 'badge-warning'}">
                                    ${plato.estado || 'N/A'}
                                </span>
                            </td>
                            <td style="max-width: 300px; word-wrap: break-word;">
                                <strong style="color: #d32f2f;">${plato.motivo || 'Sin motivo registrado'}</strong>
                            </td>
                            <td>${plato.usuario?.name || plato.usuarioNombre || 'Sistema'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ========== FUNCIONES DE CIERRE DE CAJA ==========
async function loadCierresCaja() {
    try {
        const fecha = document.getElementById('cierre-fecha')?.value || '';
        let url = `${API_BASE}/cierreCaja`;
        if (fecha) url += `?fechaDesde=${fecha}&fechaHasta=${fecha}`;
        
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        displayCierresCaja(Array.isArray(data) ? data : (data.cierres || []));
    } catch (error) {
        const container = document.getElementById('cierre-caja-list');
        if (container) {
            container.innerHTML = `<div class="alert alert-error">Error al cargar cierres de caja: ${error.message}</div>`;
        }
    }
}

function displayCierresCaja(cierres) {
    const container = document.getElementById('cierre-caja-list');
    if (!container) return;
    
    if (cierres.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay cierres de caja registrados</div>';
        return;
    }

    container.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Mozo</th>
                        <th>Fecha</th>
                        <th>Turno</th>
                        <th>Efectivo Sistema</th>
                        <th>Efectivo Físico</th>
                        <th>Diferencia</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${cierres.map(cierre => `
                        <tr style="${Math.abs(cierre.diferencia || 0) > 5 ? 'background-color: #fee;' : ''}">
                            <td>#${cierre.cierreId || cierre._id?.slice(-6)}</td>
                            <td>${cierre.nombreMozo || cierre.mozoId?.name || 'N/A'}</td>
                            <td>${new Date(cierre.fechaCierre).toLocaleDateString('es-PE')}</td>
                            <td><span class="badge badge-info">${cierre.turno || 'N/A'}</span></td>
                            <td>S/. ${(cierre.totalEfectivoSistema || 0).toFixed(2)}</td>
                            <td>S/. ${(cierre.totalEfectivoFisico || 0).toFixed(2)}</td>
                            <td style="color: ${Math.abs(cierre.diferencia || 0) > 5 ? '#d32f2f' : '#4caf50'}; font-weight: bold;">
                                S/. ${(cierre.diferencia || 0).toFixed(2)}
                            </td>
                            <td>
                                <span class="badge ${getEstadoCierreColor(cierre.estado)}">
                                    ${cierre.estado || 'borrador'}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-primary" style="margin-right: 5px; padding: 5px 10px; font-size: 12px;" onclick="verCierreCaja('${cierre._id}')">👁️ Ver</button>
                                <button class="btn btn-primary" style="padding: 5px 10px; font-size: 12px;" onclick="descargarPDFCierre('${cierre._id}')">📄 PDF</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function getEstadoCierreColor(estado) {
    const colors = {
        'borrador': 'badge-warning',
        'pendiente': 'badge-warning',
        'aprobado': 'badge-success',
        'rechazado': 'badge-danger'
    };
    return colors[estado] || 'badge-warning';
}

async function verCierreCaja(cierreId) {
    try {
        const response = await fetch(`${API_BASE}/cierreCaja/${cierreId}`, {
            headers: getAuthHeaders()
        });
        const cierre = await response.json();
        
        const modalBody = `
            <div style="padding: 20px; max-width: 900px;">
                <h3>Cierre de Caja #${cierre.cierreId || cierre._id?.slice(-6)}</h3>
                <div style="margin: 20px 0;">
                    <p><strong>Mozo:</strong> ${cierre.nombreMozo || 'N/A'}</p>
                    <p><strong>Fecha:</strong> ${new Date(cierre.fechaCierre).toLocaleDateString('es-PE')}</p>
                    <p><strong>Turno:</strong> ${cierre.turno || 'N/A'}</p>
                    <p><strong>Estado:</strong> <span class="badge ${getEstadoCierreColor(cierre.estado)}">${cierre.estado || 'borrador'}</span></p>
                </div>
                <hr>
                <h4>Totales del Sistema</h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 15px 0;">
                    <div><strong>Efectivo:</strong> S/. ${(cierre.totalEfectivoSistema || 0).toFixed(2)}</div>
                    <div><strong>Tarjeta:</strong> S/. ${(cierre.totalTarjetaSistema || 0).toFixed(2)}</div>
                    <div><strong>Yape:</strong> S/. ${(cierre.totalYapeSistema || 0).toFixed(2)}</div>
                    <div><strong>Plin:</strong> S/. ${(cierre.totalPlinSistema || 0).toFixed(2)}</div>
                    <div><strong>Transferencia:</strong> S/. ${(cierre.totalTransferenciaSistema || 0).toFixed(2)}</div>
                    <div><strong>Propinas:</strong> S/. ${(cierre.totalPropinas || 0).toFixed(2)}</div>
                </div>
                <hr>
                <h4>Validación Física</h4>
                <div style="margin: 15px 0;">
                    <p><strong>Efectivo Físico Reportado:</strong> S/. ${(cierre.totalEfectivoFisico || 0).toFixed(2)}</p>
                    <p style="font-size: 1.2em; font-weight: bold; color: ${Math.abs(cierre.diferencia || 0) > 5 ? '#d32f2f' : '#4caf50'};">
                        <strong>DIFERENCIA:</strong> S/. ${(cierre.diferencia || 0).toFixed(2)}
                    </p>
                    ${cierre.observaciones ? `<p><strong>Observaciones:</strong> ${cierre.observaciones}</p>` : ''}
                </div>
            </div>
        `;
        
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBodyEl = document.getElementById('modal-body');
        
        if (modal && modalTitle && modalBodyEl) {
            modalTitle.textContent = 'Detalle Cierre de Caja';
            modalBodyEl.innerHTML = modalBody;
            modal.classList.add('active');
        }
    } catch (error) {
        alert('Error al cargar cierre de caja: ' + error.message);
    }
}

async function descargarPDFCierre(cierreId) {
    try {
        const response = await fetch(`${API_BASE}/cierreCaja/${cierreId}/reporte-pdf`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Error al generar PDF');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cierre_caja_${cierreId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        alert('Error al descargar PDF: ' + error.message);
    }
}

async function generarCierreCaja() {
    const mozoId = prompt('ID del Mozo:');
    if (!mozoId) return;
    
    const fecha = prompt('Fecha (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!fecha) return;
    
    const turno = prompt('Turno (mañana/tarde/noche):', 'tarde');
    if (!turno) return;
    
    try {
        const response = await fetch(`${API_BASE}/cierreCaja/generar`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ mozoId: parseInt(mozoId), fecha, turno })
        });
        
        if (response.ok) {
            const cierre = await response.json();
            showAlert('Cierre de caja generado exitosamente', 'success');
            loadCierresCaja();
        } else {
            const error = await response.json();
            showAlert('Error: ' + (error.error || 'No se pudo generar el cierre'), 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

// ========== FUNCIONES DE MODAL ==========
function openModal(type, data = null) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalTitle || !modalBody) return;
    
    editingId = data ? data._id : null;

    if (type === 'mesa') {
        modalTitle.textContent = data ? 'Editar Mesa' : 'Nueva Mesa';
        loadAreasForSelect().then(areasOptions => {
            const areaId = data?.area?._id || data?.area || '';
            let areasOptionsWithSelection = areasOptions;
            if (areaId) {
                areasOptionsWithSelection = areasOptions.replace(
                    new RegExp(`value="${areaId}"`),
                    `value="${areaId}" selected`
                );
            }
            modalBody.innerHTML = `
                <form id="mesa-form" onsubmit="saveMesa(event)">
                    <input type="hidden" name="id" value="${data?._id || ''}">
                    <div class="form-group">
                        <label>Área:</label>
                        <select name="area" id="area-select" required>
                            <option value="">Seleccione un área</option>
                            ${areasOptionsWithSelection}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Número de Mesa:</label>
                        <input type="number" name="nummesa" required min="1" value="${data?.nummesa || ''}">
                    </div>
                    <div class="form-group">
                        <label>Estado de Mesa:</label>
                        <select name="estado" required>
                            <option value="libre" ${data?.estado === 'libre' ? 'selected' : ''}>Libre</option>
                            <option value="esperando" ${data?.estado === 'esperando' ? 'selected' : ''}>Esperando</option>
                            <option value="pedido" ${data?.estado === 'pedido' ? 'selected' : ''}>Pedido</option>
                            <option value="preparado" ${data?.estado === 'preparado' ? 'selected' : ''}>Preparado</option>
                            <option value="pagado" ${data?.estado === 'pagado' ? 'selected' : ''}>Pagado</option>
                            <option value="reservado" ${data?.estado === 'reservado' ? 'selected' : ''}>Reservado</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Activa:</label>
                        <select name="isActive" required>
                            <option value="true" ${data?.isActive !== false ? 'selected' : ''}>Activa</option>
                            <option value="false" ${data?.isActive === false ? 'selected' : ''}>Inactiva</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-primary">${data ? 'Actualizar' : 'Guardar'}</button>
                </form>
            `;
        });
    } else if (type === 'area') {
        modalTitle.textContent = data ? 'Editar Área' : 'Nueva Área';
        modalBody.innerHTML = `
            <form id="area-form" onsubmit="saveArea(event)">
                <input type="hidden" name="id" value="${data?._id || ''}">
                <div class="form-group">
                    <label>Nombre del Área:</label>
                    <input type="text" name="nombre" required placeholder="Ej: Restaurante, Patio, VIP" value="${data?.nombre || ''}">
                </div>
                <div class="form-group">
                    <label>Descripción (opcional):</label>
                    <textarea name="descripcion" rows="3" placeholder="Descripción del área">${data?.descripcion || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Estado:</label>
                    <select name="isActive" required>
                        <option value="true" ${data?.isActive !== false ? 'selected' : ''}>Activa</option>
                        <option value="false" ${data?.isActive === false ? 'selected' : ''}>Inactiva</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary">${data ? 'Actualizar' : 'Guardar'}</button>
            </form>
        `;
    } else if (type === 'mozo') {
        modalTitle.textContent = data ? 'Editar Mozo' : 'Nuevo Mozo';
        modalBody.innerHTML = `
            <form id="mozo-form" onsubmit="saveMozo(event)">
                <input type="hidden" name="id" value="${data?._id || ''}">
                <div class="form-group">
                    <label>Nombre:</label>
                    <input type="text" name="name" required value="${data?.name || ''}">
                </div>
                <div class="form-group">
                    <label>DNI:</label>
                    <input type="number" name="DNI" required min="0" value="${data?.DNI || ''}">
                </div>
                <div class="form-group">
                    <label>Teléfono:</label>
                    <input type="number" name="phoneNumber" required min="0" value="${data?.phoneNumber || ''}">
                </div>
                <button type="submit" class="btn btn-primary">${data ? 'Actualizar' : 'Guardar'}</button>
            </form>
        `;
    } else if (type === 'plato') {
        modalTitle.textContent = data ? 'Editar Plato' : 'Nuevo Plato';
        modalBody.innerHTML = `
            <form id="plato-form" onsubmit="savePlato(event)">
                <input type="hidden" name="id" value="${data?._id || ''}">
                <div class="form-group">
                    <label>Nombre:</label>
                    <input type="text" name="nombre" required value="${data?.nombre || ''}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Precio:</label>
                        <input type="number" name="precio" required min="0" step="0.01" value="${data?.precio || ''}">
                    </div>
                    <div class="form-group">
                        <label>Stock:</label>
                        <input type="number" name="stock" required min="0" value="${data?.stock || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Categoría:</label>
                    <input type="text" name="categoria" required placeholder="Ej: Entrada, Principal, Postre" value="${data?.categoria || ''}">
                </div>
                <div class="form-group">
                    <label>Tipo:</label>
                    <select name="tipo" required>
                        <option value="plato-carta normal" ${data?.tipo === 'plato-carta normal' ? 'selected' : ''}>Carta Normal</option>
                        <option value="platos-desayuno" ${data?.tipo === 'platos-desayuno' ? 'selected' : ''}>Desayuno</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary">${data ? 'Actualizar' : 'Guardar'}</button>
            </form>
        `;
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
    editingId = null;
}

// ========== FUNCIONES DE UTILIDADES ==========
function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.style.position = 'fixed';
    alert.style.top = '20px';
    alert.style.right = '20px';
    alert.style.zIndex = '9999';
    alert.style.padding = '15px 20px';
    alert.style.borderRadius = '8px';
    alert.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    document.body.appendChild(alert);

    setTimeout(() => {
        alert.remove();
    }, 3000);
}

// Exportar funciones globalmente
window.API_BASE = API_BASE;
window.editingId = editingId;


