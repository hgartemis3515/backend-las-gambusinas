const mozos = require('../database/models/mozos.model');
const mongoose = require('mongoose');

const listarMozos = async () => {
    const data = await mozos.find();
    return data;

}

const crearMozo = async (data) => {
    await mozos.create(data);
    const todoslosmozos = await listarMozos();
    return todoslosmozos;
}

const obtenerMozosPorId = async (id) => {
    const mozo = await mozos.findOne({mozoId: id});
    return mozo;
}



const borrarMozo = async (id) => {
    try {
        await mozos.findOneAndDelete({id});

        const todoslosmozos = await listarMozos();
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

const inicializarUsuarioAdmin = async () => {
    try {
        // Verificar si el usuario admin ya existe (buscar por nombre primero)
        const adminExistente = await mozos.findOne({
            name: 'admin'
        });

        if (!adminExistente) {
            // Crear el usuario admin si no existe
            const nuevoAdmin = await mozos.create({
                name: 'admin',
                DNI: 12345678,
                phoneNumber: 0 // Número de teléfono por defecto para admin
            });
            console.log('✅ Usuario admin creado exitosamente');
            console.log('   - Usuario: admin');
            console.log('   - Contraseña: 12345678');
            console.log('   - DNI guardado:', nuevoAdmin.DNI, 'tipo:', typeof nuevoAdmin.DNI);
            console.log('   - ID:', nuevoAdmin._id);
        } else {
            console.log('✅ Usuario admin ya existe en la base de datos');
            console.log('   - Usuario: admin');
            console.log('   - DNI guardado:', adminExistente.DNI, 'tipo:', typeof adminExistente.DNI);
            console.log('   - ID:', adminExistente._id);
            
            // Verificar si el DNI es correcto, si no, actualizarlo
            if (adminExistente.DNI !== 12345678) {
                console.log('⚠️ El DNI del admin no es 12345678, actualizando...');
                adminExistente.DNI = 12345678;
                await adminExistente.save();
                console.log('✅ DNI del admin actualizado a 12345678');
            }
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
    borrarMozo,
    autenticarMozo,
    inicializarUsuarioAdmin
};