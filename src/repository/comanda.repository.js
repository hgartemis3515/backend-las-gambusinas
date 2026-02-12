const comandaModel = require("../database/models/comanda.model");
const mesasModel = require("../database/models/mesas.model");
const platoModel = require("../database/models/plato.model");
const HistorialComandas = require("../database/models/historialComandas.model");
const { syncJsonFile } = require('../utils/jsonSync');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errorHandler');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '../../data');

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

const listarComanda = async (incluirEliminadas = false) => {
  try {
    // ESTANDARIZADO: Solo usar IsActive para soft-delete
    // ✅ FILTRAR EXPLÍCITAMENTE comandas eliminadas
    const query = incluirEliminadas 
      ? {} 
      : { 
          IsActive: { $ne: false, $exists: true }, // Solo comandas activas
          eliminada: { $ne: true } // También filtrar por campo eliminada si existe
        };
    
    // Obtener datos (compatible con tests - sort y populate opcionales)
    let data;
    try {
      // Intentar con sort y populate (producción)
      data = await comandaModel
        .find(query)
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
        .sort({ createdAt: -1, comandaNumber: -1 });
      console.log('✅ FASE1: listarComanda populada correctamente');
    } catch (error) {
      // Si falla (tests), intentar solo con find
      try {
        data = await comandaModel.find(query);
        // Intentar sort si existe
        if (data && typeof data.sort === 'function') {
          data = data.sort((a, b) => {
            const dateA = a.createdAt || new Date(0);
            const dateB = b.createdAt || new Date(0);
            if (dateB.getTime() !== dateA.getTime()) {
              return dateB.getTime() - dateA.getTime();
            }
            return (b.comandaNumber || 0) - (a.comandaNumber || 0);
          });
        }
        console.warn('⚠️ Tests: listarComanda retornando sin populate/sort:', error.message);
      } catch (findError) {
        // Si incluso find falla, retornar array vacío
        console.warn('⚠️ Tests: listarComanda falló completamente, retornando []:', findError.message);
        data = [];
      }
    }

    // Asegurar que los platos estén populados (fallback manual) - solo si populate funcionó
    let dataConPlatos = data;
    try {
      dataConPlatos = await ensurePlatosPopulated(data);
    } catch (ensureError) {
      console.warn('⚠️ Tests: ensurePlatosPopulated falló, usando datos sin populate:', ensureError.message);
      // En tests, usar datos sin populate
    }
    
    // 🔥 AUDITORÍA: Asegurar que historialPlatos tenga nombres correctos en todas las comandas
    for (const comanda of dataConPlatos) {
      if (comanda.historialPlatos && comanda.historialPlatos.length > 0) {
        for (let i = 0; i < comanda.historialPlatos.length; i++) {
          const h = comanda.historialPlatos[i];
          if (h.estado === 'eliminado' && (!h.nombreOriginal || h.nombreOriginal === 'Plato desconocido' || h.nombreOriginal === 'Sin nombre')) {
            // Buscar el plato por platoId numérico
            if (h.platoId) {
              const plato = await platoModel.findOne({ id: h.platoId });
              if (plato && plato.nombre) {
                h.nombreOriginal = plato.nombre;
              }
            }
          }
        }
      }
    }

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
  
  // ========== FASE 1: VALIDACIÓN Y NORMALIZACIÓN DE ESTADOS POR PLATO ==========
  const ahora = moment.tz("America/Lima").toDate();
  
  // Validar que cada plato tenga un ID válido y obtener el id numérico
  for (let index = 0; index < data.platos.length; index++) {
    const plato = data.platos[index];
    if (!plato.plato) {
      throw new Error(`El plato en la posición ${index} no tiene ID`);
    }
    
    // Buscar el plato para obtener su id numérico
    let platoCompleto = null;
    try {
      platoCompleto = await platoModel.findById(plato.plato);
      if (platoCompleto && platoCompleto.id) {
        plato.platoId = platoCompleto.id;
      } else {
        console.warn(`⚠️ No se encontró el id numérico para el plato ${plato.plato}`);
      }
    } catch (error) {
      console.error(`Error al buscar el plato ${plato.plato}:`, error);
    }
    
    // FASE 1: Validar y normalizar estado del plato
    // 1. Establecer estado default si no existe
    if (!plato.estado) {
      plato.estado = 'pedido';
      console.log(`FASE1: Plato ${index} sin estado → establecido 'pedido' (default)`);
    }
    
    // 2. Normalizar 'en_espera' a 'pedido' para consistencia (opcional, mantener ambos)
    // Mantenemos ambos estados pero los tratamos igual
    
    // 3. Validar que estado inicial es válido (solo 'pedido' o 'en_espera' permitidos)
    const estadosInicialesValidos = ['pedido', 'en_espera'];
    if (!estadosInicialesValidos.includes(plato.estado)) {
      const errorMsg = `FASE1: Estado inicial inválido para plato ${index}: "${plato.estado}". Solo se permiten: pedido, en_espera`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // 4. Inicializar timestamps del plato
    if (!plato.tiempos) {
      plato.tiempos = {};
    }
    plato.tiempos.pedido = ahora;
    if (plato.estado === 'en_espera') {
      plato.tiempos.en_espera = ahora;
    }
    
    console.log(`FASE1: Plato ${index}: _id=${plato.plato}, id=${plato.platoId}, nombre=${platoCompleto?.nombre || 'N/A'}, Estado=${plato.estado}`);
  }
  
  // FASE 1: Calcular estado global inicial basado en estados de platos
  if (!data.status) {
    data.status = calcularEstadoGlobalInicial(data.platos);
    console.log(`FASE1: Estado global calculado: "${data.status}" basado en estados de platos`);
  }
  
  // Validar que las cantidades coincidan con los platos (REQUERIDO - rechazar si no coincide)
  if (data.platos.length !== data.cantidades.length) {
    const error = new Error(`Desincronización: ${data.platos.length} platos pero ${data.cantidades.length} cantidades. Deben coincidir.`);
    error.statusCode = 400;
    throw error;
  }
  
  logger.info('Resumen de platos y cantidades', {
    platosCount: data.platos.length,
    cantidadesCount: data.cantidades.length
  });
  
  // Establecer timestamp inicial para estado 'en_espera' (estado por defecto)
  if (!data.tiempoEnEspera && (!data.status || data.status === 'en_espera')) {
    data.tiempoEnEspera = moment.tz("America/Lima").toDate();
  }
  
  // Inicializar historial de estados con el estado inicial
  if (!data.historialEstados || data.historialEstados.length === 0) {
    data.historialEstados = [{
      status: data.status || 'en_espera',
      statusAnterior: null,
      timestamp: moment.tz("America/Lima").toDate(),
      usuario: data.createdBy || data.mozos || null,
      accion: 'Comanda creada',
      deviceId: data.deviceId || null,
      sourceApp: data.sourceApp || null,
      motivo: null
    }];
  }
  
  const nuevaComanda = await comandaModel.create(data);
  logger.info('Comanda creada exitosamente', {
    comandaId: nuevaComanda._id,
    comandaNumber: nuevaComanda.comandaNumber,
    mesaId: nuevaComanda.mesas,
    mozoId: nuevaComanda.mozos
  });
  
  // Actualizar estado de la mesa a "pedido" automáticamente cuando se crea la comanda
  // Si la mesa estaba en "preparado", cambiar a "pedido" para la nueva comanda
  // Si la mesa estaba en "libre", cambiar a "pedido"
  if (estadoMesa === 'preparado' || estadoMesa === 'libre') {
    await mesasModel.updateOne(
      { _id: data.mesas },
      { $set: { estado: 'pedido' } }
    );
    console.log(`✅ Mesa ${mesa.nummesa} actualizada de "${estadoMesa}" a estado "pedido"`);
  }
  
  // Emitir evento Socket.io de mesa actualizada
  if (global.emitMesaActualizada) {
    await global.emitMesaActualizada(mesa._id);
  }
  
  logger.debug('Comanda guardada en MongoDB', {
    _id: nuevaComanda._id,
    platosCount: nuevaComanda.platos?.length,
    cantidadesCount: nuevaComanda.cantidades?.length,
    platos: nuevaComanda.platos?.map(p => ({
      platoId: p.plato?.toString() || p.plato,
      estado: p.estado
    })),
    cantidades: nuevaComanda.cantidades
  });
  
  // Obtener la comanda recién creada con populate (opcional para tests)
  let comandaCreada = nuevaComanda;
  try {
    comandaCreada = await comandaModel
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
    console.log('✅ FASE1: Comanda populada correctamente');
    
    // Asegurar que los platos estén populados (fallback manual)
    const comandasConPlatos = await ensurePlatosPopulated([comandaCreada]);
    comandaCreada = comandasConPlatos[0];
  } catch (populateError) {
    console.warn('⚠️ Tests: Retornando sin populate:', populateError.message);
    // En tests, retornar comanda sin populate
  }
  
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

/**
 * Eliminar comanda lógicamente (soft-delete) con auditoría completa
 * @param {String} comandaId - ID de la comanda
 * @param {String} usuarioId - ID del usuario que elimina
 * @param {String} motivo - Motivo de la eliminación (obligatorio)
 * @returns {Promise<Object>} - Comanda eliminada
 */
const eliminarLogicamente = async (comandaId, usuarioId, motivo, requerirMotivo = false) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(comandaId)) {
      const error = new Error('ID de comanda inválido');
      error.statusCode = 400;
      throw error;
    }
    
    // El motivo es obligatorio solo si se requiere explícitamente (nuevos endpoints con modal)
    // Para endpoints legacy, usar motivo por defecto
    if (requerirMotivo && (!motivo || motivo.trim() === '')) {
      const error = new Error('El motivo de eliminación es obligatorio');
      error.statusCode = 400;
      throw error;
    }
    
    // Si no se proporciona motivo y no se requiere, usar uno por defecto
    if (!motivo || motivo.trim() === '') {
      motivo = 'Eliminación sin motivo especificado (legacy)';
    }
    
    // Obtener la comanda antes de eliminarla
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) {
      const error = new Error('Comanda no encontrada');
      error.statusCode = 404;
      throw error;
    }
    
    // Calcular precio total original si no existe
    if (!comanda.precioTotalOriginal && comanda.platos && comanda.platos.length > 0) {
      let precioTotal = 0;
      for (const platoItem of comanda.platos) {
        const plato = await platoModel.findById(platoItem.plato);
        if (plato && plato.precio) {
          const cantidad = comanda.cantidades[comanda.platos.indexOf(platoItem)] || 1;
          precioTotal += plato.precio * cantidad;
        }
      }
      comanda.precioTotalOriginal = precioTotal;
    }
    
    // ESTANDARIZADO: Soft-delete solo con IsActive
    // ✅ MARCAR COMANDA COMO ELIMINADA (para que no aparezca en app de cocina)
    comanda.fechaEliminacion = moment.tz("America/Lima").toDate();
    comanda.motivoEliminacion = motivo;
    comanda.eliminadaPor = usuarioId;
    comanda.IsActive = false; // Soft-delete estándar - CRÍTICO para filtrar en app de cocina
    comanda.eliminada = true; // Campo adicional para compatibilidad
    comanda.version++;
    
    // Registrar historial de platos eliminados
    if (!comanda.historialPlatos) {
      comanda.historialPlatos = [];
    }
    
    comanda.platos.forEach((platoItem, index) => {
      const cantidad = comanda.cantidades[index] || 1;
      comanda.historialPlatos.push({
        platoId: platoItem.platoId,
        nombreOriginal: platoItem.plato?.nombre || 'Plato desconocido',
        cantidadOriginal: cantidad,
        cantidadFinal: 0,
        estado: 'eliminado-completo',
        timestamp: new Date(),
        usuario: usuarioId,
        motivo: `comanda-${motivo}`
      });
    });
    
    await comanda.save();
    console.log('🗑️ Comanda eliminada lógicamente (soft-delete):', comandaId);
    
    // Guardar en historial de comandas
    try {
      await HistorialComandas.create({
        comandaId: comanda._id,
        version: comanda.version,
        status: comanda.status,
        platos: comanda.platos.map((p, idx) => ({
          plato: p.plato,
          platoId: p.platoId,
          estado: p.estado,
          cantidad: comanda.cantidades[idx] || 1,
          nombre: p.plato?.nombre || 'Plato desconocido',
          precio: p.plato?.precio || 0
        })),
        cantidades: comanda.cantidades,
        observaciones: comanda.observaciones,
        usuario: usuarioId,
        accion: 'eliminada',
        motivo: motivo,
        precioTotal: comanda.precioTotalOriginal || 0
      });
    } catch (historialError) {
      console.error('⚠️ Error al guardar historial de comanda:', historialError.message);
    }
    
    // ✅ RECALCULAR ESTADO DE LA MESA después de eliminar comanda
    const mesaId = comanda.mesas;
    if (mesaId) {
      try {
        await recalcularEstadoMesa(mesaId);
        console.log(`✅ Estado de mesa ${mesaId} recalculado después de eliminar comanda`);
      } catch (error) {
        console.error(`⚠️ Error al recalcular estado de mesa después de eliminar comanda:`, error.message);
        // No lanzar error para no interrumpir el flujo principal
      }
    }
    
    return comanda;
  } catch (error) {
    console.error("❌ Error al eliminar comanda lógicamente:", error);
    throw error;
  }
};

/**
 * Función legacy - Mantener compatibilidad pero usar soft-delete
 * @deprecated Usar eliminarLogicamente en su lugar
 */
const eliminarComanda = async (comandaId, usuarioId = null, motivo = 'Eliminación sin motivo especificado') => {
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
    
    // Usar soft-delete en lugar de eliminación física
    const deletedComanda = await eliminarLogicamente(comandaId, usuarioId, motivo);
    console.log('🗑️ Comanda eliminada (soft-delete):', comandaId);
    
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

/**
 * Editar comanda con auditoría completa de cambios
 * @param {String} comandaId - ID de la comanda
 * @param {Array} platosNuevos - Array de platos nuevos
 * @param {Array} platosEliminados - Array de IDs de platos eliminados
 * @param {String} usuarioId - ID del usuario que edita
 * @param {String} motivo - Motivo de la edición (opcional)
 * @returns {Promise<Object>} - Comanda actualizada
 */
const editarConAuditoria = async (comandaId, platosNuevos, platosEliminados, usuarioId, motivo = null) => {
  try {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) {
      throw new Error('Comanda no encontrada');
    }
    
    // Populate platos antes de crear snapshot para obtener nombres
    await comanda.populate('platos.plato');
    
    // Snapshot antes de la edición
    const snapshotAntes = {
      platos: comanda.platos.map((p, idx) => {
        let nombrePlato = 'Plato desconocido';
        if (p.plato) {
          if (typeof p.plato === 'object' && p.plato.nombre) {
            nombrePlato = p.plato.nombre;
          } else if (p.plato._id) {
            // Si es ObjectId, buscar el plato completo
            // Nota: esto se hará de forma asíncrona, pero para el snapshot usamos el ID
            nombrePlato = 'Plato desconocido'; // Se actualizará después
          }
        }
        return {
          platoId: p.platoId,
          plato: p.plato?._id || p.plato,
          nombre: nombrePlato,
          precio: p.plato?.precio || 0,
          cantidad: comanda.cantidades[idx] || 1,
          estado: p.estado
        };
      }),
      cantidades: [...comanda.cantidades],
      observaciones: comanda.observaciones
    };
    
    // Obtener nombres de platos si no están populados
    for (let i = 0; i < snapshotAntes.platos.length; i++) {
      const p = snapshotAntes.platos[i];
      if (p.nombre === 'Plato desconocido' && p.plato) {
        const platoCompleto = await platoModel.findById(p.plato);
        if (platoCompleto) {
          snapshotAntes.platos[i].nombre = platoCompleto.nombre;
          snapshotAntes.platos[i].precio = platoCompleto.precio || 0;
        }
      }
    }
    
    // Inicializar historialPlatos si no existe
    if (!comanda.historialPlatos) {
      comanda.historialPlatos = [];
    }
    
    // Registrar platos eliminados en historial y REMOVER completamente del array
    if (platosEliminados && platosEliminados.length > 0) {
      // Populate platos antes de procesar eliminados para obtener nombres
      await comanda.populate('platos.plato');
      
      // Array para almacenar índices a eliminar (en orden inverso para evitar problemas al eliminar)
      const indicesAEliminar = [];
      const platosInfoEliminados = [];
      
      for (const platoEliminado of platosEliminados) {
        const platoOriginal = comanda.platos.find(p => 
          p.platoId === platoEliminado.platoId || 
          p.plato?.toString() === platoEliminado.platoId ||
          (p.plato && p.plato._id && p.plato._id.toString() === platoEliminado.platoId?.toString())
        );
        
        if (platoOriginal) {
          const index = comanda.platos.indexOf(platoOriginal);
          const cantidad = comanda.cantidades[index] || 1;
          
          // Obtener nombre del plato (populado o desde el modelo)
          let nombrePlato = 'Plato desconocido';
          if (platoOriginal.plato) {
            if (typeof platoOriginal.plato === 'object' && platoOriginal.plato.nombre) {
              nombrePlato = platoOriginal.plato.nombre;
            } else if (platoOriginal.plato._id) {
              // Si es ObjectId, buscar el plato completo
              const platoCompleto = await platoModel.findById(platoOriginal.plato._id || platoOriginal.plato);
              if (platoCompleto) {
                nombrePlato = platoCompleto.nombre || 'Plato desconocido';
              }
            }
          }
          
          // Si aún no tenemos nombre, intentar buscar por platoId numérico
          if ((!nombrePlato || nombrePlato === 'Plato desconocido') && platoOriginal.platoId) {
            const platoPorId = await platoModel.findOne({ id: platoOriginal.platoId });
            if (platoPorId && platoPorId.nombre) {
              nombrePlato = platoPorId.nombre;
              console.log(`✅ Nombre encontrado por platoId ${platoOriginal.platoId}: ${nombrePlato}`);
            }
          }
          
          console.log(`📝 Guardando plato eliminado: platoId=${platoOriginal.platoId}, nombre=${nombrePlato}`);
          
          // Guardar información para historial
          platosInfoEliminados.push({
            platoId: platoOriginal.platoId,
            nombreOriginal: nombrePlato,
            cantidadOriginal: cantidad,
            index: index
          });
          
          // Agregar índice a la lista (solo si no está ya)
          if (indicesAEliminar.indexOf(index) === -1) {
            indicesAEliminar.push(index);
          }
        }
      }
      
      // Registrar en historialPlatos
      for (const info of platosInfoEliminados) {
        comanda.historialPlatos.push({
          platoId: info.platoId,
          nombreOriginal: info.nombreOriginal,
          cantidadOriginal: info.cantidadOriginal,
          cantidadFinal: 0,
          estado: 'eliminado',
          timestamp: new Date(),
          usuario: usuarioId,
          motivo: motivo || 'Plato eliminado de comanda'
        });
      }
      
      // Eliminar platos del array (en orden inverso para evitar problemas de índices)
      indicesAEliminar.sort((a, b) => b - a); // Ordenar descendente
      const platosAntes = comanda.platos.length;
      const cantidadesAntes = comanda.cantidades.length;
      
      for (const index of indicesAEliminar) {
        const platoEliminado = comanda.platos[index];
        const nombrePlato = platoEliminado?.plato?.nombre || platoEliminado?.platoId || 'desconocido';
        console.log(`🗑️ Eliminando plato en índice ${index}: ${nombrePlato}`);
        comanda.platos.splice(index, 1);
        comanda.cantidades.splice(index, 1);
      }
      
      console.log(`✅ ${platosInfoEliminados.length} plato(s) eliminado(s) completamente de comanda ${comanda.comandaNumber}`);
      console.log(`📊 Platos antes: ${platosAntes}, después: ${comanda.platos.length}`);
      console.log(`📊 Cantidades antes: ${cantidadesAntes}, después: ${comanda.cantidades.length}`);
      
      // Verificar que los arrays estén sincronizados (deben estar siempre sincronizados)
      if (comanda.platos.length !== comanda.cantidades.length) {
        const error = new AppError(
          `Desincronización crítica: ${comanda.platos.length} platos pero ${comanda.cantidades.length} cantidades después de eliminar. Deben coincidir.`,
          500
        );
        logger.error('Desincronización después de eliminar platos', {
          comandaId: comanda._id,
          comandaNumber: comanda.comandaNumber,
          platosLength: comanda.platos.length,
          cantidadesLength: comanda.cantidades.length
        });
        throw error;
      }
    }
    
    // Agregar nuevos platos
    if (platosNuevos && platosNuevos.length > 0) {
      console.log(`➕ Agregando ${platosNuevos.length} plato(s) nuevo(s) a comanda ${comanda.comandaNumber}`);
      
      for (const nuevoPlato of platosNuevos) {
        console.log(`🔍 Buscando plato: _id=${nuevoPlato.plato}, platoId=${nuevoPlato.platoId}`);
        
        // Buscar el plato completo por _id
        let platoCompleto = await platoModel.findById(nuevoPlato.plato);
        
        // Si no se encuentra por _id, intentar buscar por platoId numérico
        if (!platoCompleto && nuevoPlato.platoId) {
          console.log(`⚠️ No se encontró plato por _id, intentando por platoId numérico: ${nuevoPlato.platoId}`);
          platoCompleto = await platoModel.findOne({ id: nuevoPlato.platoId });
        }
        
        if (platoCompleto) {
          const platoAgregado = {
            plato: platoCompleto._id, // Usar el _id del plato encontrado
            platoId: platoCompleto.id, // ID numérico del plato
            estado: nuevoPlato.estado || 'en_espera'
          };
          
          comanda.platos.push(platoAgregado);
          comanda.cantidades.push(nuevoPlato.cantidad || 1);
          
          console.log(`✅ Plato agregado: ${platoCompleto.nombre} (id numérico: ${platoCompleto.id}, cantidad: ${nuevoPlato.cantidad || 1})`);
        } else {
          const errorMsg = `❌ ERROR: No se pudo encontrar el plato con _id=${nuevoPlato.plato} o platoId=${nuevoPlato.platoId}`;
          console.error(errorMsg);
          logger.error('Plato no encontrado al agregar a comanda', {
            comandaId: comanda._id,
            comandaNumber: comanda.comandaNumber,
            nuevoPlato: nuevoPlato
          });
          // Lanzar error para que el usuario sepa que algo salió mal
          throw new AppError(
            `No se pudo encontrar el plato para agregar a la comanda. ID: ${nuevoPlato.plato || nuevoPlato.platoId}`,
            404
          );
        }
      }
      
      console.log(`✅ Total de platos agregados: ${platosNuevos.length}. Platos totales en comanda: ${comanda.platos.length}`);
    }
    
    comanda.version++;
    
    console.log(`💾 Guardando comanda ${comanda.comandaNumber} con ${comanda.platos.length} plato(s) después de edición`);
    console.log(`📋 Cantidades: ${comanda.cantidades.length}`);
    
    await comanda.save();
    
    // Verificar que se guardó correctamente
    const comandaVerificada = await comandaModel.findById(comanda._id);
    console.log(`✅ Comanda guardada. Platos en BD: ${comandaVerificada.platos.length}, Cantidades: ${comandaVerificada.cantidades.length}`);
    
    if (comandaVerificada.platos.length !== comanda.platos.length) {
      console.error(`❌ ERROR: Desincronización! Platos en memoria: ${comanda.platos.length}, Platos en BD: ${comandaVerificada.platos.length}`);
    }
    
    // Populate platos después de guardar para obtener nombres en el snapshot
    await comanda.populate('platos.plato');
    
    // Obtener nombres de platos si no están populados
    for (let i = 0; i < comanda.platos.length; i++) {
      const p = comanda.platos[i];
      if (p.plato && typeof p.plato === 'object' && !p.plato.nombre) {
        const platoCompleto = await platoModel.findById(p.plato._id || p.plato);
        if (platoCompleto) {
          // Actualizar referencia del plato con datos completos
          p.plato = platoCompleto;
        }
      }
    }
    
    // Guardar en historial de comandas
    try {
      await HistorialComandas.create({
        comandaId: comanda._id,
        version: comanda.version,
        status: comanda.status,
        platos: comanda.platos.map((p, idx) => {
          let nombrePlato = 'Plato desconocido';
          let precioPlato = 0;
          
          if (p.plato) {
            if (typeof p.plato === 'object' && p.plato.nombre) {
              nombrePlato = p.plato.nombre;
              precioPlato = p.plato.precio || 0;
            } else if (p.plato._id) {
              const platoCompleto = p.plato;
              if (platoCompleto && platoCompleto.nombre) {
                nombrePlato = platoCompleto.nombre;
                precioPlato = platoCompleto.precio || 0;
              }
            }
          }
          
          return {
            plato: p.plato?._id || p.plato,
            platoId: p.platoId,
            estado: p.estado,
            cantidad: comanda.cantidades[idx] || 1,
            nombre: nombrePlato,
            precio: precioPlato
          };
        }),
        cantidades: comanda.cantidades,
        observaciones: comanda.observaciones,
        usuario: usuarioId,
        accion: 'editada',
        motivo: motivo
      });
    } catch (historialError) {
      console.error('⚠️ Error al guardar historial de comanda:', historialError.message);
    }
    
    // Obtener comanda actualizada con populate
    // IMPORTANTE: Recargar desde BD para asegurar que tenemos la versión más reciente
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
    
    // 🔥 AUDITORÍA: Asegurar que historialPlatos tenga nombres correctos
    if (comandaActualizada.historialPlatos && comandaActualizada.historialPlatos.length > 0) {
      let necesitaGuardar = false;
      for (let i = 0; i < comandaActualizada.historialPlatos.length; i++) {
        const h = comandaActualizada.historialPlatos[i];
        if (h.estado === 'eliminado' && (!h.nombreOriginal || h.nombreOriginal === 'Plato desconocido' || h.nombreOriginal === 'Sin nombre')) {
          // Buscar el plato por platoId numérico
          if (h.platoId) {
            const plato = await platoModel.findOne({ id: h.platoId });
            if (plato && plato.nombre) {
              comandaActualizada.historialPlatos[i].nombreOriginal = plato.nombre;
              necesitaGuardar = true;
              console.log(`✅ Nombre corregido en historialPlatos: platoId=${h.platoId}, nombre=${plato.nombre}`);
            }
          }
        }
      }
      // Guardar los cambios en el historialPlatos si hubo correcciones
      if (necesitaGuardar) {
        await comandaActualizada.save();
      }
    }
    
    console.log(`✅ Comanda ${comandaActualizada.comandaNumber} actualizada - Platos finales: ${comandaActualizada.platos.length}`);
    console.log(`📊 HistorialPlatos eliminados: ${comandaActualizada.historialPlatos?.filter(h => h.estado === 'eliminado').length || 0}`);
    
    return comandaActualizada;
  } catch (error) {
    console.error("❌ Error al editar comanda con auditoría:", error);
    throw error;
  }
};

const actualizarComanda = async (comandaId, newData) => {
  try {
    console.log('✏️ Actualizando comanda:', comandaId);
    console.log('📋 Datos a actualizar:', JSON.stringify(newData, null, 2));
    
    // Si se están actualizando platos, incrementar versión
    if (newData.platos) {
      const comanda = await comandaModel.findById(comandaId);
      if (comanda) {
        newData.version = (comanda.version || 1) + 1;
      }
    }
    
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
      
      // Validar que las cantidades coincidan con los platos (REQUERIDO - rechazar si no coincide)
      if (newData.platos && newData.platos.length !== newData.cantidades.length) {
        const error = new AppError(
          `Desincronización: ${newData.platos.length} platos pero ${newData.cantidades.length} cantidades. Deben coincidir.`,
          400
        );
        logger.warn('Intento de actualizar comanda con platos/cantidades desincronizados', {
          comandaId,
          platosLength: newData.platos.length,
          cantidadesLength: newData.cantidades.length
        });
        throw error;
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
    // FASE 1: Obtener comanda sin populate primero para validar
    let comanda = await comandaModel.findById(comandaId);
    if (!comanda) throw new Error('Comanda no encontrada');
    
    // Populate mesas si es necesario
    if (comanda.mesas && typeof comanda.mesas === 'object' && !comanda.mesas._id) {
      await comanda.populate('mesas');
    }

    // FASE 1: Buscar plato por ObjectId o id numérico
    const platoIndex = comanda.platos.findIndex(p => 
      p.plato.toString() === platoId.toString() || 
      p.platoId?.toString() === platoId.toString()
    );
    
    if (platoIndex === -1) {
      throw new Error('Plato no encontrado en la comanda');
    }
    
    const plato = comanda.platos[platoIndex];
    const estadoActual = plato.estado || 'pedido';
    
    // FASE 1: Validar transición de estado
    if (!validarTransicionPlato(estadoActual, nuevoEstado)) {
      const errorMsg = `FASE1: Transición inválida de estado: "${estadoActual}" → "${nuevoEstado}"`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    console.log(`FASE1: plato ${platoId} → estado ${nuevoEstado} (anterior: ${estadoActual})`);
    
    // FASE 1: Actualización GRANULAR con MongoDB updateOne (solo el plato específico)
    const ahora = moment.tz("America/Lima").toDate();
    
    // Usar updateOne con $set específico para evitar sobrescribir otros campos
    await comandaModel.updateOne(
      { _id: comandaId, "platos.plato": plato.plato },
      { 
        $set: { 
          "platos.$.estado": nuevoEstado,
          [`platos.$.tiempos.${nuevoEstado}`]: ahora,
          updatedAt: ahora
        }
      }
    );
    
    // FASE 1: Recalcular estado global de comanda DESPUÉS de actualizar plato
    await recalcularEstadoComandaPorPlatos(comandaId);
    
    // Obtener comanda actualizada después del recálculo
    const comandaActualizada = await comandaModel.findById(comandaId);
    
    // Obtener la mesa para actualizar su estado
    // Manejar tanto ObjectId como objeto populado
    const mesaId = comandaActualizada.mesas?._id || comandaActualizada.mesas;
    
    // FASE 2: Emitir evento WebSocket GRANULAR (solo plato, no toda la comanda)
    if (global.emitPlatoActualizadoGranular) {
      try {
        // Obtener fecha de la comanda para el room de cocina
        const fecha = comandaActualizada.createdAt 
          ? moment(comandaActualizada.createdAt).tz("America/Lima").format('YYYY-MM-DD')
          : moment().tz("America/Lima").format('YYYY-MM-DD');
        
        await global.emitPlatoActualizadoGranular({
          comandaId: comandaId.toString(),
          platoId: platoId.toString(),
          nuevoEstado: nuevoEstado,
          estadoAnterior: estadoActual,
          mesaId: mesaId ? mesaId.toString() : null,
          fecha: fecha
        });
        console.log(`FASE2: Evento granular emitido para plato ${platoId} → ${nuevoEstado}`);
      } catch (wsError) {
        console.error('FASE2: Error al emitir evento granular:', wsError.message);
        // No fallar la operación si el WebSocket falla
      }
    }
    const mesa = await mesasModel.findById(mesaId);
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
      await mesasModel.updateOne(
        { _id: mesaId },
        { $set: { estado: nuevoEstadoMesa } }
      );
      console.log(`✅ Mesa ${mesa.nummesa} actualizada de "${estadoAnterior}" a "${nuevoEstadoMesa}" después de cambiar estado de plato`);
      
      // Emitir evento Socket.io de mesa actualizada
      if (global.emitMesaActualizada) {
        await global.emitMesaActualizada(mesaId);
      }
    } else {
      console.log(`ℹ️ Mesa ${mesa.nummesa} ya está en estado "${nuevoEstadoMesa}" - No se requiere actualización`);
    }

    // Obtener la comanda actualizada con populate completo (opcional para tests)
    let comandaCompleta = await comandaModel.findById(comandaId);
    
    // Populate de forma segura
    if (comandaCompleta) {
      try {
        // Intentar populate encadenado primero (producción)
        comandaCompleta = await comandaModel
          .findById(comandaId)
          .populate('mozos')
          .populate({
            path: 'mesas',
            populate: { path: 'area' }
          })
          .populate('cliente')
          .populate({
            path: 'platos.plato',
            model: 'platos'
          });
        console.log('✅ FASE1: Comanda populada correctamente en cambiarEstadoPlato');
      } catch (populateError) {
        // Si falla (tests), usar populate individual
        try {
          await comandaCompleta.populate('mozos');
          await comandaCompleta.populate({
            path: 'mesas',
            populate: { path: 'area' }
          });
          await comandaCompleta.populate('cliente');
          await comandaCompleta.populate({
            path: 'platos.plato',
            model: 'platos'
          });
        } catch (populateError2) {
          console.warn('⚠️ Tests: Retornando sin populate:', populateError2.message);
        }
      }
    }

    return comandaCompleta;
  } catch (error) {
    console.error("Error al cambiar el estado del plato en la comanda", error);
    throw error;
  }
};

/**
 * FASE 1: Valida si una transición de estado de PLATO es válida
 * Transiciones permitidas:
 * - 'pedido' → ['recoger', 'entregado']
 * - 'en_espera' → ['recoger', 'entregado'] (equivalente a pedido)
 * - 'recoger' → ['entregado']
 * - 'entregado' → ['pagado']
 * - Cualquier estado → 'pedido' o 'en_espera' (revertir - solo admin/cocina)
 * @param {string} estadoActual - Estado actual del plato
 * @param {string} nuevoEstado - Nuevo estado solicitado
 * @returns {boolean} true si la transición es válida
 */
const validarTransicionPlato = (estadoActual, nuevoEstado) => {
  // Normalizar estados equivalentes
  const estadoNormalizado = estadoActual === 'en_espera' ? 'pedido' : estadoActual;
  const nuevoNormalizado = nuevoEstado === 'en_espera' ? 'pedido' : nuevoEstado;
  
  // Permitir revertir a 'pedido' o 'en_espera' desde cualquier estado (solo admin/cocina)
  if (nuevoNormalizado === 'pedido') {
    return true; // Revertir siempre permitido
  }
  
  // Definir transiciones válidas según el plan
  const transicionesValidas = {
    'pedido': ['recoger', 'entregado'], // Cocina puede marcar como listo o entregado directamente
    'recoger': ['entregado'], // Solo mozo puede marcar como entregado
    'entregado': ['pagado'], // Solo al procesar pago
    'pagado': [] // Estado final, no se puede cambiar (excepto revertir)
  };
  
  const estadosPermitidos = transicionesValidas[estadoNormalizado] || [];
  return estadosPermitidos.includes(nuevoNormalizado);
};

/**
 * Valida si una transición de estado es válida (para comanda global)
 * Transiciones permitidas:
 * - en_espera -> recoger
 * - recoger -> entregado
 * - entregado -> pagado
 * - Cualquier estado -> en_espera (revertir)
 * @param {string} estadoActual - Estado actual de la comanda
 * @param {string} nuevoEstado - Nuevo estado solicitado
 * @returns {boolean} true si la transición es válida
 */
const validarTransicionEstado = (estadoActual, nuevoEstado) => {
  // Permitir revertir a en_espera desde cualquier estado
  if (nuevoEstado === 'en_espera') {
    return true;
  }
  
  // Definir transiciones válidas
  const transicionesValidas = {
    'en_espera': ['recoger'],
    'recoger': ['entregado'],
    'entregado': ['pagado'],
    'pagado': [] // No se puede cambiar desde pagado (excepto revertir)
  };
  
  const estadosPermitidos = transicionesValidas[estadoActual] || [];
  return estadosPermitidos.includes(nuevoEstado);
};

/**
 * Cambia el status de una comanda con validación de transiciones y registro de timestamps
 * @param {string} comandaId - ID de la comanda
 * @param {string} nuevoStatus - Nuevo status
 * @param {Object} options - Opciones adicionales { usuario, deviceId, sourceApp, motivo }
 * @returns {Promise<Object>} Comanda actualizada
 */
const cambiarStatusComanda = async (comandaId, nuevoStatus, options = {}) => {
  try {
      // Obtener comanda actual
      const comandaActual = await comandaModel.findById(comandaId);
      
      if (!comandaActual) {
        throw new AppError('Comanda no encontrada', 404);
      }
      
      const estadoActual = comandaActual.status;
      
      // Validar transición de estado
      if (!validarTransicionEstado(estadoActual, nuevoStatus)) {
        const error = new AppError(
          `Transición inválida: no se puede cambiar de "${estadoActual}" a "${nuevoStatus}"`,
          400
        );
        logger.warn('Intento de transición inválida', {
          comandaId,
          estadoActual,
          nuevoStatus,
          usuario: options.usuario
        });
        throw error;
      }
      
      // Preparar actualización con timestamps
      const updateData = {
        status: nuevoStatus,
        updatedAt: moment.tz("America/Lima").toDate(),
        updatedBy: options.usuario || null
      };
      
      // TIMESTAMPS AUTOMÁTICOS: Actualizar siempre al cambiar de estado
      const timestampActual = moment.tz("America/Lima").toDate();
      if (nuevoStatus === 'en_espera') {
        updateData.tiempoEnEspera = timestampActual;
      } else if (nuevoStatus === 'recoger') {
        updateData.tiempoRecoger = timestampActual;
      } else if (nuevoStatus === 'entregado') {
        updateData.tiempoEntregado = timestampActual;
      } else if (nuevoStatus === 'pagado') {
        updateData.tiempoPagado = timestampActual;
      }
      
      // Actualizar historial de estados
      const historialEntry = {
        status: nuevoStatus,
        statusAnterior: estadoActual,
        timestamp: moment.tz("America/Lima").toDate(),
        usuario: options.usuario || null,
        accion: `Cambio de estado de "${estadoActual}" a "${nuevoStatus}"`,
        deviceId: options.deviceId || null,
        sourceApp: options.sourceApp || null,
        motivo: options.motivo || null
      };
      
      // Usar $set para campos regulares y $push para arrays
      const updateQuery = {
        $set: updateData,
        $push: { historialEstados: historialEntry }
      };
      
      const updatedComanda = await comandaModel.findByIdAndUpdate(
          comandaId,
          updateQuery,
          { new: true }
      ).populate('mesas');
      
      logger.info('Estado de comanda actualizado', {
        comandaId,
        comandaNumber: updatedComanda.comandaNumber,
        estadoAnterior: estadoActual,
        nuevoEstado: nuevoStatus,
        usuario: options.usuario,
        sourceApp: options.sourceApp
      });
      
      // Si el nuevo status es "recoger", actualizar la mesa a "preparado"
      if (nuevoStatus === "recoger" && updatedComanda.mesas) {
        const mesaId = updatedComanda.mesas._id || updatedComanda.mesas;
        const mesa = await mesasModel.findById(mesaId);
        if (mesa && mesa.estado !== "preparado" && mesa.estado !== "pagando") {
          mesa.estado = "preparado";
          await mesa.save();
          logger.info(`Mesa ${mesa.nummesa} actualizada a estado "preparado" - Comanda lista para recoger`);
          
          // Emitir evento Socket.io de mesa actualizada
          if (global.emitMesaActualizada) {
            await global.emitMesaActualizada(mesa._id);
          }
        }
      }
      
      // Si el nuevo status es "entregado", verificar si todas las comandas están entregadas
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
      logger.error("Error al cambiar el estado de la comanda", {
        comandaId,
        nuevoStatus,
        error: error.message,
        stack: error.stack
      });
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
    // ✅ FILTRAR EXPLÍCITAMENTE comandas eliminadas (IsActive debe ser explícitamente true)
    // Primero intentar búsqueda por rango de fechas
    let data = await comandaModel.find({ 
      createdAt: {
        $gte: fechaInicio,
        $lte: fechaFin
      },
      status: { $ne: "entregado" },
      IsActive: true // ✅ SOLO comandas activas (IsActive debe ser explícitamente true)
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
        IsActive: true // ✅ SOLO comandas activas (IsActive debe ser explícitamente true)
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
/**
 * Recalcula el estado de una mesa basado en las comandas activas
 * PRIORIDAD SIMPLIFICADA: en_espera > recoger > entregado > pagado
 * @param {string} mesaId - ID de la mesa
 * @param {object} session - Sesión de MongoDB (opcional)
 * @returns {Promise<string>} - Nuevo estado de la mesa
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
      // Contar comandas por estado (simplificado)
      const comandasEnEspera = comandasActivas.filter(c => c.status === 'en_espera');
      const comandasRecoger = comandasActivas.filter(c => c.status === 'recoger');
      const comandasEntregadas = comandasActivas.filter(c => c.status === 'entregado');
      
      // PRIORIDAD CLARA Y SIMPLE
      if (comandasEnEspera.length > 0) {
        nuevoEstadoMesa = 'pedido';
        logger.debug('Mesa con comandas en espera', {
          mesaId,
          comandasEnEspera: comandasEnEspera.length,
          nuevoEstado: nuevoEstadoMesa
        });
      } else if (comandasRecoger.length > 0) {
        nuevoEstadoMesa = 'preparado';
        logger.debug('Mesa con comandas listas para recoger', {
          mesaId,
          comandasRecoger: comandasRecoger.length,
          nuevoEstado: nuevoEstadoMesa
        });
      } else if (comandasEntregadas.length > 0) {
        nuevoEstadoMesa = 'preparado';
        logger.debug('Mesa con comandas entregadas esperando pago', {
          mesaId,
          comandasEntregadas: comandasEntregadas.length,
          nuevoEstado: nuevoEstadoMesa
        });
      }
    } else {
      nuevoEstadoMesa = 'libre';
      logger.debug('Mesa sin comandas activas', { mesaId, nuevoEstado: nuevoEstadoMesa });
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
        logger.info('Estado de mesa actualizado', {
          mesaId: mesa._id,
          numMesa: mesa.nummesa,
          estadoAnterior,
          nuevoEstado: nuevoEstadoMesa
        });
        
        // Emitir evento Socket.io de mesa actualizada (solo si no hay sesión activa, para evitar duplicados)
        if (!session && global.emitMesaActualizada) {
          await global.emitMesaActualizada(mesa._id);
        }
      } else {
        logger.debug('Mesa ya está en el estado correcto', {
          mesaId: mesa._id,
          numMesa: mesa.nummesa,
          estado: nuevoEstadoMesa
        });
      }
    } else {
      logger.warn('Mesa no encontrada para actualizar estado', { mesaId });
    }
    
    return nuevoEstadoMesa;
  } catch (error) {
    logger.error("Error al recalcular estado de mesa", {
      mesaId,
      error: error.message,
      stack: error.stack
    });
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

/**
 * Obtiene las comandas listas para pagar de una mesa específica
 * Filtra solo comandas activas con status 'preparado' o 'entregado' y platos no eliminados
 * @param {string} mesaId - ID de la mesa
 * @returns {Promise<Array>} Array de comandas listas para pagar
 */
const getComandasParaPagar = async (mesaId) => {
  try {
    // ✅ FILTRADO EXACTO: Solo comandas listas para pagar
    // - mesas: mesaId específica
    // - IsActive: true (no eliminadas)
    // - status: ['preparado', 'recoger', 'entregado'] (listas para pagar, excluye 'pagado')
    // - Excluir platos eliminados
    const comandas = await comandaModel.find({
      mesas: mesaId,
      IsActive: true,
      status: { $in: ['preparado', 'recoger', 'entregado'] } // Solo listas para pagar (excluye 'pagado' automáticamente)
    })
    .populate('platos.plato', 'nombre precio')
    .populate('mozos', 'name')
    .populate('mesas', 'nummesa estado')
    .sort({ createdAt: -1 }); // Más recientes primero

    // Filtrar comandas que tengan al menos un plato no eliminado
    const comandasConPlatosValidos = comandas.filter(comanda => {
      if (!comanda.platos || comanda.platos.length === 0) {
        return false; // Excluir comandas sin platos
      }
      // Verificar que tenga al menos un plato no eliminado
      const tienePlatosNoEliminados = comanda.platos.some(p => !p.eliminado);
      return tienePlatosNoEliminados;
    });

    // Asegurar que los platos estén populados (fallback manual)
    const comandasConPlatos = await ensurePlatosPopulated(comandasConPlatosValidos);
    
    console.log(`✅ [getComandasParaPagar] Mesa ${mesaId}: ${comandasConPlatos.length} comandas listas para pagar`);
    
    return comandasConPlatos;
  } catch (error) {
    console.error("❌ Error al obtener comandas para pagar:", error);
    throw error;
  }
};

/**
 * Valida que las comandas proporcionadas pertenecen a la mesa y no están pagadas
 * @param {string} mesaId - ID de la mesa
 * @param {Array<string>} comandasIds - Array de IDs de comandas a validar
 * @returns {Promise<Array>} Array de comandas válidas
 */
const validarComandasParaPagar = async (mesaId, comandasIds) => {
  try {
    if (!Array.isArray(comandasIds) || comandasIds.length === 0) {
      throw new Error('Debe proporcionar al menos una comanda');
    }

    const comandas = await comandaModel.find({
      _id: { $in: comandasIds },
      mesas: mesaId,
      IsActive: true,
      status: { $in: ['preparado', 'recoger', 'entregado'] }, // Solo preparadas o entregadas (incluye preparado)
      'platos.eliminado': { $ne: true }
    })
    .populate('platos.plato', 'nombre precio')
    .populate('mozos')
    .populate('mesas', 'nummesa');

    // Verificar que todas las comandas solicitadas fueron encontradas
    if (comandas.length !== comandasIds.length) {
      const encontradas = comandas.map(c => c._id.toString());
      const faltantes = comandasIds.filter(id => !encontradas.includes(id.toString()));
      throw new Error(`Algunas comandas no son válidas para pagar: ${faltantes.join(', ')}`);
    }

    // Asegurar que los platos estén populados
    const comandasConPlatos = await ensurePlatosPopulated(comandas);
    
    return comandasConPlatos;
  } catch (error) {
    console.error("❌ Error al validar comandas para pagar:", error);
    throw error;
  }
};

/**
 * Construye mapa platoId (numérico) -> _id actual en BD. Llamar después de importar platos.
 */
const buildPlatoIdToObjectIdMap = async () => {
  const platos = await platoModel.find({}).select('id _id').lean();
  const map = new Map();
  platos.forEach(p => { if (p.id != null) map.set(Number(p.id), p._id); });
  return map;
};

/**
 * Importa comandas desde data/comandas.json. Reemplaza refs de plato por _id actual en BD.
 */
const importarComandasDesdeJSON = async () => {
  try {
    const filePath = path.join(DATA_DIR, 'comandas.json');
    if (!fs.existsSync(filePath)) {
      console.log('⚠️ Archivo comandas.json no encontrado');
      return { imported: 0, updated: 0, errors: 0 };
    }
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(jsonData)) {
      console.log('⚠️ comandas.json no contiene un array válido');
      return { imported: 0, updated: 0, errors: 0 };
    }
    const platoIdMap = await buildPlatoIdToObjectIdMap();
    const toObjId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);
    let imported = 0, errors = 0;
    for (const item of jsonData) {
      try {
        const existente = await comandaModel.findById(item._id).lean();
        if (existente) continue;
        const platos = (item.platos || []).map(p => ({
          plato: platoIdMap.get(Number(p.platoId)) || toObjId(p.plato),
          platoId: p.platoId,
          estado: p.estado || 'en_espera',
          eliminado: p.eliminado === true,
          eliminadoPor: toObjId(p.eliminadoPor),
          eliminadoAt: p.eliminadoAt ? new Date(p.eliminadoAt) : null,
          eliminadoRazon: p.eliminadoRazon || null
        }));
        const doc = {
          _id: toObjId(item._id),
          mozos: toObjId(item.mozos),
          mesas: toObjId(item.mesas),
          cliente: toObjId(item.cliente),
          dividedFrom: toObjId(item.dividedFrom),
          platos,
          cantidades: item.cantidades || platos.map(() => 1),
          observaciones: item.observaciones || '',
          status: item.status || 'en_espera',
          IsActive: item.IsActive !== false,
          comandaNumber: item.comandaNumber,
          tiempoEnEspera: item.tiempoEnEspera ? new Date(item.tiempoEnEspera) : null,
          tiempoRecoger: item.tiempoRecoger ? new Date(item.tiempoRecoger) : null,
          tiempoEntregado: item.tiempoEntregado ? new Date(item.tiempoEntregado) : null,
          tiempoPagado: item.tiempoPagado ? new Date(item.tiempoPagado) : null,
          createdBy: toObjId(item.createdBy),
          updatedBy: toObjId(item.updatedBy),
          deviceId: item.deviceId || null,
          sourceApp: item.sourceApp || null,
          fechaEliminacion: item.fechaEliminacion ? new Date(item.fechaEliminacion) : null,
          motivoEliminacion: item.motivoEliminacion || null,
          eliminadaPor: toObjId(item.eliminadaPor),
          precioTotalOriginal: item.precioTotalOriginal ?? 0,
          precioTotal: item.precioTotal ?? 0,
          version: item.version ?? 1,
          createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
        };
        if (item.historialEstados && item.historialEstados.length) {
          doc.historialEstados = item.historialEstados.map(h => ({
            status: h.status,
            statusAnterior: h.statusAnterior,
            timestamp: h.timestamp ? new Date(h.timestamp) : new Date(),
            usuario: toObjId(h.usuario),
            accion: h.accion,
            deviceId: h.deviceId,
            sourceApp: h.sourceApp,
            motivo: h.motivo
          }));
        }
        if (item.historialPlatos && item.historialPlatos.length) {
          doc.historialPlatos = item.historialPlatos.map(h => ({
            platoId: h.platoId,
            nombreOriginal: h.nombreOriginal,
            cantidadOriginal: h.cantidadOriginal,
            cantidadFinal: h.cantidadFinal,
            estado: h.estado || 'activo',
            timestamp: h.timestamp ? new Date(h.timestamp) : new Date(),
            usuario: toObjId(h.usuario),
            motivo: h.motivo
          }));
        }
        await comandaModel.create(doc);
        imported++;
      } catch (err) {
        errors++;
        console.error(`❌ Error al importar comanda ${item.comandaNumber || item._id}:`, err.message);
      }
    }
    if (imported > 0 || errors > 0) {
      console.log(`✅ Comandas: ${imported} importadas${errors ? `, ${errors} errores` : ''}`);
    }
    return { imported, updated: 0, errors };
  } catch (error) {
    console.error('❌ Error al importar comandas:', error.message);
    return { imported: 0, updated: 0, errors: 1 };
  }
};

/**
 * Marca un plato individual como entregado
 * Solo permite transición desde estado "recoger" a "entregado"
 * @param {String} comandaId - ID de la comanda
 * @param {String|Number} platoId - ID del plato (puede ser ObjectId o platoId numérico)
 * @returns {Object} Comanda actualizada
 */
const marcarPlatoComoEntregado = async (comandaId, platoId) => {
  try {
    // Buscar comanda
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) {
      throw new Error('Comanda no encontrada');
    }
    
    // Encontrar plato - buscar por platoId numérico o ObjectId
    const platoIndex = comanda.platos.findIndex(p => {
      // Comparar por platoId numérico
      if (p.platoId && p.platoId.toString() === platoId.toString()) {
        return true;
      }
      // Comparar por ObjectId
      if (p.plato && (p.plato.toString() === platoId.toString() || p.plato._id?.toString() === platoId.toString())) {
        return true;
      }
      return false;
    });
    
    if (platoIndex === -1) {
      throw new Error('Plato no encontrado en la comanda');
    }
    
    const plato = comanda.platos[platoIndex];
    
    // VALIDACIÓN CRÍTICA: Solo desde "recoger"
    if (plato.estado !== 'recoger' && plato.estado !== 'en_espera') {
      throw new Error(`No se puede marcar como entregado un plato en estado "${plato.estado}". Solo se permiten platos en estado "recoger" o "en_espera".`);
    }
    
    // VALIDACIÓN: No revertir si ya está entregado
    if (plato.estado === 'entregado') {
      throw new Error('Este plato ya fue marcado como entregado. No se puede revertir.');
    }
    
    // Actualizar estado y timestamp
    const estadoAnterior = plato.estado;
    comanda.platos[platoIndex].estado = 'entregado';
    
    // Inicializar tiempos si no existe
    if (!comanda.platos[platoIndex].tiempos) {
      comanda.platos[platoIndex].tiempos = {};
    }
    
    // Actualizar timestamp de entregado
    comanda.platos[platoIndex].tiempos.entregado = moment.tz("America/Lima").toDate();
    
    // Si no tiene timestamp de pedido, establecerlo ahora
    if (!comanda.platos[platoIndex].tiempos.pedido) {
      comanda.platos[platoIndex].tiempos.pedido = comanda.createdAt || moment.tz("America/Lima").toDate();
    }
    
    await comanda.save();
    
    // Recalcular estado de comanda basado en estados de platos
    await recalcularEstadoComandaPorPlatos(comandaId);
    
    // Obtener plato populado para el evento
    const platoPopulado = await comandaModel.findById(comandaId)
      .populate('platos.plato')
      .then(c => c.platos[platoIndex]);
    
    // Emitir evento WebSocket
    if (global.emitPlatoEntregado) {
      const platoNombre = platoPopulado?.plato?.nombre || 'Plato desconocido';
      await global.emitPlatoEntregado(comandaId, platoId, platoNombre, estadoAnterior);
    }
    
    // Retornar comanda actualizada populada
    return await comandaModel.findById(comandaId)
      .populate('mozos')
      .populate('mesas')
      .populate('platos.plato');
      
  } catch (error) {
    console.error('❌ Error al marcar plato como entregado:', error);
    throw error;
  }
};

/**
 * FASE 1: Calcula el estado global inicial de una comanda basado en estados de platos
 * - Si TODOS los platos tienen MISMO estado → usar ese estado
 * - Si hay mezcla → usar estado MÁS BAJO ('en_espera')
 * - Ignora platos eliminados
 * @param {Array} platos - Array de platos con estados
 * @returns {string} Estado global calculado
 */
const calcularEstadoGlobalInicial = (platos) => {
  if (!platos || platos.length === 0) {
    return 'en_espera'; // Default si no hay platos
  }
  
  // Filtrar solo platos no eliminados
  const platosActivos = platos.filter(p => !p.eliminado);
  
  if (platosActivos.length === 0) {
    return 'en_espera';
  }
  
  // Obtener estados únicos de platos activos
  const estados = platosActivos.map(p => {
    const estado = p.estado || 'pedido';
    // Normalizar 'en_espera' a 'pedido' para comparación
    return estado === 'en_espera' ? 'pedido' : estado;
  });
  
  const estadosUnicos = [...new Set(estados)];
  
  // Si todos tienen el mismo estado, usar ese estado
  if (estadosUnicos.length === 1) {
    const estadoUnico = estadosUnicos[0];
    // Mapear 'pedido' a 'en_espera' para estado global de comanda
    return estadoUnico === 'pedido' ? 'en_espera' : estadoUnico;
  }
  
  // Si hay mezcla, usar el estado más bajo (más temprano en el flujo)
  const prioridad = { 
    'pedido': 1, 
    'en_espera': 1, 
    'recoger': 2, 
    'entregado': 3, 
    'pagado': 4 
  };
  
  const estadoMasBajo = estados.reduce((min, e) => 
    prioridad[e] < prioridad[min] ? e : min
  );
  
  // Mapear 'pedido' a 'en_espera' para estado global
  return estadoMasBajo === 'pedido' ? 'en_espera' : estadoMasBajo;
};

/**
 * Recalcula el estado de la comanda basado en los estados individuales de los platos
 * @param {String} comandaId - ID de la comanda
 */
const recalcularEstadoComandaPorPlatos = async (comandaId) => {
  try {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) {
      console.warn(`⚠️ Comanda ${comandaId} no encontrada para recalcular estado`);
      return;
    }
    
    // Contar platos por estado (solo platos no eliminados)
    const platosActivos = comanda.platos.filter(p => !p.eliminado);
    
    const cuentas = {
      pedido: 0,
      en_espera: 0,
      recoger: 0,
      entregado: 0,
      pagado: 0
    };
    
    platosActivos.forEach(plato => {
      const estado = plato.estado || 'pedido';
      // Normalizar 'en_espera' como 'pedido'
      const estadoNormalizado = estado === 'en_espera' ? 'pedido' : estado;
      cuentas[estadoNormalizado] = (cuentas[estadoNormalizado] || 0) + 1;
    });
    
    const total = platosActivos.length;
    
    // Determinar nuevo estado de comanda
    let nuevoEstado = comanda.status;
    const estadoAnterior = comanda.status;
    
    if (total === 0) {
      // Sin platos activos, mantener estado actual o cambiar a 'en_espera'
      nuevoEstado = 'en_espera';
    } else if (cuentas.pagado === total) {
      // Todos pagados
      nuevoEstado = 'pagado';
    } else if (cuentas.entregado === total) {
      // Todos entregados
      nuevoEstado = 'entregado';
    } else if (cuentas.recoger > 0 || cuentas.entregado > 0) {
      // Al menos uno listo para recoger o entregado
      nuevoEstado = 'recoger';
    } else if (cuentas.pedido === total) {
      // Todos en pedido
      nuevoEstado = 'en_espera';
    }
    
    // Actualizar si cambió
    if (comanda.status !== nuevoEstado) {
      comanda.status = nuevoEstado;
      
      // Actualizar timestamps de estado de comanda
      if (nuevoEstado === 'recoger' && !comanda.tiempoRecoger) {
        comanda.tiempoRecoger = moment.tz("America/Lima").toDate();
      } else if (nuevoEstado === 'entregado' && !comanda.tiempoEntregado) {
        comanda.tiempoEntregado = moment.tz("America/Lima").toDate();
      }
      
      await comanda.save();
      
      // Recalcular estado de mesa
      if (comanda.mesas) {
        await recalcularEstadoMesa(comanda.mesas);
      }
      
      // Emitir evento WebSocket
      if (global.emitComandaActualizada) {
        await global.emitComandaActualizada(comandaId, estadoAnterior, nuevoEstado, cuentas);
      }
      
      logger.debug('Estado de comanda recalculado', {
        comandaId,
        estadoAnterior,
        nuevoEstado,
        cuentas
      });
    }
    
  } catch (error) {
    console.error('❌ Error al recalcular estado de comanda por platos:', error);
    // No lanzar error para no interrumpir el flujo principal
  }
};

module.exports = { 
  listarComanda, 
  agregarComanda, 
  eliminarComanda, 
  eliminarLogicamente,
  editarConAuditoria,
  actualizarComanda, 
  cambiarStatusComanda, 
  cambiarEstadoComanda, 
  listarComandaPorFecha, 
  listarComandaPorFechaEntregado, 
  cambiarEstadoPlato, 
  revertirStatusComanda, 
  recalcularEstadoMesa,
  validarTransicionEstado, // Exportar para tests
  validarTransicionPlato, // FASE 1: Exportar para tests
  calcularEstadoGlobalInicial, // FASE 1: Exportar para tests
  getComandasParaPagar,
  validarComandasParaPagar,
  importarComandasDesdeJSON,
  buildPlatoIdToObjectIdMap,
  ensurePlatosPopulated,
  marcarPlatoComoEntregado,
  recalcularEstadoComandaPorPlatos
};
