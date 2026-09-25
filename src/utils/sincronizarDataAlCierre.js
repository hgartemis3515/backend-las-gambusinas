const logger = require('./logger');
const { syncJsonFile } = require('./jsonSync');

const OPERATIVOS = [
    { archivo: 'comandas.json', cargar: () => require('../database/models/comanda.model') },
    { archivo: 'mesas.json', cargar: () => require('../database/models/mesas.model') },
    { archivo: 'mozos.json', cargar: () => require('../database/models/mozos.model') },
    { archivo: 'clientes.json', cargar: () => require('../database/models/cliente.model') },
    { archivo: 'boucher.json', cargar: () => require('../database/models/boucher.model') },
    { archivo: 'auditoria.json', cargar: () => require('../database/models/auditoriaAcciones.model') },
    { archivo: 'areas.json', cargar: () => require('../database/models/area.model') },
    { archivo: 'notificaciones.json', cargar: () => require('../database/models/notificacion.model') },
];

async function sincronizarJsonAlCerrarCaja() {
    const resumen = {};
    const { exportarCatalogoCartaAJson } = require('./catalogoCartaPersistencia');
    try {
        const catalogo = await exportarCatalogoCartaAJson(null, { inmediato: true });
        Object.assign(resumen, catalogo);
    } catch (error) {
        logger.warn('No se pudo volcar el catálogo al cerrar caja', { error: error.message });
        resumen.catalogo = 'error';
    }
    for (const item of OPERATIVOS) {
        try {
            const Model = item.cargar();
            const docs = await Model.find({}).lean();
            await syncJsonFile(item.archivo, docs, { forzar: true });
            resumen[item.archivo] = docs.length;
        } catch (error) {
            logger.warn('No se pudo volcar JSON al cerrar caja', { archivo: item.archivo, error: error.message });
            resumen[item.archivo] = 'error';
        }
    }
    return resumen;
}

module.exports = { sincronizarJsonAlCerrarCaja };
