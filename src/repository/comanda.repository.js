const comandaModel = require("../database/models/comanda.model");
const mesasModel = require("../database/models/mesas.model");

const listarComanda = async () => {
  try {
    const data = await comandaModel
      .find()
      .populate({
        path: "mozos",
      })
      .populate({
        path: "mesas",
      })
      .populate({
        path: "platos",
      });

    const mesasSinComandas = await mesasModel.find({
      _id: { $nin: data.map(comanda => comanda.mesas._id) }
    });

    await Promise.all(mesasSinComandas.map(async (mesa) => {
      if (!mesa.isActive) {
        mesa.isActive = true;
        await mesa.save();
      }
    }));

    return data;
  } catch (error) {
    console.error("error al listar la comanda", error);
    throw error;
  }
};

const agregarComanda = async (data) => {
  await comandaModel.create(data);
  console.log(data);
  const todaslascomandas = await listarComanda();
  return todaslascomandas;
};

const eliminarComanda = async (comandaId) => {
  try {
    const deletedComanda = await comandaModel.findByIdAndDelete(comandaId);
    return deletedComanda;
  } catch (error) {
    console.error("error al eliminar la comanda", error);
    throw error;
  }
};

const actualizarComanda = async (comandaId, newData) => {
  try {
    const updatedComanda = await comandaModel.findByIdAndUpdate(
      comandaId,
      newData,
      { new: true }
    );
    return updatedComanda;
  } catch (error) {
    console.error("Error al actualizar la comanda", error);
    throw error;
  }
};

const cambiarEstadoPlato = async (comandaId, platoId, nuevoEstado) => {
  try {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) throw new Error('Comanda no encontrada');

    const plato = comanda.platos.find(p => p.plato.equals(platoId));
    if (!plato) throw new Error('Plato no encontrado en la comanda');

    plato.estado = nuevoEstado;
    await comanda.save();
    return comanda;
  } catch (error) {
    console.error("Error al cambiar el estado del plato en la comanda", error);
    throw error;
  }
};

const cambiarStatusComanda = async (comandaId, nuevoStatus) => {
  try {
      const updatedComanda = await comandaModel.findByIdAndUpdate(
          comandaId,
          { status: nuevoStatus },
          { new: true }
      );
      return updatedComanda;
  } catch (error) {
      console.error("Error al cambiar el estado de la comanda", error);
      throw error;
  }
};

const cambiarEstadoComanda = async (comandaId, nuevoEstado) => {
  try {
      const updatedComanda = await comandaModel.findByIdAndUpdate(
          comandaId,
          { IsActive: nuevoEstado },
          { new: true }
      );
      return updatedComanda;
  } catch (error) {
      console.error("Error al cambiar el estado de la comanda", error);
      throw error;
  }
};

const listarComandaPorFechaEntregado = async (fecha) => {
  try {
    console.log('🔍 Buscando comandas para fecha:', fecha);
    const data = await comandaModel.find({ 
      createdAt: fecha,
      status: { $ne: "entregado" },
      IsActive: true
    })
    .populate({
      path: "mozos",
    })
    .populate({
      path: "mesas",
    })
    .populate({
      path: "platos.plato",
      model: "platos"
    })
    .sort({ comandaNumber: -1 }); // Ordenar por número de comanda descendente
    
    console.log(`✅ Encontradas ${data.length} comandas para la fecha ${fecha}`);
    if (data.length > 0) {
      const primeraComanda = data[0];
      console.log('📋 Ejemplo de comanda:', {
        numero: primeraComanda.comandaNumber,
        mesa: primeraComanda.mesas?.nummesa,
        mozo: primeraComanda.mozos?.name,
        platos: primeraComanda.platos?.length,
        cantidades: primeraComanda.cantidades?.length,
        primerPlato: primeraComanda.platos?.[0]?.plato?.nombre || 'N/A'
      });
      
      // Validar que los datos estén correctamente populados
      if (primeraComanda.platos && primeraComanda.platos.length > 0) {
        primeraComanda.platos.forEach((platoObj, index) => {
          if (!platoObj.plato || !platoObj.plato.nombre) {
            console.warn(`⚠️ Plato en índice ${index} no está correctamente populado:`, platoObj);
          }
        });
      }
    }
    
    return data;
  } catch (error) {
    console.error("❌ Error al listar la comanda por fecha:", error);
    throw error;
  }
};

const listarComandaPorFecha = async (fecha) => {
  try {
    const data = await comandaModel.find({ 
      createdAt: fecha,
      IsActive: true
    })
    .populate({
      path: "mozos",
    })
    .populate({
      path: "mesas",
    })
    .populate({
      path: "platos.plato",
    });
    
    return data;
  } catch (error) {
    console.error("error al listar la comanda por fecha", error);
    throw error;
  }
};

module.exports = { listarComanda, agregarComanda, eliminarComanda, actualizarComanda, cambiarStatusComanda, cambiarEstadoComanda, listarComandaPorFecha, listarComandaPorFechaEntregado, cambiarEstadoPlato};
