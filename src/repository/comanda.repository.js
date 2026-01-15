const comandaModel = require("../database/models/comanda.model");
const mesasModel = require("../database/models/mesas.model");
const platoModel = require("../database/models/plato.model");
const { syncJsonFile } = require('../utils/jsonSync');

// Función helper para asegurar que los platos estén populados
const ensurePlatosPopulated = async (comandas) => {
  try {
    // Obtener todos los platos una vez
    const todosLosPlatos = await platoModel.find({});
    const platosMapById = new Map(); // Mapa por ObjectId (_id)
    const platosMapByNumId = new Map(); // Mapa por id numérico
    
    todosLosPlatos.forEach(plato => {
      platosMapById.set(plato._id.toString(), plato);
      if (plato.id) {
        platosMapByNumId.set(plato.id, plato);
      }
    });

    // Mapear cada comanda y asegurar que los platos estén populados
    return comandas.map(comanda => {
      const comandaObj = comanda.toObject ? comanda.toObject() : comanda;
      
      if (comandaObj.platos && Array.isArray(comandaObj.platos)) {
        comandaObj.platos = comandaObj.platos.map(platoItem => {
          const platoId = platoItem.plato;
          const platoNumId = platoItem.platoId; // ID numérico guardado
          
          // Si el plato ya está populado (es un objeto con nombre), usarlo
          if (platoItem.plato && typeof platoItem.plato === 'object' && platoItem.plato.nombre) {
            return platoItem;
          }
          
          // Buscar el plato por ObjectId primero
          let platoEncontrado = null;
          if (platoId) {
            const platoIdStr = platoId.toString ? platoId.toString() : platoId;
            platoEncontrado = platosMapById.get(platoIdStr);
          }
          
          // Si no se encontró por ObjectId, buscar por id numérico
          if (!platoEncontrado && platoNumId) {
            platoEncontrado = platosMapByNumId.get(platoNumId);
            console.log(`🔍 Plato encontrado por id numérico ${platoNumId}:`, platoEncontrado?.nombre || 'No encontrado');
          }
          
          // Retornar el plato populado o un objeto con datos por defecto
          return {
            ...platoItem,
            plato: platoEncontrado || {
              _id: platoId,
              id: platoNumId,
              nombre: "Plato desconocido",
              precio: 0,
              stock: 0,
              categoria: "Desconocida",
              tipo: "plato-carta normal"
            }
          };
        });
      }
      
      return comandaObj;
    });
  } catch (error) {
    console.error("Error al asegurar que los platos estén populados:", error);
    return comandas;
  }
};

const listarComanda = async () => {
  try {
    const data = await comandaModel
      .find()
      .populate({
        path: "mozos",
      })
      .populate({
        path: "mesas",
        populate: {
          path: "area"
        }
      })
      .populate({
        path: "platos.plato",
        model: "platos"
      });

    // Asegurar que los platos estén populados (fallback manual)
    const dataConPlatos = await ensurePlatosPopulated(data);

    const mesasSinComandas = await mesasModel.find({
      _id: { $nin: data.map(comanda => comanda.mesas._id) }
    });

    await Promise.all(mesasSinComandas.map(async (mesa) => {
      if (!mesa.isActive) {
        mesa.isActive = true;
        await mesa.save();
      }
    }));

    return dataConPlatos;
  } catch (error) {
    console.error("error al listar la comanda", error);
    throw error;
  }
};

const agregarComanda = async (data) => {
  console.log('📤 Creando comanda con datos:', JSON.stringify(data, null, 2));
  
  // Validar que los datos estén en el formato correcto
  if (!data.platos || !Array.isArray(data.platos)) {
    throw new Error('Los platos deben ser un array');
  }
  
  if (!data.cantidades || !Array.isArray(data.cantidades)) {
    throw new Error('Las cantidades deben ser un array');
  }

  // Validar que se proporcione una mesa
  if (!data.mesas) {
    throw new Error('Debe proporcionarse una mesa');
  }

  // Validar estado de la mesa antes de crear la comanda
  const mesa = await mesasModel.findById(data.mesas);
  if (!mesa) {
    throw new Error('Mesa no encontrada');
  }

  // Validar que el número de mesa sea único (ya está en el schema, pero verificamos)
  const mesaConMismoNumero = await mesasModel.findOne({ 
    nummesa: mesa.nummesa, 
    _id: { $ne: mesa._id } 
  });
  if (mesaConMismoNumero) {
    const errorMsg = `Ya existe una mesa con el número ${mesa.nummesa}`;
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  // Validar que la mesa esté en estado "libre"
  const estadoMesa = (mesa.estado || 'libre').toLowerCase();
  if (estadoMesa !== 'libre') {
    // Verificar si hay comanda activa para esta mesa
    const comandaActiva = await comandaModel.findOne({
      mesas: mesa._id,
      IsActive: true,
      status: { $in: ['en_espera', 'recoger'] }
    });

    if (comandaActiva || ['esperando', 'pedido', 'preparado', 'pagado'].includes(estadoMesa)) {
      const errorMsg = 'Mesa ocupada con comanda existente';
      console.error(`❌ ${errorMsg} - Mesa ${mesa.nummesa} en estado: ${estadoMesa}`);
      // Log para auditoría
      console.log(`📝 AUDITORÍA - Intento inválido de crear comanda:`, {
        timestamp: new Date().toISOString(),
        mesaId: mesa._id,
        numMesa: mesa.nummesa,
        estadoActual: estadoMesa,
        estadoSolicitado: 'esperando',
        razon: errorMsg
      });
      const error = new Error(errorMsg);
      error.statusCode = 409; // Conflict
      throw error;
    }

    if (estadoMesa === 'reservado') {
      const errorMsg = 'Mesa reservada. Solo un administrador puede liberarla.';
      console.error(`❌ ${errorMsg} - Mesa ${mesa.nummesa}`);
      // Log para auditoría
      console.log(`📝 AUDITORÍA - Intento inválido de crear comanda:`, {
        timestamp: new Date().toISOString(),
        mesaId: mesa._id,
        numMesa: mesa.nummesa,
        estadoActual: estadoMesa,
        estadoSolicitado: 'esperando',
        razon: errorMsg
      });
      const error = new Error(errorMsg);
      error.statusCode = 409; // Conflict
      throw error;
    }
  }
  
  // Validar que cada plato tenga un ID válido y obtener el id numérico
  for (let index = 0; index < data.platos.length; index++) {
    const plato = data.platos[index];
    if (!plato.plato) {
      throw new Error(`El plato en la posición ${index} no tiene ID`);
    }
    
    // Buscar el plato para obtener su id numérico
    try {
      const platoCompleto = await platoModel.findById(plato.plato);
      if (platoCompleto && platoCompleto.id) {
        plato.platoId = platoCompleto.id;
        console.log(`  - Plato ${index}: _id=${plato.plato}, id=${platoCompleto.id}, nombre=${platoCompleto.nombre}, Estado=${plato.estado || 'en_espera'}`);
      } else {
        console.warn(`⚠️ No se encontró el id numérico para el plato ${plato.plato}`);
      }
    } catch (error) {
      console.error(`Error al buscar el plato ${plato.plato}:`, error);
    }
  }
  
  // Validar que las cantidades coincidan con los platos
  if (data.platos.length !== data.cantidades.length) {
    console.warn(`⚠️ Advertencia: ${data.platos.length} platos pero ${data.cantidades.length} cantidades. Ajustando...`);
    // Ajustar cantidades si no coinciden
    while (data.cantidades.length < data.platos.length) {
      data.cantidades.push(1);
    }
    data.cantidades = data.cantidades.slice(0, data.platos.length);
  }
  
  console.log('📊 Resumen de platos y cantidades:');
  data.platos.forEach((plato, index) => {
    console.log(`  - Plato ${index}: ID=${plato.plato}, Cantidad=${data.cantidades[index] || 1}`);
  });
  
  const nuevaComanda = await comandaModel.create(data);
  console.log('✅ Comanda creada:', nuevaComanda._id);
  
  // Actualizar estado de la mesa a "pedido" automáticamente cuando se crea la comanda
  mesa.estado = 'pedido';
  await mesa.save();
  console.log(`✅ Mesa ${mesa.nummesa} actualizada a estado "pedido"`);
  
  console.log('📋 Comanda guardada en MongoDB:', {
    _id: nuevaComanda._id,
    platosCount: nuevaComanda.platos?.length,
    cantidadesCount: nuevaComanda.cantidades?.length,
    platos: nuevaComanda.platos?.map(p => ({
      platoId: p.plato?.toString() || p.plato,
      estado: p.estado
    })),
    cantidades: nuevaComanda.cantidades
  });
  
  // Obtener la comanda recién creada con populate
  let comandaCreada = await comandaModel
    .findById(nuevaComanda._id)
    .populate({
      path: "mozos",
    })
    .populate({
      path: "mesas",
      populate: {
        path: "area"
      }
    })
    .populate({
      path: "platos.plato",
      model: "platos"
    });
  
  // Asegurar que los platos estén populados (fallback manual)
  const comandasConPlatos = await ensurePlatosPopulated([comandaCreada]);
  comandaCreada = comandasConPlatos[0];
  
  console.log('📋 Comanda populada:', {
    id: comandaCreada._id,
    platos: comandaCreada.platos?.length,
    primerPlato: comandaCreada.platos?.[0]?.plato?.nombre || 'N/A'
  });
  
  // Sincronizar con archivo JSON (obtener sin populate para guardar IDs)
  try {
    const todasLasComandasSinPopulate = await comandaModel.find({});
    await syncJsonFile('comandas.json', todasLasComandasSinPopulate);
  } catch (error) {
    console.error('⚠️ Error al sincronizar comandas.json:', error);
  }
  
  return { comanda: comandaCreada, todaslascomandas: await listarComanda() };
};

const eliminarComanda = async (comandaId) => {
  try {
    const deletedComanda = await comandaModel.findByIdAndDelete(comandaId);
    console.log('🗑️ Comanda eliminada:', comandaId);
    
    // Sincronizar con archivo JSON (obtener sin populate para guardar IDs)
    try {
      const todasLasComandasSinPopulate = await comandaModel.find({});
      await syncJsonFile('comandas.json', todasLasComandasSinPopulate);
    } catch (error) {
      console.error('⚠️ Error al sincronizar comandas.json:', error);
    }
    
    return deletedComanda;
  } catch (error) {
    console.error("error al eliminar la comanda", error);
    throw error;
  }
};

const actualizarComanda = async (comandaId, newData) => {
  try {
    console.log('✏️ Actualizando comanda:', comandaId);
    console.log('📋 Datos a actualizar:', JSON.stringify(newData, null, 2));
    
    // Validar que los platos y cantidades estén correctos si se están actualizando
    if (newData.platos) {
      if (!Array.isArray(newData.platos)) {
        throw new Error('Los platos deben ser un array');
      }
      
      // Obtener los ids numéricos de los platos
      for (let index = 0; index < newData.platos.length; index++) {
        const plato = newData.platos[index];
        if (!plato.plato) {
          throw new Error(`El plato en la posición ${index} no tiene ID`);
        }
        
        // Buscar el plato para obtener su id numérico
        try {
          const platoCompleto = await platoModel.findById(plato.plato);
          if (platoCompleto && platoCompleto.id) {
            plato.platoId = platoCompleto.id;
            console.log(`  - Plato ${index}: _id=${plato.plato}, id=${platoCompleto.id}, nombre=${platoCompleto.nombre}, Estado=${plato.estado || 'en_espera'}`);
          } else {
            console.warn(`⚠️ No se encontró el id numérico para el plato ${plato.plato}`);
          }
        } catch (error) {
          console.error(`Error al buscar el plato ${plato.plato}:`, error);
        }
      }
    }
    
    if (newData.cantidades) {
      if (!Array.isArray(newData.cantidades)) {
        throw new Error('Las cantidades deben ser un array');
      }
      
      // Validar que las cantidades coincidan con los platos
      if (newData.platos && newData.platos.length !== newData.cantidades.length) {
        console.warn(`⚠️ Advertencia: ${newData.platos.length} platos pero ${newData.cantidades.length} cantidades. Ajustando...`);
        while (newData.cantidades.length < newData.platos.length) {
          newData.cantidades.push(1);
        }
        newData.cantidades = newData.cantidades.slice(0, newData.platos.length);
      }
    }
    
    let updatedComanda = await comandaModel.findByIdAndUpdate(
      comandaId,
      newData,
      { new: true }
    )
    .populate({
      path: "mozos",
    })
    .populate({
      path: "mesas",
      populate: {
        path: "area"
      }
    })
    .populate({
      path: "platos.plato",
      model: "platos"
    });
    
    // Asegurar que los platos estén populados (fallback manual)
    const comandasConPlatos = await ensurePlatosPopulated([updatedComanda]);
    updatedComanda = comandasConPlatos[0];
    
    console.log('✅ Comanda actualizada:', {
      _id: updatedComanda._id,
      platosCount: updatedComanda.platos?.length,
      cantidadesCount: updatedComanda.cantidades?.length,
      platos: updatedComanda.platos?.map(p => ({
        platoId: p.plato?._id || p.plato,
        nombre: p.plato?.nombre || 'N/A',
        estado: p.estado
      })),
      cantidades: updatedComanda.cantidades
    });
    
    // Sincronizar con archivo JSON (obtener sin populate para guardar IDs)
    try {
      const todasLasComandasSinPopulate = await comandaModel.find({});
      await syncJsonFile('comandas.json', todasLasComandasSinPopulate);
    } catch (error) {
      console.error('⚠️ Error al sincronizar comandas.json:', error);
    }
    
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
    
    // Convertir fecha string a rango de fechas (inicio y fin del día)
    const moment = require('moment-timezone');
    const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
    const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
    
    // También buscar por string de fecha para compatibilidad
    const fechaString = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").format('YYYY-MM-DD');
    
    console.log('📅 Rango de búsqueda:', {
      desde: fechaInicio,
      hasta: fechaFin,
      fechaString: fechaString
    });
    
    // Buscar comandas activas que no estén entregadas
    // Primero intentar búsqueda por rango de fechas
    let data = await comandaModel.find({ 
      createdAt: {
        $gte: fechaInicio,
        $lte: fechaFin
      },
      status: { $ne: "entregado" },
      IsActive: { $ne: false }
    })
    .populate({
      path: "mozos",
    })
    .populate({
      path: "mesas",
      populate: {
        path: "area"
      }
    })
    .populate({
      path: "platos.plato",
      model: "platos"
    })
    .sort({ comandaNumber: -1 }); // Ordenar por número de comanda descendente
    
    // Si no se encuentran comandas, intentar búsqueda más amplia (sin filtro de fecha)
    if (data.length === 0) {
      console.log('⚠️ No se encontraron comandas con el filtro de fecha. Buscando todas las comandas activas...');
      data = await comandaModel.find({ 
        status: { $ne: "entregado" },
        IsActive: { $ne: false }
      })
      .populate({
        path: "mozos",
      })
      .populate({
        path: "mesas",
        populate: {
          path: "area"
        }
      })
      .populate({
        path: "platos.plato",
        model: "platos"
      })
      .sort({ comandaNumber: -1 })
      .limit(50); // Limitar a 50 para no sobrecargar
      
      console.log(`📊 Encontradas ${data.length} comandas activas (sin filtro de fecha)`);
    }
    
    // Asegurar que los platos estén populados (fallback manual)
    const dataConPlatos = await ensurePlatosPopulated(data);
    
    console.log(`✅ Encontradas ${dataConPlatos.length} comandas para la fecha ${fecha}`);
    if (dataConPlatos.length > 0) {
      const primeraComanda = dataConPlatos[0];
      console.log('📋 Ejemplo de comanda:', {
        _id: primeraComanda._id,
        numero: primeraComanda.comandaNumber,
        status: primeraComanda.status,
        IsActive: primeraComanda.IsActive,
        createdAt: primeraComanda.createdAt,
        tipoCreatedAt: typeof primeraComanda.createdAt,
        mesa: primeraComanda.mesas?.nummesa,
        mozo: primeraComanda.mozos?.name,
        platos: primeraComanda.platos?.length,
        cantidades: primeraComanda.cantidades?.length,
        primerPlato: primeraComanda.platos?.[0]?.plato?.nombre || 'N/A',
        estadosPlatos: primeraComanda.platos?.map(p => p.estado) || []
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
    
    return dataConPlatos;
  } catch (error) {
    console.error("❌ Error al listar la comanda por fecha:", error);
    throw error;
  }
};

const listarComandaPorFecha = async (fecha) => {
  try {
    console.log('🔍 Buscando comandas para fecha:', fecha);
    
    // Convertir fecha string a rango de fechas (inicio y fin del día)
    const moment = require('moment-timezone');
    const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
    const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
    
    console.log('📅 Rango de búsqueda:', {
      desde: fechaInicio,
      hasta: fechaFin
    });
    
    const data = await comandaModel.find({ 
      createdAt: {
        $gte: fechaInicio,
        $lte: fechaFin
      },
      IsActive: true
    })
    .populate({
      path: "mozos",
    })
    .populate({
      path: "mesas",
      populate: {
        path: "area"
      }
    })
    .populate({
      path: "platos.plato",
      model: "platos"
    })
    .sort({ comandaNumber: -1 });
    
    // Asegurar que los platos estén populados (fallback manual)
    const dataConPlatos = await ensurePlatosPopulated(data);
    
    console.log(`✅ Encontradas ${dataConPlatos.length} comandas para la fecha ${fecha}`);
    if (dataConPlatos.length > 0) {
      const primeraComanda = dataConPlatos[0];
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
    
    return dataConPlatos;
  } catch (error) {
    console.error("error al listar la comanda por fecha", error);
    throw error;
  }
};

module.exports = { listarComanda, agregarComanda, eliminarComanda, actualizarComanda, cambiarStatusComanda, cambiarEstadoComanda, listarComandaPorFecha, listarComandaPorFechaEntregado, cambiarEstadoPlato};
