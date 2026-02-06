const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const SesionesUsuarios = require('../database/models/sesionesUsuarios.model');

/**
 * Middleware de Auditoría Global
 * Registra automáticamente todas las acciones del sistema
 * Inspirado en Toast POS, Lightspeed, Square Restaurant
 */
const auditoriaMiddleware = async (req, res, next) => {
  // Extraer información de la acción
  const metodo = req.method;
  const ruta = req.path;
  const partesRuta = ruta.split('/').filter(p => p);
  
  // Determinar tipo de entidad y acción
  let entidadTipo = null;
  let accion = null;
  
  // Mapeo de rutas a tipos de entidad
  if (partesRuta[0] === 'comanda') {
    entidadTipo = 'comanda';
    if (metodo === 'POST') accion = 'comanda_creada';
    else if (metodo === 'PUT' && partesRuta[1] === 'eliminar') accion = 'comanda_eliminada';
    else if (metodo === 'PUT') accion = 'comanda_editada';
    else if (metodo === 'DELETE') accion = 'comanda_eliminada';
  } else if (partesRuta[0] === 'platos') {
    entidadTipo = 'plato';
    if (metodo === 'POST') accion = 'plato_agregado';
    else if (metodo === 'PUT') accion = 'plato_modificado';
    else if (metodo === 'DELETE') accion = 'plato_eliminado';
  } else if (partesRuta[0] === 'mesas') {
    entidadTipo = 'mesa';
    if (metodo === 'PUT') accion = 'mesa_modificada';
  }
  
  // Agregar información de auditoría al request
  req.auditoria = {
    accion: accion || `${metodo}_${partesRuta[0]}`,
    entidadTipo: entidadTipo || partesRuta[0] || 'unknown',
    usuario: req.userId || req.body?.usuarioId || null,
    ip: req.ip || req.connection?.remoteAddress || null,
    deviceId: req.headers['device-id'] || req.headers['x-device-id'] || null,
    metadata: {
      metodo,
      ruta,
      userAgent: req.headers['user-agent'] || null
    }
  };
  
  // Guardar snapshot del body antes de la modificación (para PUT/DELETE)
  if ((metodo === 'PUT' || metodo === 'DELETE') && req.params.id) {
    try {
      // Esto se completará después de la acción en el controller
      req.auditoria.entidadId = req.params.id;
    } catch (error) {
      console.warn('⚠️ Error al preparar auditoría:', error.message);
    }
  }
  
  // Continuar con el siguiente middleware
  next();
};

/**
 * Función helper para registrar auditoría después de una acción
 * @param {Object} req - Request object
 * @param {Object} datosAntes - Snapshot antes de la acción
 * @param {Object} datosDespues - Snapshot después de la acción
 * @param {String} motivo - Motivo de la acción (opcional)
 */
const registrarAuditoria = async (req, datosAntes, datosDespues, motivo = null) => {
  try {
    if (!req.auditoria) {
      console.warn('⚠️ No hay información de auditoría en el request');
      return;
    }
    
    // Convertir snapshots a objetos planos con nombres explícitos
    let datosAntesPlain = null;
    let datosDespuesPlain = null;
    
    if (datosAntes) {
      if (typeof datosAntes.toObject === 'function') {
        datosAntesPlain = datosAntes.toObject();
      } else {
        datosAntesPlain = datosAntes;
      }
      
      // Asegurar que los platos tengan nombres explícitos
      if (datosAntesPlain.platos && Array.isArray(datosAntesPlain.platos)) {
        datosAntesPlain.platos = datosAntesPlain.platos.map(p => {
          // Si ya tiene nombre explícito, mantenerlo
          if (p.nombre && p.nombre !== 'Plato desconocido' && p.nombre !== 'Sin nombre') {
            return p;
          }
          // Si tiene plato populado, usar su nombre
          if (p.plato && typeof p.plato === 'object' && p.plato.nombre) {
            return { ...p, nombre: p.plato.nombre, precio: p.plato.precio || 0 };
          }
          return p;
        });
      }
    }
    
    if (datosDespues) {
      if (typeof datosDespues.toObject === 'function') {
        datosDespuesPlain = datosDespues.toObject();
      } else {
        datosDespuesPlain = datosDespues;
      }
      
      // Asegurar que los platos tengan nombres explícitos
      if (datosDespuesPlain.platos && Array.isArray(datosDespuesPlain.platos)) {
        datosDespuesPlain.platos = datosDespuesPlain.platos.map(p => {
          // Si ya tiene nombre explícito, mantenerlo
          if (p.nombre && p.nombre !== 'Plato desconocido' && p.nombre !== 'Sin nombre') {
            return p;
          }
          // Si tiene plato populado, usar su nombre
          if (p.plato && typeof p.plato === 'object' && p.plato.nombre) {
            return { ...p, nombre: p.plato.nombre, precio: p.plato.precio || 0 };
          }
          return p;
        });
      }
    }
    
    const auditoriaData = {
      accion: req.auditoria.accion,
      entidadId: req.auditoria.entidadId || datosDespues?._id || datosAntes?._id,
      entidadTipo: req.auditoria.entidadTipo,
      usuario: req.auditoria.usuario,
      datosAntes: datosAntesPlain,
      datosDespues: datosDespuesPlain,
      motivo: motivo || req.body?.motivo || null,
      ip: req.auditoria.ip,
      deviceId: req.auditoria.deviceId,
      metadata: {
        ...req.auditoria.metadata,
        comandaNumber: datosDespues?.comandaNumber || datosAntes?.comandaNumber,
        mesaId: datosDespues?.mesas || datosAntes?.mesas
      }
    };
    
    await AuditoriaAcciones.create(auditoriaData);
    console.log(`✅ Auditoría registrada: ${auditoriaData.accion} - ${auditoriaData.entidadTipo}`);
  } catch (error) {
    console.error('❌ Error al registrar auditoría:', error.message);
    // No lanzar error para no interrumpir el flujo principal
  }
};

/**
 * Función helper para actualizar sesión de usuario
 * @param {String} usuarioId - ID del usuario
 * @param {String} deviceId - ID del dispositivo
 * @param {String} ip - IP del usuario
 */
const actualizarSesionUsuario = async (usuarioId, deviceId = null, ip = null) => {
  try {
    if (!usuarioId) return;
    
    const sesion = await SesionesUsuarios.findOneAndUpdate(
      { usuario: usuarioId, estado: 'activa' },
      {
        $set: {
          ultimaAccion: new Date(),
          deviceId: deviceId || undefined,
          ip: ip || undefined
        }
      },
      { upsert: true, new: true }
    );
    
    return sesion;
  } catch (error) {
    console.error('❌ Error al actualizar sesión de usuario:', error.message);
  }
};

module.exports = {
  auditoriaMiddleware,
  registrarAuditoria,
  actualizarSesionUsuario
};

