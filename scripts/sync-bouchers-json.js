/**
 * Sincroniza los bouchers de MongoDB al archivo JSON
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Cargar variables de entorno
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const boucherModel = require('../src/database/models/boucher.model');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lasgambusinas';

async function syncBouchers() {
    console.log('🔄 Sincronizando bouchers...');
    
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado a MongoDB');
        
        const bouchers = await boucherModel.find({ isActive: true }).lean();
        console.log(`📦 ${bouchers.length} bouchers encontrados`);
        
        // Verificar que los bouchers tengan los campos de cocinero
        const conCocinero = bouchers.filter(b => b.platos?.some(p => p.cocinero));
        console.log(`👨‍🍳 ${conCocinero.length} bouchers con información de cocinero`);
        
        // Guardar en JSON
        fs.writeFileSync(
            path.join(__dirname, '../data/boucher.json'),
            JSON.stringify(bouchers, null, 2)
        );
        
        console.log('✅ boucher.json actualizado');
        
        // Mostrar ejemplo de un boucher con cocinero
        if (conCocinero.length > 0) {
            const ejemplo = conCocinero[0];
            console.log('\n📋 Ejemplo de boucher con cocinero:');
            console.log(`   Boucher #${ejemplo.boucherNumber}`);
            ejemplo.platos.forEach(p => {
                if (p.cocinero || p.tiempoPreparacion) {
                    console.log(`   - ${p.nombre}: Cocinero=${p.cocinero || '—'}, Tiempo=${p.tiempoPreparacion || '—'}`);
                }
            });
        }
        
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

syncBouchers().then(() => process.exit(0)).catch(() => process.exit(1));
