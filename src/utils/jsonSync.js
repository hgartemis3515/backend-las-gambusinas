const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Sincroniza los datos de MongoDB con el archivo JSON correspondiente
 * @param {string} fileName - Nombre del archivo JSON (ej: 'mozos.json', 'mesas.json', 'platos.json')
 * @param {Array} data - Array de datos a escribir en el archivo JSON
 */
const syncJsonFile = async (fileName, data) => {
    try {
        const filePath = path.join(DATA_DIR, fileName);
        
        // Convertir los documentos de MongoDB a objetos planos
        const jsonData = data.map(item => {
            const plainObject = item.toObject ? item.toObject() : item;
            // Remover el campo __v de mongoose si existe
            if (plainObject.__v !== undefined) {
                delete plainObject.__v;
            }
            return plainObject;
        });
        
        // Escribir el archivo JSON con formato legible
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
        console.log(`✅ Archivo ${fileName} actualizado correctamente con ${jsonData.length} registros`);
    } catch (error) {
        console.error(`❌ Error al sincronizar el archivo ${fileName}:`, error);
        throw error;
    }
};

module.exports = {
    syncJsonFile
};

