/**
 * COCINEROS CONTROLLER
 * Endpoints para gestión de cocineros y configuración KDS
 */

const express = require('express');
const router = express.Router();
const cocinerosRepository = require('../repository/cocineros.repository');
const { adminAuth, checkPermission, checkRole } = require('../middleware/adminAuth');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

/**
 * GET /api/cocina/cocineros
 * Listar cocineros activos para el selector de Ver Cocina Completo (app cocina).
 * Requiere permiso: ver-cocina-completo (roles cocinero/admin/supervisor).
 * Respuesta mínima sin datos sensibles: _id, name, alias.
 */
router.get('/cocina/cocineros', adminAuth, checkPermission('ver-cocina-completo'), async (req, res) => {
    try {
        const cocineros = await cocinerosRepository.obtenerCocineros({ activo: true });
        // Proyección mínima: _id, name, alias, fotoUrl
        const data = cocineros.map(c => ({
            _id: c._id,
            name: c.name,
            alias: c.configKDS?.aliasCocinero || c.name,
            fotoUrl: c.fotoUrl || ''
        }));
        res.json({ success: true, data, total: data.length });
    } catch (error) {
        logger.error('Error al listar cocineros para app cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener lista de cocineros' });
    }
});

/**
 * GET /api/cocineros
 * Listar todos los cocineros con su configuración
 * Requiere permiso: ver-mozos
 */
router.get('/cocineros', adminAuth, checkPermission('ver-mozos'), async (req, res) => {
    try {
        const { activo } = req.query;
        
        const filtros = {};
        if (activo !== undefined) {
            filtros.activo = activo === 'true';
        }
        
        const cocineros = await cocinerosRepository.obtenerCocineros(filtros);
        
        res.json({
            success: true,
            data: cocineros,
            total: cocineros.length
        });
    } catch (error) {
        logger.error('Error al listar cocineros', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener lista de cocineros' 
        });
    }
});

/**
 * GET /api/cocineros/:id
 * Obtener un cocinero específico con su configuración
 */
router.get('/cocineros/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validar que el usuario tenga permiso de ver otros o sea el mismo usuario
        const esPropio = req.admin.id === id;
        if (!esPropio && !req.admin.permisos?.includes('ver-mozos')) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para ver este cocinero' 
            });
        }
        
        const cocinero = await cocinerosRepository.obtenerCocineroPorId(id);
        
        if (!cocinero) {
            return res.status(404).json({ 
                success: false, 
                error: 'Cocinero no encontrado' 
            });
        }
        
        res.json({
            success: true,
            data: cocinero
        });
    } catch (error) {
        logger.error('Error al obtener cocinero', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener cocinero' 
        });
    }
});

/**
 * GET /api/cocineros/:id/config
 * Obtener configuración KDS de un cocinero
 * El cocinero puede ver su propia configuración, admin/supervisor puede ver cualquiera
 */
router.get('/cocineros/:id/config', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validar permisos
        const esPropio = req.admin.id === id;
        const tienePermisoGestion = req.admin.permisos?.includes('ver-mozos');
        
        if (!esPropio && !tienePermisoGestion) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para ver esta configuración' 
            });
        }
        
        const config = await cocinerosRepository.obtenerConfigKDS(id);
        
        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('Error al obtener configuración KDS', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener configuración KDS' 
        });
    }
});

/**
 * PUT /api/cocineros/:id/config
 * Actualizar configuración KDS de un cocinero
 * El cocinero puede editar su propia configuración, admin/supervisor puede editar cualquiera
 */
router.put('/cocineros/:id/config', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const datosConfig = req.body;
        
        // Validar permisos
        const esPropio = req.admin.id === id;
        const tienePermisoGestion = req.admin.permisos?.includes('editar-mozos');
        
        if (!esPropio && !tienePermisoGestion) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para modificar esta configuración' 
            });
        }
        
        // Sanitizar datos de entrada
        const datosSanitizados = {};
        
        if (datosConfig.aliasCocinero !== undefined) {
            datosSanitizados.aliasCocinero = datosConfig.aliasCocinero?.trim() || null;
        }
        
        if (datosConfig.filtrosPlatos) {
            datosSanitizados.filtrosPlatos = {
                modoInclusion: datosConfig.filtrosPlatos.modoInclusion ?? true,
                platosPermitidos: datosConfig.filtrosPlatos.platosPermitidos || [],
                categoriasPermitidas: datosConfig.filtrosPlatos.categoriasPermitidas || [],
                tiposPermitidos: datosConfig.filtrosPlatos.tiposPermitidos || []
            };
        }
        
        if (datosConfig.filtrosComandas) {
            datosSanitizados.filtrosComandas = {
                areasPermitidas: datosConfig.filtrosComandas.areasPermitidas || [],
                mesasEspecificas: datosConfig.filtrosComandas.mesasEspecificas || [],
                rangoHorario: datosConfig.filtrosComandas.rangoHorario || { inicio: null, fin: null },
                soloPrioritarias: datosConfig.filtrosComandas.soloPrioritarias || false
            };
        }
        
        if (datosConfig.configTableroKDS) {
            datosSanitizados.configTableroKDS = {
                tiempoAmarillo: datosConfig.configTableroKDS.tiempoAmarillo || 15,
                tiempoRojo: datosConfig.configTableroKDS.tiempoRojo || 20,
                maxTarjetasVisibles: datosConfig.configTableroKDS.maxTarjetasVisibles || 20,
                modoAltoVolumen: datosConfig.configTableroKDS.modoAltoVolumen || false,
                sonidoNotificacion: datosConfig.configTableroKDS.sonidoNotificacion ?? true,
                modoNocturno: datosConfig.configTableroKDS.modoNocturno ?? true,
                columnasGrid: datosConfig.configTableroKDS.columnasGrid || 5,
                filasGrid: datosConfig.configTableroKDS.filasGrid || 1,
                tamanioFuente: datosConfig.configTableroKDS.tamanioFuente || 15
            };
        }
        
        const configActualizada = await cocinerosRepository.actualizarConfigKDS(
            id, 
            datosSanitizados, 
            req.admin.id
        );
        
        // Emitir evento Socket.io para actualizar el KDS del cocinero en tiempo real
        if (global.emitConfigCocineroActualizada) {
            global.emitConfigCocineroActualizada(id, datosSanitizados);
        }
        
        logger.info('Configuración KDS actualizada', {
            cocineroId: id,
            actualizadoPor: req.admin.id,
            campos: Object.keys(datosSanitizados)
        });
        
        res.json({
            success: true,
            message: 'Configuración actualizada correctamente',
            data: configActualizada
        });
    } catch (error) {
        logger.error('Error al actualizar configuración KDS', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Error al actualizar configuración KDS' 
        });
    }
});

/**
 * GET /api/cocineros/:id/perfil-ver-cocina
 * Obtener el perfil de personalización de Ver Cocina de un cocinero.
 * Flujo "Distribuir Cocina en monitores" (perfil=auto).
 */
router.get('/cocineros/:id/perfil-ver-cocina', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const esPropio = req.admin.id === id;
        const tienePermisoGestion = req.admin.permisos?.includes('ver-mozos');
        if (!esPropio && !tienePermisoGestion) {
            return res.status(403).json({ success: false, error: 'No tiene permisos para ver este perfil' });
        }
        const perfil = await cocinerosRepository.obtenerPerfilVerCocina(id);
        res.json({ success: true, data: perfil || {} });
    } catch (error) {
        logger.error('Error al obtener perfil-ver-cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener perfil de personalización' });
    }
});

/**
 * PUT /api/cocineros/:id/perfil-ver-cocina
 * Guardar el perfil de personalización de Ver Cocina de un cocinero.
 * Body: { config: { ...localDesign } }
 */
const PERFIL_VER_COCINA_KEYS = new Set([
    'tamanioFuentePlato', 'tamanioFuenteDetalle', 'tamanioFuenteCronometro', 'tamanioFuenteCocinero',
    'tiempoAmarillo', 'tiempoRojo', 'modoNocturno', 'modoAgrupacion', 'mostrarMesas', 'modoTimers',
    'maxTimersVisibles', 'mostrarCabeceraCocinero', 'colorPorCocinero', 'mostrarCocineroTomado',
    'umbralCargaAlta', 'umbralSobrecarga', 'estiloTemporizador', 'intensidadAlerta',
    'mostrarEtiquetaPlato', 'mostrarIconoCocinero', 'fuenteFamilia', 'fuenteFamiliaCustom',
    'colorFondo', 'colorTextoPrincipal', 'colorTextoSecundario', 'colorAcento', 'colorAlertaAmarilla',
    'colorAlertaRoja', 'colorFilaPlato', 'espaciadoFilas', 'pesoFuentePlato', 'layoutColumnas',
    'disposicionTarjeta', 'animacionesTarjetas',
    'icono', 'mostrarNotificacionEntrada', 'textoNotificacionEntrada', 'duracionNotificacionEntrada',
    'mostrarComplementos',
    'layoutColumnasGuarniciones', 'diferenciarDisenoGuarniciones',
    'numeroSecForma', 'numeroSecColor', 'numeroSecContorno', 'numeroSecFondo', 'numeroSecPeso',
    'numeroSecGlow', 'numeroSecTamanio', 'numeroSecPrefijo',
    'cantidadColor', 'cantidadContorno', 'cantidadFondo', 'cantidadTamanio',
    'cantidadGrosorContorno', 'cantidadRadio',
    'cronometroColor', 'cronometroContorno', 'cronometroFondo',
    'cronometroContornoLetra', 'cronometroFondoTexto',
    'cronometroForma', 'cronometroAncho', 'cronometroAlto', 'cronometroRadio',
    'numeroSecAncho', 'numeroSecAlto',
    'tarjetaRadio', 'tarjetaPadding', 'tarjetaGap',
    'colorDegradadoTarjeta', 'degradadoTarjeta', 'colorFondoTarjeta',
    'quitarNombreCocineroTarjeta', 'ocultarAtencionUrgente', 'animacionesAlerta',
    'animacionAtencion', 'animacionUrgente', 'colorAnimacionAtencion', 'colorAnimacionUrgente',
    'emojisAnimacionAtencion', 'tamanioEmojiAtencion', 'cantidadEmojiAtencion',
    'emojisAnimacionUrgente', 'tamanioEmojiUrgente', 'cantidadEmojiUrgente',
    'autoAgrandamiento', 'autoAcomodamiento', 'aprovecharEspacio',
    'tamanioCronometroCabecera',
]);

router.put('/cocineros/:id/perfil-ver-cocina', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const esPropio = req.admin.id === id;
        const tienePermisoGestion = req.admin.permisos?.includes('editar-mozos');
        if (!esPropio && !tienePermisoGestion) {
            return res.status(403).json({ success: false, error: 'No tiene permisos para modificar este perfil' });
        }
        const configEntrada = req.body && typeof req.body.config === 'object' ? req.body.config : req.body;
        if (!configEntrada || typeof configEntrada !== 'object') {
            return res.status(400).json({ success: false, error: 'config es requerido (objeto)' });
        }
        // Whitelist: solo claves visuales permitidas
        const sanitizado = {};
        for (const [k, v] of Object.entries(configEntrada)) {
            if (PERFIL_VER_COCINA_KEYS.has(k)) sanitizado[k] = v;
        }
        const guardado = await cocinerosRepository.guardarPerfilVerCocina(id, sanitizado, req.admin.id);
        res.json({ success: true, message: 'Perfil guardado correctamente', data: guardado });
    } catch (error) {
        logger.error('Error al guardar perfil-ver-cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al guardar perfil' });
    }
});

// ============================================================
// PERFILES DE PERSONALIZACIÓN "VER COCINA" CON NOMBRE
// Flujo "Distribuir Cocina en monitores" - perfilId=<id>
// ============================================================

/**
 * GET /api/perfiles-ver-cocina
 * Listar perfiles de personalización con nombre (activos).
 */
router.get('/perfiles-ver-cocina', adminAuth, async (req, res) => {
    try {
        const soloActivos = req.query.incluirInactivos !== '1';
        const perfiles = await cocinerosRepository.listarPerfilesVerCocina({ soloActivos });
        const data = perfiles.map(p => ({
            _id: p._id,
            nombre: p.nombre,
            config: p.config,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
        }));
        res.json({ success: true, data, total: data.length });
    } catch (error) {
        logger.error('Error al listar perfiles-ver-cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al listar perfiles' });
    }
});

/**
 * GET /api/perfiles-ver-cocina/:id
 * Obtener un perfil concreto (lo usan las ventanas hijas con ?perfilId=<id>).
 */
router.get('/perfiles-ver-cocina/:id', adminAuth, async (req, res) => {
    try {
        const perfil = await cocinerosRepository.obtenerPerfilVerCocinaPorId(req.params.id);
        if (!perfil) {
            return res.status(404).json({ success: false, error: 'Perfil no encontrado' });
        }
        res.json({ success: true, data: perfil });
    } catch (error) {
        logger.error('Error al obtener perfil-ver-cocina por id', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener perfil' });
    }
});

/**
 * POST /api/perfiles-ver-cocina
 * Crear un perfil con nombre.
 * Body: { nombre: string, config: { ...localDesign } }
 */
router.post('/perfiles-ver-cocina', adminAuth, async (req, res) => {
    try {
        const nombre = (req.body?.nombre || '').toString().trim();
        if (!nombre) {
            return res.status(400).json({ success: false, error: 'nombre es requerido' });
        }
        const configEntrada = req.body?.config && typeof req.body.config === 'object'
            ? req.body.config
            : (req.body && typeof req.body === 'object' ? req.body : {});
        const sanitizado = {};
        for (const [k, v] of Object.entries(configEntrada)) {
            if (PERFIL_VER_COCINA_KEYS.has(k)) sanitizado[k] = v;
        }
        const creado = await cocinerosRepository.crearPerfilVerCocina({
            nombre,
            config: sanitizado,
            creadoPor: req.admin.id,
        });
        res.status(201).json({ success: true, data: creado, message: 'Perfil creado correctamente' });
    } catch (error) {
        const status = error.code === 'DUPLICADO' ? 409 : 400;
        res.status(status).json({ success: false, error: error.message || 'Error al crear perfil' });
    }
});

/**
 * PUT /api/perfiles-ver-cocina/:id
 * Actualizar nombre y/o config de un perfil existente.
 * Body: { nombre?, config? }
 */
router.put('/perfiles-ver-cocina/:id', adminAuth, async (req, res) => {
    try {
        const update = {};
        if (req.body?.nombre !== undefined) {
            update.nombre = (req.body.nombre).toString().trim();
            if (!update.nombre) {
                return res.status(400).json({ success: false, error: 'nombre no puede ser vacío' });
            }
        }
        if (req.body?.config !== undefined && typeof req.body.config === 'object') {
            const sanitizado = {};
            for (const [k, v] of Object.entries(req.body.config)) {
                if (PERFIL_VER_COCINA_KEYS.has(k)) sanitizado[k] = v;
            }
            update.config = sanitizado;
        }
        const actualizado = await cocinerosRepository.actualizarPerfilVerCocina(
            req.params.id,
            { ...update, actualizadoPor: req.admin.id }
        );
        res.json({ success: true, data: actualizado, message: 'Perfil actualizado correctamente' });
    } catch (error) {
        const status = error.code === 'NO_ENCONTRADO' ? 404
            : error.code === 'DUPLICADO' ? 409
            : 400;
        res.status(status).json({ success: false, error: error.message || 'Error al actualizar perfil' });
    }
});

/**
 * DELETE /api/perfiles-ver-cocina/:id
 * Borrado lógico (activo=false).
 */
router.delete('/perfiles-ver-cocina/:id', adminAuth, async (req, res) => {
    try {
        await cocinerosRepository.eliminarPerfilVerCocina(req.params.id);
        res.json({ success: true, message: 'Perfil eliminado correctamente' });
    } catch (error) {
        const status = error.code === 'NO_ENCONTRADO' ? 404 : 400;
        res.status(status).json({ success: false, error: error.message || 'Error al eliminar perfil' });
    }
});

/**
 * POST /api/cocineros/:id/asignar-rol
 * Asignar rol de cocinero a un usuario existente
 * Requiere permiso: gestionar-roles
 */
router.post('/cocineros/:id/asignar-rol', adminAuth, checkPermission('gestionar-roles'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const resultado = await cocinerosRepository.asignarRolCocinero(id, req.admin.id);
        
        logger.info('Rol de cocinero asignado', {
            usuarioId: id,
            asignadoPor: req.admin.id,
            yaEraCocinero: resultado.yaEraCocinero
        });
        
        res.json({
            success: true,
            message: resultado.yaEraCocinero 
                ? 'El usuario ya tiene rol de cocinero' 
                : 'Rol de cocinero asignado correctamente',
            data: resultado.usuario
        });
    } catch (error) {
        logger.error('Error al asignar rol de cocinero', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Error al asignar rol de cocinero' 
        });
    }
});

/**
 * POST /api/cocineros/:id/quitar-rol
 * Quitar rol de cocinero a un usuario
 * Requiere permiso: gestionar-roles
 */
router.post('/cocineros/:id/quitar-rol', adminAuth, checkPermission('gestionar-roles'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nuevoRol = 'mozos' } = req.body;
        
        const resultado = await cocinerosRepository.quitarRolCocinero(id, nuevoRol, req.admin.id);
        
        logger.info('Rol de cocinero quitado', {
            usuarioId: id,
            quitadoPor: req.admin.id,
            nuevoRol
        });
        
        res.json({
            success: true,
            message: 'Rol de cocinero removido correctamente',
            data: resultado.usuario
        });
    } catch (error) {
        logger.error('Error al quitar rol de cocinero', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Error al quitar rol de cocinero' 
        });
    }
});

// ========== MÉTRICAS DE RENDIMIENTO ==========

/**
 * GET /api/cocineros/:id/metricas
 * Obtener métricas de rendimiento de un cocinero
 */
router.get('/cocineros/:id/metricas', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { desde, hasta } = req.query;
        
        // Validar permisos
        const esPropio = req.admin.id === id;
        const tienePermisoReportes = req.admin.permisos?.includes('ver-reportes');
        
        if (!esPropio && !tienePermisoReportes) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para ver estas métricas' 
            });
        }
        
        // Fechas por defecto: hoy
        const fechaInicio = desde 
            ? moment(desde).startOf('day').toDate()
            : moment().startOf('day').toDate();
        const fechaFin = hasta 
            ? moment(hasta).endOf('day').toDate()
            : moment().endOf('day').toDate();
        
        const [metricas, platosTop] = await Promise.all([
            cocinerosRepository.calcularMetricasRendimiento(id, fechaInicio, fechaFin),
            cocinerosRepository.obtenerPlatosTopPorCocinero(id, fechaInicio, fechaFin, 10)
        ]);
        
        res.json({
            success: true,
            data: {
                periodo: {
                    desde: fechaInicio,
                    hasta: fechaFin
                },
                metricas,
                platosTop
            }
        });
    } catch (error) {
        logger.error('Error al obtener métricas de cocinero', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener métricas de rendimiento' 
        });
    }
});

/**
 * GET /api/cocineros/metricas/todos
 * Obtener métricas de todos los cocineros (ranking)
 * Requiere permiso: ver-reportes
 */
router.get('/cocineros/metricas/todos', adminAuth, checkPermission('ver-reportes'), async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        
        // Fechas por defecto: hoy
        const fechaInicio = desde 
            ? moment(desde).startOf('day').toDate()
            : moment().startOf('day').toDate();
        const fechaFin = hasta 
            ? moment(hasta).endOf('day').toDate()
            : moment().endOf('day').toDate();
        
        const metricas = await cocinerosRepository.obtenerMetricasTodosCocineros(
            fechaInicio, 
            fechaFin
        );
        
        res.json({
            success: true,
            data: {
                periodo: {
                    desde: fechaInicio,
                    hasta: fechaFin
                },
                ranking: metricas
            }
        });
    } catch (error) {
        logger.error('Error al obtener métricas de todos los cocineros', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener métricas de cocineros' 
        });
    }
});

/**
 * GET /api/cocineros/rendimiento/en-vivo
 * Snapshot de platos en curso por cocinero (rendimiento en tiempo real).
 * Requiere permiso: ver-reportes o ver-cocina-completo
 */
router.get('/cocineros/rendimiento/en-vivo', adminAuth, async (req, res) => {
    try {
        const tieneReportes = req.admin?.permisos?.includes('ver-reportes') || req.admin?.rol === 'admin' || req.admin?.rol === 'supervisor';
        const tieneCocina = req.admin?.permisos?.includes('ver-cocina-completo');
        if (!tieneReportes && !tieneCocina) {
            return res.status(403).json({ success: false, error: 'No tiene permisos para ver el rendimiento en vivo' });
        }

        // Si es cocinero (no reportes), limitar a su propio id
        let usuarioId = null;
        if (!tieneReportes && req.admin?.id) {
            usuarioId = req.admin.id;
        }
        // Query opcional ?cocineroId= para filtrar (solo si tiene reportes)
        if (req.query.cocineroId && tieneReportes) {
            usuarioId = req.query.cocineroId;
        }

        const cocineros = await cocinerosRepository.obtenerRendimientoEnVivo(usuarioId);

        res.json({
            success: true,
            actualizadoEn: new Date().toISOString(),
            data: { cocineros }
        });
    } catch (error) {
        logger.error('Error al obtener rendimiento en vivo', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener rendimiento en vivo' });
    }
});

/**
 * GET /api/cocineros/rendimiento/resumen-turno
 * KPIs agregados del turno (hoy por defecto).
 * Requiere permiso: ver-reportes o ver-cocina-completo
 */
router.get('/cocineros/rendimiento/resumen-turno', adminAuth, async (req, res) => {
    try {
        const tieneReportes = req.admin?.permisos?.includes('ver-reportes') || req.admin?.rol === 'admin' || req.admin?.rol === 'supervisor';
        const tieneCocina = req.admin?.permisos?.includes('ver-cocina-completo');
        if (!tieneReportes && !tieneCocina) {
            return res.status(403).json({ success: false, error: 'No tiene permisos para ver el resumen del turno' });
        }

        const { desde, hasta } = req.query;
        const fechaInicio = desde
            ? moment(desde).startOf('day').toDate()
            : moment().startOf('day').toDate();
        const fechaFin = hasta
            ? moment(hasta).endOf('day').toDate()
            : moment().endOf('day').toDate();

        const resumen = await cocinerosRepository.obtenerResumenTurno(fechaInicio, fechaFin);

        res.json({
            success: true,
            data: resumen
        });
    } catch (error) {
        logger.error('Error al obtener resumen del turno', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener resumen del turno' });
    }
});

/**
 * GET /api/cocineros/rendimiento/historial
 * Registro de platos cocinados agrupado por comanda (misma lógica que mozos).
 * Solo platos tomados por cocineros; incluye comandas cerradas (persistente).
 * Query params:
 *   - cocineroId: filtrar por un cocinero específico (requiere ver-reportes si no es el propio)
 *   - desde, hasta: rango de fechas (default: hoy)
 *   - limite: máximo de comandas (default 200, máx 1000)
 * Requiere permiso: ver-reportes o ver-cocina-completo
 */
router.get('/cocineros/rendimiento/historial', adminAuth, async (req, res) => {
    try {
        const tieneReportes = req.admin?.permisos?.includes('ver-reportes') || req.admin?.rol === 'admin' || req.admin?.rol === 'supervisor';
        const tieneCocina = req.admin?.permisos?.includes('ver-cocina-completo');
        if (!tieneReportes && !tieneCocina) {
            return res.status(403).json({ success: false, error: 'No tiene permisos para ver el historial de platos cocinados' });
        }

        const { desde, hasta } = req.query;
        const fechaInicio = desde
            ? moment(desde).startOf('day').toDate()
            : moment().startOf('day').toDate();
        const fechaFin = hasta
            ? moment(hasta).endOf('day').toDate()
            : moment().endOf('day').toDate();

        let usuarioId = null;
        // Si no es admin/supervisor con reportes, limitar a sus propios platos
        if (!tieneReportes && req.admin?.id) {
            usuarioId = req.admin.id;
        }
        // Query opcional ?cocineroId= para filtrar (solo si tiene reportes)
        if (req.query.cocineroId && tieneReportes) {
            usuarioId = req.query.cocineroId;
        }

        const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 200, 1), 1000);

        const resultado = await cocinerosRepository.obtenerHistorialPlatosCocinados({
            usuarioId,
            fechaInicio,
            fechaFin,
            limite
        });

        res.json({
            success: true,
            data: {
                periodo: { desde: fechaInicio, hasta: fechaFin },
                ...resultado
            }
        });
    } catch (error) {
        logger.error('Error al obtener historial de platos cocinados', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener historial de platos cocinados' });
    }
});

/**
 * POST /api/cocineros/:id/conexion
 * Registrar conexión de un cocinero (uso interno)
 */
router.post('/cocineros/:id/conexion', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Solo el propio usuario puede registrar su conexión
        if (req.admin.id !== id) {
            return res.status(403).json({ 
                success: false, 
                error: 'No autorizado' 
            });
        }
        
        await cocinerosRepository.registrarConexion(id);
        
        res.json({
            success: true,
            message: 'Conexión registrada'
        });
    } catch (error) {
        logger.error('Error al registrar conexión', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al registrar conexión' 
        });
    }
});

/**
 * GET /api/cocineros/:id/zonas
 * Obtener zonas asignadas a un cocinero
 */
router.get('/cocineros/:id/zonas', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const Mozos = require('../database/models/mozos.model');
        const Zona = require('../database/models/zona.model');
        
        const cocinero = await Mozos.findById(id).select('zonaIds').lean();
        
        if (!cocinero) {
            return res.status(404).json({
                success: false,
                error: 'Cocinero no encontrado'
            });
        }
        
        // Obtener detalles de las zonas
        const zonas = await Zona.find({
            _id: { $in: cocinero.zonaIds || [] }
        }).select('nombre descripcion color icono').lean();
        
        res.json({
            success: true,
            data: zonas
        });
    } catch (error) {
        logger.error('Error al obtener zonas del cocinero', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Error al obtener zonas asignadas'
        });
    }
});

/**
 * PUT /api/cocineros/:id/zonas
 * Asignar zonas a un cocinero
 */
router.put('/cocineros/:id/zonas', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { id } = req.params;
        const { zonaIds } = req.body;
        
        const Mozos = require('../database/models/mozos.model');
        
        const cocinero = await Mozos.findByIdAndUpdate(
            id,
            { zonaIds: zonaIds || [] },
            { new: true }
        ).select('_id name zonaIds');
        
        if (!cocinero) {
            return res.status(404).json({
                success: false,
                error: 'Cocinero no encontrado'
            });
        }
        
        logger.info('Zonas asignadas a cocinero', {
            cocineroId: id,
            zonaIds,
            actualizadoPor: req.admin.id
        });
        
        // TEMA 1: Emitir evento Socket.io para actualizar el KDS del cocinero en tiempo real
        // Esto permite que el cocinero vea los cambios de zonas sin recargar
        if (global.emitConfigCocineroActualizada) {
            global.emitConfigCocineroActualizada(id, { 
                zonasAsignadas: zonaIds,
                tipoCambio: 'zonas'
            });
        }
        
        res.json({
            success: true,
            message: 'Zonas asignadas correctamente',
            data: cocinero
        });
    } catch (error) {
        logger.error('Error al asignar zonas al cocinero', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Error al asignar zonas'
        });
    }
});

module.exports = router;
