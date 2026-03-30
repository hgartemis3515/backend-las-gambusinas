/**
 * Validador de Complementos v2.0
 * 
 * Servicio centralizado para validar complementos con soporte de cantidades.
 * Implementa reglas de negocio para:
 * - Grupos obligatorios
 * - Límites de unidades por grupo
 * - Límites de unidades por opción
 * - Compatibilidad legacy con datos antiguos
 * 
 * @author Sistema Las Gambusinas
 * @version 2.0 - Marzo 2026
 */

const logger = require('./logger');

/**
 * Normaliza un grupo de complementos legacy al formato nuevo
 * Para datos antiguos que solo tienen seleccionMultiple sin campos de cantidad
 * 
 * @param {Object} grupo - Grupo de complemento del plato
 * @returns {Object} Grupo normalizado con campos de cantidad
 */
function normalizarGrupoLegacy(grupo) {
    // Si ya tiene modoSeleccion, ya está normalizado
    if (grupo.modoSeleccion) {
        return grupo;
    }

    // Detectar si es legacy (solo tiene seleccionMultiple)
    const esLegacy = grupo.modoSeleccion === undefined;
    
    if (esLegacy) {
        // Inferir reglas de cantidad desde campos legacy
        const modoSeleccion = grupo.seleccionMultiple ? 'cantidades' : 'opciones';
        
        // Si seleccionMultiple = true pero no hay maxUnidadesGrupo, asumir sin límite
        // Si seleccionMultiple = false, equivale a maxUnidadesGrupo = 1
        let maxUnidadesGrupo = grupo.maxUnidadesGrupo;
        if (maxUnidadesGrupo === undefined || maxUnidadesGrupo === null) {
            maxUnidadesGrupo = grupo.seleccionMultiple ? null : 1;
        }

        // minUnidadesGrupo: si es obligatorio, mínimo 1; si no, 0
        let minUnidadesGrupo = grupo.minUnidadesGrupo;
        if (minUnidadesGrupo === undefined || minUnidadesGrupo === null) {
            minUnidadesGrupo = grupo.obligatorio ? 1 : 0;
        }

        return {
            ...grupo,
            modoSeleccion,
            maxUnidadesGrupo,
            minUnidadesGrupo,
            maxUnidadesPorOpcion: grupo.maxUnidadesPorOpcion || (grupo.seleccionMultiple ? null : 1),
            permiteRepetirOpcion: grupo.permiteRepetirOpcion !== undefined ? grupo.permiteRepetirOpcion : grupo.seleccionMultiple,
            _esLegacy: true
        };
    }

    return grupo;
}

/**
 * Normaliza complementos seleccionados legacy al formato nuevo
 * Para datos antiguos que no tienen campo cantidad
 * 
 * @param {Array} complementosSeleccionados - Complementos seleccionados
 * @returns {Array} Complementos con cantidad normalizada
 */
function normalizarSeleccionLegacy(complementosSeleccionados) {
    if (!Array.isArray(complementosSeleccionados)) {
        return [];
    }

    return complementosSeleccionados.map(comp => {
        // Si ya tiene cantidad, usarla
        if (comp.cantidad !== undefined && comp.cantidad !== null) {
            return comp;
        }
        // Si es legacy sin cantidad, asumir cantidad 1
        return {
            grupo: comp.grupo,
            opcion: comp.opcion,
            cantidad: 1,
            _esLegacy: true
        };
    });
}

/**
 * Valida los complementos seleccionados para un plato
 * 
 * @param {Array} complementosPlato - Grupos de complementos del plato (configuración)
 * @param {Array} complementosSeleccionados - Complementos elegidos por el mozo
 * @returns {Object} { valido: boolean, errores: string[], advertencias: string[] }
 */
function validarComplementos(complementosPlato, complementosSeleccionados) {
    const errores = [];
    const advertencias = [];
    
    if (!Array.isArray(complementosPlato) || complementosPlato.length === 0) {
        // El plato no tiene complementos configurados
        return { valido: true, errores: [], advertencias: [] };
    }

    // Normalizar entrada
    const gruposNormalizados = complementosPlato.map(normalizarGrupoLegacy);
    const seleccionNormalizada = normalizarSeleccionLegacy(complementosSeleccionados || []);

    // Agrupar selección por grupo
    const seleccionPorGrupo = {};
    seleccionNormalizada.forEach(comp => {
        if (!seleccionPorGrupo[comp.grupo]) {
            seleccionPorGrupo[comp.grupo] = [];
        }
        seleccionPorGrupo[comp.grupo].push(comp);
    });

    // Validar cada grupo
    for (const grupo of gruposNormalizados) {
        const nombreGrupo = grupo.grupo;
        const seleccionGrupo = seleccionPorGrupo[nombreGrupo] || [];

        // 1. Validar que las opciones existan en el grupo
        const opcionesValidas = grupo.opciones || [];
        for (const comp of seleccionGrupo) {
            if (!opcionesValidas.includes(comp.opcion)) {
                errores.push(`La opción "${comp.opcion}" no existe en el grupo "${nombreGrupo}". Opciones válidas: ${opcionesValidas.join(', ')}`);
            }
        }

        // 2. Calcular total de unidades seleccionadas
        const totalUnidades = seleccionGrupo.reduce((sum, comp) => sum + (comp.cantidad || 1), 0);
        const opcionesUnicas = new Set(seleccionGrupo.map(comp => comp.opcion)).size;

        // 3. Validar obligatoriedad
        if (grupo.obligatorio && totalUnidades === 0) {
            errores.push(`El grupo "${nombreGrupo}" es obligatorio. Debes seleccionar al menos ${grupo.minUnidadesGrupo || 1} unidad(es).`);
        }

        // 4. Validar mínimo de unidades
        if (grupo.minUnidadesGrupo !== null && grupo.minUnidadesGrupo > 0 && totalUnidades < grupo.minUnidadesGrupo) {
            errores.push(`En "${nombreGrupo}" debes seleccionar al menos ${grupo.minUnidadesGrupo} unidad(es). Actual: ${totalUnidades}.`);
        }

        // 5. Validar máximo de unidades del grupo
        if (grupo.maxUnidadesGrupo !== null && totalUnidades > grupo.maxUnidadesGrupo) {
            errores.push(`En "${nombreGrupo}" excediste el máximo de ${grupo.maxUnidadesGrupo} unidad(es). Actual: ${totalUnidades}.`);
        }

        // 6. Validar máximo por opción
        if (grupo.maxUnidadesPorOpcion !== null) {
            for (const comp of seleccionGrupo) {
                if (comp.cantidad > grupo.maxUnidadesPorOpcion) {
                    errores.push(`En "${nombreGrupo}", la opción "${comp.opcion}" excede el máximo de ${grupo.maxUnidadesPorOpcion} unidad(es). Seleccionaste: ${comp.cantidad}.`);
                }
            }
        }

        // 7. Validar si permite repetir opción
        if (!grupo.permiteRepetirOpcion && grupo.modoSeleccion === 'cantidades') {
            for (const comp of seleccionGrupo) {
                if (comp.cantidad > 1) {
                    errores.push(`En "${nombreGrupo}" no se permite repetir la misma opción. "${comp.opcion}" tiene ${comp.cantidad} unidades.`);
                }
            }
        }

        // 8. Advertencia para grupos legacy (información para el mozo)
        if (grupo._esLegacy) {
            advertencias.push(`El grupo "${nombreGrupo}" usa configuración legacy. Considera actualizar para usar cantidades explícitas.`);
        }
    }

    // Validar que no haya grupos extraños no definidos en el plato
    const gruposDefinidos = new Set(gruposNormalizados.map(g => g.grupo));
    for (const grupoNombre of Object.keys(seleccionPorGrupo)) {
        if (!gruposDefinidos.has(grupoNombre)) {
            errores.push(`El grupo "${grupoNombre}" no está definido para este plato.`);
        }
    }

    return {
        valido: errores.length === 0,
        errores,
        advertencias
    };
}

/**
 * Valida un payload completo de platos con complementos
 * Útil para validar comandas antes de crear/actualizar
 * 
 * @param {Object} platoCompleto - { plato: ObjectId, complementosSeleccionados: [], notaEspecial: '' }
 * @param {Object} platoData - Datos del plato desde la BD (con complementos configurados)
 * @returns {Object} { valido: boolean, errores: string[] }
 */
function validarPlatoEnComanda(platoCompleto, platoData) {
    if (!platoData) {
        return { valido: false, errores: ['Plato no encontrado en la base de datos'] };
    }

    const complementosPlato = platoData.complementos || [];
    const complementosSeleccionados = platoCompleto.complementosSeleccionados || [];

    return validarComplementos(complementosPlato, complementosSeleccionados);
}

/**
 * Genera un resumen legible de los complementos seleccionados
 * Útil para mostrar en KDS, tickets, y visualización
 * 
 * @param {Array} complementosSeleccionados - Complementos elegidos
 * @param {boolean} incluirCantidad - Si mostrar cantidad explícita
 * @returns {string} Resumen formateado
 */
function formatearComplementosSeleccionados(complementosSeleccionados, incluirCantidad = true) {
    const normalizados = normalizarSeleccionLegacy(complementosSeleccionados || []);

    if (normalizados.length === 0) {
        return '';
    }

    // Agrupar por grupo
    const porGrupo = {};
    normalizados.forEach(comp => {
        if (!porGrupo[comp.grupo]) {
            porGrupo[comp.grupo] = [];
        }
        porGrupo[comp.grupo].push(comp);
    });

    // Formatear
    const partes = [];
    for (const [grupo, opciones] of Object.entries(porGrupo)) {
        const opcionesStr = opciones.map(comp => {
            if (incluirCantidad && comp.cantidad > 1) {
                return `${comp.opcion} x${comp.cantidad}`;
            }
            return comp.opcion;
        }).join(', ');
        partes.push(`${grupo}: ${opcionesStr}`);
    }

    return partes.join(' | ');
}

/**
 * Calcula el estado de validación de un grupo para UI
 * Retorna información útil para mostrar feedback al usuario
 * 
 * @param {Object} grupo - Grupo de complemento normalizado
 * @param {Array} seleccionGrupo - Complementos seleccionados para este grupo
 * @returns {Object} { esValido, unidadesActuales, unidadesRestantes, mensaje }
 */
function calcularEstadoGrupo(grupo, seleccionGrupo) {
    const grupoNormalizado = normalizarGrupoLegacy(grupo);
    const seleccionNormalizada = normalizarSeleccionLegacy(seleccionGrupo || []);

    const totalUnidades = seleccionNormalizada.reduce((sum, comp) => sum + (comp.cantidad || 1), 0);
    const minUnidades = grupoNormalizado.minUnidadesGrupo || (grupoNormalizado.obligatorio ? 1 : 0);
    const maxUnidades = grupoNormalizado.maxUnidadesGrupo;

    let esValido = true;
    let mensaje = '';

    if (totalUnidades < minUnidades) {
        esValido = false;
        mensaje = `Faltan ${minUnidades - totalUnidades} unidad(es) - Mínimo: ${minUnidades}`;
    } else if (maxUnidades !== null && totalUnidades > maxUnidades) {
        esValido = false;
        mensaje = `Excedido por ${totalUnidades - maxUnidades} unidad(es) - Máximo: ${maxUnidades}`;
    } else if (maxUnidades !== null && totalUnidades === maxUnidades) {
        mensaje = `Máximo alcanzado (${maxUnidades} unidades)`;
    } else if (totalUnidades >= minUnidades && minUnidades > 0) {
        mensaje = `Mínimo cumplido (${totalUnidades}/${maxUnidades !== null ? maxUnidades : '∞'})`;
    } else {
        mensaje = `${totalUnidades} unidad(es) seleccionada(s)`;
    }

    return {
        esValido,
        unidadesActuales: totalUnidades,
        unidadesRestantes: maxUnidades !== null ? maxUnidades - totalUnidades : null,
        minUnidades,
        maxUnidades,
        mensaje
    };
}

module.exports = {
    normalizarGrupoLegacy,
    normalizarSeleccionLegacy,
    validarComplementos,
    validarPlatoEnComanda,
    formatearComplementosSeleccionados,
    calcularEstadoGrupo
};
