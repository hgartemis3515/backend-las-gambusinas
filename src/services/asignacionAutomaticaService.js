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
 *   está activo AHORA (según día + hora de Lima). Si no hay franja activa →
 *   no se asigna (v1: motivo "sin_franja_activa").
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
 *   6. Overflow 5+1: si el primario ya tiene >= maxMismoPlato del mismo platoId en curso,
 *      el siguiente pasa al primer backup válido. Igual para totalEnCurso.
 *   7. Si no hay candidato → modoSinCandidato (default: dejar_sin_asignar).
 *
 * Contadores en tiempo real: agregación sobre el index idx_platos_en_curso_cocinero.
 * Concurrencia: reintento sobre selección si el write condicional falla por capacidad.
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const redisCache = require('../utils/redisCache');

const AsignacionAutomatica = require('../database/models/asignacionAutomatica.model');
const ConfigCocinero = require('../database/models/configCocinero.model');
const Zona = require('../database/models/zona.model');

const Comanda = mongoose.model('Comanda') || require('../database/models/comanda.model');
const Mozos = mongoose.model('mozos') || require('../database/models/mozos.model');
const { getCocineroInfo } = require('../utils/cocineroInfo');

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

/**
 * Compara "HH:mm" como strings lexicográficos (válido para 24h sin cruzar medianoche).
 * Devuelve -1, 0, 1.
 */
function compararHHmm(a, b) {
    return a < b ? -1 : (a > b ? 1 : 0);
}

/**
 * ¿hhmm está dentro de [horaInicio, horaFin)?  (horaFin exclusiva; v1 sin cruce de medianoche)
 */
function horaEnRango(hhmm, horaInicio, horaFin) {
    if (horaFin === '23:59' || horaFin === '24:00') {
        return compararHHmm(hhmm, horaInicio) >= 0 && compararHHmm(hhmm, '23:59') <= 0;
    }
    return compararHHmm(hhmm, horaInicio) >= 0 && compararHHmm(hhmm, horaFin) < 0;
}

/**
 * RESOLVER PERFIL ACTIVO (pura, sin IO).
 *
 * Dada la config (documento de asignación) y un momento (moment tz Lima), determina
 * qué perfil está activo AHORA según el calendario semanal. Devuelve:
 *   { perfil, bloque, motivo } | { perfil: null, bloque: null, motivo }
 *
 * Reglas (prioridad entre bloques solapados):
 *   1. Solo bloques activos cuyo diasSemana incluye el día actual y la hora cae en rango.
 *   2. Si 0 bloques → null, motivo 'sin_franja_activa' (o 'deshabilitada' si !habilitada).
 *   3. Si >1 → gana el MÁS ESPECÍFICO (menos días en diasSemana).
 *      Si empatan → el de horaInicio más tarde (más acotado al momento actual).
 *      Si empatan → el de createdAt más reciente (último en crearse).
 *   4. Busca el perfil por bloque.perfilId; si no existe o está inactivo → null,
 *      motivo 'perfil_inactivo_o_inexistente'.
 *
 * Día: usamos moment.day() => 0=Dom, 1=Lun, ..., 6=Sáb (consistente con diasSemana).
 */
function perfilPorId(config, perfilId) {
    const id = perfilId != null ? String(perfilId) : '';
    return (config.perfiles || []).find(p => p && String(p.id) === id && p.activo !== false) || null;
}

function resolverPerfilActivo(config, momento) {
    if (!config || !config.habilitada) {
        return { perfil: null, bloque: null, motivo: 'deshabilitada' };
    }
    const bloques = (config.calendario && Array.isArray(config.calendario.bloques)) ? config.calendario.bloques : [];
    const activos = (config.perfiles || []).filter(p => p && p.activo !== false);
    if (bloques.length === 0) {
        if (activos.length >= 1) {
            return { perfil: activos[0], bloque: null, motivo: 'ok' };
        }
        return { perfil: null, bloque: null, motivo: 'sin_franja_activa' };
    }
    const m = momento || nowLima();
    const dia = m.day();
    const hhmm = m.format('HH:mm');

    const candidatos = bloques.filter(b =>
        b.activo !== false &&
        Array.isArray(b.diasSemana) &&
        b.diasSemana.map(Number).includes(dia) &&
        horaEnRango(hhmm, b.horaInicio, b.horaFin)
    );

    if (candidatos.length === 0) {
        return { perfil: null, bloque: null, motivo: 'sin_franja_activa', dia, hhmm };
    }

    // Orden de prioridad: menos días (más específico) → horaInicio más tarde → createdAt más reciente.
    candidatos.sort((a, b) => {
        const porDias = (a.diasSemana.length) - (b.diasSemana.length);
        if (porDias !== 0) return porDias;
        const porInicio = compararHHmm(b.horaInicio, a.horaInicio); // invertido: mayor horaInicio primero
        if (porInicio !== 0) return porInicio;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta; // más reciente primero
    });

    const bloqueSeleccionado = candidatos[0];
    const perfil = perfilPorId(config, bloqueSeleccionado.perfilId);
    if (!perfil) {
        return { perfil: null, bloque: bloqueSeleccionado, motivo: 'perfil_inactivo_o_inexistente', dia, hhmm };
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
        { $match: { IsActive: true, 'platos.procesandoPor.cocineroId': { $in: objectIds }, 'platos.estado': { $in: ESTADOS_EN_CURSO } } },
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
 * Encuentra la regla aplicable para un plato.
 * Prioridad: reglaPorPlato > reglaPorCategoria.
 *
 * En v2, `configOrPerfil` puede ser:
 *   - un PERFIL (tiene sus propias reglasPorPlato/reglasPorCategoria) → usa esas.
 *   - el documento raíz legacy (sin perfiles) → usa reglasPorPlato/reglasPorCategoria raíz
 *     (compatibilidad para rollback / tests viejos).
 */
function encontrarRegla(configOrPerfil, plato) {
    const platoId = Number(plato.platoId || plato.id);
    const reglasPlato = configOrPerfil.reglasPorPlato || [];
    const reglasCat = configOrPerfil.reglasPorCategoria || [];

    const reglaPlato = Number.isFinite(platoId) && platoId > 0
        ? reglasPlato.find(r => Number(r.platoId) === platoId && r.activo !== false)
        : null;
    if (reglaPlato && reglaPlato.cocineroPrimarioId) return { tipo: 'plato', regla: reglaPlato };

    const categoria = plato.categoria || plato.plato?.categoria;
    if (categoria) {
        const reglaCat = reglasCat.find(r => r.categoria === categoria && r.activo !== false);
        if (reglaCat && reglaCat.cocineroPrimarioId) return { tipo: 'categoria', regla: reglaCat };
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
async function filtrarCandidato(cand, config, plato, platoId, cacheConectado, cacheCargaTot, maxTotalesPorOverride) {
    const { soloCocinerosConectados, respetarZonas, maxMismoPlatoPorCocinero, maxPlatosTotalesEnCurso } = config.defaults;

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
    if (total >= maxTotal) return null;

    // Límite mismo plato
    const maxMismo = maxMismoPlatoPorCocinero;
    const mismoPlatoCount = await contarPlatosEnCurso(cand.cocineroId, platoId);
    if (mismoPlatoCount >= maxMismo) {
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
async function seleccionarCocinero(config, plato, perfil = null) {
    const fuenteReglas = perfil || config;
    const match = encontrarRegla(fuenteReglas, plato);
    if (!match) {
        // Sin regla: modoSinCandidato decide (en este punto no asignamos)
        return null;
    }
    const { tipo, regla } = match;
    const candidatos = construirCandidatos(regla);
    if (candidatos.length === 0) return null;

    const estrategia = regla.estrategia || config.defaults.estrategiaDefault || 'hibrido';
    const cacheConectado = {};
    const cacheCargaTot = {};

    // Modos que consideran carga para elegir entre backups
    const usaMenorCarga = ['menor_carga', 'hibrido'].includes(estrategia);
    const candidatosValidos = [];
    for (const cand of candidatos) {
        const v = await filtrarCandidato(cand, config, plato, regla.platoId || (plato.platoId || plato.id), cacheConectado, cacheCargaTot);
        if (v) candidatosValidos.push(v);
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

    // Write condicional con arrayFilters: atómico y seguro contra concurrencia.
    // Solo actualiza el subdoc plato cuyo _id coincide y cuyo procesandoPor.cocineroId está vacío.
    const platoSubdocId = platoActual._id;
    const subeAEspera = platoActual.estado === 'pedido';
    const setUpdate = {
        'platos.$[elem].procesandoPor': cocineroInfo,
        'platos.$[elem].asignacionMeta': {
            origen: metaOrigen,
            regla: metaRegla,
            timestamp: ahora
        },
        updatedAt: ahora,
        updatedBy: cocineroId
    };
    if (subeAEspera) {
        setUpdate['platos.$[elem].estado'] = 'en_espera';
        setUpdate['platos.$[elem].tiempos.en_espera'] = ahora;
    }
    const result = await Comanda.updateOne(
        {
            _id: comandaId,
            $or: [
                { [`platos.${platoIndex}.procesandoPor.cocineroId`]: null },
                { [`platos.${platoIndex}.procesandoPor.cocineroId`]: { $exists: false } }
            ]
        },
        { $set: setUpdate },
        {
            arrayFilters: [{
                'elem._id': platoSubdocId,
                'elem.estado': { $in: ['pedido', 'en_espera'] }
            }]
        }
    );

    if (result.modifiedCount === 0) return false; // alguien tomó o cambió estado entre read y write

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

        // Necesitamos info de categoría de cada plato (plato ref poblada o lookup por platoId)
        const PlatoModel = mongoose.model('platos') || require('../database/models/plato.model');
        const platosCatalogo = {};
        const platoIds = platosAsignables.map(p => p.platoId).filter(Boolean);
        if (platoIds.length) {
            const found = await PlatoModel.find({ id: { $in: platoIds } }).lean();
            found.forEach(p => { platosCatalogo[p.id] = p; });
        }

        let asignados = 0;
        let noAsignados = 0;
        for (const plato of platosAsignables) {
            const platoId = plato.platoId;
            const enriched = {
                platoId,
                _id: plato._id,
                categoria: plato.categoria || platosCatalogo[platoId]?.categoria,
                tipo: plato.tipo || platosCatalogo[platoId]?.tipo,
                plato: plato.plato || platosCatalogo[platoId]
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

                elegido = await seleccionarCocinero(configViva, enriched, perfil);
                if (!elegido && intento === MAX_REINTENTOS - 1) {
                    logger.info('Auto-asignación: plato sin candidato', {
                        comandaId: comanda._id.toString(), platoId,
                        perfilId: perfil.id, bloqueId: bloque?.id,
                        modoSinCandidato: configViva.defaults.modoSinCandidato
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
        platoId: Number(platoId),
        categoria,
        tipo,
        plato: { categoria, tipo }
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
    construirPlatosAsignadosDTO,
    filtrarPerfilesPorAlcance
};