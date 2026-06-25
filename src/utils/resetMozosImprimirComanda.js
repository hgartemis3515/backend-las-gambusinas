/**
 * Script de utilidad: fuerza `mozos.botonImprimirComanda` a false en la
 * configuración del sistema (configuracion_unica). Útil cuando el flag quedó
 * persistido en true y la app de mozos muestra el botón de imprimir comanda
 * aunque en configuracion.html esté desmarcado.
 *
 * Por defecto, los mozos NO pueden imprimir comandas. Ejecutar una vez:
 *   node src/utils/resetMozosImprimirComanda.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ConfiguracionSistema = require('../database/models/configuracionSistema.model');

async function run() {
    await mongoose.connect(process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas');
    console.log('Conectado a MongoDB');

    const config = await ConfiguracionSistema.findById('configuracion_unica').lean();
    if (!config) {
        console.log('No existe configuracion_unica; el modelo la creará con botonImprimirComanda=false por defecto al primer GET.');
        await mongoose.disconnect();
        process.exit(0);
    }

    const antes = config.mozos?.botonImprimirComanda;
    if (antes === false) {
        console.log('El flag ya está en false. Nada que hacer.');
        await mongoose.disconnect();
        process.exit(0);
    }

    await ConfiguracionSistema.findByIdAndUpdate(
        'configuracion_unica',
        { $set: { 'mozos.botonImprimirComanda': false } }
    );
    console.log(`Flag corregido: ${antes} -> false. Los mozos NO podrán imprimir comandas por defecto.`);

    // Invalidar caché Redis (si está disponible)
    try {
        const redisCache = require('../utils/redisCache');
        if (typeof redisCache.invalidateCustom === 'function') {
            await redisCache.invalidateCustom('configuracion', 'sistema');
            console.log('Caché de configuración invalidada.');
        }
    } catch (_) {}

    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error('Error en reset:', err);
    process.exit(1);
});