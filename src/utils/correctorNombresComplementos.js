const {
    extraerNombreOpcion,
    extraerPronombreOpcion,
    claveNombreComplemento,
    sugerirNombreCanonico,
} = require('./nombreComplementoCanonico');

function asegurarCluster(clusters, clave) {
    let c = clusters.get(clave);
    if (!c) {
        c = { clave, variantes: new Map(), pronombres: new Map() };
        clusters.set(clave, c);
    }
    return c;
}

function tocarVariante(cluster, nombre, origen, id) {
    const key = String(nombre || '').trim();
    if (!key) return;
    let v = cluster.variantes.get(key);
    if (!v) {
        v = { nombre: key, platos: new Set(), plantillas: new Set() };
        cluster.variantes.set(key, v);
    }
    if (origen === 'plato' && id) v.platos.add(String(id));
    if (origen === 'plantilla' && id) v.plantillas.add(String(id));
}

function tocarPronombre(cluster, pronombre, origen, id) {
    const key = String(pronombre || '').trim();
    let v = cluster.pronombres.get(key);
    if (!v) {
        v = { pronombre: key, platos: new Set(), plantillas: new Set() };
        cluster.pronombres.set(key, v);
    }
    if (origen === 'plato' && id) v.platos.add(String(id));
    if (origen === 'plantilla' && id) v.plantillas.add(String(id));
}

function recogerDeGrupos(grupos, origen, id, clusters) {
    if (!Array.isArray(grupos)) return;
    for (const grupo of grupos) {
        const ops = Array.isArray(grupo && grupo.opciones) ? grupo.opciones : [];
        for (const op of ops) {
            const nombre = extraerNombreOpcion(op);
            const clave = claveNombreComplemento(nombre);
            if (!clave) continue;
            const cluster = asegurarCluster(clusters, clave);
            tocarVariante(cluster, nombre, origen, id);
            tocarPronombre(cluster, extraerPronombreOpcion(op), origen, id);
        }
    }
}

function serializarUso(map, campo) {
    return [...map.values()].map((v) => ({
        [campo]: v[campo],
        platos: v.platos.size,
        plantillas: v.plantillas.size,
        total: v.platos.size + v.plantillas.size,
    }));
}

function construirCatalogoOpciones(platos, plantillas) {
    const clusters = new Map();
    for (const p of Array.isArray(platos) ? platos : []) {
        recogerDeGrupos(p.complementos, 'plato', p._id || p.id, clusters);
    }
    for (const t of Array.isArray(plantillas) ? plantillas : []) {
        recogerDeGrupos(
            [{ opciones: t.opciones }],
            'plantilla',
            t._id || t.id,
            clusters
        );
    }
    const opciones = [...clusters.values()].map((c) => {
        const platosUnicos = new Set();
        const plantillasUnicas = new Set();
        for (const v of c.variantes.values()) {
            v.platos.forEach((id) => platosUnicos.add(id));
            v.plantillas.forEach((id) => plantillasUnicas.add(id));
        }
        const variantes = serializarUso(c.variantes, 'nombre');
        variantes.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
        const pronombres = serializarUso(c.pronombres, 'pronombre');
        pronombres.sort((a, b) => b.total - a.total || String(a.pronombre).localeCompare(String(b.pronombre), 'es'));
        const pronombre = sugerirNombreCanonico(
            pronombres.filter((p) => p.pronombre).map((p) => ({ nombre: p.pronombre, total: p.total }))
        );
        return {
            clave: c.clave,
            nombre: sugerirNombreCanonico(variantes),
            pronombre,
            platos: platosUnicos.size,
            plantillas: plantillasUnicas.size,
            variantes,
            pronombres,
            tieneVariantes: variantes.length > 1,
            tienePronombresDistintos: pronombres.filter((p) => p.pronombre).length > 1
                || (pronombres.some((p) => p.pronombre) && pronombres.some((p) => !p.pronombre)),
        };
    });
    opciones.sort((a, b) => b.platos - a.platos || a.nombre.localeCompare(b.nombre, 'es'));
    return { opciones, total: opciones.length };
}

function construirPreviewCorrector(platos, plantillas) {
    const catalogo = construirCatalogoOpciones(platos, plantillas);
    const grupos = catalogo.opciones
        .filter((g) => g.tieneVariantes || g.tienePronombresDistintos)
        .map((g) => ({
            clave: g.clave,
            nombreSugerido: g.nombre,
            pronombreSugerido: g.pronombre || '',
            variantes: g.variantes,
            pronombres: g.pronombres,
            platosAfectados: g.platos,
        }));
    return { grupos, totalGrupos: grupos.length };
}

function claveEnMapas(clave, nombrePorClave, pronombrePorClave) {
    if (!clave) return false;
    if (nombrePorClave && nombrePorClave.has(clave)) return true;
    if (pronombrePorClave && pronombrePorClave.has(clave)) return true;
    return false;
}

function reescribirOpcion(op, nombrePorClave, pronombrePorClave) {
    const nombre = extraerNombreOpcion(op);
    const clave = claveNombreComplemento(nombre);
    if (!clave) return { op, clave, changed: false };
    const tieneNombre = !!(nombrePorClave && nombrePorClave.has(clave));
    const tienePron = !!(pronombrePorClave && pronombrePorClave.has(clave));
    if (!tieneNombre && !tienePron) return { op, clave, changed: false };

    const canon = tieneNombre ? String(nombrePorClave.get(clave) || '').trim() : '';
    const nombreNext = canon || nombre;
    const pronActual = extraerPronombreOpcion(op);
    const pronNext = tienePron
        ? String(pronombrePorClave.get(clave) || '').trim().slice(0, 40)
        : pronActual;

    const nameChanged = !!(tieneNombre && canon && canon !== nombre);
    const pronChanged = !!(tienePron && pronNext !== pronActual);
    if (!nameChanged && !pronChanged) return { op, clave, changed: false };

    if (typeof op === 'string') {
        if (!tienePron) return { op: nombreNext, clave, changed: true };
        return { op: { nombre: nombreNext, precio: 0, pronombre: pronNext }, clave, changed: true };
    }
    const next = { ...op, nombre: nombreNext };
    if (tienePron) next.pronombre = pronNext;
    return { op: next, clave, changed: true };
}

function fusionarOpcionesGrupo(opciones, nombrePorClave, pronombrePorClave) {
    const nombres = nombrePorClave instanceof Map ? nombrePorClave : new Map();
    const prons = pronombrePorClave instanceof Map ? pronombrePorClave : new Map();
    const out = [];
    const seen = new Map();
    let changed = false;
    for (const op of Array.isArray(opciones) ? opciones : []) {
        const { op: next, clave, changed: ch } = reescribirOpcion(op, nombres, prons);
        if (ch) changed = true;
        const k = clave || claveNombreComplemento(extraerNombreOpcion(next));
        const unificar = claveEnMapas(k, nombres, prons);
        if (unificar && seen.has(k)) {
            changed = true;
            const prev = out[seen.get(k)];
            if (prev && typeof prev === 'object' && next && typeof next === 'object') {
                if (prons.has(k)) prev.pronombre = String(prons.get(k) || '').trim().slice(0, 40);
                else if (!prev.pronombre && next.pronombre) prev.pronombre = next.pronombre;
                if (!(Number(prev.precio) > 0) && Number(next.precio) > 0) prev.precio = next.precio;
            }
            continue;
        }
        if (unificar) seen.set(k, out.length);
        out.push(next);
    }
    return { opciones: out, changed };
}

function aplicarCorrectorEnMemoria(platos, plantillas, nombrePorClave, pronombrePorClave) {
    const map = nombrePorClave instanceof Map ? nombrePorClave : new Map();
    const prons = pronombrePorClave instanceof Map ? pronombrePorClave : new Map();
    let platosActualizados = 0;
    let plantillasActualizadas = 0;
    const platosOut = [];
    const plantillasOut = [];

    for (const p of Array.isArray(platos) ? platos : []) {
        const grupos = Array.isArray(p.complementos) ? p.complementos : [];
        let changed = false;
        const nextGrupos = grupos.map((g) => {
            const { opciones, changed: ch } = fusionarOpcionesGrupo(g.opciones, map, prons);
            if (ch) changed = true;
            return ch ? { ...g, opciones } : g;
        });
        if (changed) platosActualizados += 1;
        platosOut.push(changed ? { ...p, complementos: nextGrupos, _correctorChanged: true } : p);
    }

    for (const t of Array.isArray(plantillas) ? plantillas : []) {
        const { opciones, changed } = fusionarOpcionesGrupo(t.opciones, map, prons);
        if (changed) plantillasActualizadas += 1;
        plantillasOut.push(changed ? { ...t, opciones, _correctorChanged: true } : t);
    }

    return { platos: platosOut, plantillas: plantillasOut, platosActualizados, plantillasActualizadas };
}

function mapaNombresDesdePreview(preview, overrides = []) {
    const map = new Map();
    for (const g of (preview && preview.grupos) || []) {
        if (g.clave && g.nombreSugerido) map.set(g.clave, String(g.nombreSugerido).trim());
    }
    for (const o of Array.isArray(overrides) ? overrides : []) {
        const clave = o && o.clave;
        const nom = o && (o.nombreCanonico || o.nombreSugerido);
        if (clave && nom && String(nom).trim()) map.set(clave, String(nom).trim());
    }
    return map;
}

function mapaPronombresDesdePreview(preview, overrides = []) {
    const map = new Map();
    for (const g of (preview && preview.grupos) || []) {
        if (g.clave && String(g.pronombreSugerido || '').trim()) {
            map.set(g.clave, String(g.pronombreSugerido).trim().slice(0, 40));
        }
    }
    for (const o of Array.isArray(overrides) ? overrides : []) {
        const clave = o && o.clave;
        if (!clave || o.pronombre === undefined || o.pronombre === null) continue;
        map.set(clave, String(o.pronombre).trim().slice(0, 40));
    }
    return map;
}

function mapasDesdeOverrides(overrides) {
    const nombrePorClave = new Map();
    const pronombrePorClave = new Map();
    for (const o of Array.isArray(overrides) ? overrides : []) {
        const clave = claveNombreComplemento(o && o.clave);
        if (!clave) continue;
        const nom = o && (o.nombreCanonico || o.nombreSugerido);
        if (nom && String(nom).trim()) nombrePorClave.set(clave, String(nom).trim());
        if (o && o.pronombre !== undefined && o.pronombre !== null) {
            pronombrePorClave.set(clave, String(o.pronombre).trim().slice(0, 40));
        }
    }
    return { nombrePorClave, pronombrePorClave };
}

module.exports = {
    construirCatalogoOpciones,
    construirPreviewCorrector,
    fusionarOpcionesGrupo,
    aplicarCorrectorEnMemoria,
    mapaNombresDesdePreview,
    mapaPronombresDesdePreview,
    mapasDesdeOverrides,
};
