/**
 * Script de migración para actualizar estados de comandas
 * Convierte estados antiguos a los nuevos estados estandarizados:
 * - "pendiente" o "ingresante" → "en_espera"
 * - "preparacion" → "recoger" (o mantener "recoger" si ya existe)
 * - "entregado" → "entregado" (sin cambios)
 * 
 * Estados de comanda (status):
 * - "ingresante" → "en_espera"
 * - "recoger" → "recoger" (sin cambios)
 * - "entregado" → "entregado" (sin cambios)
 */

const comandaModel = require('../database/models/comanda.model');
const mongoose = require('mongoose');

const migrateEstados = async () => {
  try {
    console.log('🔄 Iniciando migración de estados de comandas...');
    
    // Mapeo de estados antiguos a nuevos
    const estadoPlatoMap = {
      'pendiente': 'en_espera',
      'ingresante': 'en_espera',
      'preparacion': 'recoger',
      'recoger': 'recoger',
      'entregado': 'entregado'
    };
    
    const statusComandaMap = {
      'ingresante': 'en_espera',
      'recoger': 'recoger',
      'entregado': 'entregado',
      'completado': 'entregado'
    };
    
    // Obtener todas las comandas
    const comandas = await comandaModel.find({});
    console.log(`📋 Encontradas ${comandas.length} comandas para migrar`);
    
    let comandasActualizadas = 0;
    let totalPlatosActualizados = 0;
    
    for (const comanda of comandas) {
      let necesitaActualizacion = false;
      const platosActualizados = [];
      
      // Migrar estados de platos
      if (comanda.platos && Array.isArray(comanda.platos)) {
        for (let i = 0; i < comanda.platos.length; i++) {
          const plato = comanda.platos[i];
          const estadoActual = plato.estado;
          const nuevoEstado = estadoPlatoMap[estadoActual];
          
          if (nuevoEstado && nuevoEstado !== estadoActual) {
            plato.estado = nuevoEstado;
            necesitaActualizacion = true;
            platosActualizados.push({
              indice: i,
              antiguo: estadoActual,
              nuevo: nuevoEstado
            });
          }
        }
      }
      
      // Migrar status de comanda
      const statusActual = comanda.status;
      const nuevoStatus = statusComandaMap[statusActual];
      
      if (nuevoStatus && nuevoStatus !== statusActual) {
        comanda.status = nuevoStatus;
        necesitaActualizacion = true;
      }
      
      // Guardar si hubo cambios
      if (necesitaActualizacion) {
        await comanda.save();
        comandasActualizadas++;
        
        if (platosActualizados.length > 0) {
          totalPlatosActualizados += platosActualizados.length;
          console.log(`✅ Comanda #${comanda.comandaNumber || comanda._id}:`);
          console.log(`   - Status: ${statusActual} → ${comanda.status}`);
          platosActualizados.forEach(({ indice, antiguo, nuevo }) => {
            console.log(`   - Plato ${indice}: ${antiguo} → ${nuevo}`);
          });
        }
      }
    }
    
    console.log(`\n✅ Migración completada:`);
    console.log(`   - Comandas actualizadas: ${comandasActualizadas}`);
    console.log(`   - Total de platos actualizados: ${totalPlatosActualizados}`);
    
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    throw error;
  }
};

// Si se ejecuta directamente
if (require.main === module) {
  require('dotenv/config');
  const mongoose = require('mongoose');
  
  mongoose.connect(process.env.DBLOCAL)
    .then(() => {
      console.log('📦 Base de datos conectada');
      return migrateEstados();
    })
    .then(() => {
      console.log('✅ Migración finalizada exitosamente');
      mongoose.connection.close();
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en la migración:', error);
      mongoose.connection.close();
      process.exit(1);
    });
}

module.exports = { migrateEstados };

