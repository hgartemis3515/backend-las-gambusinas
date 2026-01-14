const plato = require('../database/models/plato.model');
const { syncJsonFile } = require('../utils/jsonSync');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

const listarPlatos = async () => {
    const data = await plato.find({});
    return data;
}

/**
 * Importa platos desde el archivo JSON a MongoDB
 * Solo importa platos que no existen (basándose en el ID)
 */
const importarPlatosDesdeJSON = async () => {
    try {
        const filePath = path.join(DATA_DIR, 'platos.json');
        
        // Verificar si el archivo existe
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Archivo platos.json no encontrado');
            return { imported: 0, updated: 0, errors: [] };
        }

        // Leer el archivo JSON
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (!Array.isArray(jsonData)) {
            console.log('⚠️ El archivo platos.json no contiene un array válido');
            return { imported: 0, updated: 0, errors: [] };
        }

        let imported = 0;
        let updated = 0;
        const errors = [];

        // Procesar cada plato del JSON
        for (const platoData of jsonData) {
            try {
                // Buscar si el plato ya existe por ID
                const platoExistente = await plato.findOne({ id: platoData.id });
                
                if (platoExistente) {
                    // Actualizar el plato existente
                    await plato.findOneAndUpdate(
                        { id: platoData.id },
                        {
                            nombre: platoData.nombre,
                            precio: platoData.precio,
                            stock: platoData.stock,
                            categoria: platoData.categoria,
                            tipo: platoData.tipo || 'plato-carta normal'
                        },
                        { new: true }
                    );
                    updated++;
                } else {
                    // Crear nuevo plato (sin el _id del JSON, MongoDB lo generará)
                    const nuevoPlato = {
                        id: platoData.id,
                        nombre: platoData.nombre,
                        precio: platoData.precio,
                        stock: platoData.stock,
                        categoria: platoData.categoria,
                        tipo: platoData.tipo || 'plato-carta normal'
                    };
                    await plato.create(nuevoPlato);
                    imported++;
                }
            } catch (error) {
                errors.push({ plato: platoData.nombre || platoData.id, error: error.message });
                console.error(`❌ Error al importar plato ${platoData.nombre || platoData.id}:`, error.message);
            }
        }

        console.log(`✅ Importación completada: ${imported} nuevos, ${updated} actualizados`);
        if (errors.length > 0) {
            console.log(`⚠️ Errores: ${errors.length}`);
        }

        return { imported, updated, errors };
    } catch (error) {
        console.error('❌ Error al importar platos desde JSON:', error);
        throw error;
    }
}

const obtenerPlatoPorId = async (id) => {
    const data = await plato.findOne({ id: id });
    return data;
}

const findByCategoria = async (categoria) => {
    const data = await plato.find({ categoria: categoria });
    return data;
}

const crearPlato = async (data) => {
    await plato.create(data);
    const todosLosPlatos = await listarPlatos();
    // Sincronizar con el archivo JSON
    await syncJsonFile('platos.json', todosLosPlatos);
    return todosLosPlatos;
}

const actualizarPlato = async (id, newData) => {
    await plato.findOneAndUpdate({ id: id }, newData);
    const todosLosPlatos = await listarPlatos();
    // Sincronizar con el archivo JSON
    await syncJsonFile('platos.json', todosLosPlatos);
    return todosLosPlatos;
}

const borrarPlato = async (id) => {
    // Usar _id (ObjectId de MongoDB) para eliminar
    await plato.findByIdAndDelete(id);
    const todosLosPlatos = await listarPlatos();
    // Sincronizar con el archivo JSON
    await syncJsonFile('platos.json', todosLosPlatos);
    return todosLosPlatos;
}

module.exports = {
    listarPlatos,
    crearPlato,
    obtenerPlatoPorId,
    actualizarPlato,
    borrarPlato,
    findByCategoria,
    importarPlatosDesdeJSON
};
