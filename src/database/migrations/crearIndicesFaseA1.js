/**
 * Script de migración para crear índices optimizados - Fase A1
 * Ejecutar con: node src/database/migrations/crearIndicesFaseA1.js
 * 
 * Este script crea los índices compuestos definidos en los modelos:
 * - Comanda: 5 índices para queries de cocina, mesas y fecha
 * - Mesas: 2 índices para búsquedas por estado y área
 * - Plato: 2 índices para menú y búsqueda
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Importar modelos
const comandaModel = require('../models/comanda.model');
const mesasModel = require('../models/mesas.model');
const platoModel = require('../models/plato.model');

const MONGODB_URI = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';

async function crearIndices() {
  console.log('🚀 Iniciando creación de índices Fase A1...');
  console.log(`📍 Conectando a: ${MONGODB_URI}`);
  
  const startTime = Date.now();
  
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    
    console.log('✅ Conectado a MongoDB');
    
    // ========== COLECCIÓN COMANDAS ==========
    console.log('\n📊 Creando índices en colección "comandas"...');
    
    const indicesComandas = [
      // Índice para cocina (endpoint más crítico)
      {
        key: { IsActive: 1, status: 1, createdAt: -1 },
        name: 'idx_comanda_cocina_fecha',
        description: 'Para listarComandaPorFechaEntregado - cocina'
      },
      // Índice para mesas
      {
        key: { mesas: 1, IsActive: 1, status: 1 },
        name: 'idx_comanda_mesa_activa',
        description: 'Para getComandasParaPagar - pagos y estado mesa'
      },
      // Índice para fecha general
      {
        key: { createdAt: -1, IsActive: 1 },
        name: 'idx_comanda_fecha_general',
        description: 'Para listarComandaPorFecha - mozos'
      },
      // Índice para filtrado de eliminadas
      {
        key: { IsActive: 1, eliminada: 1 },
        name: 'idx_comanda_activa_eliminada',
        description: 'Para limpieza y auditoría'
      },
      // Índice para prioridad en cocina
      {
        key: { IsActive: 1, status: 1, prioridadOrden: -1, createdAt: -1 },
        name: 'idx_comanda_prioridad_cocina',
        description: 'Para ordenamiento por prioridad'
      }
    ];
    
    const db = mongoose.connection.db;
    const comandasCollection = db.collection('comandas');
    
    for (const indice of indicesComandas) {
      try {
        await comandasCollection.createIndex(indice.key, { name: indice.name });
        console.log(`  ✅ ${indice.name}: ${indice.description}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`  ⚠️ ${indice.name}: Ya existe con diferente especificación`);
        } else if (error.code === 48) {
          console.log(`  ℹ️ ${indice.name}: Ya existe`);
        } else {
          throw error;
        }
      }
    }
    
    // ========== COLECCIÓN MESAS ==========
    console.log('\n📊 Creando índices en colección "mesas"...');
    
    const indicesMesas = [
      {
        key: { isActive: 1, estado: 1, area: 1 },
        name: 'idx_mesa_estado_area',
        description: 'Para mapa de mesas por estado'
      },
      {
        key: { isActive: 1, nummesa: 1 },
        name: 'idx_mesa_activa_num',
        description: 'Para listado rápido de mesas activas'
      }
    ];
    
    const mesasCollection = db.collection('mesas');
    
    for (const indice of indicesMesas) {
      try {
        await mesasCollection.createIndex(indice.key, { name: indice.name });
        console.log(`  ✅ ${indice.name}: ${indice.description}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`  ⚠️ ${indice.name}: Ya existe con diferente especificación`);
        } else if (error.code === 48) {
          console.log(`  ℹ️ ${indice.name}: Ya existe`);
        } else {
          throw error;
        }
      }
    }
    
    // ========== COLECCIÓN PLATOS ==========
    console.log('\n📊 Creando índices en colección "platos"...');
    
    const indicesPlatos = [
      {
        key: { isActive: 1, tipo: 1, categoria: 1 },
        name: 'idx_plato_menu',
        description: 'Para menú filtrado por tipo y categoría'
      },
      {
        key: { isActive: 1, nombreLower: 1 },
        name: 'idx_plato_nombre_search',
        description: 'Para autocompletado de búsqueda'
      }
    ];
    
    const platosCollection = db.collection('platos');
    
    for (const indice of indicesPlatos) {
      try {
        await platosCollection.createIndex(indice.key, { name: indice.name });
        console.log(`  ✅ ${indice.name}: ${indice.description}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`  ⚠️ ${indice.name}: Ya existe con diferente especificación`);
        } else if (error.code === 48) {
          console.log(`  ℹ️ ${indice.name}: Ya existe`);
        } else {
          throw error;
        }
      }
    }
    
    // ========== VERIFICAR ÍNDICES ==========
    console.log('\n📋 Verificando índices creados...');
    
    const comandasIndexes = await comandasCollection.indexes();
    console.log(`\n  Comandas: ${comandasIndexes.length} índices`);
    comandasIndexes.forEach(idx => {
      if (idx.name.startsWith('idx_comanda_')) {
        console.log(`    - ${idx.name}`);
      }
    });
    
    const mesasIndexes = await mesasCollection.indexes();
    console.log(`\n  Mesas: ${mesasIndexes.length} índices`);
    mesasIndexes.forEach(idx => {
      if (idx.name.startsWith('idx_mesa_')) {
        console.log(`    - ${idx.name}`);
      }
    });
    
    const platosIndexes = await platosCollection.indexes();
    console.log(`\n  Platos: ${platosIndexes.length} índices`);
    platosIndexes.forEach(idx => {
      if (idx.name.startsWith('idx_plato_')) {
        console.log(`    - ${idx.name}`);
      }
    });
    
    const elapsedMs = Date.now() - startTime;
    console.log(`\n✅ Migración completada en ${elapsedMs}ms`);
    
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  crearIndices()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = crearIndices;
