const comandaModel = require("../database/models/comanda.model");
const mesasModel = require("../database/models/mesas.model");
const platoModel = require("../database/models/plato.model");
const HistorialComandas = require("../database/models/historialComandas.model");
const pedidoModel = require("../database/models/pedido.model");
const { syncJsonFile } = require('../utils/jsonSync');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errorHandler');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// FASE 5: Redis Cache para comandas activas
const redisCache = require('../utils/redisCache');
const calculosPrecios = require('../utils/calculosPrecios');
const configuracionRepository = require('./configuracion.repository');

// ========== RESERVAS: Importar repositorio de reservas ==========
// Importacion diferida para evitar dependencia circular
let reservaRepository = null;
const getReservaRepository = () => {
    if (!reservaRepository) {
        reservaRepository = require('./reserva.repository');
    }
    return reservaRepository;
};
// ========== FIN RESERVAS ==========

const DATA_DIR = path.join(__dirname, '../../data');

// ==================== FASE A1: PROYECCIONES OPTIMIZADAS ====================
/**
 * Proyecciones para reducir el tamaño de los documentos retornados
 * Solo incluye los campos que realmente necesita cada tipo de cliente
 */

// Proyección para app de Cocina (endpoint más crítico)
const PROYECCION_COCINA = {
    _id: 1,
    comandaNumber: 1,
    status: 1,
    prioridadOrden: 1,
    createdAt: 1,
    updatedAt: 1,
    observaciones: 1,
    cantidades: 1,
    IsActive: 1,
    eliminada: 1,
    // Campos desnormalizados (evitan populate)
    mozoNombre: 1,
    mesaNumero: 1,
    areaNombre: 1,
    // Referencias mínimas (solo para fallback si no hay desnormalizados)
    mozos: 1,
    mesas: 1,
    // Platos con solo campos necesarios
    'platos._id': 1,  // 🔥 CRÍTICO: ID único del subdocumento (distingue platos duplicados con diferentes complementos)
    'platos.platoId': 1,
    'platos.estado': 1,
    'platos.eliminado': 1,
    'platos.anulado': 1,
    'platos.complementosSeleccionados': 1,
    'platos.notaEspecial': 1,
    'platos.tiempos': 1,
    'platos.eliminadoPor': 1,
    'platos.eliminadoAt': 1,
    'platos.eliminadoRazon': 1,
    'platos.anuladoPor': 1,
    'platos.anuladoRazon': 1,
    'platos.procesandoPor': 1,  // 🔥 v7.2: Info del cocinero que está preparando el plato
    'platos.procesadoPor': 1,   // 🔥 v7.2: Info del cocinero que terminó el plato
    'platos.plato': 1,  // Se popula solo con nombre y precio
    // Auditoría mínima
    historialPlatos: 1
};

// Proyección para resumen de mesas (app de mozos - mapa de mesas)
const PROYECCION_RESUMEN_MESA = {
    _id: 1,
    comandaNumber: 1,
    status: 1,
    precioTotal: 1,
    mesaNumero: 1,
    mozoNombre: 1,
    areaNombre: 1,
    totalPlatos: 1,
    platosActivos: 1,
    createdAt: 1,
    mesas: 1,
    mozos: 1,
    IsActive: 1,
    'platos._id': 1,  // 🔥 CRÍTICO: ID único del subdocumento
    'platos.estado': 1,
    'platos.eliminado': 1,
    'platos.anulado': 1
};

// Proyección para pagos (campos necesarios para cálculo)
const PROYECCION_PAGOS = {
    _id: 1,
    comandaNumber: 1,
    status: 1,
    precioTotal: 1,
    precioTotalOriginal: 1,
    mesaNumero: 1,
    mozoNombre: 1,
    clienteNombre: 1,
    observaciones: 1,
    createdAt: 1,
    cantidades: 1,
    mesas: 1,
    mozos: 1,
    cliente: 1,
    IsActive: 1,
    'platos._id': 1,  // 🔥 CRÍTICO: ID único del subdocumento
    'platos.platoId': 1,
    'platos.estado': 1,
    'platos.eliminado': 1,
    'platos.anulado': 1,
    'platos.complementosSeleccionados': 1,
    'platos.plato': 1
};

// ==================== FIN PROYECCIONES FASE A1 ====================

/**
 * Helper para validar y convertir usuarioId a ObjectId válido
 * Si no es un ObjectId válido, retorna null
 */
const validarUsuarioId = (usuarioId) => {
  if (!usuarioId) return null;
  
  // Si ya es un ObjectId de mongoose, retornarlo
  if (usuarioId instanceof mongoose.Types.ObjectId) {
    return usuarioId;
  }
  
  // Si es un string de 24 caracteres hexadecimales, convertirlo
  if (typeof usuarioId === 'string' && mongoose.Types.ObjectId.isValid(usuarioId) && usuarioId.length === 24) {
    return new mongoose.Types.ObjectId(usuarioId);
  }
  
  // Si es 'admin' u otro string no válido, retornar null
  console.log(`⚠️ usuarioId "${usuarioId}" no es un ObjectId válido, usando null`);
  return null;
};

/**
 * Helper para sanitizar historialPlatos existente - limpia usuarios inválidos
 */
const sanitizarHistorialPlatos = (historialPlatos) => {
  if (!historialPlatos || !Array.isArray(historialPlatos)) return historialPlatos;
  
  return historialPlatos.map(item => ({
    ...item,
    usuario: validarUsuarioId(item.usuario)
  }));
};

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

const listarComanda = async (incluirEliminadas = false, usarProyeccion = true) => {
  try {
    console.log('🔍 [FASE A1] Listando comandas...');
    const startTime = Date.now();
    
    // ESTANDARIZADO: Solo usar IsActive para soft-delete
    const query = incluirEliminadas 
      ? {} 
      : { 
          IsActive: { $ne: false, $exists: true },
          eliminada: { $ne: true }
        };
    
    // ==================== FASE A1: QUERY OPTIMIZADA ====================
    // Construir query con lean() y proyecciones
    let dbQuery = comandaModel.find(query);
    
    // Aplicar proyección para reducir payload
    if (usarProyeccion) {
      dbQuery = dbQuery.select({
        _id: 1,
        comandaNumber: 1,
        status: 1,
        precioTotal: 1,
        prioridadOrden: 1,
        createdAt: 1,
        updatedAt: 1,
        observaciones: 1,
        cantidades: 1,
        IsActive: 1,
        eliminada: 1,
        // Campos desnormalizados
        mozoNombre: 1,
        mesaNumero: 1,
        areaNombre: 1,
        totalPlatos: 1,
        platosActivos: 1,
        // Referencias mínimas
        mozos: 1,
        mesas: 1,
        cliente: 1,
        pedido: 1,
        // Platos con campos necesarios
        'platos.platoId': 1,
        'platos.estado': 1,
        'platos.eliminado': 1,
        'platos.anulado': 1,
        'platos.complementosSeleccionados': 1,
        'platos.notaEspecial': 1,
        'platos.plato': 1
      });
    }
    
    // Usar lean() para objetos planos (mucho más rápido)
    dbQuery = dbQuery
      .sort({ createdAt: -1, comandaNumber: -1 })
      .lean();
    
    // Populate MÍNIMO: solo campos necesarios
    dbQuery = dbQuery.populate({
      path: "mozos",
      select: "name DNI",
      options: { lean: true }
    });
    dbQuery = dbQuery.populate({
      path: "mesas",
      select: "nummesa estado area",
      options: { lean: true },
      populate: {
        path: "area",
        select: "nombre",
        options: { lean: true }
      }
    });
    dbQuery = dbQuery.populate({
      path: "cliente",
      select: "nombre dni telefono",
      options: { lean: true }
    });
    dbQuery = dbQuery.populate({
      path: "platos.plato",
      select: "nombre precio categoria",
      options: { lean: true }
    });
    
    let data = await dbQuery.exec();
    // ==================== FIN QUERY OPTIMIZADA ====================
    
    // Procesar comandas para usar campos desnormalizados
    const dataProcesada = data.map(comanda => {
      // Usar campos desnormalizados si existen, sino usar populate
      if (!comanda.mozoNombre && comanda.mozos?.name) {
        comanda.mozoNombre = comanda.mozos.name;
      }
      if (!comanda.mesaNumero && comanda.mesas?.nummesa) {
        comanda.mesaNumero = comanda.mesas.nummesa;
      }
      if (!comanda.areaNombre && comanda.mesas?.area?.nombre) {
        comanda.areaNombre = comanda.mesas.area.nombre;
      }
      return comanda;
    });
    
    const elapsedMs = Date.now() - startTime;
    console.log(`✅ [FASE A1] listarComanda: ${dataProcesada.length} comandas en ${elapsedMs}ms`);
    
    return dataProcesada;
  } catch (error) {
    console.error("❌ Error al listar la comanda:", error);
    console.error("Stack trace:", error.stack);
    throw error;
  }
};

// ==================== FASE A1: VALIDACIÓN BATCH DE PLATOS ====================
/**
 * Valida múltiples platos en una sola consulta (optimización)
 * Antes: N consultas (una por plato)
 * Ahora: 1-2 consultas (batch con $in)
 * @param {Array} platosRefs - Array de referencias a platos (ObjectId o ID numérico)
 * @returns {Promise<Map>} - Mapa de platos encontrados con su información
 */
const validarPlatosBatch = async (platosRefs) => {
  const startTime = Date.now();
  const platoMap = new Map();
  
  if (!platosRefs || platosRefs.length === 0) {
    return platoMap;
  }
  
  // Separar ObjectIds de IDs numéricos
  const objectIds = [];
  const numericIds = [];
  
  platosRefs.forEach(ref => {
    const platoRef = ref?.plato ?? ref?.platoId ?? ref;
    if (platoRef == null || platoRef === '') return;
    
    if (mongoose.Types.ObjectId.isValid(platoRef) && String(platoRef).length === 24) {
      objectIds.push(platoRef);
    } else if (typeof platoRef === 'number' || !Number.isNaN(Number(platoRef))) {
      numericIds.push(Number(platoRef));
    }
  });
  
  // Construir query con $or para buscar ambos tipos de IDs
  const orConditions = [];
  if (objectIds.length > 0) {
    orConditions.push({ _id: { $in: objectIds } });
  }
  if (numericIds.length > 0) {
    orConditions.push({ id: { $in: numericIds } });
  }
  
  if (orConditions.length === 0) {
    return platoMap;
  }
  
  // UNA sola consulta para todos los platos
  const platosEncontrados = await platoModel.find({
    $or: orConditions,
    isActive: { $ne: false }
  }).lean();
  
  // Llenar el mapa para lookup O(1)
  platosEncontrados.forEach(plato => {
    // Por ObjectId
    platoMap.set(plato._id.toString(), plato);
    // Por ID numérico
    if (plato.id) {
      platoMap.set(plato.id, plato);
      platoMap.set(String(plato.id), plato);
    }
  });
  
  const elapsedMs = Date.now() - startTime;
  console.log(`✅ [FASE A1] Validados ${platosEncontrados.length} platos en ${elapsedMs}ms (batch)`);
  
  return platoMap;
};

/**
 * Obtiene información de mesa y mozo para desnormalización
 * @param {ObjectId} mesaId - ID de la mesa
 * @param {ObjectId} mozoId - ID del mozo
 * @returns {Promise<Object>} - Objeto con datos desnormalizados
 */
const obtenerDatosDesnormalizados = async (mesaId, mozoId) => {
  const datos = {
    mozoNombre: null,
    mesaNumero: null,
    areaNombre: null
  };
  
  // Obtener mesa con área en una consulta
  if (mesaId) {
    const mesa = await mesasModel.findById(mesaId)
      .populate('area', 'nombre')
      .lean();
    
    if (mesa) {
      datos.mesaNumero = mesa.nummesa;
      datos.areaNombre = mesa.area?.nombre || null;
    }
  }
  
  // Obtener mozo en una consulta separada (podría combinarse si es necesario)
  if (mozoId) {
    const mozoModel = require('../database/models/mozos.model');
    const mozo = await mozoModel.findById(mozoId).select('name').lean();
    if (mozo) {
      datos.mozoNombre = mozo.name;
    }
  }
  
  return datos;
};
// ==================== FIN VALIDACIÓN BATCH FASE A1 ====================

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

  // Validar que la mesa exista. NO se valida el estado de comandas existentes en la mesa:
  // las comandas son entidades independientes y una mesa puede tener múltiples comandas
  // simultáneas en cualquier estado (en_espera, recoger, entregado).
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

  // Validación de mesa: solo rechazar si está reservada. NO validar estado de comandas existentes.
  // Las comandas son independientes: una mesa puede tener múltiples comandas en cualquier combinación
  // de estados (en_espera, recoger, entregado). No hay restricción por "mismo mozo" ni por estado previo.
  const estadoMesa = (mesa.estado || 'libre').toLowerCase();
  
  // ========== RESERVAS: Validacion de mozo autorizado ==========
  if (estadoMesa === 'reservado') {
    console.log(`🔍 Mesa ${mesa.nummesa} está reservada. Verificando autorización del mozo...`);
    console.log(`🔍 Mesa ID: ${mesa._id}, Mozo solicitante: ${data.mozos}`);
    
    try {
      const reservaActiva = await getReservaRepository().obtenerReservaActivaPorMesa(mesa._id);
      
      console.log(`🔍 Resultado búsqueda reserva:`, reservaActiva ? {
        id: reservaActiva._id,
        estado: reservaActiva.estado,
        mozo: reservaActiva.mozo
      } : 'NO ENCONTRADA');
      
      if (reservaActiva) {
        // Si hay un mozo asignado en la reserva
        // El mozo puede ser un ObjectId directo o un objeto poblado
        const mozoAsignadoId = reservaActiva.mozo?._id 
          ? reservaActiva.mozo._id.toString() 
          : (reservaActiva.mozo ? reservaActiva.mozo.toString() : null);
        
        if (mozoAsignadoId) {
          const mozoSolicitante = data.mozos ? data.mozos.toString() : null;
          
          console.log(`🔍 Comparando mozos - Asignado: ${mozoAsignadoId}, Solicitante: ${mozoSolicitante}`);
          
          if (mozoSolicitante && mozoAsignadoId !== mozoSolicitante) {
            const mozoNombre = reservaActiva.mozo?.name || 'desconocido';
            const errorMsg = `Mesa reservada. Solo el mozo asignado (${mozoNombre}) puede atender esta mesa.`;
            console.error(`❌ ${errorMsg} - Mozo solicitante: ${mozoSolicitante}`);
            const error = new Error(errorMsg);
            error.statusCode = 403; // Forbidden
            throw error;
          }
          
          // Mozo autorizado: marcar reserva como activa
          console.log(`✅ Mozo autorizado para mesa reservada ${mesa.nummesa}`);
          
        } else {
          // No hay mozo asignado: cualquier mozo puede atender
          console.log(`ℹ️ Mesa ${mesa.nummesa} reservada sin mozo asignado. Cualquier mozo puede atender.`);
        }
        
        // Marcar la reserva como activa
        await getReservaRepository().marcarReservaComoActiva(reservaActiva._id);
        
        // Guardar referencia a la reserva en la comanda
        data.origenReserva = reservaActiva._id;
        
      } else {
        // No hay reserva activa, pero la mesa está en estado reservado (inconsistencia o expiró)
        // Permitir que cualquier mozo pueda atender y cambiar el estado de la mesa
        console.log(`⚠️ Mesa ${mesa.nummesa} en estado 'reservado' sin reserva activa. Permitiendo crear comanda.`);
        console.log(`📝 El estado de la mesa se actualizará a 'pedido' automáticamente.`);
        
        // Actualizar el estado de la mesa a 'pedido' para corregir la inconsistencia
        mesa.estado = 'pedido';
        await mesa.save();
        console.log(`✅ Mesa ${mesa.nummesa} actualizada a estado 'pedido'`);
      }
    } catch (err) {
      if (err.statusCode) throw err; // Re-lanzar errores con status
      console.error('❌ Error al validar reserva:', err.message);
      throw new Error('Error al validar reserva de mesa');
    }
  }
  // ========== FIN VALIDACION RESERVAS ==========
  // Libre, pedido, preparado, esperando, pagado: permitir crear comanda. La mesa existe y está activa.
  console.log(`✅ Permitiendo nueva comanda en mesa ${mesa.nummesa} (estado: ${estadoMesa}) - Sin restricción por comandas existentes`);

  // ========== FASE A1: VALIDACIÓN BATCH DE PLATOS (OPTIMIZADO) ==========
  const ahora = moment.tz("America/Lima").toDate();
  
  // 🚀 OPTIMIZACIÓN: Validar TODOS los platos en una sola consulta
  console.log(`🔍 [FASE A1] Validando ${data.platos.length} platos en batch...`);
  const platosMap = await validarPlatosBatch(data.platos);
  
  // Validar que cada plato tenga un ID válido y exista
  for (let index = 0; index < data.platos.length; index++) {
    const plato = data.platos[index];
    const platoRef = plato.plato ?? plato.platoId;
    if (platoRef == null || platoRef === '') {
      const err = new Error(`El plato en la posición ${index} no tiene ID`);
      err.statusCode = 400;
      throw err;
    }

    // Buscar en el mapa (O(1)) en lugar de consulta individual
    let platoCompleto = null;
    const isObjectId = mongoose.Types.ObjectId.isValid(platoRef) && String(platoRef).length === 24;
    
    if (isObjectId) {
      platoCompleto = platosMap.get(String(platoRef));
    }
    if (!platoCompleto) {
      platoCompleto = platosMap.get(Number(platoRef)) || platosMap.get(String(platoRef));
    }
    
    if (!platoCompleto) {
      const err = new Error(`Plato no encontrado. ID: ${platoRef}`);
      err.statusCode = 404;
      throw err;
    }
    if (platoCompleto.isActive === false) {
      const err = new Error(`Plato inactivo o eliminado. ID: ${platoCompleto.id ?? platoCompleto._id}`);
      err.statusCode = 400;
      throw err;
    }
    plato.plato = platoCompleto._id;
    plato.platoId = platoCompleto.id;
    
    // FASE 1: Validar y normalizar estado del plato
    if (!plato.estado) {
      plato.estado = 'pedido';
    }
    
    const estadosInicialesValidos = ['pedido', 'en_espera'];
    if (!estadosInicialesValidos.includes(plato.estado)) {
      const errorMsg = `Estado inicial inválido para plato ${index}: "${plato.estado}". Solo se permiten: pedido, en_espera`;
      throw new Error(errorMsg);
    }
    
    // Inicializar timestamps del plato
    if (!plato.tiempos) {
      plato.tiempos = {};
    }
    plato.tiempos.pedido = ahora;
    if (plato.estado === 'en_espera') {
      plato.tiempos.en_espera = ahora;
    }
    
    console.log(`✅ Plato ${index}: ${platoCompleto.nombre} (id=${platoCompleto.id})`);
  }
  
  // ========== OBTENER DATOS DESNORMALIZADOS ==========
  // Obtener mozoNombre, mesaNumero, areaNombre para guardar en el documento
  const datosDesnormalizados = await obtenerDatosDesnormalizados(data.mesas, data.mozos);
  
  // Calcular totales de platos
  const totalPlatos = data.platos.length;
  const platosActivos = data.platos.filter(p => !p.eliminado && !p.anulado).length;
  
  // Añadir campos desnormalizados a data
  data.mozoNombre = datosDesnormalizados.mozoNombre;
  data.mesaNumero = datosDesnormalizados.mesaNumero;
  data.areaNombre = datosDesnormalizados.areaNombre;
  data.totalPlatos = totalPlatos;
  data.platosActivos = platosActivos;
  
  console.log(`✅ [FASE A1] Datos desnormalizados: mozo="${data.mozoNombre}", mesa=${data.mesaNumero}, área="${data.areaNombre}"`);
  // ========== FIN FASE A1 ==========
  
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

  // ========== ASOCIAR COMANDA AL PEDIDO ABIERTO DE LA MESA ==========
  try {
    const pedido = await pedidoModel.obtenerOcrearPedidoAbierto(
      nuevaComanda.mesas,
      nuevaComanda.mozos,
      {
        numMesa: datosDesnormalizados.mesaNumero,
        areaNombre: datosDesnormalizados.areaNombre,
        nombreMozo: datosDesnormalizados.mozoNombre || 'Sin asignar'
      }
    );

    // Agregar comanda al pedido si no existe ya
    if (!pedido.comandas.some(c => c.toString() === nuevaComanda._id.toString())) {
      pedido.comandas.push(nuevaComanda._id);
      pedido.comandasNumbers.push(nuevaComanda.comandaNumber);
      await pedido.save(); // pre-save hook recalcula totales
    }

    // Guardar referencia del pedido en la comanda
    nuevaComanda.pedido = pedido._id;
    await nuevaComanda.save();

    console.log(`✅ Comanda #${nuevaComanda.comandaNumber} asociada al Pedido #${pedido.pedidoId} (mesa ${datosDesnormalizados.mesaNumero})`);
  } catch (pedidoError) {
    // No bloquear la creación de comanda si falla la asociación con pedido
    console.error('⚠️ Error al asociar comanda con pedido (no crítico):', pedidoError.message);
    logger.warn('Error al asociar comanda con pedido', {
      comandaId: nuevaComanda._id,
      error: pedidoError.message
    });
  }
  // ========== FIN ASOCIACIÓN PEDIDO ==========

  // Actualizar estado de la mesa a "pedido" automáticamente cuando se crea la comanda
  // Si la mesa estaba en "preparado", cambiar a "pedido" para la nueva comanda
  // Si la mesa estaba en "libre", cambiar a "pedido"
  // Si la mesa estaba en "reservado", cambiar a "pedido" (el mozo autorizado está atendiendo)
  if (estadoMesa === 'preparado' || estadoMesa === 'libre' || estadoMesa === 'reservado') {
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
  
  // FASE 9: Emitir evento para actualización de reportes en tiempo real
  if (global.emitReporteComandaNueva) {
    try {
      await global.emitReporteComandaNueva(comandaCreada);
      console.log('✅ Evento reportes:comanda-nueva emitido');
    } catch (error) {
      console.error('⚠️ Error al emitir evento reportes:comanda-nueva (no crítico):', error);
    }
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
    comanda.eliminadaPor = validarUsuarioId(usuarioId);
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
        usuario: validarUsuarioId(usuarioId),
        motivo: `comanda-${motivo}`
      });
    });
    
    // 🔥 SANITIZAR historialPlatos para limpiar usuarios inválidos existentes
    if (comanda.historialPlatos && comanda.historialPlatos.length > 0) {
      const historialLimpio = sanitizarHistorialPlatos(comanda.historialPlatos);
      console.log(`🧹 HistorialPlatos sanitizado en eliminarLogicamente - ${historialLimpio.length} items`);
    }
    
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
        usuario: validarUsuarioId(usuarioId),
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
      }
    }

    // Recalcular totales del Pedido asociado
    if (comanda.pedido) {
      try {
        const pedido = await pedidoModel.findById(comanda.pedido);
        if (pedido && pedido.estado === 'abierto') {
          await pedido.calcularTotales();
          await pedido.save();
          console.log(`✅ Pedido #${pedido.pedidoId} recalculado tras eliminar comanda`);
        }
      } catch (pedidoError) {
        console.error('⚠️ Error al recalcular pedido tras eliminar comanda:', pedidoError.message);
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
        // Mejorar búsqueda para manejar tanto ObjectId como ID numérico
        const platoEliminadoId = platoEliminado.platoId;
        const esObjectId = typeof platoEliminadoId === 'string' && platoEliminadoId.length === 24;
        
        const platoOriginal = comanda.platos.find(p => {
          // Comparar por platoId numérico
          if (p.platoId && p.platoId === platoEliminadoId) {
            return true;
          }
          // Comparar por ObjectId del plato (string)
          if (p.plato && p.plato.toString() === platoEliminadoId) {
            return true;
          }
          // Si el plato eliminado es ObjectId, comparar con p.plato
          if (esObjectId && p.plato) {
            const platoStr = typeof p.plato === 'object' ? p.plato._id?.toString() : p.plato.toString();
            if (platoStr === platoEliminadoId) {
              return true;
            }
          }
          // Si el plato eliminado es numérico, comparar con p.platoId
          if (!esObjectId && p.platoId == platoEliminadoId) {
            return true;
          }
          return false;
        });
        
        console.log(`🔍 Buscando plato a eliminar: platoId=${platoEliminadoId}, encontrado=${platoOriginal ? 'SÍ' : 'NO'}`);
        
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
          usuario: validarUsuarioId(usuarioId),
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
    
    // Agregar nuevos platos (solo los que NO existen ya en la comanda)
    if (platosNuevos && platosNuevos.length > 0) {
      console.log(`➕ Procesando ${platosNuevos.length} plato(s) para comanda ${comanda.comandaNumber}`);
      
      for (const nuevoPlato of platosNuevos) {
        console.log(`🔍 Buscando plato: _id=${nuevoPlato.plato}, platoId=${nuevoPlato.platoId}`);
        
        // Verificar si el plato YA existe en la comanda (para actualizar, no agregar)
        const platoExistenteIndex = comanda.platos.findIndex(p => {
          const platoIdMatch = p.platoId && p.platoId === nuevoPlato.platoId;
          const platoObjectIdMatch = p.plato && p.plato.toString() === nuevoPlato.plato;
          return platoIdMatch || platoObjectIdMatch;
        });
        
        if (platoExistenteIndex !== -1) {
          // El plato ya existe, ACTUALIZAR sus propiedades
          console.log(`📝 Actualizando plato existente en índice ${platoExistenteIndex}`);
          comanda.platos[platoExistenteIndex].estado = nuevoPlato.estado || comanda.platos[platoExistenteIndex].estado;
          comanda.cantidades[platoExistenteIndex] = nuevoPlato.cantidad || comanda.cantidades[platoExistenteIndex];
          console.log(`✅ Plato actualizado: cantidad=${comanda.cantidades[platoExistenteIndex]}, estado=${comanda.platos[platoExistenteIndex].estado}`);
        } else {
          // El plato NO existe, AGREGAR como nuevo
          console.log(`➕ Agregando nuevo plato...`);
          
          // Buscar el plato completo por _id
          let platoCompleto = await platoModel.findById(nuevoPlato.plato);
          
          // Si no se encuentra por _id, intentar buscar por platoId numérico
          if (!platoCompleto && nuevoPlato.platoId) {
            console.log(`⚠️ No se encontró plato por _id, intentando por platoId numérico: ${nuevoPlato.platoId}`);
            platoCompleto = await platoModel.findOne({ id: nuevoPlato.platoId });
          }
          
          if (platoCompleto) {
            if (platoCompleto.isActive === false) {
              throw new AppError(`Plato inactivo o eliminado. ID: ${platoCompleto.id ?? platoCompleto._id}`, 400);
            }
            const platoAgregado = {
              plato: platoCompleto._id,
              platoId: platoCompleto.id,
              estado: nuevoPlato.estado || 'en_espera'
            };
            comanda.platos.push(platoAgregado);
            comanda.cantidades.push(nuevoPlato.cantidad || 1);
            console.log(`✅ Plato nuevo agregado: ${platoCompleto.nombre} (id numérico: ${platoCompleto.id}, cantidad: ${nuevoPlato.cantidad || 1})`);
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
      }
      
      console.log(`✅ Total de platos procesados: ${platosNuevos.length}. Platos totales en comanda: ${comanda.platos.length}`);
    }
    
    comanda.version++;
    
    // 🔥 SANITIZAR historialPlatos para limpiar usuarios inválidos existentes
    if (comanda.historialPlatos && comanda.historialPlatos.length > 0) {
      comanda.historialPlatos = sanitizarHistorialPlatos(comanda.historialPlatos);
      console.log(`🧹 HistorialPlatos sanitizado - ${comanda.historialPlatos.length} items`);
    }
    
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
        usuario: validarUsuarioId(usuarioId),
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
    console.log(`🔄 [cambiarEstadoPlato] Iniciando cambio de estado para comanda ${comandaId}, plato ${platoId} → ${nuevoEstado}`);
    
    // FASE 5: Intentar obtener del cache primero (si está disponible)
    let comanda = null;
    try {
      comanda = await redisCache.get(comandaId);
    } catch (cacheError) {
      // Si cache falla, continuar sin cache
      logger.debug('FASE5: Cache no disponible, obteniendo de MongoDB', { error: cacheError.message });
    }
    
    if (!comanda) {
      // Cache miss: obtener de MongoDB
      comanda = await comandaModel.findById(comandaId);
      if (!comanda) {
        console.error(`❌ [cambiarEstadoPlato] Comanda ${comandaId} no encontrada`);
        throw new Error('Comanda no encontrada');
      }
      
      // Guardar en cache (sin populate para ahorrar espacio) - opcional
      try {
        await redisCache.set(comandaId, comanda.toObject());
      } catch (cacheError) {
        // Si cache falla, continuar sin cache
        logger.debug('FASE5: No se pudo guardar en cache', { error: cacheError.message });
      }
    } else {
      // Cache hit: convertir a Mongoose document si es necesario
      if (!comanda._id) {
        comanda = await comandaModel.findById(comandaId);
      }
    }
    
    // Populate mesas si es necesario
    if (comanda.mesas && typeof comanda.mesas === 'object' && !comanda.mesas._id) {
      await comanda.populate('mesas');
    }

    // 🔥 FIX CRÍTICO: Buscar plato por PRIORIDAD para distinguir platos duplicados
    // PRIORIDAD:
    // 1. p._id (ObjectId del subdocumento) - ÚNICO por cada instancia de plato
    // 2. p.platoId (ID numérico del plato)
    // 3. p.plato (ObjectId del plato referenciado)
    
    let platoIndex = -1;
    
    // PRIORIDAD 1: Buscar por _id del subdocumento (ÚNICO - es la clave para platos duplicados)
    platoIndex = comanda.platos.findIndex(p => 
      p._id && p._id.toString() === platoId.toString()
    );
    
    if (platoIndex !== -1) {
      console.log(`✅ [cambiarEstadoPlato] Plato encontrado por _id de subdocumento (único): índice ${platoIndex}`);
    } else {
      // PRIORIDAD 2: Buscar por platoId numérico
      platoIndex = comanda.platos.findIndex(p => 
        p.platoId && p.platoId.toString() === platoId.toString()
      );
      
      if (platoIndex !== -1) {
        console.log(`✅ [cambiarEstadoPlato] Plato encontrado por platoId numérico: índice ${platoIndex}`);
      } else {
        // PRIORIDAD 3: Buscar por plato ObjectId (referencia al modelo)
        platoIndex = comanda.platos.findIndex(p => 
          p.plato && p.plato.toString() === platoId.toString()
        );
        
        if (platoIndex !== -1) {
          console.log(`✅ [cambiarEstadoPlato] Plato encontrado por plato ObjectId: índice ${platoIndex}`);
        }
      }
    }
    
    if (platoIndex === -1) {
      // Debug detallado para identificar el problema
      console.error(`❌ [cambiarEstadoPlato] Plato NO encontrado`);
      console.error(`   Buscado: ${platoId}`);
      console.error(`   Platos disponibles en comanda:`);
      comanda.platos.forEach((p, idx) => {
        console.error(`   [${idx}] _id=${p._id?.toString()}, platoId=${p.platoId}, plato=${p.plato?.toString()}, estado=${p.estado}`);
      });
      
      const error = new Error('Plato no encontrado en comanda');
      error.status = 404;
      error.platoId = platoId;
      error.comandaId = comandaId;
      throw error;
    }
    
    const plato = comanda.platos[platoIndex];
    const estadoActual = plato.estado || 'pedido';
    
    // Validación: Si el plato ya está en el estado destino, retornar éxito sin error
    if (estadoActual === nuevoEstado) {
      console.log(`ℹ️ [cambiarEstadoPlato] Plato ${platoId} ya está en estado "${nuevoEstado}" - Sin cambios necesarios`);
      // Retornar la comanda sin modificar
      return comanda;
    }
    
    // FASE 1: Validar transición de estado
    if (!validarTransicionPlato(estadoActual, nuevoEstado)) {
      const errorMsg = `Transición inválida de estado: "${estadoActual}" → "${nuevoEstado}". Estados permitidos desde "${estadoActual}": pedido/en_espera → recoger, recoger → entregado`;
      console.error(`❌ [cambiarEstadoPlato] ${errorMsg}`);
      const error = new Error(errorMsg);
      error.status = 400;
      throw error;
    }
    
    console.log(`✅ [cambiarEstadoPlato] Plato ${platoId}: ${estadoActual} → ${nuevoEstado}`);
    
    // FASE 7: Actualización GRANULAR con MongoDB updateOne (solo el plato específico) + Auditoría
    const ahora = moment.tz("America/Lima").toDate();
    
    // Obtener información de usuario/device desde headers o contexto
    const usuarioId = global.currentRequestId ? null : null; // Se puede obtener de req si está disponible
    const deviceId = null; // Se puede obtener de headers
    const sourceApp = 'cocina'; // Por defecto cocina para cambios de estado de platos
    
    // Entrada de historial para el cambio de estado del plato
    const historialEntry = {
      status: `plato_${nuevoEstado}`,
      statusAnterior: `plato_${estadoActual}`,
      timestamp: ahora,
      usuario: validarUsuarioId(usuarioId),
      accion: `Plato ${platoId} cambió de "${estadoActual}" a "${nuevoEstado}"`,
      deviceId: deviceId || null,
      sourceApp: sourceApp,
      motivo: null
    };
    
    // Usar updateOne con índice explícito para mayor precisión
    await comandaModel.updateOne(
      { _id: comandaId },
      { 
        $set: { 
          [`platos.${platoIndex}.estado`]: nuevoEstado,
          [`platos.${platoIndex}.tiempos.${nuevoEstado}`]: ahora,
          updatedAt: ahora
        },
        $push: { historialEstados: historialEntry }
      }
    );

    // Crítico: verificación dedicada "todos los platos entregados → status recoger" (desbloquea pago)
    const resultadoTodosEntregados = await actualizarComandaSiTodosEntregados(comandaId);
    if (!resultadoTodosEntregados.updated) {
      // Si no se actualizó por "todos entregados", aplicar recálculo general
      await recalcularEstadoComandaPorPlatos(comandaId);
    }

    // FASE 5: Invalidar cache de la comanda después de actualizar (opcional)
    try {
      await redisCache.invalidate(comandaId);
    } catch (cacheError) {
      // Si cache falla, continuar sin cache
      logger.debug('FASE5: No se pudo invalidar cache', { error: cacheError.message });
    }
    
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
  // Permitir mantener el mismo estado
  if (estadoActual === nuevoEstado) {
    return true;
  }
  
  // Permitir revertir a en_espera desde cualquier estado (para admin)
  if (nuevoEstado === 'en_espera') {
    return true;
  }
  
  // Permitir cancelar desde cualquier estado (para admin)
  if (nuevoEstado === 'cancelado') {
    return true;
  }
  
  // Definir transiciones válidas (flujo normal)
  const transicionesValidas = {
    'en_espera': ['recoger'],
    'recoger': ['entregado'],
    'entregado': ['pagado'],
    'pagado': [] // No se puede cambiar desde pagado (excepto revertir o cancelar)
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
      
      // ACTUALIZACIÓN INTELIGENTE DE PLATOS: Actualizar platos cuando cambia status de comanda
      // Reutilizar timestampActual ya declarado arriba
      let platosModificados = false;
      
      // Si el nuevo status es "recoger", actualizar TODOS los platos que NO estén ya en "recoger" o "entregado"
      if (nuevoStatus === "recoger") {
        let cantidadActualizados = 0;
        comandaActual.platos.forEach((plato, index) => {
          // Solo actualizar platos que están en "en_espera" o "ingresante"
          // Dejar intactos los que ya están en "recoger" o "entregado" (idempotente)
          if (plato.estado === "en_espera" || plato.estado === "ingresante") {
            comandaActual.platos[index].estado = "recoger";
            // Actualizar timestamp del plato
            if (!comandaActual.platos[index].tiempos) {
              comandaActual.platos[index].tiempos = {};
            }
            comandaActual.platos[index].tiempos.recoger = timestampActual;
            platosModificados = true;
            cantidadActualizados++;
          }
        });
        
        if (platosModificados) {
          logger.info('Platos modificados para actualización a "recoger"', {
            comandaId,
            platosActualizados: cantidadActualizados,
            totalPlatos: comandaActual.platos.length
          });
        }
      }
      
      // Si el nuevo status es "entregado", actualizar TODOS los platos a "entregado" (sin excepciones)
      if (nuevoStatus === "entregado") {
        comandaActual.platos.forEach((plato, index) => {
          comandaActual.platos[index].estado = "entregado";
          // Actualizar timestamp del plato
          if (!comandaActual.platos[index].tiempos) {
            comandaActual.platos[index].tiempos = {};
          }
          comandaActual.platos[index].tiempos.entregado = timestampActual;
        });
        platosModificados = true;
        
        logger.info('Platos modificados para actualización a "entregado"', {
          comandaId,
          totalPlatos: comandaActual.platos.length
        });
      }
      
      // Si se modificaron platos, guardar primero los cambios en platos (antes de actualizar status)
      if (platosModificados) {
        // Guardar cambios en platos directamente en el documento
        await comandaActual.save();
        logger.info('Platos guardados exitosamente antes de actualizar status', {
          comandaId,
          nuevoStatus,
          totalPlatos: comandaActual.platos.length
        });
      }
      
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
      
      // Verificar que los platos se actualizaron correctamente
      if (platosModificados) {
        const platosEnEstadoCorrecto = updatedComanda.platos.filter(p => {
          if (nuevoStatus === "recoger") {
            return p.estado === "recoger" || p.estado === "entregado";
          } else if (nuevoStatus === "entregado") {
            return p.estado === "entregado";
          }
          return true;
        }).length;
        
        logger.info('Comanda y platos actualizados exitosamente', {
          comandaId,
          comandaNumber: updatedComanda.comandaNumber,
          nuevoStatus,
          platosEnEstadoCorrecto,
          totalPlatos: updatedComanda.platos.length,
          detallePlatos: updatedComanda.platos.map(p => ({
            nombre: p.plato?.nombre || p.nombre,
            estado: p.estado
          }))
        });
      }
      
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

const listarComandaPorFechaEntregado = async (fecha, usarProyeccion = true) => {
  try {
    console.log('🔍 [FASE A1] Buscando comandas para fecha:', fecha);
    const startTime = Date.now();
    
    // Convertir fecha string a rango de fechas (inicio y fin del día)
    const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
    const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
    
    console.log('📅 Rango de búsqueda:', {
      desde: fechaInicio,
      hasta: fechaFin
    });
    
    // ==================== FASE A1: QUERY OPTIMIZADA ====================
    // Usar índice idx_comanda_cocina_fecha
    // Filtrar comandas activas que NO estén entregadas ni pagadas
    let query = comandaModel.find({ 
      createdAt: { $gte: fechaInicio, $lte: fechaFin },
      status: { $nin: ["entregado", "pagado"] },
      IsActive: true
    });
    
    // Aplicar proyección si está habilitada (reducir tamaño del documento)
    if (usarProyeccion) {
      query = query.select(PROYECCION_COCINA);
    }
    
    // Ordenar por prioridad y fecha (usará índice)
    query = query.sort({ prioridadOrden: -1, createdAt: -1, comandaNumber: -1 });
    
    // Usar lean() para obtener objetos planos (más rápido)
    query = query.lean();
    
    // Populate MÍNIMO: solo campos necesarios para la UI
    query = query.populate({
      path: "mozos",
      select: "name DNI",
      options: { lean: true }
    });
    query = query.populate({
      path: "mesas",
      select: "nummesa estado area",
      options: { lean: true },
      populate: {
        path: "area",
        select: "nombre",
        options: { lean: true }
      }
    });
    // Solo nombre y precio del plato (no todo el documento)
    query = query.populate({
      path: "platos.plato",
      select: "nombre precio categoria",
      options: { lean: true }
    });
    
    let data = await query.exec();
    
    // Si no se encuentran comandas, intentar búsqueda más amplia (sin filtro de fecha)
    if (data.length === 0) {
      console.log('⚠️ No se encontraron comandas con el filtro de fecha. Buscando últimas comandas activas...');
      
      let fallbackQuery = comandaModel.find({ 
        status: { $nin: ["entregado", "pagado"] },
        IsActive: true
      });
      
      if (usarProyeccion) {
        fallbackQuery = fallbackQuery.select(PROYECCION_COCINA);
      }
      
      fallbackQuery = fallbackQuery
        .sort({ prioridadOrden: -1, createdAt: -1 })
        .limit(50)
        .lean()
        .populate({
          path: "mozos",
          select: "name DNI",
          options: { lean: true }
        })
        .populate({
          path: "mesas",
          select: "nummesa estado area",
          options: { lean: true },
          populate: {
            path: "area",
            select: "nombre",
            options: { lean: true }
          }
        })
        .populate({
          path: "platos.plato",
          select: "nombre precio categoria",
          options: { lean: true }
        });
      
      data = await fallbackQuery.exec();
      console.log(`📊 Encontradas ${data.length} comandas activas (sin filtro de fecha)`);
    }
    // ==================== FIN QUERY OPTIMIZADA ====================
    
    // Procesar comandas para usar campos desnormalizados o fallback a populate
    const dataProcesada = data.map(comanda => {
      // Usar campos desnormalizados si existen, sino usar populate
      if (!comanda.mozoNombre && comanda.mozos?.name) {
        comanda.mozoNombre = comanda.mozos.name;
      }
      if (!comanda.mesaNumero && comanda.mesas?.nummesa) {
        comanda.mesaNumero = comanda.mesas.nummesa;
      }
      if (!comanda.areaNombre && comanda.mesas?.area?.nombre) {
        comanda.areaNombre = comanda.mesas.area.nombre;
      }
      return comanda;
    });
    
    const elapsedMs = Date.now() - startTime;
    console.log(`✅ [FASE A1] Encontradas ${dataProcesada.length} comandas en ${elapsedMs}ms`);
    
    if (dataProcesada.length > 0) {
      const primeraComanda = dataProcesada[0];
      console.log('📋 Ejemplo de comanda:', {
        _id: primeraComanda._id,
        numero: primeraComanda.comandaNumber,
        status: primeraComanda.status,
        mesa: primeraComanda.mesaNumero || primeraComanda.mesas?.nummesa,
        mozo: primeraComanda.mozoNombre || primeraComanda.mozos?.name,
        platos: primeraComanda.platos?.length,
        prioridad: primeraComanda.prioridadOrden
      });
    }
    
    return dataProcesada;
  } catch (error) {
    logger.error("Error al listar comandas por fecha (entregado)", {
      fecha,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

const listarComandaPorFecha = async (fecha, usarProyeccion = true) => {
  try {
    console.log('🔍 [FASE A1] Buscando comandas para fecha:', fecha);
    const startTime = Date.now();
    
    // Convertir fecha string a rango de fechas (inicio y fin del día)
    const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
    const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
    
    console.log('📅 Rango de búsqueda:', {
      desde: fechaInicio,
      hasta: fechaFin
    });
    
    // ==================== FASE A1: QUERY OPTIMIZADA ====================
    // Usar índice idx_comanda_fecha_general
    let query = comandaModel.find({ 
      createdAt: { $gte: fechaInicio, $lte: fechaFin },
      IsActive: true
    });
    
    // Aplicar proyección si está habilitada
    if (usarProyeccion) {
      query = query.select(PROYECCION_RESUMEN_MESA);
    }
    
    query = query.sort({ createdAt: -1, comandaNumber: -1 }).lean();
    
    // Populate mínimo
    query = query.populate({
      path: "mozos",
      select: "name DNI",
      options: { lean: true }
    });
    query = query.populate({
      path: "mesas",
      select: "nummesa estado area",
      options: { lean: true },
      populate: {
        path: "area",
        select: "nombre",
        options: { lean: true }
      }
    });
    query = query.populate({
      path: "platos.plato",
      select: "nombre precio",
      options: { lean: true }
    });
    
    const data = await query.exec();
    
    // Procesar comandas para usar campos desnormalizados
    const dataProcesada = data.map(comanda => {
      if (!comanda.mozoNombre && comanda.mozos?.name) {
        comanda.mozoNombre = comanda.mozos.name;
      }
      if (!comanda.mesaNumero && comanda.mesas?.nummesa) {
        comanda.mesaNumero = comanda.mesas.nummesa;
      }
      if (!comanda.areaNombre && comanda.mesas?.area?.nombre) {
        comanda.areaNombre = comanda.mesas.area.nombre;
      }
      return comanda;
    });
    
    const elapsedMs = Date.now() - startTime;
    console.log(`✅ [FASE A1] Encontradas ${dataProcesada.length} comandas para la fecha ${fecha} en ${elapsedMs}ms`);
    
    if (dataProcesada.length > 0) {
      const primeraComanda = dataProcesada[0];
      console.log('📋 Ejemplo de comanda:', {
        numero: primeraComanda.comandaNumber,
        mesa: primeraComanda.mesaNumero || primeraComanda.mesas?.nummesa,
        mozo: primeraComanda.mozoNombre || primeraComanda.mozos?.name,
        platos: primeraComanda.platos?.length
      });
    }
    
    return dataProcesada;
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
 * Obtiene las comandas listas para pagar de una mesa (todas sus platos no eliminados en estado 'entregado').
 * Incluye comandas con status 'recoger' o 'entregado' y filtra por estado real de platos; opcionalmente
 * auto-corrige status cuando todos los platos están entregados pero el status estaba desincronizado.
 * Si se pasa comandaIds, solo se devuelven esas comandas (útil para pagar solo la comanda actual en mesa reutilizada).
 * @param {string} mesaId - ID de la mesa
 * @param {string[]} [comandaIds] - Opcional. IDs de comandas a incluir; si se pasa, solo se devuelven esas comandas de la mesa
 * @returns {Promise<Array>} Array de comandas listas para pagar (todas con todos los platos entregados)
 */
const getComandasParaPagar = async (mesaId, comandaIds = null) => {
  try {
    const query = {
      mesas: mesaId,
      IsActive: true,
      status: { $in: ['recoger', 'entregado'] }
    };
    if (comandaIds && Array.isArray(comandaIds) && comandaIds.length > 0) {
      const ids = comandaIds.map(id => (typeof id === 'string' ? id.trim() : id)).filter(Boolean);
      if (ids.length > 0) {
        query._id = { $in: ids };
      }
    }
    // Enum comanda.status: en_espera, recoger, entregado, pagado (no existe 'preparado')
    const comandas = await comandaModel.find(query)
      .populate('platos.plato', 'nombre precio')
      .populate('mozos', 'name')
      .populate('mesas', 'nummesa estado')
      .sort({ createdAt: -1 });

    const comandasListasParaPagar = [];
    for (const comanda of comandas) {
      if (!comanda.platos || comanda.platos.length === 0) continue;
      const platosActivos = comanda.platos.filter(p => p.eliminado !== true);
      if (platosActivos.length === 0) continue;

      const todosEntregados = platosActivos.every(p => {
        const e = (p.estado || '').toLowerCase();
        return e === 'entregado';
      });

      if (todosEntregados) {
        if (comanda.status !== 'entregado') {
          try {
            await comandaModel.findByIdAndUpdate(comanda._id, { status: 'entregado' });
            comanda.status = 'entregado';
            logger.info('[getComandasParaPagar] Auto-corregido status a entregado', { comandaId: comanda._id, comandaNumber: comanda.comandaNumber });
          } catch (e) {
            logger.warn('[getComandasParaPagar] No se pudo auto-corregir status', { comandaId: comanda._id, error: e.message });
          }
        }
        comandasListasParaPagar.push(comanda);
      }
    }

    const comandasConPlatos = await ensurePlatosPopulated(comandasListasParaPagar);
    console.log(`✅ [getComandasParaPagar] Mesa ${mesaId}: ${comandasConPlatos.length} comandas listas para pagar (todos los platos entregados)`);
    return comandasConPlatos;
  } catch (error) {
    console.error("❌ Error al obtener comandas para pagar:", error);
    throw error;
  }
};

/**
 * Valida que las comandas pertenecen a la mesa, no están pagadas, y que TODOS sus platos no eliminados están en estado 'entregado'.
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
      status: { $in: ['recoger', 'entregado'] }
    })
      .populate('platos.plato', 'nombre precio')
      .populate('mozos')
      .populate('mesas', 'nummesa');

    if (comandas.length !== comandasIds.length) {
      const encontradas = comandas.map(c => c._id.toString());
      const faltantes = comandasIds.filter(id => !encontradas.includes(id.toString()));
      throw new Error(`Algunas comandas no son válidas para pagar: ${faltantes.join(', ')}`);
    }

    for (const comanda of comandas) {
      const platosActivos = (comanda.platos || []).filter(p => p.eliminado !== true);
      const noEntregados = platosActivos.filter(p => (p.estado || '').toLowerCase() !== 'entregado');
      if (noEntregados.length > 0) {
        const estados = noEntregados.map(p => p.estado || 'sin estado');
        throw new Error(
          `No se puede procesar el pago. La comanda #${comanda.comandaNumber || comanda._id.toString().slice(-6)} tiene platos que aún no han sido entregados al cliente (estados: ${[...new Set(estados)].join(', ')}). Todos los platos deben estar en estado "entregado".`
        );
      }
    }

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

    // Crítico: verificación dedicada "todos los platos entregados → status recoger" (desbloquea pago)
    const resultadoTodosEntregados = await actualizarComandaSiTodosEntregados(comandaId);
    if (!resultadoTodosEntregados.updated) {
      // Si no se actualizó por "todos entregados", aplicar recálculo general (recoger, en_espera, etc.)
      await recalcularEstadoComandaPorPlatos(comandaId);
    }

    // Obtener plato populado para el evento
    const platoPopulado = await comandaModel.findById(comandaId)
      .populate('platos.plato')
      .then(c => c.platos[platoIndex]);
    
    // Emitir evento WebSocket
    if (global.emitPlatoEntregado) {
      const platoNombre = platoPopulado?.plato?.nombre || 'Plato desconocido';
      await global.emitPlatoEntregado(comandaId, platoId, platoNombre, estadoAnterior);
    }
    
    // FASE 9: Emitir evento para actualización de reportes en tiempo real
    if (global.emitReportePlatoListo) {
      try {
        const platoNombre = platoPopulado?.plato?.nombre || 'Plato desconocido';
        const platoPrecio = platoPopulado?.plato?.precio || 0;
        await global.emitReportePlatoListo(comandaId, platoId, platoNombre, platoPrecio);
        console.log('✅ Evento reportes:plato-listo emitido');
      } catch (error) {
        console.error('⚠️ Error al emitir evento reportes:plato-listo (no crítico):', error);
      }
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
 * Actualiza el status de la comanda a 'recoger' cuando TODOS los platos activos están en estado 'entregado'.
 * Función dedicada de una sola regla: evita bloqueos de pago cuando los platos se entregan de forma gradual.
 * Se debe llamar DESPUÉS de persistir el cambio de estado del plato (después de comanda.save() o updateOne).
 * Idempotente: si el status ya es 'recoger' o 'entregado', no hace nada.
 *
 * @param {string} comandaId - ID de la comanda
 * @returns {Promise<{updated: boolean, estadoAnterior?: string, nuevoEstado?: string, totalPlatos?: number, platosEntregados?: number, reason?: string}>}
 */
const actualizarComandaSiTodosEntregados = async (comandaId) => {
  const logPrefix = `[actualizarComandaSiTodosEntregados] ${comandaId}`;
  try {
    logger.info(`${logPrefix} Iniciando verificación (todos los platos entregados → status recoger)`);

    const comanda = await comandaModel
      .findById(comandaId)
      .select('platos status comandaNumber mesas tiempoRecoger tiempoEntregado tiempoEnEspera tiempoPagado historialEstados')
      .lean();

    if (!comanda) {
      logger.warn(`${logPrefix} Comanda no encontrada`);
      return { updated: false, reason: 'comanda_no_encontrada' };
    }

    const totalPlatos = comanda.platos?.length ?? 0;
    const platosActivos = (comanda.platos || []).filter(p => p.eliminado !== true);
    const numActivos = platosActivos.length;
    const statusActual = comanda.status || 'en_espera';

    logger.info(`${logPrefix} Comanda #${comanda.comandaNumber} | Total platos: ${totalPlatos} | Eliminados: ${totalPlatos - numActivos} | Activos: ${numActivos} | Status actual: ${statusActual}`);

    if (numActivos === 0) {
      logger.warn(`${logPrefix} Sin platos activos, no se actualiza`);
      return { updated: false, reason: 'sin_platos_activos', totalPlatos: 0, platosEntregados: 0 };
    }

    const platosEntregados = platosActivos.filter(p => (p.estado || '').toLowerCase() === 'entregado').length;
    logger.info(`${logPrefix} Platos activos: ${numActivos} | Con estado entregado: ${platosEntregados}`);

    if (platosEntregados !== numActivos) {
      logger.info(`${logPrefix} No todos entregados (faltan ${numActivos - platosEntregados}), no se actualiza`);
      return {
        updated: false,
        reason: 'no_todos_entregados',
        totalPlatos: numActivos,
        platosEntregados
      };
    }

    if (statusActual === 'recoger' || statusActual === 'entregado') {
      logger.info(`${logPrefix} Status ya es "${statusActual}", no se actualiza`);
      return {
        updated: false,
        reason: 'status_ya_correcto',
        estadoAnterior: statusActual,
        totalPlatos: numActivos,
        platosEntregados
      };
    }

    const ahora = moment.tz("America/Lima").toDate();
    await comandaModel.updateOne(
      { _id: comandaId },
      {
        $set: { status: 'recoger', updatedAt: ahora },
        $push: {
          historialEstados: {
            status: 'recoger',
            statusAnterior: statusActual,
            timestamp: ahora,
            usuario: null,
            accion: `Auto-actualización: todos los platos entregados → status "recoger" (antes: "${statusActual}")`,
            deviceId: null,
            sourceApp: 'sistema',
            motivo: 'actualizarComandaSiTodosEntregados'
          }
        }
      }
    );

    logger.info(`${logPrefix} Comanda #${comanda.comandaNumber} actualizada: "${statusActual}" → "recoger" (todos los platos entregados)`);

    const mesaId = comanda.mesas?._id || comanda.mesas;
    if (mesaId) {
      try {
        await recalcularEstadoMesa(mesaId);
      } catch (err) {
        logger.warn(`${logPrefix} Error al recalcular estado de mesa (no crítico):`, err.message);
      }
    }

    if (global.emitComandaActualizada) {
      try {
        await global.emitComandaActualizada(comandaId, statusActual, 'recoger', {
          pedido: 0,
          en_espera: 0,
          recoger: 0,
          entregado: numActivos,
          pagado: 0
        });
      } catch (err) {
        logger.warn(`${logPrefix} Error al emitir comanda-actualizada (no crítico):`, err.message);
      }
    }

    return {
      updated: true,
      estadoAnterior: statusActual,
      nuevoEstado: 'recoger',
      totalPlatos: numActivos,
      platosEntregados
    };
  } catch (error) {
    logger.error(`${logPrefix} Error (no debe interrumpir el flujo principal):`, { error: error.message, stack: error.stack });
    return { updated: false, reason: 'error', error: error.message };
  }
};

/**
 * Recalcula el estado de la comanda basado en los estados individuales de los platos.
 * Se debe llamar después de cada cambio de estado de un plato (cambiarEstadoPlato, marcarPlatoComoEntregado).
 * @param {String} comandaId - ID de la comanda
 * @returns {Promise<{changed: boolean, estadoAnterior?: string, nuevoEstado?: string, cuentas?: object}>}
 */
const recalcularEstadoComandaPorPlatos = async (comandaId) => {
  try {
    const comanda = await comandaModel.findById(comandaId).select('platos status mesas tiempoRecoger tiempoEntregado tiempoEnEspera tiempoPagado historialEstados');
    if (!comanda) {
      console.warn(`⚠️ [recalcularEstadoComanda] Comanda ${comandaId} no encontrada`);
      return { changed: false };
    }

    // Contar platos por estado (solo platos no eliminados)
    const platosActivos = comanda.platos.filter(p => p.eliminado !== true);
    const estadosPlatos = platosActivos.map(p => (p.estado || 'pedido'));

    const cuentas = {
      pedido: 0,
      en_espera: 0,
      recoger: 0,
      entregado: 0,
      pagado: 0
    };

    platosActivos.forEach(plato => {
      const estado = plato.estado || 'pedido';
      const estadoNormalizado = estado === 'en_espera' ? 'pedido' : estado;
      cuentas[estadoNormalizado] = (cuentas[estadoNormalizado] || 0) + 1;
    });

    const total = platosActivos.length;
    let nuevoEstado = comanda.status || 'en_espera';
    const estadoAnterior = comanda.status || 'en_espera';

    if (total === 0) {
      nuevoEstado = 'en_espera';
    } else if (cuentas.pagado === total) {
      nuevoEstado = 'pagado';
    } else if (cuentas.entregado === total) {
      nuevoEstado = 'entregado';
    } else if (cuentas.recoger === total) {
      nuevoEstado = 'recoger';
    } else if (cuentas.recoger > 0 || cuentas.entregado > 0) {
      nuevoEstado = 'en_espera';
    } else if (cuentas.pedido === total) {
      nuevoEstado = 'en_espera';
    }

    const changed = comanda.status !== nuevoEstado;

    logger.info('[recalcularEstadoComanda] Ejecutado', {
      comandaId: comandaId.toString(),
      estadosPlatos,
      estadoAnterior,
      nuevoEstado,
      changed,
      totalPlatos: total,
      cuentas,
      timestamp: new Date().toISOString()
    });

    if (changed) {
      comanda.status = nuevoEstado;
      const ahora = moment.tz("America/Lima").toDate();
      if (nuevoEstado === 'recoger' && !comanda.tiempoRecoger) comanda.tiempoRecoger = ahora;
      else if (nuevoEstado === 'entregado' && !comanda.tiempoEntregado) comanda.tiempoEntregado = ahora;
      else if (nuevoEstado === 'en_espera' && !comanda.tiempoEnEspera) comanda.tiempoEnEspera = ahora;
      else if (nuevoEstado === 'pagado' && !comanda.tiempoPagado) comanda.tiempoPagado = ahora;

      if (!comanda.historialEstados) comanda.historialEstados = [];
      comanda.historialEstados.push({
        status: nuevoEstado,
        statusAnterior: estadoAnterior,
        timestamp: ahora,
        usuario: null,
        accion: `Estado recalculado automáticamente: "${estadoAnterior}" → "${nuevoEstado}"`,
        deviceId: null,
        sourceApp: 'sistema',
        motivo: 'Recálculo por cambio de estado de platos'
      });

      await comanda.save();

      if (comanda.mesas) {
        await recalcularEstadoMesa(comanda.mesas);
      }

      if (global.emitComandaActualizada) {
        await global.emitComandaActualizada(comandaId, estadoAnterior, nuevoEstado, cuentas);
      }
    }

    return { changed, estadoAnterior, nuevoEstado, cuentas };
  } catch (error) {
    console.error('❌ Error al recalcular estado de comanda por platos:', error);
    logger.error('recalcularEstadoComandaPorPlatos', { comandaId, error: error.message, stack: error.stack });
    return { changed: false };
  }
};

/**
 * Anula un plato individual desde la App de Cocina
 * Diferente de eliminación (mozo): la anulación es por motivos operativos de cocina
 * @param {String} comandaId - ID de la comanda
 * @param {Number} platoIndex - Índice del plato en el array
 * @param {String} motivo - Tipo de anulación (producto_roto, insumo_agotado, etc.)
 * @param {String} observaciones - Observaciones adicionales
 * @param {String} usuarioId - ID del usuario que anula
 * @param {String} sourceApp - App origen (cocina, admin, etc.)
 * @returns {Object} Comanda actualizada y datos del plato anulado
 */
const anularPlato = async (comandaId, platoIndex, motivo, observaciones, usuarioId, sourceApp = 'cocina') => {
  const logPrefix = `[anularPlato] ${comandaId} index=${platoIndex}`;
  logger.info(logPrefix, { motivo, observaciones, usuarioId, sourceApp });

  try {
    const comanda = await comandaModel.findById(comandaId).populate('platos.plato');
    if (!comanda) {
      throw new AppError('Comanda no encontrada', 404);
    }

    // Validación: no anular comandas pagadas
    if (comanda.status === 'pagado') {
      throw new AppError('No se puede anular platos de una comanda ya pagada. Use el flujo de reembolsos.', 400);
    }

    // Validar índice
    const index = parseInt(platoIndex);
    if (isNaN(index) || index < 0 || index >= comanda.platos.length) {
      throw new AppError('Índice de plato inválido', 400);
    }

    const plato = comanda.platos[index];
    if (!plato) {
      throw new AppError('Plato no encontrado en la comanda', 404);
    }

    // Validar que no esté ya anulado o eliminado
    if (plato.anulado) {
      throw new AppError('Este plato ya fue anulado', 400);
    }
    if (plato.eliminado) {
      throw new AppError('Este plato ya fue eliminado', 400);
    }

    // Validación: no anular platos ya entregados (a menos que sea admin con permisos especiales)
    if (plato.estado === 'entregado' && sourceApp !== 'admin') {
      throw new AppError('No se puede anular un plato que ya fue entregado al cliente. Para devoluciones use el flujo de reembolsos.', 400);
    }

    const ahora = moment.tz("America/Lima").toDate();
    const estadoAlAnular = plato.estado;
    const razonCompleta = observaciones ? `${motivo} - ${observaciones}` : motivo;

    // 🔥 IMPORTANTE: Marcar como ELIMINADO (igual que eliminación desde app mozos)
    // Esto asegura que el sistema de pagos lo excluya correctamente
    plato.eliminado = true;
    plato.eliminadoPor = usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null;
    plato.eliminadoAt = ahora;
    plato.eliminadoRazon = razonCompleta;
    plato.estadoAlEliminar = estadoAlAnular;
    
    // Campos adicionales para auditoría (source app cocina)
    plato.anulado = true;
    plato.anuladoPor = usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null;
    plato.anuladoAt = ahora;
    plato.anuladoRazon = razonCompleta;
    plato.anuladoSourceApp = sourceApp;
    plato.tipoAnulacion = motivo;

    // Si estaba en recoger, marcar como desperdicio
    if (estadoAlAnular === 'recoger') {
      plato.generoDesperdicio = true;
    }

    // Registrar en historialPlatos como 'eliminado' (igual que app mozos)
    if (!comanda.historialPlatos) {
      comanda.historialPlatos = [];
    }

    const nombrePlato = plato.plato?.nombre || 'Plato desconocido';
    comanda.historialPlatos.push({
      platoId: plato.platoId,
      nombreOriginal: nombrePlato,
      cantidadOriginal: comanda.cantidades[index] || 1,
      cantidadFinal: 0,
      estado: 'eliminado', // Usar 'eliminado' para consistencia con app mozos
      timestamp: ahora,
      usuario: usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null,
      motivo: razonCompleta,
      anuladoPor: usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null,
      anuladoSourceApp: sourceApp,
      tipoAnulacion: motivo
    });

    // Incrementar versión
    comanda.version = (comanda.version || 1) + 1;
    await comanda.save();

    // Verificar si todos los platos están anulados/eliminados
    const platosActivos = comanda.platos.filter(p => !p.anulado && !p.eliminado);
    if (platosActivos.length === 0) {
      comanda.status = 'cancelado';
      await comanda.save();
      logger.info(`${logPrefix} Comanda #${comanda.comandaNumber} cancelada automáticamente (todos los platos anulados/eliminados)`);
    }

    // Recalcular estado de la mesa si es necesario
    const mesaId = comanda.mesas?._id || comanda.mesas;
    if (mesaId && platosActivos.length === 0) {
      try {
        await recalcularEstadoMesa(mesaId);
      } catch (err) {
        logger.warn(`${logPrefix} Error al recalcular estado de mesa:`, err.message);
      }
    }

    // Obtener comanda completa populada
    const comandaActualizada = await comandaModel.findById(comandaId)
      .populate('mozos')
      .populate({ path: 'mesas', populate: { path: 'area' } })
      .populate('cliente')
      .populate('platos.plato');

    const cantidadAnulada = comanda.cantidades[index] || 1;
    const precioUnitario = plato.plato?.precio || 0;

    logger.info(`${logPrefix} Plato anulado/eliminado exitosamente`, {
      comandaNumber: comanda.comandaNumber,
      platoNombre: nombrePlato,
      motivo,
      estadoAlAnular,
      cantidad: cantidadAnulada
    });

    return {
      comanda: comandaActualizada,
      platoAnulado: {
        index,
        platoId: plato.platoId,
        nombre: nombrePlato,
        cantidad: cantidadAnulada,
        precioUnitario,
        subtotal: precioUnitario * cantidadAnulada,
        estadoAlAnular,
        motivo,
        observaciones,
        anuladoAt: ahora,
        tipoAnulacion: motivo
      },
      auditoria: {
        activos: comandaActualizada.platos.filter(p => !p.anulado && !p.eliminado).length,
        anulados: comandaActualizada.platos.filter(p => p.anulado).length,
        eliminados: comandaActualizada.platos.filter(p => p.eliminado).length
      }
    };
  } catch (error) {
    logger.error(`${logPrefix} Error:`, { error: error.message, stack: error.stack });
    throw error;
  }
};

/**
 * Anula todos los platos de una comanda desde la App de Cocina
 * @param {String} comandaId - ID de la comanda
 * @param {String} motivo - Tipo de anulación
 * @param {String} observaciones - Observaciones adicionales
 * @param {String} usuarioId - ID del usuario que anula
 * @param {String} sourceApp - App origen
 * @returns {Object} Comanda actualizada y resumen de anulaciones
 */
const anularComandaCompleta = async (comandaId, motivo, observaciones, usuarioId, sourceApp = 'cocina') => {
  const logPrefix = `[anularComandaCompleta] ${comandaId}`;
  logger.info(logPrefix, { motivo, observaciones, usuarioId, sourceApp });

  try {
    const comanda = await comandaModel.findById(comandaId).populate('platos.plato');
    if (!comanda) {
      throw new AppError('Comanda no encontrada', 404);
    }

    // Validación: no anular comandas pagadas
    if (comanda.status === 'pagado') {
      throw new AppError('No se puede anular una comanda ya pagada. Use el flujo de reembolsos.', 400);
    }

    const ahora = moment.tz("America/Lima").toDate();
    const razonCompleta = observaciones ? `${motivo} - ${observaciones}` : motivo;
    const platosAnulados = [];
    let totalAnulado = 0;

    // Anular cada plato que no esté ya anulado o eliminado
    for (let index = 0; index < comanda.platos.length; index++) {
      const plato = comanda.platos[index];
      
      if (plato.anulado || plato.eliminado) {
        continue; // Saltar platos ya anulados/eliminados
      }

      const estadoAlAnular = plato.estado;
      const nombrePlato = plato.plato?.nombre || 'Plato desconocido';
      const cantidad = comanda.cantidades[index] || 1;
      const precioUnitario = plato.plato?.precio || 0;

      // 🔥 IMPORTANTE: Marcar como ELIMINADO (igual que eliminación desde app mozos)
      // Esto asegura que el sistema de pagos lo excluya correctamente
      plato.eliminado = true;
      plato.eliminadoPor = usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null;
      plato.eliminadoAt = ahora;
      plato.eliminadoRazon = razonCompleta;
      plato.estadoAlEliminar = estadoAlAnular;

      // Marcar plato como anulado (campos adicionales para auditoría)
      plato.anulado = true;
      plato.anuladoPor = usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null;
      plato.anuladoAt = ahora;
      plato.anuladoRazon = razonCompleta;
      plato.anuladoSourceApp = sourceApp;
      plato.estadoAlAnular = estadoAlAnular;
      plato.tipoAnulacion = motivo;

      if (estadoAlAnular === 'recoger') {
        plato.generoDesperdicio = true;
      }

      // Registrar en historialPlatos como 'eliminado' (consistencia con app mozos)
      if (!comanda.historialPlatos) {
        comanda.historialPlatos = [];
      }
      comanda.historialPlatos.push({
        platoId: plato.platoId,
        nombreOriginal: nombrePlato,
        cantidadOriginal: cantidad,
        cantidadFinal: 0,
        estado: 'eliminado',
        timestamp: ahora,
        usuario: usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null,
        motivo: razonCompleta,
        anuladoPor: usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null,
        anuladoSourceApp: sourceApp,
        tipoAnulacion: motivo
      });

      platosAnulados.push({
        index,
        platoId: plato.platoId,
        nombre: nombrePlato,
        cantidad,
        precioUnitario,
        subtotal: precioUnitario * cantidad,
        estadoAlAnular,
        motivo
      });

      totalAnulado += precioUnitario * cantidad;
    }

    // Cambiar estado de la comanda a cancelado
    comanda.status = 'cancelado';
    comanda.version = (comanda.version || 1) + 1;
    
    // Registrar en historialEstados
    if (!comanda.historialEstados) {
      comanda.historialEstados = [];
    }
    comanda.historialEstados.push({
      status: 'cancelado',
      statusAnterior: comanda.status,
      timestamp: ahora,
      usuario: usuarioId ? new mongoose.Types.ObjectId(usuarioId) : null,
      accion: `Comanda anulada completamente desde ${sourceApp}`,
      deviceId: null,
      sourceApp,
      motivo: razonCompleta
    });

    await comanda.save();

    // Recalcular estado de la mesa
    const mesaId = comanda.mesas?._id || comanda.mesas;
    if (mesaId) {
      try {
        await recalcularEstadoMesa(mesaId);
        logger.info(`${logPrefix} Estado de mesa ${mesaId} recalculado`);
      } catch (err) {
        logger.warn(`${logPrefix} Error al recalcular estado de mesa:`, err.message);
      }
    }

    // Obtener comanda completa populada
    const comandaActualizada = await comandaModel.findById(comandaId)
      .populate('mozos')
      .populate({ path: 'mesas', populate: { path: 'area' } })
      .populate('cliente')
      .populate('platos.plato');

    logger.info(`${logPrefix} Comanda #${comanda.comandaNumber} anulada completamente`, {
      platosAnulados: platosAnulados.length,
      totalAnulado
    });

    return {
      comanda: comandaActualizada,
      platosAnulados,
      totalAnulado,
      motivoGeneral: razonCompleta,
      mesaId,
      numMesa: comandaActualizada.mesas?.nummesa,
      comandaNumber: comanda.comandaNumber
    };
  } catch (error) {
    logger.error(`${logPrefix} Error:`, { error: error.message, stack: error.stack });
    throw error;
  }
};

/**
 * 🔥 NUEVA FUNCIÓN: Aplicar descuento a una comanda
 * Solo usuarios con rol 'admin' o 'supervisor' pueden aplicar descuentos
 * @param {string} comandaId - ID de la comanda
 * @param {number} descuento - Porcentaje de descuento (0-100)
 * @param {string} motivo - Motivo del descuento (requerido si descuento > 0)
 * @param {string} usuarioId - ID del usuario que aplica el descuento
 * @param {string} usuarioRol - Rol del usuario para validación
 * @returns {Object} Comanda actualizada con descuento aplicado
 */
const aplicarDescuento = async (comandaId, descuento, motivo, usuarioId, usuarioRol) => {
  const logPrefix = '💰 [aplicarDescuento]';
  
  try {
    // 1. Validar rol del usuario
    const rolesPermitidos = ['admin', 'supervisor'];
    if (!rolesPermitidos.includes(usuarioRol)) {
      const error = new Error(`No autorizado. Solo usuarios con rol 'admin' o 'supervisor' pueden aplicar descuentos. Tu rol: ${usuarioRol}`);
      error.statusCode = 403;
      throw error;
    }

    // 2. Validar que el descuento esté en rango válido
    const descuentoNum = Number(descuento);
    if (isNaN(descuentoNum) || descuentoNum < 0 || descuentoNum > 100 || !Number.isInteger(descuentoNum)) {
      const error = new Error('El descuento debe ser un número entero entre 0 y 100');
      error.statusCode = 400;
      throw error;
    }

    // 3. Validar motivo obligatorio si hay descuento
    if (descuentoNum > 0 && (!motivo || motivo.trim().length < 3)) {
      const error = new Error('El motivo del descuento es obligatorio (mínimo 3 caracteres)');
      error.statusCode = 400;
      throw error;
    }

    // 4. Buscar la comanda
    const comanda = await comandaModel.findById(comandaId)
      .populate('platos.plato')
      .populate('mozos')
      .populate('mesas');

    if (!comanda) {
      const error = new Error('Comanda no encontrada');
      error.statusCode = 404;
      throw error;
    }

    // 5. Validar que la comanda no esté pagada
    if (comanda.status === 'pagado') {
      const error = new Error('No se puede aplicar descuento a una comanda ya pagada');
      error.statusCode = 400;
      throw error;
    }

    // 6. Calcular el subtotal actual de la comanda (platos activos)
    let subtotalActual = 0;

    for (let i = 0; i < comanda.platos.length; i++) {
      const platoItem = comanda.platos[i];
      // Solo contar platos no eliminados ni anulados
      if (platoItem.eliminado || platoItem.anulado) continue;

      const cantidad = comanda.cantidades?.[i] || 1;
      const precio = platoItem.plato?.precio || platoItem.precio || 0;
      subtotalActual += precio * cantidad;
    }

    // 7. Calcular totales usando calculosPrecios (respeta preciosIncluyenIGV)
    const configMoneda = await configuracionRepository.obtenerConfiguracionMoneda();
    const totalesOriginales = calculosPrecios.calcularTotales(subtotalActual, configMoneda);
    const totalSinDescuento = totalesOriginales.total;
    const subtotalSinIGV = totalesOriginales.subtotalSinIGV;

    // Aplicar descuento al subtotal sin IGV, luego recalcular IGV
    const subtotalConDescuento = subtotalSinIGV * (1 - descuentoNum / 100);
    const totalesConDescuento = calculosPrecios.calcularTotales(
      configMoneda.preciosIncluyenIGV ? subtotalConDescuento * (1 + configMoneda.igvPorcentaje / 100) : subtotalConDescuento,
      configMoneda
    );
    const totalCalculado = descuentoNum === 100 ? 0 : totalesConDescuento.total;
    // montoDescuento = ahorro TOTAL (subtotal + IGV), no solo subtotal
    const montoDescuento = Number((totalSinDescuento - totalCalculado).toFixed(2));
    const igvConDescuento = descuentoNum === 100 ? 0 : totalesConDescuento.igv;

    // 8. Guardar valores anteriores para auditoría
    const valoresAnteriores = {
      descuento: comanda.descuento || 0,
      motivoDescuento: comanda.motivoDescuento,
      totalCalculado: comanda.totalCalculado != null ? comanda.totalCalculado : totalSinDescuento,
      precioTotal: comanda.precioTotal || subtotalActual
    };

    // 9. Actualizar la comanda
    comanda.descuento = descuentoNum;
    comanda.motivoDescuento = descuentoNum > 0 ? motivo.trim() : null;
    comanda.descuentoAplicadoPor = validarUsuarioId(usuarioId);
    comanda.descuentoAplicadoAt = descuentoNum > 0 ? moment.tz("America/Lima").toDate() : null;
    comanda.totalSinDescuento = totalSinDescuento;
    comanda.montoDescuento = montoDescuento;
    comanda.totalCalculado = totalCalculado;
    comanda.precioTotal = subtotalConDescuento; // Actualizar precioTotal para consistencia
    comanda.version = (comanda.version || 1) + 1;
    comanda.updatedAt = moment.tz("America/Lima").toDate();

    await comanda.save();

    // 10. Obtener comanda completa actualizada
    const comandaActualizada = await comandaModel.findById(comandaId)
      .populate('mozos', 'name DNI rol')
      .populate({ path: 'mesas', populate: { path: 'area' } })
      .populate('cliente')
      .populate('platos.plato');

    logger.info(`${logPrefix} Descuento aplicado exitosamente`, {
      comandaId,
      comandaNumber: comanda.comandaNumber,
      descuento: descuentoNum,
      motivo: motivo?.substring(0, 50),
      totalAnterior: valoresAnteriores.totalCalculado,
      totalNuevo: totalCalculado,
      montoAhorro: totalSinDescuento - totalCalculado,
      aplicadoPor: usuarioId
    });

    return {
      comanda: comandaActualizada,
      descuentoAplicado: {
        porcentaje: descuentoNum,
        motivo: motivo?.trim(),
        totalSinDescuento: Number(totalSinDescuento.toFixed(2)),
        montoDescuento: Number(montoDescuento.toFixed(2)),
        igv: Number(igvConDescuento.toFixed(2)),
        totalCalculado: Number(totalCalculado.toFixed(2)),
        aplicadoPor: comandaActualizada.descuentoAplicadoPor,
        aplicadoAt: comanda.descuentoAplicadoAt
      },
      valoresAnteriores,
      usuarioRol
    };
  } catch (error) {
    logger.error(`${logPrefix} Error:`, { error: error.message, stack: error.stack });
    throw error;
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
  recalcularEstadoComandaPorPlatos,
  actualizarComandaSiTodosEntregados,
  anularPlato,
  anularComandaCompleta,
  aplicarDescuento,
  // FASE A1: Nuevas funciones optimizadas
  validarPlatosBatch,
  obtenerDatosDesnormalizados,
  PROYECCION_COCINA,
  PROYECCION_RESUMEN_MESA,
  PROYECCION_PAGOS
};
