/**
 * VISTA COCINA REPOSITORY
 * Acceso a datos para gestion de Vistas de Cocina y Pantallas de Cocina
 */

const crypto = require('crypto');
const VistaCocina = require('../database/models/vistaCocina.model');
const PantallaCocina = require('../database/models/pantallaCocina.model');
const logger = require('../utils/logger');

// Longitud del token de dispositivo en bytes (se devuelve en hex)
const DEVICE_TOKEN_BYTES = 32;

/**
 * Hashea un token de dispositivo usando scrypt (Node stdlib, sin dependencias).
 * @param {string} token - Token plano
 * @returns {string} Hash listo para almacenar
 */
function hashDeviceToken(token) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(token, salt, 32).toString('hex');
    return `scrypt$${salt}$${hash}`;
}

/**
 * Verifica un token plano contra el hash almacenado.
 * @param {string} token - Token plano
 * @param {string} stored - Hash almacenado
 * @returns {boolean}
 */
function verifyDeviceToken(token, stored) {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = parts[1];
    const expected = parts[2];
    const computed = crypto.scryptSync(token, salt, 32).toString('hex');
    // Comparacion de tiempo constante
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Genera un token de dispositivo aleatorio (hex).
 * @returns {string}
 */
function generateDeviceToken() {
    return crypto.randomBytes(DEVICE_TOKEN_BYTES).toString('hex');
}

/* ====================== VISTAS DE COCINA ====================== */

async function obtenerVistasCocina(filtros = {}) {
    try {
        const query = {};
        if (filtros.activo !== undefined) {
            query.activo = filtros.activo;
        }
        return await VistaCocina.find(query).sort({ nombre: 1 }).lean();
    } catch (error) {
        logger.error('Error al obtener vistas de cocina', { error: error.message });
        throw error;
    }
}

async function obtenerVistasCocinaActivas() {
    try {
        return await VistaCocina.find({ activo: true })
            .select('nombre descripcion color icono filtrosPlatos configVisual ordenamiento configCronometro')
            .sort({ nombre: 1 })
            .lean();
    } catch (error) {
        logger.error('Error al obtener vistas activas', { error: error.message });
        throw error;
    }
}

async function obtenerVistaCocinaPorId(id) {
    try {
        return await VistaCocina.findById(id).lean();
    } catch (error) {
        logger.error('Error al obtener vista de cocina por ID', { error: error.message });
        throw error;
    }
}

async function crearVistaCocina(datos, creadoPor = null) {
    try {
        const existente = await VistaCocina.findOne({ nombre: datos.nombre });
        if (existente) {
            throw new Error('Ya existe una vista de cocina con ese nombre');
        }
        const vista = await VistaCocina.create({ ...datos, creadoPor });
        logger.info('Vista de Cocina creada', { vistaId: vista._id, nombre: vista.nombre, creadoPor });
        return vista;
    } catch (error) {
        logger.error('Error al crear vista de cocina', { error: error.message });
        throw error;
    }
}

async function actualizarVistaCocina(id, datos, actualizadoPor = null) {
    try {
        const existente = await VistaCocina.findById(id);
        if (!existente) {
            throw new Error('Vista de cocina no encontrada');
        }
        if (datos.nombre && datos.nombre !== existente.nombre) {
            const dup = await VistaCocina.findOne({ nombre: datos.nombre, _id: { $ne: id } });
            if (dup) {
                throw new Error('Ya existe otra vista de cocina con ese nombre');
            }
        }
        const vista = await VistaCocina.findByIdAndUpdate(
            id,
            { $set: { ...datos, actualizadoPor, updatedAt: new Date() } },
            { new: true }
        );
        logger.info('Vista de Cocina actualizada', { vistaId: id, actualizadoPor });
        return vista;
    } catch (error) {
        logger.error('Error al actualizar vista de cocina', { error: error.message });
        throw error;
    }
}

async function eliminarVistaCocina(id, eliminadoPor = null) {
    try {
        const vista = await VistaCocina.findByIdAndUpdate(
            id,
            { $set: { activo: false, actualizadoPor: eliminadoPor, updatedAt: new Date() } },
            { new: true }
        );
        if (!vista) {
            throw new Error('Vista de cocina no encontrada');
        }
        logger.info('Vista de Cocina desactivada', { vistaId: id, eliminadoPor });
        return vista;
    } catch (error) {
        logger.error('Error al eliminar vista de cocina', { error: error.message });
        throw error;
    }
}

async function reactivarVistaCocina(id, actualizadoPor = null) {
    try {
        const vista = await VistaCocina.findByIdAndUpdate(
            id,
            { $set: { activo: true, actualizadoPor, updatedAt: new Date() } },
            { new: true }
        );
        if (!vista) {
            throw new Error('Vista de cocina no encontrada');
        }
        logger.info('Vista de Cocina reactivada', { vistaId: id, actualizadoPor });
        return vista;
    } catch (error) {
        logger.error('Error al reactivar vista de cocina', { error: error.message });
        throw error;
    }
}

/* ====================== PANTALLAS DE COCINA ====================== */

async function obtenerPantallasCocina() {
    try {
        return await PantallaCocina.find()
            .sort({ numeroPantalla: 1 })
            .populate('vistaCocinaId', 'nombre color icono')
            .populate('cocineroId', 'nombre alias')
            .lean();
    } catch (error) {
        logger.error('Error al obtener pantallas de cocina', { error: error.message });
        throw error;
    }
}

async function obtenerPantallasActivas() {
    try {
        return await PantallaCocina.find({ activo: true })
            .sort({ numeroPantalla: 1 })
            .populate('vistaCocinaId', 'nombre descripcion color icono filtrosPlatos configVisual ordenamiento configCronometro')
            .populate('cocineroId', 'nombre alias')
            .populate('perfilVerCocinaId', 'nombre')
            .lean();
    } catch (error) {
        // Fallback: si un doc tiene cocineroId/vistaCocinaId/perfilVerCocinaId invalido (string vacio,
        // no-ObjectId), el populate lanza CastError. Reintentamos sin populate para
        // que el frontend no reciba 500 y pueda mostrar las pantallas.
        logger.warn('obtenerPantallasActivas: populate falló, reintentando sin populate', { error: error.message });
        try {
            return await PantallaCocina.find({ activo: true })
                .sort({ numeroPantalla: 1 })
                .lean();
        } catch (err2) {
            logger.error('Error al obtener pantallas activas (fallback)', { error: err2.message });
            throw err2;
        }
    }
}

async function crearPantallaCocina(datos, creadoPor = null) {
    try {
        const existente = await PantallaCocina.findOne({ numeroPantalla: datos.numeroPantalla });
        if (existente) {
            throw new Error(`Ya existe la pantalla ${datos.numeroPantalla}`);
        }
        const pantalla = await PantallaCocina.create(datos);
        logger.info('Pantalla de Cocina creada', { pantallaId: pantalla._id, numero: pantalla.numeroPantalla, creadoPor });
        return pantalla;
    } catch (error) {
        logger.error('Error al crear pantalla de cocina', { error: error.message });
        throw error;
    }
}

async function actualizarPantallaCocina(id, datos, actualizadoPor = null) {
    try {
        const pantalla = await PantallaCocina.findByIdAndUpdate(
            id,
            { $set: { ...datos, updatedAt: new Date() } },
            { new: true }
        );
        if (!pantalla) {
            throw new Error('Pantalla de cocina no encontrada');
        }
        logger.info('Pantalla de Cocina actualizada', { pantallaId: id, actualizadoPor });
        return pantalla;
    } catch (error) {
        logger.error('Error al actualizar pantalla de cocina', { error: error.message });
        throw error;
    }
}

/**
 * Actualiza en lote la distribucion de pantallas para el flujo
 * "Distribuir Cocina en monitores" (PC multi-monitor).
 * Cada item: { id, cocineroId, modoVista, perfilAplicar }.
 * - cocineroId null  => "Sin asignar" (no se abrira ventana para esa pantalla).
 * - modoVista        => 'completo' (recomendado) o 'personalizado'.
 * - perfilAplicar    => 'none' | 'auto' | '<PerfilVerCocinaId>' (perfil por monitor).
 * No toca deviceTokenHash ni configDespliegue.
 * @param {Array<{id: string, cocineroId: string|null, modoVista: string, perfilAplicar?: string}>} items
 * @param {string|null} actualizadoPor
 * @returns {Promise<Array<Object>>} pantallas actualizadas (lean)
 */
async function actualizarDistribucionPantallas(items, actualizadoPor = null) {
    try {
        if (!Array.isArray(items) || items.length === 0) return [];
        const ops = items.map((item) => {
            const set = {
                modoVista: item.modoVista || 'completo',
                actualizadoPor,
                updatedAt: new Date(),
            };
            // cocineroId: null desasigna; string lo asigna
            if (item.cocineroId === null || item.cocineroId === '' || item.cocineroId === undefined) {
                set.cocineroId = null;
            } else {
                set.cocineroId = item.cocineroId;
            }
            // Perfil de personalización por monitor (flujo Distribuir Cocina).
            const perfil = item.perfilAplicar;
            if (perfil === 'auto') {
                set.perfilAuto = true;
                set.perfilVerCocinaId = null;
            } else if (perfil && perfil !== 'none') {
                set.perfilAuto = false;
                set.perfilVerCocinaId = perfil;
            } else {
                // 'none' o ausente
                set.perfilAuto = false;
                set.perfilVerCocinaId = null;
            }
            // PLAN GUARNICIONES_SEPARADAS v1.1 §11: flag por monitor para que la
            // ventana hija abra con ?listaGuarniciones=1 (split 50/50 en kiosk).
            if (typeof item.listaGuarniciones === 'boolean') {
                set.listaGuarniciones = item.listaGuarniciones === true;
            }
            return {
                updateOne: {
                    filter: { _id: item.id },
                    update: { $set: set },
                },
            };
        });
        await PantallaCocina.bulkWrite(ops);
        const ids = items.map((i) => i.id);
        return await PantallaCocina.find({ _id: { $in: ids } })
            .populate('cocineroId', 'nombre alias')
            .populate('perfilVerCocinaId', 'nombre')
            .lean();
    } catch (error) {
        logger.error('Error al actualizar distribucion de pantallas', { error: error.message });
        throw error;
    }
}

async function eliminarPantallaCocina(id) {
    try {
        const pantalla = await PantallaCocina.findByIdAndDelete(id);
        if (!pantalla) {
            throw new Error('Pantalla de cocina no encontrada');
        }
        logger.info('Pantalla de Cocina eliminada', { pantallaId: id });
        return pantalla;
    } catch (error) {
        logger.error('Error al eliminar pantalla de cocina', { error: error.message });
        throw error;
    }
}

/* ====================== KIOSKO / DEVICE TOKEN ====================== */

/**
 * Obtiene una pantalla por su numero (1-8) sin auth, para bootstrap del TV.
 * No devuelve el hash del token.
 */
async function obtenerPantallaPorNumero(numeroPantalla) {
    try {
        return await PantallaCocina.findOne({ numeroPantalla: Number(numeroPantalla) })
            .populate('cocineroId', 'nombre alias')
            .select('-deviceTokenHash')
            .lean();
    } catch (error) {
        logger.error('Error al obtener pantalla por numero', { error: error.message });
        throw error;
    }
}

/**
 * Verifica el device token de una pantalla y retorna la pantalla si es valida.
 * @param {number} numeroPantalla
 * @param {string} deviceToken - Token plano
 * @returns {Promise<Object|null>}
 */
async function verificarDeviceToken(numeroPantalla, deviceToken) {
    try {
        const pantalla = await PantallaCocina.findOne({ numeroPantalla: Number(numeroPantalla) });
        if (!pantalla || !pantalla.activo) return null;
        if (!pantalla.deviceTokenHash || !deviceToken) return null;
        const ok = verifyDeviceToken(deviceToken, pantalla.deviceTokenHash);
        if (!ok) return null;
        // Actualizar heartbeat
        pantalla.ultimaConexion = new Date();
        await pantalla.save();
        return pantalla.toObject();
    } catch (error) {
        logger.error('Error al verificar device token', { error: error.message });
        throw error;
    }
}

/**
 * Genera (o regenera) un device token para una pantalla.
 * Devuelve el token plano (solo una vez) y almacena el hash.
 * @param {string} pantallaId
 * @returns {Promise<{pantalla: Object, deviceToken: string}>}
 */
async function generarDeviceToken(pantallaId) {
    try {
        const pantalla = await PantallaCocina.findById(pantallaId);
        if (!pantalla) throw new Error('Pantalla de cocina no encontrada');

        const plainToken = generateDeviceToken();
        pantalla.deviceTokenHash = hashDeviceToken(plainToken);
        pantalla.deviceTokenCreatedAt = new Date();
        await pantalla.save();

        logger.info('Device token generado para pantalla', {
            pantallaId: pantalla._id,
            numero: pantalla.numeroPantalla
        });

        return { pantalla: pantalla.toObject(), deviceToken: plainToken };
    } catch (error) {
        logger.error('Error al generar device token', { error: error.message });
        throw error;
    }
}

/**
 * Revoca el device token de una pantalla (la desvincula del TV).
 * @param {string} pantallaId
 */
async function revocarDeviceToken(pantallaId) {
    try {
        const pantalla = await PantallaCocina.findByIdAndUpdate(
            pantallaId,
            { $unset: { deviceTokenHash: 1, deviceTokenCreatedAt: 1 }, ultimaConexion: null },
            { new: true }
        );
        if (!pantalla) throw new Error('Pantalla de cocina no encontrada');
        logger.info('Device token revocado', { pantallaId });
        return pantalla;
    } catch (error) {
        logger.error('Error al revocar device token', { error: error.message });
        throw error;
    }
}

module.exports = {
    obtenerVistasCocina,
    obtenerVistasCocinaActivas,
    obtenerVistaCocinaPorId,
    crearVistaCocina,
    actualizarVistaCocina,
    eliminarVistaCocina,
    reactivarVistaCocina,
    obtenerPantallasCocina,
    obtenerPantallasActivas,
    crearPantallaCocina,
    actualizarPantallaCocina,
    eliminarPantallaCocina,
    obtenerPantallaPorNumero,
    verificarDeviceToken,
    generarDeviceToken,
    revocarDeviceToken,
    actualizarDistribucionPantallas
};