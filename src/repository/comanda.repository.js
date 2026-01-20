const comandaModel = require("../database/models/comanda.model");
const mesasModel = require("../database/models/mesas.model");
const platoModel = require("../database/models/plato.model");
const { syncJsonFile } = require('../utils/jsonSync');

// Función helper para asegurar que los platos estén populados
const ensurePlatosPopulated = async (comandas) => {
  try {
    // Validar que comandas sea un array
    if (!Array.isArray(comandas)) {
      console.warn('⚠️ ensurePlatosPopulated recibió un valor que no es array:', typeof comandas);
      return [];
    }

    // Obtener todos los platos una vez
    const todosLosPlatos = await platoModel.find({});
    const platosMapById = new Map(); // Mapa por ObjectId (_id)
    const platosMapByNumId = new Map(); // Mapa por id numérico
    
    todosLosPlatos.forEach(plato => {
      if (plato && plato._id) {
        platosMapById.set(plato._id.toString(), plato);
        if (plato.id) {
          platosMapByNumId.set(plato.id, plato);
        }
      }
    });

    // Mapear cada comanda y asegurar que los platos estén populados
    return comandas.map(comanda => {
      try {
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
      } catch (comandaError) {
        console.warn('⚠️ Error procesando comanda individual:', comandaError.message);
        // Retornar comanda sin modificar si hay error
        return comanda.toObject ? comanda.toObject() : comanda;
      }
    });
  } catch (error) {
    console.error("❌ Error al asegurar que los platos estén populados:", error);
    console.error("Stack trace:", error.stack);
    // Retornar comandas originales en caso de error
    return Array.isArray(comandas) ? comandas : [];
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
        path: "cliente"
      })
      .populate({
        path: "platos.plato",
        model: "platos"
      })
      .sort({ createdAt: -1, comandaNumber: -1 }); // Ordenar por fecha de creación descendente, luego por número de comanda

    // Asegurar que los platos estén populados (fallback manual)
    const dataConPlatos = await ensurePlatosPopulated(data);

    // Obtener IDs de mesas que tienen comandas (con validación de null)
    const mesasIds = dataConPlatos
      .map(comanda => {
        // Manejar casos donde mesas puede ser null, undefined, o un objeto
        if (!comanda.mesas) return null;
        if (typeof comanda.mesas === 'object' && comanda.mesas._id) {
          return comanda.mesas._id;
        }
        if (typeof comanda.mesas === 'string') {
          return comanda.mesas;
        }
        return null;
      })
      .filter(id => id !== null); // Filtrar nulls

    // Solo buscar mesas sin comandas si hay IDs válidos
    if (mesasIds.length > 0) {
      try {
        const mesasSinComandas = await mesasModel.find({
          _id: { $nin: mesasIds }
        });

        await Promise.all(mesasSinComandas.map(async (mesa) => {
          if (!mesa.isActive) {
            mesa.isActive = true;
            await mesa.save();
          }
        }));
      } catch (mesaError) {
        // Si hay error al actualizar mesas, no fallar toda la operación
        console.warn('⚠️ Error al actualizar mesas sin comandas:', mesaError.message);
      }
    }

    return dataConPlatos;
  } catch (error) {
    console.error("❌ Error al listar la comanda:", error);
    console.error("Stack trace:", error.stack);
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

  // Validar que la mesa esté en estado "libre" o "preparado" (para nueva comanda)
  const estadoMesa = (mesa.estado || 'libre').toLowerCase();
  let permitirNuevaComanda = false;
  
  if (estadoMesa !== 'libre') {
    // Si la mesa está en estado "preparado", permitir crear nueva comanda si es el mismo mozo
    if (estadoMesa === 'preparado') {
      // Buscar comandas activas de la mesa para verificar el mozo
      const comandasActivas = await comandaModel.find({
        mesas: mesa._id,
        IsActive: true,
        status: { $in: ['en_espera', 'recoger'] }
      });
      
      if (comandasActivas.length > 0) {
        // Verificar que el mozo que crea la nueva comanda sea el mismo que creó la comanda original
        const primeraComanda = comandasActivas[0];
        const mozoComandaId = primeraComanda.mozos?.toString ? primeraComanda.mozos.toString() : (primeraComanda.mozos ? String(primeraComanda.mozos) : null);
        const mozoNuevaComandaId = data.mozos?.toString ? data.mozos.toString() : (data.mozos ? String(data.mozos) : null);
        
        if (mozoComandaId && mozoNuevaComandaId && mozoComandaId === mozoNuevaComandaId) {
          // Es el mismo mozo, permitir crear nueva comanda
          permitirNuevaComanda = true;
          console.log(`✅ Permitiendo nueva comanda en mesa ${mesa.nummesa} (estado: preparado) - Mismo mozo`);
        } else {
          const errorMsg = 'Solo el mozo que creó la comanda original puede agregar una nueva comanda a esta mesa';
          console.error(`❌ ${errorMsg} - Mesa ${mesa.nummesa}`);
          const error = new Error(errorMsg);
          error.statusCode = 403; // Forbidden
          throw error;
        }
      } else {
        // No hay comandas activas, pero la mesa está en preparado (puede ser un estado inconsistente)
        // Permitir crear nueva comanda
        permitirNuevaComanda = true;
        console.log(`✅ Permitiendo nueva comanda en mesa ${mesa.nummesa} (estado: preparado) - Sin comandas activas`);
      }
    } else {
      // Para otros estados (esperando, pedido, pagado), rechazar
      const comandaActiva = await comandaModel.findOne({
        mesas: mesa._id,
        IsActive: true,
        status: { $in: ['en_espera', 'recoger'] }
      });

      if (comandaActiva || ['esperando', 'pedido', 'pagado'].includes(estadoMesa)) {
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
  // Si la mesa estaba en "preparado", cambiar a "pedido" para la nueva comanda
  // Si la mesa estaba en "libre", cambiar a "pedido"
  if (estadoMesa === 'preparado' || estadoMesa === 'libre') {
    mesa.estado = 'pedido';
    await mesa.save();
    console.log(`✅ Mesa ${mesa.nummesa} actualizada de "${estadoMesa}" a estado "pedido"`);
  }
  
  // Emitir evento Socket.io de mesa actualizada
  if (global.emitMesaActualizada) {
    await global.emitMesaActualizada(mesa._id);
  }
  
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
      path: "cliente"
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
    // Validar que el ID sea válido
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(comandaId)) {
      const error = new Error('ID de comanda inválido');
      error.statusCode = 400;
      throw error;
    }
    
    // Obtener la comanda antes de eliminarla para saber qué mesa afecta
    const comandaAEliminar = await comandaModel.findById(comandaId);
    if (!comandaAEliminar) {
      const error = new Error('Comanda no encontrada');
      error.statusCode = 404;
      throw error;
    }
    
    const mesaId = comandaAEliminar.mesas;
    
    // Eliminar la comanda
    const deletedComanda = await comandaModel.findByIdAndDelete(comandaId);
    console.log('🗑️ Comanda eliminada:', comandaId);
    
    // Verificar si hay otras comandas activas en la mesa
    // IMPORTANTE: Incluir comandas en estado "entregado" que aún no están pagadas
    // Solo excluir las que están pagadas o completadas
    const comandasRestantes = await comandaModel.find({
      mesas: mesaId,
      IsActive: true,
      status: { $nin: ['pagado', 'completado'] }
    });
    
    // Determinar el estado correcto de la mesa basado en las comandas restantes
    let nuevoEstadoMesa = 'libre';
    
    if (comandasRestantes.length > 0) {
      // Prioridad 1: Verificar si hay comandas en estado "entregado" (no pagadas)
      // Estas comandas deben mantener la mesa en "preparado" hasta que se paguen
      const hayComandasEntregadas = comandasRestantes.some(c => c.status?.toLowerCase() === 'entregado');
      
      if (hayComandasEntregadas) {
        // Si hay comandas entregadas pero no pagadas, la mesa debe estar en "preparado"
        nuevoEstadoMesa = 'preparado';
        console.log(`✅ Mesa tiene ${comandasRestantes.length} comanda(s) restante(s), incluyendo ${comandasRestantes.filter(c => c.status?.toLowerCase() === 'entregado').length} en estado "entregado" (no pagadas) - Mesa a "preparado"`);
      } else {
        // Prioridad 2: Verificar si hay comandas en estado "recoger" (preparado)
        const hayComandasPreparadas = comandasRestantes.some(c => c.status?.toLowerCase() === 'recoger');
        
        if (hayComandasPreparadas) {
          // Si hay comandas preparadas, la mesa debe estar en "preparado"
          nuevoEstadoMesa = 'preparado';
          console.log(`✅ Mesa tiene ${comandasRestantes.length} comanda(s) restante(s) en estado "recoger" - Mesa a "preparado"`);
        } else {
          // Prioridad 3: Si hay comandas pero no están preparadas, deben estar en "en_espera" (pedido)
          const hayComandasEnEspera = comandasRestantes.some(c => c.status?.toLowerCase() === 'en_espera');
          if (hayComandasEnEspera) {
            nuevoEstadoMesa = 'pedido';
            console.log(`✅ Mesa tiene ${comandasRestantes.length} comanda(s) restante(s) en estado "en_espera" - Mesa a "pedido"`);
          }
        }
      }
    } else {
      // No hay comandas activas (o todas están pagadas), la mesa debe estar en "libre"
      nuevoEstadoMesa = 'libre';
      console.log(`✅ No hay comandas activas restantes (o todas están pagadas) - Mesa a "libre"`);
    }
    
    // Actualizar el estado de la mesa
    const mesa = await mesasModel.findById(mesaId);
    if (mesa) {
      const estadoAnterior = mesa.estado;
      mesa.estado = nuevoEstadoMesa;
      await mesa.save();
      console.log(`✅ Mesa ${mesa.nummesa} actualizada de "${estadoAnterior}" a "${nuevoEstadoMesa}" después de eliminar comanda`);
      
      // Emitir evento Socket.io de mesa actualizada
      if (global.emitMesaActualizada) {
        await global.emitMesaActualizada(mesa._id);
      }
    } else {
      console.warn(`⚠️ No se encontró la mesa ${mesaId} para actualizar su estado`);
    }
    
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
      path: "cliente"
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
    const comanda = await comandaModel.findById(comandaId).populate('mesas');
    if (!comanda) throw new Error('Comanda no encontrada');

    const plato = comanda.platos.find(p => p.plato.equals(platoId));
    if (!plato) throw new Error('Plato no encontrado en la comanda');

    plato.estado = nuevoEstado;
    await comanda.save();

    // Obtener la mesa para actualizar su estado
    const mesa = await mesasModel.findById(comanda.mesas._id || comanda.mesas);
    if (!mesa) {
      throw new Error('Mesa no encontrada');
    }

    // IMPORTANTE: Verificar el estado de TODAS las comandas de la mesa para determinar el estado correcto
    // Esto es necesario porque si se revierte un plato de "recoger" a "en_espera", la mesa debe volver a "pedido"
    const comandasMesa = await comandaModel.find({
      mesas: mesa._id,
      IsActive: true,
      status: { $nin: ['pagado', 'completado'] }
    });

    // Determinar el estado correcto de la mesa basado en todas las comandas
    let nuevoEstadoMesa = 'libre';
    
    if (comandasMesa.length > 0) {
      // Verificar si hay comandas en estado "recoger" (preparado)
      const hayComandasPreparadas = comandasMesa.some(c => {
        // Una comanda está "preparada" si todos sus platos están en "recoger"
        return c.platos && c.platos.length > 0 && c.platos.every(p => p.estado === "recoger");
      });
      
      if (hayComandasPreparadas) {
        nuevoEstadoMesa = 'preparado';
        console.log(`✅ Mesa ${mesa.nummesa} tiene comanda(s) preparada(s) - Estado: "preparado"`);
      } else {
        // Si no hay comandas preparadas, verificar si hay comandas en "en_espera" o "recoger" (parcial)
        const hayComandasActivas = comandasMesa.some(c => {
          const status = (c.status || '').toLowerCase();
          return status === 'en_espera' || status === 'recoger';
        });
        
        if (hayComandasActivas) {
          nuevoEstadoMesa = 'pedido';
          console.log(`✅ Mesa ${mesa.nummesa} tiene comanda(s) activa(s) - Estado: "pedido"`);
        } else {
          nuevoEstadoMesa = 'libre';
          console.log(`✅ Mesa ${mesa.nummesa} no tiene comandas activas - Estado: "libre"`);
        }
      }
    } else {
      nuevoEstadoMesa = 'libre';
      console.log(`✅ Mesa ${mesa.nummesa} no tiene comandas activas - Estado: "libre"`);
    }

    // Actualizar el estado de la mesa solo si cambió
    if (mesa.estado !== nuevoEstadoMesa) {
      const estadoAnterior = mesa.estado;
      mesa.estado = nuevoEstadoMesa;
      await mesa.save();
      console.log(`✅ Mesa ${mesa.nummesa} actualizada de "${estadoAnterior}" a "${nuevoEstadoMesa}" después de cambiar estado de plato`);
      
      // Emitir evento Socket.io de mesa actualizada
      if (global.emitMesaActualizada) {
        await global.emitMesaActualizada(mesa._id);
      }
    } else {
      console.log(`ℹ️ Mesa ${mesa.nummesa} ya está en estado "${nuevoEstadoMesa}" - No se requiere actualización`);
    }

    // Obtener la comanda actualizada con populate
    const comandaActualizada = await comandaModel.findById(comandaId)
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
        path: "cliente"
      })
      .populate({
        path: "platos.plato",
        model: "platos"
      });

    return comandaActualizada;
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
      ).populate('mesas');
      
      if (!updatedComanda) {
        throw new Error('Comanda no encontrada');
      }
      
      // Si el nuevo status es "recoger", actualizar la mesa a "preparado"
      if (nuevoStatus === "recoger" && updatedComanda.mesas) {
        const mesaId = updatedComanda.mesas._id || updatedComanda.mesas;
        const mesa = await mesasModel.findById(mesaId);
        if (mesa && mesa.estado !== "preparado" && mesa.estado !== "pagando") {
          mesa.estado = "preparado";
          await mesa.save();
          console.log(`✅ Mesa ${mesa.nummesa} actualizada a estado "preparado" - Comanda lista para recoger`);
          
          // Emitir evento Socket.io de mesa actualizada
          if (global.emitMesaActualizada) {
            await global.emitMesaActualizada(mesa._id);
          }
        }
      }
      
      // Si el nuevo status es "entregado", verificar si todas las comandas están entregadas
      // y actualizar la mesa a "libre" si corresponde
      if (nuevoStatus === "entregado" && updatedComanda.mesas) {
        const mesaId = updatedComanda.mesas._id || updatedComanda.mesas;
        const comandasActivas = await comandaModel.find({
          mesas: mesaId,
          IsActive: true,
          status: { $in: ['en_espera', 'recoger'] }
        });
        
        // Si no hay comandas activas, la mesa puede estar libre
        if (comandasActivas.length === 0) {
          const mesa = await mesasModel.findById(mesaId);
          if (mesa && mesa.estado !== "libre" && mesa.estado !== "pagando") {
            // No cambiar a libre automáticamente, esperar a que se pague
            // Pero sí emitir evento para actualizar estado
            if (global.emitMesaActualizada) {
              await global.emitMesaActualizada(mesa._id);
            }
          }
        }
      }
      
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
      path: "cliente"
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
        path: "cliente"
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
      path: "cliente"
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

/**
 * Recalcula el estado de una mesa basándose en todas sus comandas activas
 * @param {ObjectId|String} mesaId - ID de la mesa
 * @param {Session} session - Sesión de MongoDB para transacciones (opcional)
 * @returns {Promise<String>} - Nuevo estado de la mesa
 */
const recalcularEstadoMesa = async (mesaId, session = null) => {
  try {
    const query = {
      mesas: mesaId,
      IsActive: true,
      status: { $nin: ['pagado', 'completado'] }
    };
    
    const comandasActivas = session
      ? await comandaModel.find(query).session(session)
      : await comandaModel.find(query);
    
    let nuevoEstadoMesa = 'libre';
    
    if (comandasActivas.length > 0) {
      // Contar comandas por estado
      const comandasEnEspera = comandasActivas.filter(c => c.status?.toLowerCase() === 'en_espera');
      const comandasRecoger = comandasActivas.filter(c => c.status?.toLowerCase() === 'recoger');
      const comandasEntregadas = comandasActivas.filter(c => c.status?.toLowerCase() === 'entregado');
      
      // PRIORIDAD CORREGIDA: "en_espera" tiene máxima prioridad (hay trabajo pendiente)
      // Si hay alguna comanda en "en_espera", la mesa debe estar en "pedido"
      if (comandasEnEspera.length > 0) {
        nuevoEstadoMesa = 'pedido';
        console.log(`✅ Mesa tiene ${comandasActivas.length} comanda(s) activa(s): ${comandasEnEspera.length} en "en_espera", ${comandasRecoger.length} en "recoger", ${comandasEntregadas.length} en "entregado" - Mesa a "pedido" (prioridad: en_espera)`);
      } 
      // Si no hay "en_espera" pero hay "recoger", la mesa está "preparado"
      else if (comandasRecoger.length > 0) {
        nuevoEstadoMesa = 'preparado';
        console.log(`✅ Mesa tiene ${comandasActivas.length} comanda(s) activa(s): ${comandasRecoger.length} en "recoger", ${comandasEntregadas.length} en "entregado" - Mesa a "preparado"`);
      }
      // Si solo hay comandas "entregado" (todas entregadas pero no pagadas), mesa en "preparado"
      else if (comandasEntregadas.length > 0) {
        nuevoEstadoMesa = 'preparado';
        console.log(`✅ Mesa tiene ${comandasEntregadas.length} comanda(s) en estado "entregado" (todas entregadas, esperando pago) - Mesa a "preparado"`);
      }
    } else {
      nuevoEstadoMesa = 'libre';
      console.log(`✅ No hay comandas activas - Mesa a "libre"`);
    }
    
    // Actualizar el estado de la mesa
    const mesa = session
      ? await mesasModel.findById(mesaId).session(session)
      : await mesasModel.findById(mesaId);
    
    if (mesa) {
      const estadoAnterior = mesa.estado;
      if (mesa.estado !== nuevoEstadoMesa) {
        mesa.estado = nuevoEstadoMesa;
        if (session) {
          await mesa.save({ session });
        } else {
          await mesa.save();
        }
        console.log(`✅ Mesa ${mesa.nummesa} actualizada de "${estadoAnterior}" a "${nuevoEstadoMesa}"`);
        
        // Emitir evento Socket.io de mesa actualizada (solo si no hay sesión activa, para evitar duplicados)
        if (!session && global.emitMesaActualizada) {
          await global.emitMesaActualizada(mesa._id);
        }
      } else {
        console.log(`ℹ️ Mesa ${mesa.nummesa} ya está en estado "${nuevoEstadoMesa}" - No se requiere actualización`);
      }
    } else {
      console.warn(`⚠️ No se encontró la mesa ${mesaId} para actualizar su estado`);
    }
    
    return nuevoEstadoMesa;
  } catch (error) {
    console.error("❌ Error al recalcular estado de mesa:", error);
    throw error;
  }
};

/**
 * Revierte el status de una comanda a un estado anterior con validación y auditoría
 * NOTA: Funciona sin transacciones MongoDB (compatible con MongoDB standalone)
 * @param {String} comandaId - ID de la comanda
 * @param {String} nuevoStatus - Nuevo status al que revertir ('en_espera', 'recoger')
 * @param {String|ObjectId} usuarioId - ID del usuario que realiza la reversión
 * @returns {Promise<Object>} - Comanda actualizada
 */
const revertirStatusComanda = async (comandaId, nuevoStatus, usuarioId) => {
  try {
    // Obtener la comanda
    const comanda = await comandaModel.findById(comandaId);
    
    if (!comanda) {
      throw new Error('Comanda no encontrada');
    }
    
    const statusActual = comanda.status?.toLowerCase() || 'en_espera';
    const nuevoStatusLower = nuevoStatus?.toLowerCase();
    
    // ✅ VALIDAR TRANSICIÓN LEGAL
    const transicionesValidas = {
      'recoger': ['en_espera'], 
      'entregado': ['recoger', 'en_espera']
    };
    
    if (!transicionesValidas[statusActual]?.includes(nuevoStatusLower)) {
      const errorMsg = `No se puede revertir de ${statusActual} → ${nuevoStatusLower}. Transiciones válidas: ${JSON.stringify(transicionesValidas[statusActual] || [])}`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // ✅ AUDITORÍA - Agregar al historial
    if (!comanda.historialEstados) {
      comanda.historialEstados = [];
    }
    
    // Validar y convertir usuarioId a ObjectId válido o null
    let usuarioIdValido = null;
    if (usuarioId) {
      const mongoose = require('mongoose');
      // Si es un ObjectId válido, usarlo; si no, intentar convertirlo
      if (mongoose.Types.ObjectId.isValid(usuarioId)) {
        usuarioIdValido = usuarioId;
      } else {
        // Si no es válido (ej: "sistema"), guardar como null
        console.log(`⚠️ usuarioId "${usuarioId}" no es un ObjectId válido, guardando como null en historial`);
        usuarioIdValido = null;
      }
    }
    
    comanda.historialEstados.push({
      status: nuevoStatusLower,
      timestamp: new Date(),
      usuario: usuarioIdValido, // null si no es válido
      accion: `revertido-desde-${statusActual}${usuarioIdValido ? '' : '-por-sistema'}`
    });
    
    // Actualizar el status
    comanda.status = nuevoStatusLower;
    
    // 🔥 CRÍTICO: Revertir TODOS los platos a "en_espera" cuando se revierte la comanda
    // Esto asegura que los platos se muestren correctamente en la app de cocina
    if (comanda.platos && comanda.platos.length > 0) {
      comanda.platos.forEach(plato => {
        // Solo revertir platos que están en "recoger" o "entregado"
        if (plato.estado === 'recoger' || plato.estado === 'entregado') {
          plato.estado = 'en_espera';
        }
      });
      console.log(`🔄 Revertidos ${comanda.platos.filter(p => p.estado === 'en_espera').length} plato(s) a "en_espera"`);
    }
    
    // Guardar comanda (incluye platos actualizados)
    await comanda.save();
    
    // ✅ RECALCULAR MESA (sin sesión de transacción)
    const mesaId = comanda.mesas?._id || comanda.mesas;
    let nuevoEstadoMesa = null;
    if (mesaId) {
      nuevoEstadoMesa = await recalcularEstadoMesa(mesaId, null); // null = sin sesión
    }
    
    console.log(`✅ Comanda ${comandaId} revertida de "${statusActual}" a "${nuevoStatusLower}" por usuario ${usuarioId} (sin transacciones - MongoDB standalone)`);
    
    // Obtener la comanda actualizada con populate para emitir
    const comandaActualizada = await comandaModel
      .findById(comandaId)
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
        path: "cliente"
      })
      .populate({
        path: "platos.plato",
        model: "platos"
      });
    
    // Obtener mesa actualizada para incluir en el evento
    let mesaActualizada = null;
    if (mesaId) {
      mesaActualizada = await mesasModel.findById(mesaId).populate('area');
    }
    
    // 🔥 EMITIR A COCINA Y MOZOS - ESTÁNDAR INDUSTRIA: Rooms por mesa
    // El evento incluye tanto comanda como mesa para evitar condición de carrera
    if (global.emitComandaRevertida) {
      await global.emitComandaRevertida(comandaActualizada, mesaActualizada);
    }
    
    // También emitir mesa-actualizada por separado para compatibilidad
    if (mesaId && global.emitMesaActualizada) {
      await global.emitMesaActualizada(mesaId);
      console.log(`📤 Evento 'mesa-actualizada' emitido después de revertir comanda - Mesa ahora en estado: ${nuevoEstadoMesa}`);
    }
    
    return { comanda: comandaActualizada, mesa: mesaActualizada };
  } catch (error) {
    console.error("❌ Error al revertir status de comanda:", error);
    throw error;
  }
};

module.exports = { listarComanda, agregarComanda, eliminarComanda, actualizarComanda, cambiarStatusComanda, cambiarEstadoComanda, listarComandaPorFecha, listarComandaPorFechaEntregado, cambiarEstadoPlato, revertirStatusComanda, recalcularEstadoMesa};
