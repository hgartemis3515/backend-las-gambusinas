const boucherModel = require("../database/models/boucher.model");
const {
    obtenerCicloServicioMesa,
    intersectarComandaIds,
    filtrarBouchersPorCiclo,
} = require('../services/mesaCicloServicio.service');
const { syncJsonFile } = require('../utils/jsonSync');
const { asociarBoucherACliente } = require('./clientes.repository');
const configuracionRepository = require('./configuracion.repository');
const calculosPrecios = require('../utils/calculosPrecios');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '../../data');

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
        // El dashboard de vouchers debe mostrar todos los comprobantes (incluidos
        // los de mesas ya liberadas, que se marcan isActive=false por
        // desactivarBouchersHistoricosMesa). El soft-delete manual (eliminarBoucher)
        // se seguirá respetando en otros flujos, pero aquí mostramos el historial completo.
        const bouchers = await boucherModel.find({})
            .populate('mesa')
            .populate('mozo')
            .populate('cliente')
            .populate('comandas')
            .populate('platos.plato')
            .populate('platos.cocineroId') // Poblar información del cocinero
            .populate('pedido', 'pedidoId estado numMesa fechaApertura fechaPago') // Poblar pedido para agrupación en dashboard
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
            }
        })
            .populate('mesa')
            .populate('mozo')
            .populate('cliente')
            .populate('comandas')
            .populate('platos.plato')
            .populate('platos.cocineroId') // Poblar información del cocinero
            .populate('pedido', 'pedidoId estado numMesa fechaApertura fechaPago') // Poblar pedido para agrupación en dashboard
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
            .populate('platos.plato')
            .populate('platos.cocineroId'); // Poblar información del cocinero
        
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
        
        // Obtener configuración de moneda y precios
        const configMoneda = await configuracionRepository.obtenerConfiguracionMoneda();
        
        // Asegurar que los subtotales de los platos estén calculados
        if (data.platos && data.platos.length > 0) {
            data.platos = data.platos.map(plato => {
                if (!plato.subtotal) {
                    plato.subtotal = (plato.precio || 0) * (plato.cantidad || 1);
                }
                return plato;
            });
        }
        
        // Calcular totales si no están definidos usando la configuración
        if (!data.subtotal && data.platos) {
            data.subtotal = data.platos.reduce((sum, plato) => sum + (plato.subtotal || 0), 0);
        }
        
        // Usar la utilidad centralizada para calcular IGV y totales
        const totales = calculosPrecios.calcularTotales(data.subtotal || 0, configMoneda);
        
        // FIX: Usar == null para no sobreescribir 0 válido (descuento 100%)
        if (data.igv == null) {
            data.igv = totales.igv;
        }

        if (data.total == null) {
            data.total = totales.total;
        }
        
        // Guardar snapshot de configuración para auditoría
        data.configuracionIGV = {
            igvPorcentaje: configMoneda.igvPorcentaje,
            preciosIncluyenIGV: configMoneda.preciosIncluyenIGV,
            nombreImpuesto: configMoneda.nombreImpuestoPrincipal || 'IGV',
            moneda: configMoneda.moneda,
            simboloMoneda: configMoneda.simboloMoneda
        };
        
        // Formatear fecha de pago
        const moment = require('moment-timezone');
        if (!data.fechaPagoString && data.fechaPago) {
            data.fechaPagoString = moment(data.fechaPago).tz(configMoneda.zonaHoraria || "America/Lima").format("DD/MM/YYYY HH:mm:ss");
        } else if (!data.fechaPagoString) {
            data.fechaPagoString = moment().tz(configMoneda.zonaHoraria || "America/Lima").format("DD/MM/YYYY HH:mm:ss");
        }
        
        // Generar voucherId único si no se proporciona
        if (!data.voucherId) {
            data.voucherId = await generarVoucherIdUnico();
            console.log('✅ VoucherId generado:', data.voucherId);
        }
        
        const nuevoBoucher = await boucherModel.create(data);
        console.log('✅ Boucher creado:', nuevoBoucher._id, 'Número:', nuevoBoucher.boucherNumber);
        console.log(`💰 Totales - Subtotal: ${data.subtotal}, IGV (${configMoneda.igvPorcentaje}%): ${data.igv}, Total: ${data.total}`);
        
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
            .populate('platos.plato')
            .populate('platos.cocineroId'); // Poblar información del cocinero
        
        // Si hay cliente asociado, asociar el boucher al cliente
        if (nuevoBoucher.cliente) {
            try {
                await asociarBoucherACliente(nuevoBoucher.cliente, nuevoBoucher._id);
                console.log('✅ Boucher asociado al cliente:', nuevoBoucher.cliente);
            } catch (error) {
                console.error('⚠️ Error al asociar boucher al cliente (no crítico):', error);
            }
        }
        
        // FASE 9: Emitir evento para actualización de reportes en tiempo real
        if (global.emitReporteBoucherNuevo) {
            try {
                await global.emitReporteBoucherNuevo(boucherCompleto);
                console.log('✅ Evento reportes:boucher-nuevo emitido');
            } catch (error) {
                console.error('⚠️ Error al emitir evento reportes:boucher-nuevo (no crítico):', error);
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
 * Une varios bouchers (pagos parciales) en uno solo para impresión / vista en mozos.
 * @param {Array} bouchers - Ordenados por fechaPago ascendente
 * @returns {Object|null}
 */
const consolidarBouchersMesa = (bouchers) => {
    if (!bouchers || bouchers.length === 0) return null;
    if (bouchers.length === 1) {
        const uno = bouchers[0].toObject ? bouchers[0].toObject() : bouchers[0];
        return uno;
    }

    const ordenados = [...bouchers].sort(
        (a, b) => new Date(a.fechaPago || 0) - new Date(b.fechaPago || 0)
    );
    const base = ordenados[ordenados.length - 1];
    const baseObj = base.toObject ? base.toObject({ virtuals: true }) : { ...base };

    const platos = [];
    const comandasMap = new Map();
    const comandasNumbers = new Set();
    const descuentos = [];
    let subtotal = 0;
    let igv = 0;
    let total = 0;
    let totalSinDescuento = 0;
    let montoDescuento = 0;
    let totalConDescuento = 0;

    for (const b of ordenados) {
        const bObj = b.toObject ? b.toObject({ virtuals: true }) : b;
        platos.push(...(bObj.platos || []));
        (bObj.comandas || []).forEach((c) => {
            const id = (c?._id || c)?.toString?.();
            if (id && !comandasMap.has(id)) comandasMap.set(id, c);
        });
        (bObj.comandasNumbers || []).forEach((n) => {
            if (n != null) comandasNumbers.add(n);
        });
        (bObj.descuentos || []).forEach((d) => descuentos.push(d));
        subtotal += Number(bObj.subtotal) || 0;
        igv += Number(bObj.igv) || 0;
        total += Number(bObj.total) || 0;
        totalSinDescuento += Number(bObj.totalSinDescuento) || Number(bObj.subtotal) || 0;
        montoDescuento += Number(bObj.montoDescuento) || 0;
        totalConDescuento += Number(bObj.totalConDescuento) || Number(bObj.total) || 0;
    }

    return {
        ...baseObj,
        platos,
        comandas: [...comandasMap.values()],
        comandasNumbers: [...comandasNumbers],
        descuentos,
        subtotal: Number(subtotal.toFixed(2)),
        igv: Number(igv.toFixed(2)),
        total: Number(total.toFixed(2)),
        totalSinDescuento: Number(totalSinDescuento.toFixed(2)),
        montoDescuento: Number(montoDescuento.toFixed(2)),
        totalConDescuento: Number(totalConDescuento.toFixed(2)),
        esPagoParcial: ordenados.some((b) => b.esPagoParcial === true) || ordenados.length > 1,
        esConsolidado: true,
        cantidadBouchersConsolidados: ordenados.length,
        bouchersConsolidados: ordenados.map((b) => ({
            _id: b._id,
            boucherNumber: b.boucherNumber,
            voucherId: b.voucherId,
            total: b.total,
            fechaPago: b.fechaPago,
        })),
        bouchersParciales: ordenados.map((b) =>
            b.toObject ? b.toObject({ virtuals: true }) : { ...b }
        ),
    };
};

const toBoucherPlain = (doc) =>
    doc?.toObject ? doc.toObject({ virtuals: true }) : { ...doc };

/**
 * Lista bouchers activos de una mesa (cada pago parcial), sin consolidar.
 * @param {string} mesaId
 * @param {{ comandaIds?: string[] }} [opts]
 */
const listarBouchersActivosPorMesa = async (mesaId, opts = {}) => {
    const mongoose = require('mongoose');
    let mesaObjectId;
    try {
        mesaObjectId = mongoose.Types.ObjectId.isValid(mesaId)
            ? new mongoose.Types.ObjectId(mesaId)
            : mesaId;
    } catch {
        return [];
    }

    const ciclo = await obtenerCicloServicioMesa(mesaId);
    const comandaIdsEfectivos = intersectarComandaIds(ciclo, opts.comandaIds);

    if (!ciclo.pedidoId && !comandaIdsEfectivos.length) {
        console.log(
            `ℹ️ [listarBouchersActivosPorMesa] Mesa ${mesaId}: sin pedido ni comandas en ciclo (${ciclo.tipo})`
        );
        return [];
    }

    const populateOpts = [
        { path: 'mesa' },
        { path: 'mozo' },
        { path: 'cliente' },
        { path: 'comandas' },
        { path: 'platos.plato' },
        { path: 'platos.cocineroId' },
        { path: 'pedido', select: 'pedidoId estado fechaApertura' },
    ];

    if (ciclo.pedidoId && mongoose.Types.ObjectId.isValid(ciclo.pedidoId)) {
        const pedidoOid = new mongoose.Types.ObjectId(ciclo.pedidoId);
        const porPedido = await boucherModel
            .find({ pedido: pedidoOid, isActive: true })
            .populate(populateOpts)
            .sort({ fechaPago: 1 });

        if (porPedido.length > 0) {
            console.log(
                `📋 [listarBouchersActivosPorMesa] Mesa ${mesaId}: pedido=${ciclo.pedidoId}, ${porPedido.length} voucher(s)`
            );
            return porPedido.map(toBoucherPlain);
        }
    }

    const todosBouchers = await boucherModel
        .find({
            $or: [{ mesa: mesaObjectId }, { mesa: mesaId }],
            isActive: true,
        })
        .populate(populateOpts)
        .sort({ fechaPago: 1 });

    const filtrados = filtrarBouchersPorCiclo(
        todosBouchers,
        ciclo,
        comandaIdsEfectivos
    );

    console.log(
        `📋 [listarBouchersActivosPorMesa] Mesa ${mesaId}: ciclo=${ciclo.tipo}, legacy ${todosBouchers.length} activo(s), ${filtrados.length} del ciclo`
    );

    return filtrados.map(toBoucherPlain);
};

/**
 * Obtiene el boucher consolidado de una mesa pagada (todos los pagos parciales).
 * @param {string} mesaId - ID de la mesa
 * @returns {Promise<Object|null>} El boucher consolidado o null si no existe
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
        
        const ciclo = await obtenerCicloServicioMesa(mesaId);
        const comandaIdsCiclo = ciclo.comandaIds || [];

        const populateOpts = [
            { path: 'mesa' },
            { path: 'mozo' },
            { path: 'cliente' },
            { path: 'comandas' },
            { path: 'platos.plato' },
            { path: 'platos.cocineroId' },
            { path: 'pedido', select: 'pedidoId estado' },
        ];

        let bouchersFiltrados = [];

        if (ciclo.pedidoId && mongoose.Types.ObjectId.isValid(ciclo.pedidoId)) {
            const pedidoOid = new mongoose.Types.ObjectId(ciclo.pedidoId);
            bouchersFiltrados = await boucherModel
                .find({ pedido: pedidoOid, isActive: true })
                .populate(populateOpts)
                .sort({ fechaPago: 1 });
        }

        if (!bouchersFiltrados.length) {
            if (!ciclo.pedidoId && !comandaIdsCiclo.length) {
                console.log(
                    `⚠️ [obtenerBoucherPorMesa] Sin pedido ni comandas en ciclo (${ciclo.tipo})`
                );
                return null;
            }

            const todosBouchers = await boucherModel
                .find({
                    $or: [{ mesa: mesaObjectId }, { mesa: mesaId }],
                    isActive: true,
                })
                .populate(populateOpts)
                .sort({ fechaPago: 1 });

            const estadosPermitidos = ['pagado', 'pagando'];
            if (!estadosPermitidos.includes(estadoMesa)) {
                if (todosBouchers.length === 0) {
                    console.log(
                        `⚠️ [obtenerBoucherPorMesa] Mesa en '${estadoMesa}' sin bouchers del ciclo (${ciclo.tipo})`
                    );
                    return null;
                }
                console.log(
                    `ℹ️ [obtenerBoucherPorMesa] Mesa en '${estadoMesa}' — ciclo ${ciclo.tipo}`
                );
            }

            bouchersFiltrados = filtrarBouchersPorCiclo(
                todosBouchers,
                ciclo,
                comandaIdsCiclo
            );
        }

        if (!bouchersFiltrados.length) {
            console.log(
                `⚠️ [obtenerBoucherPorMesa] Ningún boucher coincide con el ciclo ${ciclo.tipo}`
            );
            return null;
        }

        console.log(
            `📋 [obtenerBoucherPorMesa] ciclo=${ciclo.tipo}, pedido=${ciclo.pedidoId || '—'}, ${bouchersFiltrados.length} del ciclo`
        );

        const boucher = consolidarBouchersMesa(bouchersFiltrados);
        
        if (!boucher) {
            console.log(`⚠️ [obtenerBoucherPorMesa] No se encontró boucher activo para la mesa ${mesaId}`);
            return null;
        }

        const platosCount = boucher.platos?.length || 0;
        console.log(
            `✅ [obtenerBoucherPorMesa] Boucher listo: ${boucher._id}, platos: ${platosCount}, consolidado: ${!!boucher.esConsolidado}`
        );
        console.log(`📦 [obtenerBoucherPorMesa] Comandas asociadas: ${boucher.comandas?.length || 0}`);

        // Verificar que todas las comandas del boucher estén en estado "pagado"
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

        const bouchersParciales = bouchersFiltrados.map(toBoucherPlain);
        if (boucher.esConsolidado) {
            return { ...boucher, bouchersParciales };
        }
        if (bouchersParciales.length > 0) {
            return { ...boucher, bouchersParciales };
        }
        return boucher;
    } catch (error) {
        console.error("❌ [obtenerBoucherPorMesa] Error al obtener boucher por mesa:", error);
        throw error;
    }
};

/**
 * Importa bouchers desde data/boucher.json. Reemplaza refs de plato por _id actual en BD.
 */
const importarBoucherDesdeJSON = async () => {
    try {
        const filePath = path.join(DATA_DIR, 'boucher.json');
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Archivo boucher.json no encontrado');
            return { imported: 0, updated: 0, errors: 0 };
        }
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(jsonData)) {
            console.log('⚠️ boucher.json no contiene un array válido');
            return { imported: 0, updated: 0, errors: 0 };
        }
        const platoModel = require('../database/models/plato.model');
        const platos = await platoModel.find({}).select('id _id').lean();
        const platoIdMap = new Map();
        platos.forEach(p => { if (p.id != null) platoIdMap.set(Number(p.id), p._id); });
        const toObjId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);
        let imported = 0, errors = 0;
        for (const item of jsonData) {
            try {
                const existente = await boucherModel.findOne({ voucherId: item.voucherId });
                if (existente) continue;
                const platosArr = (item.platos || []).map(p => ({
                    plato: platoIdMap.get(Number(p.platoId)) || toObjId(p.plato),
                    platoId: p.platoId,
                    nombre: p.nombre,
                    precio: p.precio,
                    cantidad: p.cantidad ?? 1,
                    subtotal: p.subtotal,
                    comandaNumber: p.comandaNumber
                }));
                await boucherModel.create({
                    _id: toObjId(item._id),
                    voucherId: item.voucherId,
                    mesa: toObjId(item.mesa),
                    numMesa: item.numMesa,
                    mozo: toObjId(item.mozo),
                    nombreMozo: item.nombreMozo,
                    cliente: toObjId(item.cliente),
                    usadoEnComanda: toObjId(item.usadoEnComanda),
                    fechaUso: item.fechaUso ? new Date(item.fechaUso) : null,
                    comandas: Array.isArray(item.comandas) ? item.comandas.map(id => toObjId(id)) : [],
                    comandasNumbers: item.comandasNumbers || [],
                    platos: platosArr,
                    subtotal: item.subtotal ?? 0,
                    igv: item.igv ?? 0,
                    total: item.total ?? 0,
                    observaciones: item.observaciones || '',
                    fechaPago: item.fechaPago ? new Date(item.fechaPago) : new Date(),
                    fechaPagoString: item.fechaPagoString || null,
                    isActive: item.isActive !== false,
                    createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
                    updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
                });
                imported++;
            } catch (err) {
                errors++;
                console.error(`❌ Error al importar boucher ${item.voucherId}:`, err.message);
            }
        }
        if (imported > 0 || errors > 0) {
            console.log(`✅ Boucher: ${imported} importados${errors ? `, ${errors} errores` : ''}`);
        }
        return { imported, updated: 0, errors };
    } catch (error) {
        console.error('❌ Error al importar boucher:', error.message);
        return { imported: 0, updated: 0, errors: 1 };
    }
};

/**
 * Desactiva bouchers activos de una mesa al liberarla (evita mezclar con el próximo ciclo).
 */
const desactivarBouchersHistoricosMesa = async (mesaId) => {
    const result = await boucherModel.updateMany(
        { mesa: mesaId, isActive: true },
        { $set: { isActive: false } }
    );
    if (result.modifiedCount > 0) {
        console.log(
            `✅ [desactivarBouchersHistoricosMesa] Mesa ${mesaId}: ${result.modifiedCount} boucher(s) desactivado(s)`
        );
    }
    return result.modifiedCount;
};

module.exports = {
    listarBouchers,
    listarBouchersPorFecha,
    obtenerBoucherPorId,
    crearBoucher,
    eliminarBoucher,
    obtenerBoucherPorMesa,
    listarBouchersActivosPorMesa,
    desactivarBouchersHistoricosMesa,
    consolidarBouchersMesa,
    importarBoucherDesdeJSON
};

