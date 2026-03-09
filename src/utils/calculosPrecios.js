/**
 * Utilidad de Cálculos de Precios - Las Gambusinas
 * 
 * Centraliza toda la lógica de cálculos de precios, IGV, redondeo y formateo
 * Utiliza la configuración del sistema para garantizar consistencia
 */

const configuracionRepository = require('../repository/configuracion.repository');
const logger = require('../utils/logger');

// Cache local para evitar múltiples llamadas a la configuración
let cachedConfig = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60000; // 1 minuto

/**
 * Obtiene la configuración de moneda con caché local
 * @returns {Promise<Object>}
 */
const getConfigMonedaCached = async () => {
    const now = Date.now();
    if (cachedConfig && (now - cacheTimestamp) < CACHE_DURATION) {
        return cachedConfig;
    }
    
    cachedConfig = await configuracionRepository.obtenerConfiguracionMoneda();
    cacheTimestamp = now;
    return cachedConfig;
};

/**
 * Invalida el caché local (llamar cuando se actualiza la configuración)
 */
const invalidarCacheLocal = () => {
    cachedConfig = null;
    cacheTimestamp = 0;
};

/**
 * Calcula los totales de un conjunto de platos/items
 * 
 * @param {Array} items - Array de items con { precio, cantidad }
 * @param {Object} config - Configuración de moneda (opcional, se obtiene si no se pasa)
 * @returns {Promise<Object>} Totales calculados
 */
const calcularTotalesItems = async (items, config = null) => {
    try {
        const configMoneda = config || await getConfigMonedaCached();
        
        // Calcular subtotal de items
        const subtotalItems = items.reduce((sum, item) => {
            const precio = Number(item.precio) || 0;
            const cantidad = Number(item.cantidad) || 1;
            return sum + (precio * cantidad);
        }, 0);
        
        return calcularTotales(subtotalItems, configMoneda);
    } catch (error) {
        logger.error('Error al calcular totales de items:', { error: error.message });
        throw error;
    }
};

/**
 * Calcula IGV, subtotal y total a partir de un monto base
 * 
 * @param {number} subtotalBase - Suma de precios * cantidades
 * @param {Object} config - Configuración de moneda (opcional)
 * @returns {Object} { subtotalSinIGV, subtotalConIGV, igv, total, igvPorcentaje, preciosIncluyenIGV }
 */
const calcularTotales = (subtotalBase, config = null) => {
    // Usar valores por defecto si no hay configuración
    const cfg = config || {
        igvPorcentaje: 18,
        preciosIncluyenIGV: false,
        decimales: 2,
        politicaRedondeo: 'total',
        redondearA: 0.01
    };
    
    const igvFactor = cfg.igvPorcentaje / 100;
    let subtotalSinIGV, subtotalConIGV, igv, total;
    
    if (cfg.preciosIncluyenIGV) {
        // Los precios YA incluyen IGV
        subtotalConIGV = subtotalBase;
        // Fórmula para extraer IGV de un precio con IGV incluido:
        // IGV = Precio * (tasa / (1 + tasa))
        igv = subtotalConIGV * (igvFactor / (1 + igvFactor));
        subtotalSinIGV = subtotalConIGV - igv;
        total = subtotalConIGV;
    } else {
        // Los precios NO incluyen IGV (modo clásico)
        subtotalSinIGV = subtotalBase;
        igv = subtotalSinIGV * igvFactor;
        total = subtotalSinIGV + igv;
        subtotalConIGV = total;
    }
    
    // Aplicar redondeo
    const resultado = {
        subtotalSinIGV: redondear(subtotalSinIGV, cfg),
        subtotalConIGV: redondear(subtotalConIGV, cfg),
        igv: redondear(igv, cfg),
        total: redondear(total, cfg),
        igvPorcentaje: cfg.igvPorcentaje,
        preciosIncluyenIGV: cfg.preciosIncluyenIGV,
        nombreImpuesto: cfg.nombreImpuestoPrincipal || 'IGV'
    };
    
    return resultado;
};

/**
 * Aplica redondeo según la política configurada
 * 
 * @param {number} valor - Valor a redondear
 * @param {Object} config - Configuración con decimales y política de redondeo
 * @returns {number} Valor redondeado
 */
const redondear = (valor, config = null) => {
    const cfg = config || { decimales: 2, politicaRedondeo: 'total', redondearA: 0.01 };
    
    const decimales = cfg.decimales || 2;
    const factor = Math.pow(10, decimales);
    
    switch (cfg.politicaRedondeo) {
        case 'banco-peru':
            // Redondeo bancario: al par más cercano
            const multiplicador = 1 / (cfg.redondearA || 0.01);
            return Math.round(valor * multiplicador) / multiplicador;
            
        case 'linea':
            // Redondeo estándar con decimales
            return Math.round(valor * factor) / factor;
            
        case 'total':
        default:
            // Redondeo estándar con decimales
            return Math.round(valor * factor) / factor;
    }
};

/**
 * Formatea un monto según la configuración de moneda
 * 
 * @param {number} monto - Monto a formatear
 * @param {Object} config - Configuración de moneda (opcional)
 * @returns {string} Monto formateado (ej: "S/. 125.50")
 */
const formatearMonto = (monto, config = null) => {
    try {
        const cfg = config || {
            simboloMoneda: 'S/.',
            decimales: 2,
            posicionSimbolo: 'antes',
            formatoSeparadores: { separadorMiles: ',', separadorDecimales: '.' }
        };
        
        const decimales = cfg.decimales || 2;
        const montoNum = Number(monto) || 0;
        const montoFormateado = montoNum.toFixed(decimales);
        
        const partes = montoFormateado.split('.');
        const enteros = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, cfg.formatoSeparadores?.separadorMiles || ',');
        const decimalesParte = partes[1] || '';
        
        const montoConFormato = decimalesParte 
            ? `${enteros}${cfg.formatoSeparadores?.separadorDecimales || '.'}${decimalesParte}`
            : enteros;
        
        return cfg.posicionSimbolo === 'despues'
            ? `${montoConFormato} ${cfg.simboloMoneda}`
            : `${cfg.simboloMoneda} ${montoConFormato}`;
    } catch (error) {
        // Fallback seguro
        return `S/. ${Number(monto || 0).toFixed(2)}`;
    }
};

/**
 * Formatea un monto de forma asíncrona usando la configuración del sistema
 * 
 * @param {number} monto - Monto a formatear
 * @returns {Promise<string>} Monto formateado
 */
const formatearMontoAsync = async (monto) => {
    try {
        const config = await getConfigMonedaCached();
        return formatearMonto(monto, config);
    } catch (error) {
        return `S/. ${Number(monto || 0).toFixed(2)}`;
    }
};

/**
 * Calcula el IGV incluido en un precio (para mostrar en tickets)
 * Útil cuando preciosIncluyenIGV = true
 * 
 * @param {number} precioConIGV - Precio que ya incluye IGV
 * @param {number} igvPorcentaje - Porcentaje de IGV (default 18)
 * @returns {Object} { precioSinIGV, igvIncluido, precioConIGV }
 */
const desglosarIGV = (precioConIGV, igvPorcentaje = 18) => {
    const factor = igvPorcentaje / 100;
    const igvIncluido = precioConIGV * (factor / (1 + factor));
    const precioSinIGV = precioConIGV - igvIncluido;
    
    return {
        precioSinIGV: Math.round(precioSinIGV * 100) / 100,
        igvIncluido: Math.round(igvIncluido * 100) / 100,
        precioConIGV
    };
};

/**
 * Calcula el precio con IGV a partir de un precio sin IGV
 * 
 * @param {number} precioSinIGV - Precio sin IGV
 * @param {number} igvPorcentaje - Porcentaje de IGV (default 18)
 * @returns {Object} { precioSinIGV, igv, precioConIGV }
 */
const agregarIGV = (precioSinIGV, igvPorcentaje = 18) => {
    const factor = igvPorcentaje / 100;
    const igv = precioSinIGV * factor;
    const precioConIGV = precioSinIGV + igv;
    
    return {
        precioSinIGV,
        igv: Math.round(igv * 100) / 100,
        precioConIGV: Math.round(precioConIGV * 100) / 100
    };
};

/**
 * Valida si un monto es válido para operaciones
 * 
 * @param {any} monto - Valor a validar
 * @returns {boolean}
 */
const esMontoValido = (monto) => {
    const num = Number(monto);
    return !isNaN(num) && isFinite(num);
};

/**
 * Convierte un valor a número seguro
 * 
 * @param {any} valor - Valor a convertir
 * @param {number} defecto - Valor por defecto si no es válido
 * @returns {number}
 */
const aNumero = (valor, defecto = 0) => {
    const num = Number(valor);
    return !isNaN(num) && isFinite(num) ? num : defecto;
};

/**
 * Calcula porcentajes de un total
 * Útil para propinas, descuentos, etc.
 * 
 * @param {number} total - Monto base
 * @param {number} porcentaje - Porcentaje a calcular
 * @returns {number} Monto del porcentaje
 */
const calcularPorcentaje = (total, porcentaje) => {
    return (total * porcentaje) / 100;
};

/**
 * Aplica un descuento a un monto
 * 
 * @param {number} monto - Monto original
 * @param {number} descuentoPorcentaje - Porcentaje de descuento
 * @param {number} descuentoMontoFijo - Monto fijo de descuento (alternativo)
 * @returns {Object} { montoOriginal, descuento, montoFinal }
 */
const aplicarDescuento = (monto, descuentoPorcentaje = 0, descuentoMontoFijo = 0) => {
    let descuento = 0;
    
    if (descuentoMontoFijo > 0) {
        descuento = descuentoMontoFijo;
    } else if (descuentoPorcentaje > 0) {
        descuento = (monto * descuentoPorcentaje) / 100;
    }
    
    return {
        montoOriginal: monto,
        descuento: Math.round(descuento * 100) / 100,
        montoFinal: Math.round((monto - descuento) * 100) / 100
    };
};

/**
 * Calcula el vuelto para pagos en efectivo
 * 
 * @param {number} total - Total a pagar
 * @param {number} montoRecibido - Monto recibido del cliente
 * @returns {Object} { total, montoRecibido, vuelto, esExacto }
 */
const calcularVuelto = (total, montoRecibido) => {
    const vuelto = montoRecibido - total;
    
    return {
        total,
        montoRecibido,
        vuelto: Math.round(vuelto * 100) / 100,
        esExacto: vuelto === 0
    };
};

/**
 * Genera un resumen de totales para bouchers
 * Incluye todos los cálculos necesarios
 * 
 * @param {Array} items - Items del boucher
 * @param {Object} opciones - { descuentoPorcentaje, propinaPorcentaje, incluirCargoServicio }
 * @returns {Promise<Object>} Resumen completo de totales
 */
const generarResumenBoucher = async (items, opciones = {}) => {
    try {
        const config = await getConfigMonedaCached();
        
        // Calcular subtotal de items
        const subtotalItems = items.reduce((sum, item) => {
            const precio = aNumero(item.precio);
            const cantidad = aNumero(item.cantidad, 1);
            return sum + (precio * cantidad);
        }, 0);
        
        // Calcular totales base
        const totalesBase = calcularTotales(subtotalItems, config);
        
        let subtotalFinal = totalesBase.subtotalSinIGV;
        let igvFinal = totalesBase.igv;
        let totalFinal = totalesBase.total;
        
        // Aplicar descuento si existe
        let descuento = 0;
        if (opciones.descuentoPorcentaje > 0) {
            descuento = (subtotalFinal * opciones.descuentoPorcentaje) / 100;
            subtotalFinal -= descuento;
            // Recalcular IGV
            igvFinal = subtotalFinal * (config.igvPorcentaje / 100);
            totalFinal = subtotalFinal + igvFinal;
        }
        
        // Aplicar cargo de servicio si está configurado
        let cargoServicio = 0;
        if (opciones.incluirCargoServicio) {
            cargoServicio = (totalFinal * 10) / 100; // 10% por defecto
            totalFinal += cargoServicio;
        }
        
        // Aplicar propina si existe
        let propina = 0;
        if (opciones.propinaPorcentaje > 0) {
            propina = (totalFinal * opciones.propinaPorcentaje) / 100;
            totalFinal += propina;
        }
        
        return {
            subtotalItems: redondear(subtotalItems, config),
            subtotalSinIGV: redondear(subtotalFinal, config),
            igv: redondear(igvFinal, config),
            total: redondear(totalFinal, config),
            descuento: redondear(descuento, config),
            cargoServicio: redondear(cargoServicio, config),
            propina: redondear(propina, config),
            igvPorcentaje: config.igvPorcentaje,
            preciosIncluyenIGV: config.preciosIncluyenIGV,
            nombreImpuesto: config.nombreImpuestoPrincipal || 'IGV',
            moneda: config.moneda,
            simboloMoneda: config.simboloMoneda,
            decimales: config.decimales,
            // Formateados para mostrar
            subtotalFormateado: formatearMonto(subtotalFinal, config),
            igvFormateado: formatearMonto(igvFinal, config),
            totalFormateado: formatearMonto(totalFinal, config)
        };
    } catch (error) {
        logger.error('Error al generar resumen de boucher:', { error: error.message });
        throw error;
    }
};

module.exports = {
    calcularTotalesItems,
    calcularTotales,
    redondear,
    formatearMonto,
    formatearMontoAsync,
    desglosarIGV,
    agregarIGV,
    esMontoValido,
    aNumero,
    calcularPorcentaje,
    aplicarDescuento,
    calcularVuelto,
    generarResumenBoucher,
    invalidarCacheLocal,
    getConfigMonedaCached
};
