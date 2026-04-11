const mozos = require('../database/models/mozos.model');
const mongoose = require('mongoose');
const { syncJsonFile } = require('../utils/jsonSync');
const fs = require('fs');
const path = require('path');

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DATA_DIR = path.join(__dirname, '../../data');

const listarMozos = async () => {
    const data = await mozos.find();
    return data;

}

const crearMozo = async (data) => {
    await mozos.create(data);
    const todoslosmozos = await listarMozos();
    try {
        await syncJsonFile('mozos.json', todoslosmozos);
    } catch (syncErr) {
        console.error('[mozos] syncJsonFile tras crear (BD ya guardada):', syncErr.message);
    }
    return todoslosmozos;
}

const obtenerMozosPorId = async (id) => {
    let mozo;
    
    // Si parece un ObjectId de MongoDB (24 caracteres hex)
    if (typeof id === 'string' && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)) {
        mozo = await mozos.findById(id);
    } else {
        // Buscar por mozoId (Number)
        mozo = await mozos.findOne({ mozoId: id });
    }
    
    return mozo;
}

const actualizarMozo = async (id, newData) => {
    try {
        // Buscar por _id (ObjectId) primero
        let mozo = await mozos.findById(id);
        
        // Si no se encuentra, buscar por mozoId
        if (!mozo) {
            mozo = await mozos.findOne({ mozoId: parseInt(id) });
        }
        
        if (!mozo) {
            throw new Error('Mozo no encontrado');
        }

        // Actualizar los campos
        if (newData.nombres !== undefined) mozo.nombres = newData.nombres;
        if (newData.apellidos !== undefined) mozo.apellidos = newData.apellidos;
        if (newData.name !== undefined) mozo.name = newData.name;
        if (newData.DNI !== undefined) mozo.DNI = newData.DNI;
        if (newData.phoneNumber !== undefined) mozo.phoneNumber = newData.phoneNumber;
        if (newData.fotoUrl !== undefined) mozo.fotoUrl = newData.fotoUrl;
        if (newData.email !== undefined) mozo.email = newData.email;
        if (newData.fechaNacimiento !== undefined) mozo.fechaNacimiento = newData.fechaNacimiento;
        if (newData.genero !== undefined) mozo.genero = newData.genero;
        if (newData.direccion !== undefined) mozo.direccion = newData.direccion;
        if (newData.contactoEmergenciaNombre !== undefined) mozo.contactoEmergenciaNombre = newData.contactoEmergenciaNombre;
        if (newData.contactoEmergenciaTelefono !== undefined) mozo.contactoEmergenciaTelefono = newData.contactoEmergenciaTelefono;
        if (newData.pinAcceso !== undefined) mozo.pinAcceso = String(newData.pinAcceso || '').trim();
        if (newData.usuarioWeb !== undefined) mozo.usuarioWeb = newData.usuarioWeb;
        if (newData.passwordWeb !== undefined && newData.passwordWeb !== '') mozo.passwordWeb = newData.passwordWeb;
        if (newData.rol !== undefined) mozo.rol = newData.rol;
        if (newData.activo !== undefined) mozo.activo = newData.activo;
        if (newData.enTurno !== undefined) mozo.enTurno = newData.enTurno;
        if (newData.permisos !== undefined) mozo.permisos = newData.permisos;

        await mozo.save();
        const leaf = mozo.toObject ? mozo.toObject() : mozo;
        try {
            const todoslosmozos = await listarMozos();
            await syncJsonFile('mozos.json', todoslosmozos);
        } catch (syncErr) {
            console.error('[mozos] syncJsonFile tras actualizar (BD ya guardada):', syncErr.message);
        }
        return leaf;
    } catch (error) {
        console.error('Error al actualizar el mozo:', error);
        throw error;
    }
}



const borrarMozo = async (id) => {
    try {
        // Usar _id (ObjectId de MongoDB) para eliminar
        await mozos.findByIdAndDelete(id);

        const todoslosmozos = await listarMozos();
        // Sincronizar con el archivo JSON
        await syncJsonFile('mozos.json', todoslosmozos);
        return  todoslosmozos;
    } catch(error){
        console.error('Error al eliminar usuario', error);
        throw error;
    }
};


/**
 * Login mozo: identificador (nombre completo, primer nombre, nombres o usuarioWeb)
 * + contraseña = DNI (8 dígitos; admite puntos/guiones al pegar).
 * Si el mozo tiene pinAcceso no vacío en BD, también acepta ese PIN (p. ej. app cocina).
 */
const autenticarMozo = async (name, secretRaw) => {
    try {
        const normalizeName = (s) => String(s || '').trim().replace(/\s+/g, ' ');
        const nameClean = normalizeName(name);
        const secretStr = String(secretRaw == null ? '' : secretRaw).trim();
        if (!nameClean || !secretStr) {
            return null;
        }

        const nameKey = (s) => normalizeName(s).toLowerCase();
        const targetKey = nameKey(nameClean);

        const todosLosMozos = await mozos.find({});

        const collectCandidatos = () => {
            const byId = new Map();
            const add = (m) => {
                if (m && m._id) byId.set(String(m._id), m);
            };
            for (const m of todosLosMozos) {
                const full = nameKey(m.name);
                if (full === targetKey) {
                    add(m);
                    continue;
                }
                const nom = nameKey(m.nombres || '');
                if (nom && nom === targetKey) {
                    add(m);
                    continue;
                }
                const uw = nameKey(m.usuarioWeb || '');
                if (uw && uw === targetKey) {
                    add(m);
                    continue;
                }
                const parts = full.split(' ').filter(Boolean);
                const first = parts[0];
                if (first === targetKey && targetKey.length >= 2) {
                    add(m);
                }
            }
            return Array.from(byId.values());
        };

        const candidatos = collectCandidatos();

        const dniDigitsFromSecret = secretStr.replace(/\D/g, '');
        const secretIsOnlyDigits = /^\d+$/.test(secretStr);
        const dniParsedFromSecret =
            dniDigitsFromSecret.length >= 8 && /^\d+$/.test(dniDigitsFromSecret)
                ? parseInt(dniDigitsFromSecret, 10)
                : secretIsOnlyDigits && secretStr.length >= 8
                  ? parseInt(secretStr, 10)
                  : NaN;

        const dniMatchesDoc = (m) => {
            if (m.DNI === undefined || m.DNI === null || m.DNI === '') return false;
            const n = Number(m.DNI);
            if (!Number.isNaN(n) && !Number.isNaN(dniParsedFromSecret) && n === dniParsedFromSecret) {
                return true;
            }
            const docDigits = String(m.DNI).replace(/\D/g, '');
            return (
                docDigits.length > 0 &&
                dniDigitsFromSecret.length > 0 &&
                docDigits === dniDigitsFromSecret
            );
        };

        const secretMatchesMozo = (m) => {
            const pin = m.pinAcceso != null ? String(m.pinAcceso).trim() : '';
            if (pin && pin === secretStr) {
                return true;
            }
            return !Number.isNaN(dniParsedFromSecret) && dniMatchesDoc(m);
        };

        for (const m of candidatos) {
            if (secretMatchesMozo(m)) {
                return m;
            }
        }

        return null;
    } catch (error) {
        console.error('❌ Error al autenticar usuario', error);
        throw error;
    }
};

/**
 * Importa mozos desde data/mozos.json.
 */
const importarMozosDesdeJSON = async () => {
    try {
        const filePath = path.join(DATA_DIR, 'mozos.json');
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Archivo mozos.json no encontrado');
            return { imported: 0, updated: 0, errors: 0 };
        }
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const arr = Array.isArray(jsonData) ? jsonData : [jsonData];
        let imported = 0, errors = 0;
        for (const item of arr) {
            try {
                const key = item.mozoId != null ? item.mozoId : item.DNI;
                const existente = await mozos.findOne({ $or: [{ mozoId: item.mozoId }, { DNI: item.DNI }, { name: item.name }] });
                if (existente) continue;
                await mozos.create({
                    _id: item._id ? new mongoose.Types.ObjectId(item._id) : undefined,
                    mozoId: item.mozoId,
                    name: item.name,
                    DNI: item.DNI,
                    phoneNumber: item.phoneNumber != null ? item.phoneNumber : 0
                });
                imported++;
            } catch (err) {
                errors++;
                console.error(`❌ Error al importar mozo ${item.name}:`, err.message);
            }
        }
        if (imported > 0 || errors > 0) {
            console.log(`✅ Mozos: ${imported} importados${errors ? `, ${errors} errores` : ''}`);
        }
        return { imported, updated: 0, errors };
    } catch (error) {
        console.error('❌ Error al importar mozos:', error.message);
        return { imported: 0, updated: 0, errors: 1 };
    }
};

const inicializarUsuarioAdmin = async () => {
    try {
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('🔐 VERIFICANDO USUARIO ADMINISTRADOR');
        console.log('═══════════════════════════════════════════════════════════════');

        // Verificar si el usuario admin ya existe (buscar por nombre primero)
        const adminExistente = await mozos.findOne({
            name: 'admin'
        });

        if (!adminExistente) {
            // Crear el usuario admin si no existe
            const nuevoAdmin = await mozos.create({
                name: 'admin',
                DNI: 12345678,
                phoneNumber: 0,
                rol: 'admin',
                activo: true
            });
            
            console.log('');
            console.log('┌─────────────────────────────────────────────────────────────┐');
            console.log('│  ✅ USUARIO ADMIN CREADO EXITOSAMENTE                        │');
            console.log('├─────────────────────────────────────────────────────────────┤');
            console.log('│                                                             │');
            console.log('│   📧 Usuario:    admin                                      │');
            console.log('│   🔑 Contraseña: 12345678                                   │');
            console.log('│   👤 Rol:        admin                                      │');
            console.log('│                                                             │');
            console.log('│   ⚠️  IMPORTANTE: Cambie la contraseña después del primer    │');
            console.log('│      inicio de sesión en el dashboard.                      │');
            console.log('│                                                             │');
            console.log('└─────────────────────────────────────────────────────────────┘');
            console.log('');
            
            // Sincronizar con el archivo JSON
            const todoslosmozos = await listarMozos();
            await syncJsonFile('mozos.json', todoslosmozos);
        } else {
            // Asegurar que el admin tenga el rol correcto y DNI correcto
            let necesitaActualizacion = false;
            
            if (adminExistente.DNI !== 12345678) {
                adminExistente.DNI = 12345678;
                necesitaActualizacion = true;
            }
            
            if (adminExistente.rol !== 'admin') {
                adminExistente.rol = 'admin';
                necesitaActualizacion = true;
            }
            
            if (adminExistente.activo !== true) {
                adminExistente.activo = true;
                necesitaActualizacion = true;
            }
            
            if (necesitaActualizacion) {
                await adminExistente.save();
            }
            
            console.log('');
            console.log('┌─────────────────────────────────────────────────────────────┐');
            console.log('│  ℹ️  USUARIO ADMIN YA EXISTE EN LA BASE DE DATOS             │');
            console.log('├─────────────────────────────────────────────────────────────┤');
            console.log('│                                                             │');
            console.log('│   📧 Usuario:    admin                                      │');
            console.log('│   🔑 Contraseña: 12345678                                   │');
            console.log('│   👤 Rol:        admin                                      │');
            console.log('│                                                             │');
            console.log('│   💡 Use estas credenciales para acceder al dashboard.      │');
            console.log('│                                                             │');
            console.log('└─────────────────────────────────────────────────────────────┘');
            console.log('');
            
            // Sincronizar con el archivo JSON
            const todoslosmozos = await listarMozos();
            await syncJsonFile('mozos.json', todoslosmozos);
        }
    } catch (error) {
        console.error('❌ Error al inicializar usuario admin:', error);
        throw error;
    }
};




module.exports = {
    listarMozos,
    crearMozo,
    obtenerMozosPorId,
    actualizarMozo,
    borrarMozo,
    autenticarMozo,
    inicializarUsuarioAdmin,
    importarMozosDesdeJSON
};