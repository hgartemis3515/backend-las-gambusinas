const boucherModel = require("../database/models/boucher.model");
const { syncJsonFile } = require('../utils/jsonSync');
const { asociarBoucherACliente } = require('./clientes.repository');

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

module.exports = {
    listarBouchers,
    listarBouchersPorFecha,
    obtenerBoucherPorId,
    crearBoucher,
    eliminarBoucher
};

