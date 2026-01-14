const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Sincroniza los datos de MongoDB con el archivo JSON correspondiente
 * @param {string} fileName - Nombre del archivo JSON (ej: 'mozos.json', 'mesas.json', 'platos.json')
 * @param {Array} data - Array de datos a escribir en el archivo JSON
 */
const syncJsonFile = async (fileName, data) => {
    try {
        const filePath = path.join(DATA_DIR, fileName);
        
        // Función recursiva para convertir ObjectIds a strings
        const convertObjectIds = (obj) => {
            if (obj === null || obj === undefined) {
                return obj;
            }
            
            // Si es un ObjectId de mongoose (verificar múltiples formas)
            if (mongoose.Types.ObjectId.isValid(obj)) {
                // Verificar si es realmente un ObjectId
                if (obj instanceof mongoose.Types.ObjectId || 
                    (obj.constructor && obj.constructor.name === 'ObjectID') ||
                    (obj.constructor && obj.constructor.name === 'ObjectId')) {
                    return obj.toString();
                }
            }
            
            // Si tiene la propiedad _id y es un ObjectId
            if (obj._id && mongoose.Types.ObjectId.isValid(obj._id)) {
                if (obj._id instanceof mongoose.Types.ObjectId || 
                    (obj._id.constructor && obj._id.constructor.name === 'ObjectID')) {
                    obj._id = obj._id.toString();
                }
            }
            
            // Si es un array
            if (Array.isArray(obj)) {
                return obj.map(item => convertObjectIds(item));
            }
            
            // Si es un objeto (pero no Date, Buffer, etc.)
            if (typeof obj === 'object' && obj.constructor === Object) {
                const converted = {};
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        const value = obj[key];
                        
                        // Saltar propiedades especiales de mongoose
                        if (key === '__v') {
                            continue;
                        }
                        
                        // Convertir ObjectIds a strings
                        if (value && mongoose.Types.ObjectId.isValid(value)) {
                            if (value instanceof mongoose.Types.ObjectId || 
                                (value.constructor && value.constructor.name === 'ObjectID') ||
                                (value.constructor && value.constructor.name === 'ObjectId')) {
                                converted[key] = value.toString();
                            } else {
                                converted[key] = convertObjectIds(value);
                            }
                        } else if (value instanceof Date) {
                            // Convertir fechas a ISO string
                            converted[key] = value.toISOString();
                        } else if (Buffer.isBuffer(value)) {
                            // Saltar buffers (no se guardan en JSON)
                            continue;
                        } else {
                            converted[key] = convertObjectIds(value);
                        }
                    }
                }
                return converted;
            }
            
            return obj;
        };
        
        // Convertir los documentos de MongoDB a objetos planos
        const jsonData = data.map(item => {
            // Usar lean() si está disponible, o toObject() con opciones
            let plainObject;
            if (item.toObject) {
                // Convertir a objeto plano con opciones para mantener ObjectIds como strings
                plainObject = item.toObject({ 
                    transform: (doc, ret) => {
                        // Convertir _id a string
                        if (ret._id && mongoose.Types.ObjectId.isValid(ret._id)) {
                            ret._id = ret._id.toString();
                        }
                        // Remover __v
                        delete ret.__v;
                        return ret;
                    }
                });
            } else {
                plainObject = item;
            }
            
            // Convertir todos los ObjectIds a strings recursivamente
            plainObject = convertObjectIds(plainObject);
            
            // Asegurar que los IDs de platos se guarden como strings
            if (plainObject.platos && Array.isArray(plainObject.platos)) {
                plainObject.platos = plainObject.platos.map(platoObj => {
                    if (platoObj && platoObj.plato) {
                        // Si plato es un ObjectId, convertirlo a string
                        if (mongoose.Types.ObjectId.isValid(platoObj.plato)) {
                            if (platoObj.plato instanceof mongoose.Types.ObjectId || 
                                (platoObj.plato.constructor && platoObj.plato.constructor.name === 'ObjectID')) {
                                platoObj.plato = platoObj.plato.toString();
                            }
                        }
                        // Remover _id interno del subdocumento si existe
                        if (platoObj._id && typeof platoObj._id === 'object') {
                            if (mongoose.Types.ObjectId.isValid(platoObj._id)) {
                                platoObj._id = platoObj._id.toString();
                            }
                        }
                    }
                    return platoObj;
                });
            }
            
            return plainObject;
        });
        
        // Escribir el archivo JSON con formato legible
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
        console.log(`✅ Archivo ${fileName} actualizado correctamente con ${jsonData.length} registros`);
        
        // Log adicional para comandas para verificar que los platos se guarden correctamente
        if (fileName === 'comandas.json' && jsonData.length > 0) {
            const primeraComanda = jsonData[0];
            console.log(`📋 Ejemplo de comanda en JSON:`, {
                _id: primeraComanda._id,
                comandaNumber: primeraComanda.comandaNumber,
                platosCount: primeraComanda.platos?.length,
                cantidadesCount: primeraComanda.cantidades?.length,
                primerPlato: primeraComanda.platos?.[0] ? {
                    platoId: primeraComanda.platos[0].plato,
                    estado: primeraComanda.platos[0].estado
                } : 'N/A',
                cantidades: primeraComanda.cantidades
            });
        }
    } catch (error) {
        console.error(`❌ Error al sincronizar el archivo ${fileName}:`, error);
        throw error;
    }
};

module.exports = {
    syncJsonFile
};

