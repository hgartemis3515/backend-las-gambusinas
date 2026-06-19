/**
 * Migración SOUTHIO: Normalizar estados históricos para incluir el nuevo estado "salio"
 * 
 * Este script:
 * 1. Agrega el estado "salio" al enum de platos.estado
 * 2. Agrega el campo tiempos.salio a los platos existentes
 * 3. No cambia ningún estado existente (los platos en "recoger" permanecen en "recoger")
 * 4. Agrega "salio" al enum de status de comanda
 * 5. Agrega tiempoSalio a las comandas existentes
 * 
 * USO: node scripts/migrateEstadosSalio.js [--dry-run]
 * 
 * NOTA: Ejecutar bajo supervisión. No ejecutar automáticamente en producción.
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');

// Configurar conexión MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lasgambusinas';

async function migrate() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('='.repeat(60));
  console.log('MIGRACIÓN SALIO - Agregar estado "salio" al flujo de platos');
  console.log('='.repeat(60));
  console.log(`Modo: ${dryRun ? 'DRY RUN (sin cambios)' : 'EJECUCIÓN REAL'}`);
  console.log(`Fecha: ${moment().tz('America/Lima').format('YYYY-MM-DD HH:mm:ss')}`);
  console.log(`MongoDB: ${MONGODB_URI}`);
  console.log('='.repeat(60));

  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Conectado a MongoDB');

    const db = mongoose.connection.db;

    // 1. Verificar que el estado "salio" no exista ya
    const comandasConSalio = await db.collection('comandas').countDocuments({
      'platos.estado': 'salio'
    });
    console.log(`\n📊 Comandas con platos en estado "salio": ${comandasConSalio}`);

    const comandasConStatus = await db.collection('comandas').countDocuments({
      status: 'salio'
    });
    console.log(`📊 Comandas con status "salio": ${comandasConStatus}`);

    // 2. Agregar tiempos.salio a los platos que no lo tienen
    // (Esto es opcional, el schema ya lo define con default null)
    const platosSinSalio = await db.collection('comandas').countDocuments({
      'platos.tiempos.salio': { $exists: false }
    });
    console.log(`📊 Comandas con platos sin campo tiempos.salio: ${platosSinSalio}`);

    // 3. Agregar tiempoSalio a las comandas que no lo tienen
    const comandasSinTiempoSalio = await db.collection('comandas').countDocuments({
      tiempoSalio: { $exists: false }
    });
    console.log(`📊 Comandas sin campo tiempoSalio: ${comandasSinTiempoSalio}`);

    if (dryRun) {
      console.log('\n🔍 DRY RUN - No se realizarán cambios');
      console.log('\nResumen de cambios que se harían:');
      console.log('  1. Los platos existentes no se modifican (mantienen su estado actual)');
      console.log('  2. El enum de estados ahora incluye "salio"');
      console.log('  3. Se agrega campo tiempos.salio a platos existentes (null por defecto)');
      console.log('  4. Se agrega campo tiempoSalio a comandas existentes (null por defecto)');
      console.log('  5. Los platos en "recoger" permanecen en "recoger" (sin cambio retroactivo)');
    } else {
      console.log('\n📝 Ejecutando migración...');

      // Agregar tiempos.salio a platos existentes
      const resultPlatos = await db.collection('comandas').updateMany(
        { 'platos.tiempos.salio': { $exists: false } },
        { $set: { 'platos.$[].tiempos.salio': null } }
      );
      console.log(`  ✅ Platos con tiempos.salio agregado: ${resultPlatos.modifiedCount}`);

      // Agregar tiempoSalio a comandas
      const resultComandas = await db.collection('comandas').updateMany(
        { tiempoSalio: { $exists: false } },
        { $set: { tiempoSalio: null } }
      );
      console.log(`  ✅ Comandas con tiempoSalio agregado: ${resultComandas.modifiedCount}`);

      console.log('\n✅ Migración completada exitosamente');
    }

    // Estadísticas finales
    console.log('\n📊 Estadísticas actuales:');
    const estadosPlatos = await db.collection('comandas').aggregate([
      { $unwind: '$platos' },
      { $match: { 'platos.eliminado': { $ne: true }, 'platos.anulado': { $ne: true } } },
      { $group: { _id: '$platos.estado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    console.log('  Distribución de estados de platos:');
    estadosPlatos.forEach(e => {
      console.log(`    ${e._id || 'pedido'}: ${e.count}`);
    });

    const statusComandas = await db.collection('comandas').aggregate([
      { $match: { IsActive: true } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('  Distribución de status de comandas activas:');
    statusComandas.forEach(e => {
      console.log(`    ${e._id}: ${e.count}`);
    });

  } catch (error) {
    console.error('❌ Error en la migración:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

migrate().then(() => {
  console.log('\n🏁 Script finalizado');
  process.exit(0);
}).catch(err => {
  console.error('\n💥 Script falló:', err);
  process.exit(1);
});