/**
 * ASIGNACION AUTOMATICA DE PLATOS - SERVICE (v2: Perfiles + Calendario)
 *
 * Motor de selección de cocinero para platos nuevos que llegan al KDS.
 * Reutiliza el campo `procesandoPor` de comanda.platos (mismo registro que "Tomar").
 *
 * MODELO MENTAL (resumen):
 * - La config ahora tiene perfiles con nombre + un calendario semanal (plantilla
 *   Lun–Dom con franjas horaInicio/horaFin en America/Lima).
 * - En runtime, resolverPerfilActivo(config, momento) determina QUÉ perfil
 *   está activo AHORA (día + hora Lima, con franjas que cruzan medianoche).
 *   Si hay calendario y ninguna franja cubre ahora → no asigna (sin_franja_activa).
 * - Una vez resuelto el perfil, se usan sus reglasPorPlato/reglasPorCategoria
 *   (en vez de las legacy raíz) con el mismo algoritmo de selección de antes.
 *
 * Reglas de selección (orden, dentro del perfil activo):
 *   1. Si la config no está habilitada → no asigna (deja para Tomar manual).
 *   2. resolverPerfilActivo → si null, no asigna (sin_franja_activa).
 *   3. Busca regla por platoId; si no, regla por categoría.
 *   4. Construye lista de candidatos: primario + backups ordenados.
 *   5. Filtra: activo, conectado (si soloCocinerosConectados), respeta zona (si respetarZonas),
 *      no pausado (autoAsignacion.acepta && pausadoHasta < ahora), bajo límites.
 *   6. Overflow: si el primario ya tiene >= maxMismoPlato (regla o default 20) del mismo
 *      platoId en curso, el siguiente pasa al primer backup válido. Igual para totalEnCurso.
 *   7. Si no hay candidato → modoSinCandidato (default: dejar_sin_asignar).
 *
 * Contadores en tiempo real: agregación sobre el index idx_platos_en_curso_cocinero.
 * Concurrencia: reintento sobre selección si el write condicional falla por capacidad.
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const redisCache = require('../utils/redisCache');
const {
    elegirBloqueActivo,
    compararHHmm,
    horaEnRango
} = require('../utils/asignacionCalendarioFranjas');

const AsignacionAutomatica = require('../database/models/asignacionAutomatica.model');
const ConfigCocinero = require('../database/models/configCocinero.model');
const Zona = require('../database/models/zona.model');

const Comanda = mongoose.model('Comanda') || require('../database/models/comanda.model');
const Mozos = mongoose.model('mozos') || require('../database/models/mozos.model');
const { getCocineroInfo } = require('../utils/cocineroInfo');
const { topePositivo, bumpCargaCache, encolarAsignacionKds } = require('../utils/asignacionAutomaticaCupos');

const ESTADOS_EN_CURSO = ['pedido', 'en_espera'];
const MAX_REINTENTOS = 3;

// Timezone del backend (consistente con el resto del sistema).
const TZ = 'America/Lima';

/**
 * Devuelve el momento actual en Lima como objeto moment.
 */
function nowLima() {
    return moment().tz(TZ);
}

function inicioDiaLima(momento) {
    return (momento || nowLima()).clone().startOf('day').toDate();
}

/**
 * RESOLVER PERFIL ACTIVO (pura, sin IO).
 *
 * Dada la config y un momento (moment tz Lima), determina qué perfil está activo.
 * Franjas con horaFin < horaInicio cruzan medianoche; diasSemana = días de INICIO.
 * Ver docs/PLAN_FRANJAS_DIA_NOCHE_ASIGNACION.md.
 *
 * Prioridad si solapan: menos días → horaInicio más tarde → createdAt más reciente.
 * Día: moment.day() => 0=Dom … 6=Sáb.
 */
function perfilPorId(config, perfilId) {
    const id = perfilId != null ? String(perfilId) : '';
    return (config.perfiles || []).find(p => p && String(p.id) === id && p.activo !== false) || null;
}

function perfilTieneReglasAsignacion(perfil) {
    if (!perfil) return false;
    return (perfil.reglasPorPlato || []).some(isReglaAsignada)
        || (perfil.reglasPorCategoria || []).some(isReglaAsignada);
}

function elegirPerfilConReglas(activos) {
    if (!Array.isArray(activos) || activos.length === 0) return null;
    return activos.find(perfilTieneReglasAsignacion) || activos[0];
}

function resolverPerfilActivo(config, momento) {
    if (!config || !config.habilitada) {
        return { perfil: null, bloque: null, motivo: 'deshabilitada' };
    }
    const bloques = (config.calendario && Array.isArray(config.calendario.bloques)) ? config.calendario.bloques : [];
    const activos = (config.perfiles || []).filter(p => p && p.activo !== false);
    if (bloques.length === 0) {
        const perfil = elegirPerfilConReglas(activos);
        if (perfil) return { perfil, bloque: null, motivo: 'ok' };
        return { perfil: null, bloque: null, motivo: 'sin_franja_activa' };
    }
    const m = momento || nowLima();
    const dia = m.day();
    const hhmm = m.format('HH:mm');

    const bloqueSeleccionado = elegirBloqueActivo(bloques, dia, hhmm);
    if (!bloqueSeleccionado) {
        return { perfil: null, bloque: null, motivo: 'sin_franja_activa', dia, hhmm };
    }
    const perfil = perfilPorId(config, bloqueSeleccionado.perfilId);
    if (!perfil) {
        const fallback = elegirPerfilConReglas(activos);
        if (fallback) return { perfil: fallback, bloque: bloqueSeleccionado, motivo: 'perfil_inactivo_usa_otro', dia, hhmm };
        return { perfil: null, bloque: bloqueSeleccionado, motivo: 'perfil_inactivo_o_inexistente', dia, hhmm };
    }
    if (!perfilTieneReglasAsignacion(perfil)) {
        const conReglas = elegirPerfilConReglas(activos);
        if (conReglas && String(conReglas.id) !== String(perfil.id) && perfilTieneReglasAsignacion(conReglas)) {
            return { perfil: conReglas, bloque: bloqueSeleccionado, motivo: 'perfil_sin_reglas_usa_otro', dia, hhmm };
        }
    }
    return { perfil, bloque: bloqueSeleccionado, motivo: 'ok', dia, hhmm };
}

/**
 * Cuenta platos en curso para un cocinero, total y por platoId.
 * Usa el index idx_platos_en_curso_cocinero.
 */
async function contarPlatosEnCurso(cocineroId, platoId = null) {
    const cocineroObjectId = new mongoose.Types.ObjectId(cocineroId);
    const matchBase = {
        IsActive: true,
        createdAt: { $gte: inicioDiaLima() },
        'platos.procesandoPor.cocineroId': cocineroObjectId,
        'platos.estado': { $in: ESTADOS_EN_CURSO }
    };
    const pipeline = [
        { $match: matchBase },
        { $unwind: '$platos' },
        {
            $match: {
                'platos.procesandoPor.cocineroId': cocineroObjectId,
                'platos.estado': { $in: ESTADOS_EN_CURSO },
                'platos.eliminado': { $ne: true }
            }
        }
    ];
    if (platoId != null) {
        pipeline.push({ $match: { 'platos.platoId': Number(platoId) } });
    }
    pipeline.push({ $group: { _id: null, total: { $sum: 1 } } });
    const res = await Comanda.aggregate(pipeline);
    return res.length > 0 ? res[0].total : 0;
}

/**
 * Mapa totalEnCurso para varios cocineros en una sola agregación.
 * Devuelve { [cocineroIdHex]: totalEnCurso }.
 */
async function mapaPlatosEnCursoPorCocinero(cocineroIds) {
    if (!cocineroIds.length) return {};
    const objectIds = cocineroIds.map(id => new mongoose.Types.ObjectId(id));
    const res = await Comanda.aggregate([
        { $match: { IsActive: true, createdAt: { $gte: inicioDiaLima() }, 'platos.procesandoPor.cocineroId': { $in: objectIds }, 'platos.estado': { $in: ESTADOS_EN_CURSO } } },
        { $unwind: '$platos' },
        { $match: { 'platos.procesandoPor.cocineroId': { $in: objectIds }, 'platos.estado': { $in: ESTADOS_EN_CURSO }, 'platos.eliminado': { $ne: true } } },
        { $group: { _id: '$platos.procesandoPor.cocineroId', total: { $sum: 1 } } }
    ]);
    const map = {};
    res.forEach(r => { map[r._id.toString()] = r.total; });
    return map;
}

/**
 * Verifica si un cocinero "ve" el plato según sus zonas (respetarZonas).
 * Reutiliza Zona.debeMostrarPlato.
 */
async function cocineroVePlatoEnZonas(cocineroId, plato) {
    const cocinero = await Mozos.findById(cocineroId).select('zonaIds');
    if (!cocinero || !cocinero.zonaIds || cocinero.zonaIds.length === 0) {
        // Sin zonas asignadas: se asume que ve todo (no se filtra)
        return true;
    }
    const zonas = await Zona.find({ _id: { $in: cocinero.zonaIds }, activo: { $ne: false } }).lean();
    if (zonas.length === 0) return true;
    return zonas.some(z => {
        // Reutiliza la misma lógica que el método de instancia del model
        const zonaDoc = new Zona(z);
        return zonaDoc.debeMostrarPlato(plato);
    });
}

/**
 * Verifica opt-out por cocinero (autoAsignacion en ConfigCocinero).
 */
async function cocineroAceptaAutoAsignacion(cocineroId, ahora = null) {
    const ahoraMoment = ahora || moment().tz('America/Lima').toDate();
    const cfg = await ConfigCocinero.findOne({ usuarioId: cocineroId }).select('autoAsignacion');
    if (!cfg) return { acepta: true, maxPlatosTotales: null };
    const auto = cfg.autoAsignacion || {};
    if (auto.acepta === false) return { acepta: false, maxPlatosTotales: auto.maxPlatosTotales };
    if (auto.pausadoHasta && new Date(auto.pausadoHasta) > new Date(ahoraMoment)) {
        return { acepta: false, maxPlatosTotales: auto.maxPlatosTotales };
    }
    return { acepta: true, maxPlatosTotales: auto.maxPlatosTotales };
}

/**
 * Verifica conexión del cocinero.
 * Heurística: se considera "conectado" si está activo en el sistema.
 * `enTurno` solo se usa si está explicitamente en false (cuando el KDS implemente
 * heartbeat / session tracking real). Mientras tanto, no bloqueamos por enTurno=false
 * porque no hay mecanismo que lo setee en true al ingresar al KDS.
 */
async function cocineroConectado(cocineroId) {
    const mo = await Mozos.findById(cocineroId).select('activo enTurno');
    if (!mo || mo.activo === false) return false;
    // Solo descartar si enTurno es explicitamente false Y ya hay un mecanismo
    // de sesión KDS que lo gestione. Hoy no lo hay → toleramos ambos estados.
    return true;
}

/**
 * ID numérico del catálogo (`platos.id`), no el `_id` de línea ni el Mongo del plato.
 * Misma fuente que guarniciones (`plato.plato.id` tras populate).
 */
function idCatalogoPlato(plato) {
    if (!plato || typeof plato !== 'object') return null;
    const nested = plato.plato && typeof plato.plato === 'object' && !Array.isArray(plato.plato)
        ? plato.plato
        : null;
    const candidates = [plato.platoId, plato.id, nested && nested.id, nested && nested.platoId];
    for (const c of candidates) {
        if (c == null || c === '') continue;
        if (typeof c === 'object') continue;
        const s = String(c);
        if (/^[a-fA-F0-9]{24}$/.test(s)) continue;
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

/**
 * Encuentra la regla aplicable para un plato.
 * Prioridad: reglaPorPlato > reglaPorCategoria.
 * Una regla cuenta si tiene primario O al menos un backup (igual que isReglaAsignada / UI).
 *
 * En v2, `configOrPerfil` puede ser:
 *   - un PERFIL (tiene sus propias reglasPorPlato/reglasPorCategoria) → usa esas.
 *   - el documento raíz legacy (sin perfiles) → usa reglasPorPlato/reglasPorCategoria raíz
 *     (compatibilidad para rollback / tests viejos).
 */
function encontrarRegla(configOrPerfil, plato) {
    const platoId = idCatalogoPlato(plato);
    const reglasPlato = configOrPerfil.reglasPorPlato || [];
    const reglasCat = configOrPerfil.reglasPorCategoria || [];

    const reglaPlato = platoId != null
        ? reglasPlato.find(r => Number(r.platoId) === platoId && r.activo !== false)
        : null;
    if (isReglaAsignada(reglaPlato)) return { tipo: 'plato', regla: reglaPlato };

    const categoria = plato.categoria || (plato.plato && plato.plato.categoria);
    if (categoria) {
        const reglaCat = reglasCat.find(r => r.categoria === categoria && r.activo !== false);
        if (isReglaAsignada(reglaCat)) return { tipo: 'categoria', regla: reglaCat };
    }
    return null;
}

/**
 * Construye la lista ordenada de candidatos desde una regla.
 * Retorna [{ cocineroId, esPrimario: bool, orden: number }].
 */
function construirCandidatos(regla) {
    const candidatos = [];
    if (regla.cocineroPrimarioId) {
        candidatos.push({ cocineroId: regla.cocineroPrimarioId.toString(), esPrimario: true, orden: 0 });
    }
    const backups = (regla.backups || [])
        .slice()
        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
        .map(b => ({ cocineroId: b.cocineroId.toString(), esPrimario: false, orden: b.orden || 1 }));
    return candidatos.concat(backups);
}

/**
 * Filtra un candidato según config y estado del cocinero.
 */
async function filtrarCandidato(cand, config, plato, platoId, cacheConectado, cacheCargaTot, maxMismoOverride) {
    const defaults = (config && config.defaults) || {};
    const { soloCocinerosConectados, respetarZonas, maxMismoPlatoPorCocinero, maxPlatosTotalesEnCurso } = defaults;

    // Opt-out
    const opt = await cocineroAceptaAutoAsignacion(cand.cocineroId);
    if (!opt.acepta) return null;

    // Conectado
    if (soloCocinerosConectados) {
        let conectado = cacheConectado[cand.cocineroId];
        if (conectado === undefined) {
            conectado = await cocineroConectado(cand.cocineroId);
            cacheConectado[cand.cocineroId] = conectado;
        }
        if (!conectado) return null;
    }

    // Zonas
    if (respetarZonas) {
        const ve = await cocineroVePlatoEnZonas(cand.cocineroId, plato);
        if (!ve) return null;
    }

    // Límite total en curso
    const maxTotal = opt.maxPlatosTotales || maxPlatosTotalesEnCurso;
    let total = cacheCargaTot[cand.cocineroId];
    if (total === undefined) {
        total = await contarPlatosEnCurso(cand.cocineroId);
        cacheCargaTot[cand.cocineroId] = total;
    }
    if (Number.isFinite(maxTotal) && total >= maxTotal) {
        logger.info('Auto-asignación: cocinero en tope de carga (día)', {
            cocineroId: cand.cocineroId, total, maxTotal
        });
        return null;
    }

    // Límite mismo plato (regla por plato/categoría si existe; si no, default global)
    const maxMismo = topePositivo(maxMismoOverride, maxMismoPlatoPorCocinero);
    const mismoPlatoCount = await contarPlatosEnCurso(cand.cocineroId, platoId);
    if (maxMismo != null && mismoPlatoCount >= maxMismo) {
        // Overflow: candidato saturado del mismo plato → no es válido como primario
        return null;
    }

    return { ...cand, cargaTotal: total, mismoPlatoCount };
}

/**
 * Selecciona el cocinero destino para un plato dado.
 * Retorna { cocineroId, origen, regla, estrategia, perfilId } o null si no hay candidato.
 *
 * En v2:
 *   - `perfil` (opcional): perfil activo resuelto por resolverPerfilActivo. Si se pasa,
 *     se usan sus reglasPorPlato/reglasPorCategoria. Si NO se pasa, se usa `config`
 *     (compatibilidad con el flujo legacy y con tests viejos).
 *   - `config.defaults` sigue siendo la fuente de defaults globales (max, estrategiaDefault, etc.).
 */
async function seleccionarCocinero(config, plato, perfil = null, caches = null) {
    const fuenteReglas = perfil || config;
    const match = encontrarRegla(fuenteReglas, plato);
    if (!match) {
        // Sin regla: modoSinCandidato decide (en este punto no asignamos)
        return null;
    }
    const { tipo, regla } = match;
    const candidatos = construirCandidatos(regla);
    if (candidatos.length === 0) return null;

    const estrategia = regla.estrategia || (config.defaults || {}).estrategiaDefault || 'hibrido';
    const cacheConectado = caches?.cacheConectado || {};
    const cacheCargaTot = caches?.cacheCargaTot || {};
    const platoIdRegla = regla.platoId || idCatalogoPlato(plato);

    const evaluar = async (cfg) => {
        const validos = [];
        for (const cand of candidatos) {
            const v = await filtrarCandidato(cand, cfg, plato, platoIdRegla, cacheConectado, cacheCargaTot, regla.maxMismoPlato);
            if (v) validos.push(v);
        }
        return validos;
    };

    let candidatosValidos = await evaluar(config);
    // Zona es filtro de pantalla KDS; si el cocinero está en la regla y la zona no
    // coincide (tipo vs tipos, id), igual se asigna — igual intención que "ya tiene cocinero".
    if (candidatosValidos.length === 0 && (config.defaults || {}).respetarZonas) {
        candidatosValidos = await evaluar({
            ...config,
            defaults: { ...(config.defaults || {}), respetarZonas: false }
        });
        if (candidatosValidos.length > 0) {
            logger.info('Auto-asignación: zona no coincidió, se asigna por regla', {
                platoId: idCatalogoPlato(plato),
                cocineroId: candidatosValidos[0].cocineroId
            });
        }
    }

    if (candidatosValidos.length === 0) {
        return null; // modoSinCandidato
    }

    // Primario primero (salvo estrategias puras de balanceo)
    if (estrategia === 'menor_carga' || estrategia === 'round_robin') {
        candidatosValidos.sort((a, b) => (a.cargaTotal - b.cargaTotal) || (a.orden - b.orden));
    } else {
        // fijo_por_plato, fijo_por_categoria, cadena_overflow, hibrido, respetar_zona
        candidatosValidos.sort((a, b) => (a.orden - b.orden) || (a.cargaTotal - b.cargaTotal));
    }
    const elegido = candidatosValidos[0];
    const esOverflow = !elegido.esPrimario;
    return {
        cocineroId: elegido.cocineroId,
        origen: esOverflow ? 'overflow' : 'auto',
        regla: tipo,
        estrategia,
        perfilId: perfil ? perfil.id : null
    };
}

/**
 * Asigna un plato a un cocinero usando updateOne posicional (mismo patrón que procesamientoController.tomarPlato).
 * Marca procesandoPor, asignacionMeta, y sube estado 'pedido' → 'en_espera'.
 * Retorna true si la asignación fue escrita, false si no (cambio de estado/concurrencia).
 */
async function asignarPlatoInterno(comandaId, plato, cocineroId, metaOrigen, metaRegla) {
    const comanda = await Comanda.findById(comandaId);
    if (!comanda) return false;

    // Buscar índice del plato (mismo patrón que procesamientoController.findPlatoIndex)
    let platoIndex = -1;
    const platoKey = String(plato._id || plato.platoId || plato.id);
    for (let i = 0; i < comanda.platos.length; i++) {
        const p = comanda.platos[i];
        if (p._id && p._id.toString() === platoKey) { platoIndex = i; break; }
        if (String(p.platoId) === platoKey) { platoIndex = i; break; }
    }
    if (platoIndex === -1) return false;

    const platoActual = comanda.platos[platoIndex];
    // Solo auto-asignar si NO tiene ya un procesandoPor y está en estado asignable
    if (platoActual.procesandoPor && platoActual.procesandoPor.cocineroId) return false;
    if (!['pedido', 'en_espera'].includes(platoActual.estado)) return false;

    // Info cocinero (mismo helper que procesamientoController.getCocineroInfo)
    const info = await getCocineroInfo(cocineroId);
    if (!info.cocineroId) return false;
    const cocineroInfo = {
        ...info,
        timestamp: moment().tz('America/Lima').toDate()
    };

    const ahora = moment().tz('America/Lima').toDate();
    const setObj = {
        [`platos.${platoIndex}.procesandoPor`]: cocineroInfo,
        [`platos.${platoIndex}.asignacionMeta`]: {
            origen: metaOrigen,
            regla: metaRegla,
            timestamp: ahora
        },
        updatedAt: ahora,
        updatedBy: cocineroId
    };
    if (platoActual.estado === 'pedido') {
        setObj[`platos.${platoIndex}.estado`] = 'en_espera';
        setObj[`platos.${platoIndex}.tiempos.en_espera`] = ahora;
    }

    // Mismo patrón que guarniciones: $set por índice. arrayFilters $[elem] no
    // modificaba el doc (modifiedCount=0) y el KDS quedaba sin cocinero en el padre.
    const result = await Comanda.updateOne(
        {
            _id: comandaId,
            [`platos.${platoIndex}.estado`]: { $in: ['pedido', 'en_espera'] },
            $or: [
                { [`platos.${platoIndex}.procesandoPor.cocineroId`]: null },
                { [`platos.${platoIndex}.procesandoPor.cocineroId`]: { $exists: false } }
            ]
        },
        { $set: setObj }
    );

    if ((result.modifiedCount || result.nModified || 0) === 0) {
        logger.warn('Auto-asignación write 0 (principal)', {
            comandaId: String(comandaId),
            platoIndex,
            platoId: platoActual.platoId,
            estado: platoActual.estado
        });
        return false;
    }

    try { await redisCache.invalidate(comandaId); } catch (_) { /* no bloquear */ }

    // Emitir sockets reutilizando globales (mismos que procesamientoController)
    try {
        if (global.emitPlatoProcesando) {
            await global.emitPlatoProcesando(
                comandaId.toString(),
                (platoActual._id || platoActual.platoId || platoKey).toString(),
                cocineroInfo
            );
        }
        if (global.emitRendimientoCocineroActualizado) {
            global.emitRendimientoCocineroActualizado({ tipo: 'plato_tomado', cocineroId: cocineroId.toString() });
        }
    } catch (e) {
        logger.warn('Socket emit falló en auto-asignación', { comandaId: comandaId.toString(), error: e.message });
    }

    return true;
}

/**
 * Asigna automáticamente los platos nuevos de una comanda recién creada.
 * Punto de disparo: comanda.repository.agregarComanda o comandaController tras crear.
 * No lanza (no bloquea creación de comanda). Reintenta por concurrencia.
 *
 * v2: resuelve el perfil activo una vez por comanda (y por reintento) y usa sus reglas.
 *
 * @param {Object} comanda - documento comanda populated (con platos[])
 */
async function asignarPlatosNuevos(comanda) {
    return encolarAsignacionKds(() => asignarPlatosNuevosEjecutar(comanda));
}

async function asignarPlatosNuevosEjecutar(comanda) {
    try {
        if (!comanda || !comanda.platos || comanda.platos.length === 0) return { asignados: 0, noAsignados: 0 };

        const configRaw = await AsignacionAutomatica.obtenerConfiguracion();
        const config = configRaw && typeof configRaw.toObject === 'function' ? configRaw.toObject() : configRaw;
        if (!config.habilitada) return { asignados: 0, noAsignados: 0, motivo: 'deshabilitada' };

        // Resolver perfil activo AHORA. Se recalcula por intento si hace falta.
        const platosAsignables = comanda.platos.filter(p =>
            ['pedido', 'en_espera'].includes(p.estado) &&
            !(p.procesandoPor && p.procesandoPor.cocineroId) &&
            !p.eliminado
        );
        if (platosAsignables.length === 0) return { asignados: 0, noAsignados: 0 };

        // Categoría/tipo: populate `platos.plato` o lookup por id de catálogo.
        const PlatoModel = mongoose.model('platos') || require('../database/models/plato.model');
        const platosCatalogo = {};
        const platoIds = [...new Set(platosAsignables.map(p => idCatalogoPlato(p)).filter(Boolean))];
        if (platoIds.length) {
            const found = await PlatoModel.find({ id: { $in: platoIds } }).lean();
            found.forEach(p => { platosCatalogo[p.id] = p; });
        }

        let asignados = 0;
        let noAsignados = 0;
        const caches = { cacheConectado: {}, cacheCargaTot: {} };
        for (const plato of platosAsignables) {
            const catalogo = (plato.plato && typeof plato.plato === 'object')
                ? plato.plato
                : null;
            const platoId = idCatalogoPlato(plato) || (catalogo ? idCatalogoPlato(catalogo) : null);
            const fromCatalogo = catalogo || (platoId != null ? platosCatalogo[platoId] : null);
            const enriched = {
                platoId,
                id: platoId,
                _id: plato._id,
                categoria: plato.categoria || (fromCatalogo && fromCatalogo.categoria),
                tipo: plato.tipo || (fromCatalogo && fromCatalogo.tipo),
                tipos: plato.tipos || (fromCatalogo && fromCatalogo.tipos),
                plato: fromCatalogo
            };

            let elegido = null;
            for (let intento = 0; intento < MAX_REINTENTOS && !elegido; intento++) {
                // Recarga config por si cambió entre platos (ej. overflow actualiza contadores).
                const configVivaRaw = await AsignacionAutomatica.obtenerConfiguracion();
                const configViva = configVivaRaw && typeof configVivaRaw.toObject === 'function' ? configVivaRaw.toObject() : configVivaRaw;
                if (!configViva.habilitada) break;

                const { perfil, bloque, motivo } = resolverPerfilActivo(configViva, nowLima());
                if (!perfil) {
                    // Sin franja activa: registrar motivo y salir (no reintentar, es estructural).
                    logger.info('Auto-asignación sin perfil activo', {
                        comandaId: comanda._id.toString(), platoId, motivo
                    });
                    break;
                }

                elegido = await seleccionarCocinero(configViva, enriched, perfil, caches);
                if (!elegido && intento === MAX_REINTENTOS - 1) {
                    const match = encontrarRegla(perfil, enriched);
                    logger.info('Auto-asignación: plato sin candidato', {
                        comandaId: comanda._id.toString(), platoId,
                        perfilId: perfil.id, bloqueId: bloque?.id,
                        sinRegla: !match,
                        modoSinCandidato: (configViva.defaults || {}).modoSinCandidato
                    });
                }
            }

            if (!elegido) {
                noAsignados++;
                continue;
            }

            const ok = await asignarPlatoInterno(comanda._id, plato, elegido.cocineroId, elegido.origen, elegido.regla);
            if (ok) {
                asignados++;
                bumpCargaCache(caches.cacheCargaTot, elegido.cocineroId);
                logger.info('Auto-asignación OK', {
                    comandaId: comanda._id.toString(), platoId,
                    cocineroId: elegido.cocineroId,
                    perfilId: elegido.perfilId,
                    origen: elegido.origen,
                    regla: elegido.regla
                });
            } else {
                noAsignados++;
            }
        }

        logger.info('Auto-asignación ejecutada', { comandaId: comanda._id.toString(), asignados, noAsignados });
        return { asignados, noAsignados };
    } catch (error) {
        logger.error('Error en auto-asignación (no bloqueante)', { comandaId: comanda?._id?.toString(), error: error.message });
        return { asignados: 0, noAsignados: 0, error: error.message };
    }
}

/**
 * Dry-run: simula a quién iría un plato SIN escribir.
 * Útil para la UI (botón Simular).
 *
 * v2: acepta opciones:
 *   - perfilId?: si se indica, simula usando ese perfil (ignora el calendario).
 *   - enMomento?: ISO string o Date; si se indica, resuelve el perfil activo en ese momento.
 *     Si no, usa "ahora Lima".
 */
async function simularAsignacion(platoId, categoria = null, tipo = null, opciones = {}) {
    const configRaw = await AsignacionAutomatica.obtenerConfiguracion();
    const config = configRaw && typeof configRaw.toObject === 'function' ? configRaw.toObject() : configRaw;
    if (!config.habilitada) {
        return { habilitada: false, cocineroId: null, mensaje: 'Asignación automática deshabilitada' };
    }

    // Resolver perfil a usar: explícito por perfilId, o por calendario en el momento dado.
    let perfilUsado = null;
    let bloqueUsado = null;
    let motivoPerfil = null;
    if (opciones.perfilId) {
        perfilUsado = perfilPorId(config, opciones.perfilId);
        if (!perfilUsado) {
            return { habilitada: true, cocineroId: null, mensaje: 'Perfil no encontrado o inactivo', perfilId: opciones.perfilId };
        }
    } else {
        const momento = opciones.enMomento ? moment(opciones.enMomento).tz(TZ) : nowLima();
        const r = resolverPerfilActivo(config, momento);
        perfilUsado = r.perfil;
        bloqueUsado = r.bloque;
        motivoPerfil = r.motivo;
        if (!perfilUsado) {
            return {
                habilitada: true,
                cocineroId: null,
                mensaje: `Sin perfil activo en este momento (${motivoPerfil})`,
                motivo: motivoPerfil,
                dia: r.dia,
                hhmm: r.hhmm
            };
        }
    }

    const plato = {
        platoId: idCatalogoPlato({ platoId }) || Number(platoId),
        categoria,
        tipo,
        plato: { id: idCatalogoPlato({ platoId }) || Number(platoId), categoria, tipo }
    };
    const elegido = await seleccionarCocinero(config, plato, perfilUsado);
    if (!elegido) {
        return {
            habilitada: true,
            cocineroId: null,
            mensaje: 'Sin candidato válido para este plato',
            modoSinCandidato: config.defaults.modoSinCandidato,
            perfilId: perfilUsado.id,
            perfilNombre: perfilUsado.nombre,
            bloqueId: bloqueUsado?.id || null
        };
    }
    const mo = await Mozos.findById(elegido.cocineroId).select('name aliasCocinero');
    return {
        habilitada: true,
        cocineroId: elegido.cocineroId,
        nombre: mo?.name || null,
        origen: elegido.origen,
        regla: elegido.regla,
        estrategia: elegido.estrategia,
        perfilId: perfilUsado.id,
        perfilNombre: perfilUsado.nombre,
        bloqueId: bloqueUsado?.id || null,
        mensaje: elegido.origen === 'overflow' ? 'Overflow: asignado a backup' : 'Asignado a primario'
    };
}

// ============================ Vista de platos asignados (Excel + modal) ============================

/**
 * Definición CANÓNICA de "regla asignada a un cocinero".
 * Una regla cuenta como asignada si:
 *   - está activa (activo !== false), Y
 *   - tiene cocineroPrimarioId, O al menos un backup con cocineroId.
 *
 * Fuente única de verdad: la usan el Excel de exportación y la vista de
 * "Platos asignados del perfil" en el modal de franja del calendario.
 * No realiza IO; acepta la regla tal cual viene del documento (toObject).
 *
 * @param {object} regla - reglaPorPlato o reglaPorCategoria.
 * @returns {boolean}
 */
function isReglaAsignada(regla) {
    if (!regla) return false;
    if (regla.activo === false) return false;
    const tienePrimario = !!regla.cocineroPrimarioId;
    const backupsValidos = Array.isArray(regla.backups) && regla.backups.some(b => b && b.cocineroId);
    return tienePrimario || backupsValidos;
}

/**
 * Construye el DTO de platos asignados para un perfil, enriquecido con
 * nombres de plato y de cocineros (primario + backups).
 *
 * @param {object} perfil - subdocumento perfil (con reglasPorPlato[]).
 * @param {Map<string, object>} platosMap - platoId(num/string) → { nombre, categoria }.
 * @param {Map<string, object>} cocinerosMap - _id(string) → { nombre, alias }.
 * @returns {Array<object>} DTO ordenado por categoría, luego nombre de plato.
 *   {
 *     platoId, nombrePlato, categoria,
 *     perfilId, perfilNombre, perfilActivo,
 *     cocineroPrimarioId, cocineroPrimarioNombre,
 *     backups: [{ cocineroId, nombre, orden }],
 *     backupsNombres: string,   // "Martha; Ana"
 *     estrategia, maxMismoPlato, notas, activo
 *   }
 */
function construirPlatosAsignadosDTO(perfil, platosMap, cocinerosMap) {
    if (!perfil) return [];
    const reglas = Array.isArray(perfil.reglasPorPlato) ? perfil.reglasPorPlato : [];
    const nombreCocinero = (id) => {
        if (!id) return null;
        const c = cocinerosMap.get(String(id));
        if (!c) return `Cocinero eliminado (${String(id).slice(-6)})`;
        return c.alias || c.nombre || `Cocinero ${String(id).slice(-4)}`;
    };

    const filas = reglas
        .filter(isReglaAsignada)
        .map(r => {
            const platoInfo = platosMap.get(String(r.platoId)) || platosMap.get(Number(r.platoId)) || {};
            const backups = (r.backups || [])
                .filter(b => b && b.cocineroId)
                .map(b => ({
                    cocineroId: String(b.cocineroId),
                    nombre: nombreCocinero(b.cocineroId),
                    orden: Number.isFinite(b.orden) ? Number(b.orden) : 0
                }))
                .sort((a, b) => a.orden - b.orden);

            return {
                platoId: r.platoId,
                nombrePlato: platoInfo.nombre || `Plato #${r.platoId}`,
                categoria: platoInfo.categoria || '',
                perfilId: perfil.id,
                perfilNombre: perfil.nombre,
                perfilActivo: perfil.activo !== false,
                cocineroPrimarioId: r.cocineroPrimarioId ? String(r.cocineroPrimarioId) : null,
                cocineroPrimarioNombre: r.cocineroPrimarioId ? nombreCocinero(r.cocineroPrimarioId) : null,
                backups,
                backupsNombres: backups.map(b => b.nombre).join('; '),
                estrategia: r.estrategia || null,
                maxMismoPlato: Number.isFinite(r.maxMismoPlato) ? Number(r.maxMismoPlato) : null,
                notas: r.notas || '',
                activo: r.activo !== false
            };
        });

    filas.sort((a, b) => {
        const ca = (a.categoria || '').toLowerCase();
        const cb = (b.categoria || '').toLowerCase();
        if (ca !== cb) return ca < cb ? -1 : 1;
        const na = (a.nombrePlato || '').toLowerCase();
        const nb = (b.nombrePlato || '').toLowerCase();
        return na < nb ? -1 : (na > nb ? 1 : 0);
    });

    return filas;
}

/**
 * Filtra los perfiles relevantes según el alcance del export.
 *  - 'calendario' (default): solo perfiles referenciados por bloques activos del calendario.
 *    Si el calendario no tiene bloques, cae a 'todos' (auditoría global).
 *  - 'todos': todos los perfiles.
 *
 * @returns {Array<object>} perfiles (referencias al array original).
 */
function filtrarPerfilesPorAlcance(config, alcance) {
    const perfiles = Array.isArray(config.perfiles) ? config.perfiles : [];
    if (alcance === 'todos') return perfiles;

    const bloques = (config.calendario && Array.isArray(config.calendario.bloques)) ? config.calendario.bloques : [];
    const idsEnCalendario = new Set(bloques.filter(b => b.activo !== false).map(b => b.perfilId));
    if (idsEnCalendario.size === 0) return perfiles; // fallback a todos
    return perfiles.filter(p => idsEnCalendario.has(p.id));
}

module.exports = {
    asignarPlatosNuevos,
    simularAsignacion,
    seleccionarCocinero,
    contarPlatosEnCurso,
    mapaPlatosEnCursoPorCocinero,
    resolverPerfilActivo,
    nowLima,
    horaEnRango,
    compararHHmm,
    ESTADOS_EN_CURSO,
    MAX_REINTENTOS,
    TZ,
    // Vista de platos asignados (Excel + modal)
    isReglaAsignada,
    idCatalogoPlato,
    encontrarRegla,
    construirPlatosAsignadosDTO,
    filtrarPerfilesPorAlcance
};