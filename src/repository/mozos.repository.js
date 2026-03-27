const mozos = require('../database/models/mozos.model');
const mongoose = require('mongoose');
const { syncJsonFile } = require('../utils/jsonSync');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

const listarMozos = async () => {
    const data = await mozos.find();
    return data;

}

const crearMozo = async (data) => {
    await mozos.create(data);
    const todoslosmozos = await listarMozos();
    // Sincronizar con el archivo JSON
    await syncJsonFile('mozos.json', todoslosmozos);
    return todoslosmozos;
}

const obtenerMozosPorId = async (id) => {
    const mozo = await mozos.findOne({mozoId: id});
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
        if (newData.name !== undefined) mozo.name = newData.name;
        if (newData.DNI !== undefined) mozo.DNI = newData.DNI;
        if (newData.phoneNumber !== undefined) mozo.phoneNumber = newData.phoneNumber;
        if (newData.fotoUrl !== undefined) mozo.fotoUrl = newData.fotoUrl;
        if (newData.email !== undefined) mozo.email = newData.email;
        if (newData.fechaNacimiento !== undefined) mozo.fechaNacimiento = newData.fechaNacimiento;
        if (newData.genero !== undefined) mozo.genero = newData.genero;
        if (newData.direccion !== undefined) mozo.direccion = newData.direccion;
        if (newData.rol !== undefined) mozo.rol = newData.rol;
        if (newData.activo !== undefined) mozo.activo = newData.activo;
        if (newData.permisos !== undefined) mozo.permisos = newData.permisos;

        await mozo.save();
        const todoslosmozos = await listarMozos();
        await syncJsonFile('mozos.json', todoslosmozos);
        return todoslosmozos;
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


const autenticarMozo = async (name, DNI) => {
    try {
        const nameClean = name.trim();
        const dniNumber = Number(DNI);
        
        console.log('🔍 Buscando mozo en BD:');
        console.log('   - Nombre recibido:', name, '-> Limpiado:', nameClean);
        console.log('   - DNI recibido:', DNI, 'tipo:', typeof DNI, '-> Convertido:', dniNumber, 'tipo:', typeof dniNumber);
        
        // Primero, listar todos los mozos para debug
        const todosLosMozos = await mozos.find({});
        console.log('📋 Total de mozos en BD:', todosLosMozos.length);
        todosLosMozos.forEach(m => {
            console.log(`   - ${m.name} (DNI: ${m.DNI}, tipo: ${typeof m.DNI})`);
        });
        
        // Buscar el mozo con comparación exacta del nombre (case-sensitive)
        let Mozo = await mozos.findOne({
            name: nameClean,
            DNI: dniNumber
        });
        
        // Si no se encuentra, intentar con comparación case-insensitive
        if (!Mozo) {
            console.log('⚠️ No se encontró con búsqueda exacta, intentando case-insensitive...');
            Mozo = todosLosMozos.find(m => 
                m.name.toLowerCase().trim() === nameClean.toLowerCase() && 
                Number(m.DNI) === dniNumber
            );
        }
        
        if (Mozo) {
            console.log('✅ Mozo encontrado:');
            console.log('   - Nombre:', Mozo.name);
            console.log('   - DNI guardado:', Mozo.DNI, 'tipo:', typeof Mozo.DNI);
            console.log('   - ID:', Mozo._id);
        } else {
            console.log('❌ Mozo no encontrado con esos criterios');
            // Buscar solo por nombre para debug
            const mozoPorNombre = todosLosMozos.find(m => 
                m.name.toLowerCase().trim() === nameClean.toLowerCase()
            );
            if (mozoPorNombre) {
                console.log('⚠️ Se encontró un mozo con ese nombre pero DNI diferente:');
                console.log('   - Nombre en BD:', mozoPorNombre.name);
                console.log('   - DNI en BD:', mozoPorNombre.DNI, 'tipo:', typeof mozoPorNombre.DNI);
                console.log('   - DNI buscado:', dniNumber, 'tipo:', typeof dniNumber);
                console.log('   - ¿Son iguales?', mozoPorNombre.DNI === dniNumber);
                console.log('   - ¿Son iguales (Number)?', Number(mozoPorNombre.DNI) === Number(dniNumber));
            } else {
                console.log('❌ No existe ningún mozo con ese nombre');
            }
        }

        return Mozo;
    }catch(error){
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