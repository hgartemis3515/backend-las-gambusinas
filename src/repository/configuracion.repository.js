/**
 * Repository de Configuración del Sistema - Las Gambusinas
 * 
 * Maneja todas las operaciones de base de datos para la configuración
 */

const ConfiguracionSistema = require('../database/models/configuracionSistema.model');
const redisCache = require('../utils/redisCache');
const logger = require('../utils/logger');

const CACHE_KEY_PREFIX = 'configuracion';
const CACHE_KEY = 'configuracion:sistema';
const CACHE_TTL = 300; // 5 minutos

/**
 * Obtiene la configuración activa del sistema
 * Si no existe, crea una con valores por defecto
 * Utiliza caché para optimizar lecturas
 * 
 * @returns {Promise<Object>} Configuración del sistema
 */
const obtenerConfiguracion = async () => {
    try {
        // Intentar obtener del caché
        const cachedConfig = await redisCache.getCustom(CACHE_KEY_PREFIX, 'sistema');
        if (cachedConfig) {
            logger.debug('Configuración obtenida del caché');
            return cachedConfig;
        }

        // Obtener de la base de datos
        let config = await ConfiguracionSistema.obtenerConfiguracion();
        
        // Convertir a objeto plano
        const configPlain = config.toObject();
        
        // Guardar en caché
        await redisCache.setCustom(CACHE_KEY_PREFIX, 'sistema', configPlain, CACHE_TTL);
        
        return configPlain;
    } catch (error) {
        logger.error('Error al obtener configuración:', { error: error.message });
        throw error;
    }
};

/**
 * Actualiza la configuración del sistema
 * Invalida el caché automáticamente
 * 
 * @param {Object} nuevosDatos - Nuevos datos de configuración
 * @param {string} modificadoPor - ID del usuario que modifica
 * @returns {Promise<Object>} Configuración actualizada
 */
const actualizarConfiguracion = async (nuevosDatos, modificadoPor = null) => {
    try {
        // Validar que los datos sean un objeto
        if (!nuevosDatos || typeof nuevosDatos !== 'object') {
            throw new Error('Los datos de configuración deben ser un objeto válido');
        }

        // Campos que no se pueden modificar directamente
        const camposProtegidos = ['_id', 'createdAt', 'updatedAt', 'version', '__v'];
        
        // Filtrar campos protegidos
        const datosFiltrados = {};
        for (const [key, value] of Object.entries(nuevosDatos)) {
            if (!camposProtegidos.includes(key)) {
                datosFiltrados[key] = value;
            }
        }

        // Validaciones específicas
        if (datosFiltrados.igvPorcentaje !== undefined) {
            if (datosFiltrados.igvPorcentaje < 0 || datosFiltrados.igvPorcentaje > 100) {
                throw new Error('El porcentaje de IGV debe estar entre 0 y 100');
            }
        }

        if (datosFiltrados.decimales !== undefined) {
            if (!Number.isInteger(datosFiltrados.decimales) || datosFiltrados.decimales < 0 || datosFiltrados.decimales > 4) {
                throw new Error('Los decimales deben ser un número entero entre 0 y 4');
            }
        }

        if (datosFiltrados.moneda !== undefined) {
            if (typeof datosFiltrados.moneda !== 'string' || datosFiltrados.moneda.length !== 3) {
                throw new Error('La moneda debe ser un código de 3 caracteres (ej: PEN, USD)');
            }
            datosFiltrados.moneda = datosFiltrados.moneda.toUpperCase();
        }

        // Actualizar la configuración
        const config = await ConfiguracionSistema.findByIdAndUpdate(
            'configuracion_unica',
            {
                $set: {
                    ...datosFiltrados,
                    ultimaModificacionPor: modificadoPor
                }
            },
            {
                new: true,
                runValidators: true,
                upsert: true
            }
        );

        // Invalidar caché
        await invalidarCache();

        logger.info('Configuración actualizada exitosamente', {
            camposModificados: Object.keys(datosFiltrados),
            modificadoPor
        });

        return config.toObject();
    } catch (error) {
        logger.error('Error al actualizar configuración:', { error: error.message });
        throw error;
    }
};

/**
 * Invalida el caché de configuración
 * Debe llamarse después de cualquier actualización
 */
const invalidarCache = async () => {
    try {
        await redisCache.invalidateCustom(CACHE_KEY_PREFIX, 'sistema');
        logger.debug('Caché de configuración invalidado');
    } catch (error) {
        // No lanzar error si falla la invalidación del caché
        logger.warn('Error al invalidar caché de configuración:', { error: error.message });
    }
};

/**
 * Obtiene solo la configuración de moneda y precios
 * Útil para cálculos rápidos
 * 
 * @returns {Promise<Object>} Configuración de moneda y precios
 */
const obtenerConfiguracionMoneda = async () => {
    try {
        const config = await obtenerConfiguracion();
        
        return {
            moneda: config.moneda,
            simboloMoneda: config.simboloMoneda,
            decimales: config.decimales,
            posicionSimbolo: config.posicionSimbolo,
            igvPorcentaje: config.igvPorcentaje,
            preciosIncluyenIGV: config.preciosIncluyenIGV,
            nombreImpuestoPrincipal: config.nombreImpuestoPrincipal,
            politicaRedondeo: config.politicaRedondeo,
            redondearA: config.redondearA,
            formatoSeparadores: config.formatoSeparadores
        };
    } catch (error) {
        logger.error('Error al obtener configuración de moneda:', { error: error.message });
        throw error;
    }
};

/**
 * Obtiene solo los datos fiscales del restaurante
 * Útil para generación de comprobantes
 * 
 * @returns {Promise<Object>} Datos fiscales
 */
const obtenerDatosFiscales = async () => {
    try {
        const config = await obtenerConfiguracion();
        
        return {
            ...config.datosFiscales,
            ruc: config.datosFiscales.ruc,
            pais: config.pais,
            zonaHoraria: config.zonaHoraria
        };
    } catch (error) {
        logger.error('Error al obtener datos fiscales:', { error: error.message });
        throw error;
    }
};

/**
 * Obtiene los métodos de pago activos
 * 
 * @returns {Promise<Object>} Métodos de pago configurados
 */
const obtenerMetodosPago = async () => {
    try {
        const config = await obtenerConfiguracion();
        
        return Object.entries(config.metodosPago)
            .filter(([_, datos]) => datos.activo)
            .reduce((acc, [metodo, datos]) => {
                acc[metodo] = datos;
                return acc;
            }, {});
    } catch (error) {
        logger.error('Error al obtener métodos de pago:', { error: error.message });
        throw error;
    }
};

/**
 * Verifica si un método de pago está habilitado
 * 
 * @param {string} metodo - Nombre del método de pago
 * @returns {Promise<boolean>}
 */
const metodoPagoHabilitado = async (metodo) => {
    try {
        const config = await obtenerConfiguracion();
        const metodoLower = metodo.toLowerCase();
        
        if (!config.metodosPago[metodoLower]) {
            return false;
        }
        
        return config.metodosPago[metodoLower].activo === true;
    } catch (error) {
        logger.error('Error al verificar método de pago:', { error: error.message });
        return false;
    }
};

/**
 * Calcula totales de un boucher usando la configuración actual
 * 
 * @param {number} subtotalPlatos - Suma de precio * cantidad de todos los platos
 * @param {Object} opciones - Opciones adicionales (descuento, propina, etc.)
 * @returns {Promise<Object>} Totales calculados
 */
const calcularTotalesBoucher = async (subtotalPlatos, opciones = {}) => {
    try {
        const config = await obtenerConfiguracion();
        
        // Calcular IGV y totales básicos
        const igvFactor = config.igvPorcentaje / 100;
        let subtotalSinIGV, igv, total, subtotalConIGV;
        
        if (config.preciosIncluyenIGV) {
            subtotalConIGV = subtotalPlatos;
            igv = subtotalConIGV * (igvFactor / (1 + igvFactor));
            subtotalSinIGV = subtotalConIGV - igv;
            total = subtotalConIGV;
        } else {
            subtotalSinIGV = subtotalPlatos;
            igv = subtotalSinIGV * igvFactor;
            total = subtotalSinIGV + igv;
            subtotalConIGV = total;
        }
        
        // Aplicar descuento si existe
        let descuentoMonto = 0;
        if (opciones.descuentoPorcentaje && opciones.descuentoPorcentaje > 0) {
            descuentoMonto = subtotalSinIGV * (opciones.descuentoPorcentaje / 100);
            subtotalSinIGV -= descuentoMonto;
            // Recalcular IGV y total
            igv = subtotalSinIGV * igvFactor;
            total = subtotalSinIGV + igv;
            subtotalConIGV = total;
        }
        
        // Aplicar cargo de servicio si está activo
        let cargoServicio = 0;
        if (config.cargoServicio.activo && !opciones.sinCargoServicio) {
            const baseCalculo = config.cargoServicio.incluyeImpuesto ? total : subtotalSinIGV;
            cargoServicio = baseCalculo * (config.cargoServicio.porcentaje / 100);
            total += cargoServicio;
        }
        
        // Aplicar propina si existe
        let propina = 0;
        if (opciones.propinaPorcentaje && opciones.propinaPorcentaje > 0) {
            propina = total * (opciones.propinaPorcentaje / 100);
            total += propina;
        }
        
        // Función de redondeo
        const redondear = (valor) => {
            const factor = Math.pow(10, config.decimales);
            
            switch (config.politicaRedondeo) {
                case 'banco-peru':
                    // Redondeo bancario
                    const multiplicador = 1 / config.redondearA;
                    return Math.round(valor * multiplicador) / multiplicador;
                default:
                    return Math.round(valor * factor) / factor;
            }
        };
        
        return {
            subtotalSinIGV: redondear(subtotalSinIGV),
            igv: redondear(igv),
            total: redondear(total),
            subtotalConIGV: redondear(subtotalConIGV),
            descuento: redondear(descuentoMonto),
            cargoServicio: redondear(cargoServicio),
            propina: redondear(propina),
            // Metadata
            igvPorcentaje: config.igvPorcentaje,
            preciosIncluyenIGV: config.preciosIncluyenIGV,
            nombreImpuesto: config.nombreImpuestoPrincipal,
            moneda: config.moneda,
            simboloMoneda: config.simboloMoneda,
            decimales: config.decimales
        };
    } catch (error) {
        logger.error('Error al calcular totales:', { error: error.message });
        throw error;
    }
};

/**
 * Formatea un monto según la configuración de moneda
 * 
 * @param {number} monto - Monto a formatear
 * @returns {Promise<string>} Monto formateado
 */
const formatearMonto = async (monto) => {
    try {
        const config = await obtenerConfiguracion();
        const montoFormateado = Number(monto).toFixed(config.decimales);
        const partes = montoFormateado.split('.');
        const enteros = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, config.formatoSeparadores.separadorMiles);
        const decimales = partes[1] || '';
        
        const montoConFormato = decimales 
            ? `${enteros}${config.formatoSeparadores.separadorDecimales}${decimales}`
            : enteros;
        
        return config.posicionSimbolo === 'antes' 
            ? `${config.simboloMoneda} ${montoConFormato}`
            : `${montoConFormato} ${config.simboloMoneda}`;
    } catch (error) {
        // Fallback si falla
        return `S/. ${Number(monto).toFixed(2)}`;
    }
};

module.exports = {
    obtenerConfiguracion,
    actualizarConfiguracion,
    invalidarCache,
    obtenerConfiguracionMoneda,
    obtenerDatosFiscales,
    obtenerMetodosPago,
    metodoPagoHabilitado,
    calcularTotalesBoucher,
    formatearMonto
};
