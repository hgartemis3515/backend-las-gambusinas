const express = require("express");
const jwt = require("jsonwebtoken");
const moment = require("moment-timezone");
const { JWT_SECRET, adminAuth } = require("../middleware/adminAuth");
const logger = require("../utils/logger");

const router = express.Router();

const { listarMozos, crearMozo, obtenerMozosPorId, actualizarMozo, borrarMozo, autenticarMozo} = require("../repository/mozos.repository");
const rolesRepository = require("../repository/roles.repository");
const mozosRendimiento = require("../repository/mozosRendimiento.repository");
const { rangoLima, agregarVentasComandasPorMozo } = require("../utils/estadisticasComandas");

/** Campos que la app mozos puede editar en su propio perfil (no rol, DNI, PIN, etc.) */
const MOZO_SELF_PROFILE_KEYS = new Set([
  "nombres",
  "apellidos",
  "name",
  "phoneNumber",
  "email",
  "fechaNacimiento",
  "genero",
  "direccion",
  "contactoEmergenciaNombre",
  "contactoEmergenciaTelefono",
  "fotoUrl",
]);

function filterMozoSelfUpdateBody(body) {
  const out = {};
  if (!body || typeof body !== "object") return out;
  for (const key of MOZO_SELF_PROFILE_KEYS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

router.get("/mozos", async (req, res) => {
  const data = await listarMozos();
  const list = Array.isArray(data) ? data : [];
  let ventasMap = new Map();
  try {
    const { inicio, fin } = rangoLima();
    const rows = await agregarVentasComandasPorMozo(inicio, fin);
    for (const r of rows) {
      if (r._id != null) ventasMap.set(String(r._id), Number(r.totalVentas) || 0);
    }
  } catch (e) {
    logger.warn('No se pudieron adjuntar ventasHoy a /mozos', { error: e.message });
  }
  res.json(list.map((m) => {
    const o = m && typeof m.toObject === 'function' ? m.toObject() : { ...m };
    o.ventasHoy = ventasMap.get(String(o._id)) || 0;
    return o;
  }));
});

// Endpoint de prueba para verificar el usuario admin
router.get("/mozos/test/admin", async (req, res) => {
  try {
    const { autenticarMozo } = require("../repository/mozos.repository");
    const admin = await autenticarMozo('admin', 12345678);
    if (admin) {
      res.json({ 
        success: true, 
        message: 'Usuario admin encontrado',
        admin: {
          name: admin.name,
          DNI: admin.DNI,
          DNI_type: typeof admin.DNI,
          _id: admin._id
        }
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Usuario admin NO encontrado' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

router.get("/mozos/:id", async (req, res) => {
  try {
    const codigomozo = req.params.id;

    const mozo = await obtenerMozosPorId(codigomozo);

    if (!mozo) {
      console.log("Estudiante no encontrado");
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const json = typeof mozo.toJSON === "function" ? mozo.toJSON() : mozo;
    try {
      const mozoConRol = await rolesRepository.obtenerMozoConRol(mozo._id);
      if (mozoConRol?.permisosEfectivos) {
        json.permisosEfectivos = mozoConRol.permisosEfectivos;
      }
    } catch (e) {
      logger.warn("No se pudieron adjuntar permisosEfectivos", { error: e.message, mozoId: mozo._id });
    }
    console.log('Mozo encontrado:', json._id);
    res.json(json);

  } catch (error) {
    console.error("Error al procesar la solicitud:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.post('/mozos', async (req, res) => {
  try {
      const data = req.body;
      const result = await crearMozo(data);
      res.json(result);
      console.log("Nuevo mozo creado:", result);
  } catch(error) {
      console.error("Error al procesar la solicitud:", error);
      res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.put('/mozos/:id', async (req, res) => {
    try{
        const id = req.params.id;
        let newData = { ...req.body };

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
                if (decoded.app === "mozos") {
                    if (String(decoded.id) !== String(id)) {
                        return res.status(403).json({ error: "No puedes modificar el perfil de otro usuario" });
                    }
                    newData = filterMozoSelfUpdateBody(newData);
                }
            } catch (verifyErr) {
                return res.status(401).json({ error: "Token inválido o expirado" });
            }
        }

        const data = await actualizarMozo(id, newData);
        res.json(data);
        console.log("Se actualizó el mozo:", id);
    }catch(error){
        console.error('Error al actualizar el mozo', error);
        const statusCode = error.message.includes('no encontrado') ? 404 : 500;
        res.status(statusCode).json({ error: error.message || 'Error interno del servidor' });
    }
});

router.delete('/mozos/:id', async(req, res) => {
  try {
    const id = req.params.id;

    // Verificar si el mozo existe usando _id
    const mozos = require('../database/models/mozos.model');
    const mozo = await mozos.findById(id);

    if (!mozo) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const data = await borrarMozo(id);
    res.json(data);
} catch (error) {
    console.error('Error al eliminar el usuario', error);
    res.status(500).json({ message: 'Error interno del servidor' });
}
});


router.post('/mozos/auth', async (req, res) => {
  try {
      console.log('📥 Solicitud de autenticación recibida');
      console.log('   - Body completo:', JSON.stringify(req.body));
      
      const { name, DNI } = req.body;
      
      // Validar que se recibieron los datos
      if (!name || DNI === undefined || DNI === null || DNI === '') {
          console.log('❌ Datos faltantes - name:', name, 'DNI:', DNI);
          return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
      }
      
      console.log('📋 Datos recibidos:');
      console.log('   - name:', name, 'tipo:', typeof name);
      console.log('   - DNI:', DNI, 'tipo:', typeof DNI);
      
      // Convertir DNI a número
      let dniNumber;
      if (typeof DNI === 'string') {
          dniNumber = parseInt(DNI.trim(), 10);
      } else {
          dniNumber = Number(DNI);
      }
      
      // Validar que la conversión fue exitosa
      if (isNaN(dniNumber) || dniNumber <= 0) {
          console.log('❌ DNI inválido - recibido:', DNI, 'convertido:', dniNumber);
          return res.status(400).json({ message: 'Contraseña inválida' });
      }
      
      console.log('🔍 Intentando autenticar:');
      console.log('   - Usuario:', name);
      console.log('   - Contraseña (DNI):', dniNumber);
      
      // Verificar si el usuario existe con el name y DNI proporcionados
      const mozo = await autenticarMozo(name, dniNumber);
      
      if (!mozo) {
          console.log('❌ Autenticación fallida - Usuario no encontrado');
          return res.status(401).json({ message: 'Credenciales incorrectas' });
      }
      
      console.log('✅ Autenticación exitosa');
      console.log('   - Usuario:', mozo.name);
      console.log('   - ID:', mozo._id);
      
      // Devolver información del mozo autenticado
      res.json({ message: 'Mozo autenticado correctamente', mozo });
  } catch (error) {
      console.error('❌ Error al autenticar el mozo:', error);
      console.error('   - Stack:', error.stack);
      res.status(500).json({ message: 'Error interno del servidor' });
  }
});

/**
 * POST /api/mozos/push-token
 * Registrar token de notificaciones push del App de Mozos
 * Body: { mozoId, pushToken, platform, deviceId }
 */
router.post('/mozos/push-token', async (req, res) => {
  try {
    const { mozoId, pushToken, platform, deviceId } = req.body;
    
    if (!mozoId || !pushToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'mozoId y pushToken son requeridos' 
      });
    }
    
    const mozosModel = require('../database/models/mozos.model');
    
    // Actualizar el mozo con el token de push
    const mozo = await mozosModel.findByIdAndUpdate(
      mozoId,
      {
        pushToken,
        pushPlatform: platform || 'unknown',
        pushDeviceId: deviceId || null,
        pushTokenUpdatedAt: new Date()
      },
      { new: true }
    );
    
    if (!mozo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Mozo no encontrado' 
      });
    }
    
    console.log(`✅ Push token registrado para mozo ${mozo.name}:`, pushToken.substring(0, 30) + '...');
    
    res.json({ 
      success: true, 
      message: 'Token registrado correctamente',
      mozoId: mozo._id
    });
    
  } catch (error) {
    console.error('❌ Error al registrar push token:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
});

// ==================== RENDIMIENTO DE MOZOS ====================
// GET /api/mozos/rendimiento/en-vivo — snapshot de comandas activas en salón
router.get('/mozos/rendimiento/en-vivo', adminAuth, async (req, res) => {
  try {
    const tieneReportes = req.admin?.permisos?.includes('ver-reportes') || req.admin?.rol === 'admin' || req.admin?.rol === 'supervisor' || req.admin?.permisos?.includes('ver-mozos');
    if (!tieneReportes) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para ver el rendimiento en vivo de mozos' });
    }
    const mozoId = req.query.mozoId || null;
    const data = await mozosRendimiento.obtenerRendimientoEnVivo({ mozoId });
    res.json({ success: true, data, actualizadoEn: new Date().toISOString() });
  } catch (error) {
    logger.error('Error al obtener rendimiento en vivo de mozos', { error: error.message });
    res.status(500).json({ success: false, error: 'Error al obtener rendimiento en vivo' });
  }
});

// GET /api/mozos/rendimiento/resumen-turno — KPIs agregados del día
router.get('/mozos/rendimiento/resumen-turno', adminAuth, async (req, res) => {
  try {
    const tieneReportes = req.admin?.permisos?.includes('ver-reportes') || req.admin?.rol === 'admin' || req.admin?.rol === 'supervisor' || req.admin?.permisos?.includes('ver-mozos');
    if (!tieneReportes) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para ver el resumen de turno de mozos' });
    }
    const fechaInicio = req.query.desde ? moment(req.query.desde).startOf('day').toDate() : moment().startOf('day').toDate();
    const fechaFin = req.query.hasta ? moment(req.query.hasta).endOf('day').toDate() : moment().endOf('day').toDate();
    const resumen = await mozosRendimiento.obtenerResumenTurnoMozos({ fechaInicio, fechaFin });
    res.json({ success: true, data: resumen });
  } catch (error) {
    logger.error('Error al obtener resumen de turno de mozos', { error: error.message });
    res.status(500).json({ success: false, error: 'Error al obtener resumen de turno' });
  }
});

// GET /api/mozos/rendimiento/historial — registro de comandas atendidas (una fila por comanda)
router.get('/mozos/rendimiento/historial', adminAuth, async (req, res) => {
  try {
    const tieneReportes = req.admin?.permisos?.includes('ver-reportes') || req.admin?.rol === 'admin' || req.admin?.rol === 'supervisor' || req.admin?.permisos?.includes('ver-mozos');
    if (!tieneReportes) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para ver el historial de comandas de mozos' });
    }

    const { desde, hasta } = req.query;
    const fechaInicio = desde ? moment(desde).startOf('day').toDate() : moment().startOf('day').toDate();
    const fechaFin = hasta ? moment(hasta).endOf('day').toDate() : moment().endOf('day').toDate();

    let mozoId = null;
    // Si no es admin/supervisor con reportes, limitar a sus propias comandas
    const tieneFull = req.admin?.permisos?.includes('ver-reportes') || req.admin?.rol === 'admin' || req.admin?.rol === 'supervisor';
    if (!tieneFull && req.admin?.id) {
      mozoId = req.admin.id;
    }
    if (req.query.mozoId && tieneFull) {
      mozoId = req.query.mozoId;
    }

    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 500, 1), 1000);
    const resultado = await mozosRendimiento.obtenerHistorialComandasMozos({ mozoId, fechaInicio, fechaFin, limite });

    res.json({
      success: true,
      data: {
        periodo: { desde: fechaInicio, hasta: fechaFin },
        ...resultado
      }
    });
  } catch (error) {
    logger.error('Error al obtener historial de comandas de mozos', { error: error.message });
    res.status(500).json({ success: false, error: 'Error al obtener historial de comandas' });
  }
});

module.exports = router;