/**
 * Deja el IGV del restaurante en 10.5 % dentro de Mongo.
 * Uso: npm run seed:fiscal
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ConfiguracionSistema = require('../src/database/models/configuracionSistema.model');

async function main() {
    const uri = process.env.MONGODB_URI || process.env.DBLOCAL;
    if (!uri) throw new Error('Defina DBLOCAL o MONGODB_URI');
    await mongoose.connect(uri);
    const doc = await ConfiguracionSistema.obtenerConfiguracion();
    doc.igvPorcentaje = 10.5;
    doc.facturacion = {
        limiteBoletaAnonima: 700,
        plazoEnvioDias: 3,
        modoEnvio: 'inmediato',
    };
    doc.markModified('facturacion');
    await doc.save();
    const guardado = await ConfiguracionSistema.findById('configuracion_unica').lean();
    console.log(`igvPorcentaje=${guardado.igvPorcentaje}`);
    console.log(`limiteBoletaAnonima=${guardado.facturacion?.limiteBoletaAnonima}`);
    console.log(`plazoEnvioDias=${guardado.facturacion?.plazoEnvioDias}`);
    console.log(`modoEnvio=${guardado.facturacion?.modoEnvio}`);
    if (Number(guardado.igvPorcentaje) !== 10.5) throw new Error('Mongo no conservó 10.5');
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error(err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
