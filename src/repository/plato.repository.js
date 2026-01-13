const plato = require('../database/models/plato.model');
const { syncJsonFile } = require('../utils/jsonSync');

const listarPlatos = async () => {
    const data = await plato.find({});
    return data;
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
    findByCategoria
};
