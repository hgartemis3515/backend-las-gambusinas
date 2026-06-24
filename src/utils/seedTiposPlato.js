/**
 * Seed inicial de tipos de plato.
 * Se ejecuta al conectar MongoDB. Idempotente: solo inserta los que no existan.
 */
const TipoPlato = require('../database/models/tipoPlato.model');
const logger = require('./logger');

const TIPOS_SEED = [
    {
        slug: 'platos-desayuno',
        nombre: 'Desayuno',
        nombreCorto: 'DESAYUNO',
        icono: '🌅',
        color: '#ffa502',
        orden: 1,
        activo: true,
        esSistema: true,
        alias: ['desayuno']
    },
    {
        slug: 'plato-carta normal',
        nombre: 'Carta',
        nombreCorto: 'CARTA',
        icono: '🍽️',
        color: '#3498db',
        orden: 2,
        activo: true,
        esSistema: true,
        alias: ['carta', 'carta normal', 'carta-normal']
    }
];

async function seedTiposPlato() {
    try {
        const count = await TipoPlato.countDocuments();
        if (count >= TIPOS_SEED.length) {
            return { seeded: 0, skipped: count };
        }

        let inserted = 0;
        for (const tipo of TIPOS_SEED) {
            const existe = await TipoPlato.findOne({ slug: tipo.slug });
            if (!existe) {
                await TipoPlato.create({
                    ...tipo,
                    creadoPor: 'system-seed',
                    actualizadoPor: 'system-seed'
                });
                inserted++;
            }
        }

        if (inserted > 0) {
            logger.info('Seed tipos de plato completado', { inserted });
        }
        return { seeded: inserted, skipped: count - inserted };
    } catch (error) {
        logger.warn('Seed tipos de plato falló (no crítico)', { error: error.message });
        return { seeded: 0, error: error.message };
    }
}

module.exports = { seedTiposPlato, TIPOS_SEED };