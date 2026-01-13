const mesas = require('../database/models/mesas.model');
const { syncJsonFile } = require('../utils/jsonSync');

const listarMesas = async () => {
    const data = await mesas.find({});
    return data;
}

const obtenerMesaPorId = async (id) => {
    const data = await mesas.findOne({ mesasId: id });
    return data;
}

const crearMesa = async (data) => {
    await mesas.create(data);
    const todaslasmesas = await listarMesas();
    await syncJsonFile('mesas.json', todaslasmesas);
    return todaslasmesas;
}

const actualizarMesa = async (_id, newData) => {
    await mesas.findOneAndUpdate({ mesasId: _id }, newData);
    const todaslasmesas = await listarMesas();
    await syncJsonFile('mesas.json', todaslasmesas);
    return todaslasmesas;
}


const borrarMesa = async (id) => {
    // Usar _id (ObjectId de MongoDB) para eliminar
    await mesas.findByIdAndDelete(id);
    const todaslasmesas = await listarMesas();
    // Sincronizar con el archivo JSON
    await syncJsonFile('mesas.json', todaslasmesas);
    return todaslasmesas;
}

module.exports = {
    listarMesas,
    crearMesa,
    obtenerMesaPorId,
    actualizarMesa,
    borrarMesa
};
