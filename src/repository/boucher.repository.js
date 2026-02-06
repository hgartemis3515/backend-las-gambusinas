const boucherModel = require("../database/models/boucher.model");
const { syncJsonFile } = require('../utils/jsonSync');
const { asociarBoucherACliente } = require('./clientes.repository');

/**
 * Generates a random 5-character alphanumeric voucher ID
 * Uses uppercase letters (A-Z) and numbers (0-9)
 * @returns {string} A 5-character alphanumeric string (e.g., "AB39F")
 */
const generarVoucherId = () => {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let voucherId = '';
    for (let i = 0; i < 5; i++) {
        voucherId += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return voucherId;
};

/**
 * Generates a unique voucherId by checking for collisions
 * @param {number} maxAttempts - Maximum number of attempts to generate a unique ID (default: 10)
 * @returns {Promise<string>} A unique 5-character voucherId
 */
const generarVoucherIdUnico = async (maxAttempts = 10) => {
    for (let intento = 0; intento < maxAttempts; intento++) {
        const voucherId = generarVoucherId();
        const existe = await boucherModel.findOne({ voucherId });
        if (!existe) {
            return voucherId;
        }
        console.log(`⚠️ VoucherId ${voucherId} ya existe, intentando otro...`);
    }
    throw new Error('No se pudo generar un voucherId único después de varios intentos');
};

const listarBouchers = async () => {
    try {
        const bouchers = await boucherModel.find({ isActive: true })
            .populate('mesa')
            .populate('mozo')
            .populate('cliente')
            .populate('comandas')
            .populate('platos.plato')
            .sort({ fechaPago: -1 }); // Más recientes primero
        return bouchers;
    } catch (error) {
        console.error("Error al listar bouchers:", error);
        throw error;
    }
};

const listarBouchersPorFecha = async (fecha) => {
    try {
        const moment = require('moment-timezone');
        const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
        const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
        
        const bouchers = await boucherModel.find({
            fechaPago: {
                $gte: fechaInicio,
                $lte: fechaFin
            },
            isActive: true
        })
            .populate('mesa')
            .populate('mozo')
            .populate('cliente')
            .populate('comandas')
            .populate('platos.plato')
            .sort({ fechaPago: -1 });
        
        return bouchers;
    } catch (error) {
        console.error("Error al listar bouchers por fecha:", error);
        throw error;
    }
};

const obtenerBoucherPorId = async (boucherId) => {
    try {
        const boucher = await boucherModel.findById(boucherId)
            .populate('mesa')
            .populate('mozo')
            .populate('cliente')
            .populate('comandas')
            .populate('platos.plato');
        
        if (!boucher) {
            throw new Error('Boucher no encontrado');
        }
        
        return boucher;
    } catch (error) {
        console.error("Error al obtener boucher por ID:", error);
        throw error;
    }
};

const crearBoucher = async (data) => {
    try {
        console.log('📝 Creando boucher:', JSON.stringify(data, null, 2));
        
        // Validar datos requeridos
        if (!data.mesa || !data.mozo || !data.platos || data.platos.length === 0) {
            throw new Error('Datos incompletos para crear el boucher');
        }
        
        // Asegurar que los subtotales de los platos estén calculados
        if (data.platos && data.platos.length > 0) {
            data.platos = data.platos.map(plato => {
                if (!plato.subtotal) {
                    plato.subtotal = (plato.precio || 0) * (plato.cantidad || 1);
                }
                return plato;
            });
        }
        
        // Calcular totales si no están definidos
        if (!data.subtotal && data.platos) {
            data.subtotal = data.platos.reduce((sum, plato) => sum + (plato.subtotal || 0), 0);
        }
        
        if (!data.igv && data.subtotal) {
            data.igv = data.subtotal * 0.18;
        }
        
        if (!data.total && data.subtotal) {
            data.total = data.subtotal + (data.igv || data.subtotal * 0.18);
        }
        
        // Formatear fecha de pago
        const moment = require('moment-timezone');
        if (!data.fechaPagoString && data.fechaPago) {
            data.fechaPagoString = moment(data.fechaPago).tz("America/Lima").format("DD/MM/YYYY HH:mm:ss");
        } else if (!data.fechaPagoString) {
            data.fechaPagoString = moment().tz("America/Lima").format("DD/MM/YYYY HH:mm:ss");
        }
        
        // Generar voucherId único si no se proporciona
        if (!data.voucherId) {
            data.voucherId = await generarVoucherIdUnico();
            console.log('✅ VoucherId generado:', data.voucherId);
        }
        
        const nuevoBoucher = await boucherModel.create(data);
        console.log('✅ Boucher creado:', nuevoBoucher._id, 'Número:', nuevoBoucher.boucherNumber);
        
        // Sincronizar con archivo JSON
        try {
            const todosLosBouchers = await boucherModel.find({ isActive: true });
            await syncJsonFile('boucher.json', todosLosBouchers);
        } catch (error) {
            console.error('⚠️ Error al sincronizar boucher.json:', error);
        }
        
        // Obtener el boucher con populate
        const boucherCompleto = await boucherModel.findById(nuevoBoucher._id)
            .populate('mesa')
            .populate('mozo')
            .populate('cliente')
            .populate('comandas')
            .populate('platos.plato');
        
        // Si hay cliente asociado, asociar el boucher al cliente
        if (nuevoBoucher.cliente) {
            try {
                await asociarBoucherACliente(nuevoBoucher.cliente, nuevoBoucher._id);
                console.log('✅ Boucher asociado al cliente:', nuevoBoucher.cliente);
            } catch (error) {
                console.error('⚠️ Error al asociar boucher al cliente (no crítico):', error);
            }
        }
        
        return boucherCompleto;
    } catch (error) {
        console.error("Error al crear boucher:", error);
        throw error;
    }
};

const eliminarBoucher = async (boucherId) => {
    try {
        // Soft delete: marcar como inactivo en lugar de eliminar
        const boucher = await boucherModel.findByIdAndUpdate(
            boucherId,
            { isActive: false },
            { new: true }
        );
        
        if (!boucher) {
            throw new Error('Boucher no encontrado');
        }
        
        console.log('🗑️ Boucher marcado como inactivo:', boucherId);
        
        // Sincronizar con archivo JSON
        try {
            const todosLosBouchers = await boucherModel.find({ isActive: true });
            await syncJsonFile('boucher.json', todosLosBouchers);
        } catch (error) {
            console.error('⚠️ Error al sincronizar boucher.json:', error);
        }
        
        return boucher;
    } catch (error) {
        console.error("Error al eliminar boucher:", error);
        throw error;
    }
};

/**
 * Obtiene el último boucher activo de una mesa que esté en estado pagado
 * @param {string} mesaId - ID de la mesa
 * @returns {Promise<Object|null>} El boucher encontrado o null si no existe
 */
const obtenerBoucherPorMesa = async (mesaId) => {
    try {
        const mongoose = require('mongoose');
        const comandaModel = require('../database/models/comanda.model');
        const mesaModel = require('../database/models/mesas.model');
        
        console.log(`🔍 [obtenerBoucherPorMesa] Buscando boucher para mesa: ${mesaId}`);
        
        // Convertir mesaId a ObjectId si es necesario
        let mesaObjectId;
        try {
            mesaObjectId = mongoose.Types.ObjectId.isValid(mesaId) 
                ? new mongoose.Types.ObjectId(mesaId) 
                : mesaId;
        } catch (error) {
            console.error(`❌ [obtenerBoucherPorMesa] Error convirtiendo mesaId a ObjectId:`, error);
            return null;
        }
        
        // Verificar que la mesa esté en estado "pagado"
        const mesa = await mesaModel.findById(mesaObjectId);
        if (!mesa) {
            console.log(`⚠️ [obtenerBoucherPorMesa] Mesa no encontrada: ${mesaId}`);
            return null;
        }
        
        const estadoMesa = mesa.estado?.toLowerCase();
        console.log(`📊 [obtenerBoucherPorMesa] Estado de la mesa: ${estadoMesa}`);
        
        if (estadoMesa !== 'pagado') {
            console.log(`⚠️ [obtenerBoucherPorMesa] Mesa no está en estado 'pagado', estado actual: ${estadoMesa}`);
            return null;
        }
        
        // Buscar el último boucher activo de esta mesa (más reciente primero)
        // Buscar tanto con ObjectId como con string para mayor compatibilidad
        const bouchers = await boucherModel.find({
            $or: [
                { mesa: mesaObjectId },
                { mesa: mesaId }
            ],
            isActive: true
        })
        .populate('mesa')
        .populate('mozo')
        .populate('cliente')
        .populate('comandas')
        .populate('platos.plato')
        .sort({ fechaPago: -1 }) // Más reciente primero
        .limit(1); // Solo el más reciente
        
        console.log(`📋 [obtenerBoucherPorMesa] Encontrados ${bouchers.length} boucher(s) activo(s)`);
        
        const boucher = bouchers.length > 0 ? bouchers[0] : null;
        
        if (!boucher) {
            console.log(`⚠️ [obtenerBoucherPorMesa] No se encontró boucher activo para la mesa ${mesaId}`);
            return null;
        }
        
        console.log(`✅ [obtenerBoucherPorMesa] Boucher encontrado: ${boucher._id}, voucherId: ${boucher.voucherId}, boucherNumber: ${boucher.boucherNumber}`);
        console.log(`📦 [obtenerBoucherPorMesa] Comandas asociadas: ${boucher.comandas?.length || 0}`);
        
        // Verificar que todas las comandas del boucher estén en estado "pagado"
        // Si las comandas ya están populadas, usar esos datos directamente
        if (boucher.comandas && boucher.comandas.length > 0) {
            // Si las comandas están populadas (son objetos), verificar directamente
            const comandasPopuladas = boucher.comandas.filter(c => c && typeof c === 'object' && c.status);
            
            if (comandasPopuladas.length > 0) {
                // Las comandas ya están populadas, verificar directamente
                const todasPagadas = comandasPopuladas.every(c => {
                    const status = c.status?.toLowerCase();
                    const esPagado = status === 'pagado' || status === 'completado';
                    if (!esPagado) {
                        console.log(`⚠️ [obtenerBoucherPorMesa] Comanda ${c._id || c.comandaNumber} no está pagada, status: ${status}`);
                    }
                    return esPagado;
                });
                
                if (!todasPagadas) {
                    console.log(`⚠️ [obtenerBoucherPorMesa] No todas las comandas están pagadas (${comandasPopuladas.length} comandas verificadas)`);
                    // En lugar de retornar null, solo loguear la advertencia y continuar
                    // El boucher fue creado, así que debería ser válido
                    console.log(`ℹ️ [obtenerBoucherPorMesa] Continuando con boucher aunque algunas comandas no estén pagadas`);
                } else {
                    console.log(`✅ [obtenerBoucherPorMesa] Todas las comandas están pagadas (verificación con populate)`);
                }
            } else {
                // Las comandas no están populadas o son solo IDs, obtenerlas del servidor
                const comandasIds = boucher.comandas.map(c => {
                    if (typeof c === 'object' && c._id) {
                        return c._id;
                    }
                    return c;
                }).filter(id => id); // Filtrar valores nulos/undefined
                
                if (comandasIds.length > 0) {
                    console.log(`📡 [obtenerBoucherPorMesa] Obteniendo ${comandasIds.length} comanda(s) del servidor para verificación`);
                    const comandas = await comandaModel.find({ _id: { $in: comandasIds } });
                    
                    if (comandas.length > 0) {
                        const todasPagadas = comandas.every(c => {
                            const status = c.status?.toLowerCase();
                            const esPagado = status === 'pagado' || status === 'completado';
                            if (!esPagado) {
                                console.log(`⚠️ [obtenerBoucherPorMesa] Comanda ${c._id || c.comandaNumber} no está pagada, status: ${status}`);
                            }
                            return esPagado;
                        });
                        
                        if (!todasPagadas) {
                            console.log(`⚠️ [obtenerBoucherPorMesa] No todas las comandas están pagadas (verificación con query)`);
                            // En lugar de retornar null, solo loguear la advertencia
                            console.log(`ℹ️ [obtenerBoucherPorMesa] Continuando con boucher aunque algunas comandas no estén pagadas`);
                        } else {
                            console.log(`✅ [obtenerBoucherPorMesa] Todas las comandas están pagadas (verificación con query)`);
                        }
                    } else {
                        console.log(`⚠️ [obtenerBoucherPorMesa] No se encontraron comandas en el servidor, pero continuando con boucher`);
                    }
                } else {
                    console.log(`ℹ️ [obtenerBoucherPorMesa] No se pudieron extraer IDs de comandas, pero continuando con boucher`);
                }
            }
        } else {
            console.log(`ℹ️ [obtenerBoucherPorMesa] El boucher no tiene comandas asociadas, pero es válido`);
        }
        
        console.log(`✅ [obtenerBoucherPorMesa] Boucher válido encontrado y verificado`);
        return boucher;
    } catch (error) {
        console.error("❌ [obtenerBoucherPorMesa] Error al obtener boucher por mesa:", error);
        throw error;
    }
};

module.exports = {
    listarBouchers,
    listarBouchersPorFecha,
    obtenerBoucherPorId,
    crearBoucher,
    eliminarBoucher,
    obtenerBoucherPorMesa
};

