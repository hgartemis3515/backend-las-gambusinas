/**
 * Catálogo de guarniciones (plantillas + complementos de platos) con platos relacionados.
 * Puro: no toca Mongo.
 */

function nombreOpcionComplemento(op) {
    if (op == null) return '';
    if (typeof op === 'string') return op.trim();
    return String(op.nombre || op.opcion || '').trim();
}

function normalizarKey(grupo, opcion) {
    const g = (grupo || '').toString().trim().toLowerCase();
    const o = (opcion || '').toString().trim().toLowerCase();
    return `${g}::${o}`;
}

function grupoNorm(grupo) {
    return (grupo || '').toString().trim().toLowerCase();
}

function etiqueta(grupo, opcion) {
    return `${(grupo || '').toString().trim()} :: ${(opcion || '').toString().trim()}`;
}

function infoPlato(plato) {
    const nombre = (plato.nombre || '').toString().trim();
    if (!nombre) return null;
    return {
        id: plato.id != null ? plato.id : (plato._id || null),
        nombre,
        codigo: (plato.codigo || '').toString().trim(),
        _pid: String(plato._id || plato.id || nombre)
    };
}

function addPlato(item, info) {
    if (!item || !info) return;
    if (item._platoIds.has(info._pid)) return;
    item._platoIds.add(info._pid);
    item.platos.push({ id: info.id, nombre: info.nombre, codigo: info.codigo });
}

/**
 * Igual que platos.html / biblioteca: un plato usa la plantilla si
 * complementos.grupo coincide con el nombre del grupo.
 * Primero por opción exacta; si un ítem queda en 0, se rellena por grupo.
 */
function adjuntarPlatosRelacionados(items, platos) {
    const byKey = new Map();
    const byGrupo = new Map();
    for (const item of items) {
        if (!Array.isArray(item.platos)) item.platos = [];
        item._platoIds = new Set(item.platos.map((p) => String(p.id || p.nombre)));
        byKey.set(item.key, item);
        const gn = grupoNorm(item.grupo);
        if (!byGrupo.has(gn)) byGrupo.set(gn, []);
        byGrupo.get(gn).push(item);
    }

    for (const plato of platos || []) {
        if (plato.isActive === false) continue;
        const info = infoPlato(plato);
        if (!info) continue;
        for (const grupo of (plato.complementos || [])) {
            for (const op of (grupo.opciones || [])) {
                const item = byKey.get(normalizarKey(grupo.grupo, nombreOpcionComplemento(op)));
                addPlato(item, info);
            }
        }
    }

    for (const item of items) {
        if (item.platos.length > 0) continue;
        const gn = grupoNorm(item.grupo);
        for (const plato of platos || []) {
            if (plato.isActive === false) continue;
            const info = infoPlato(plato);
            if (!info) continue;
            const usaGrupo = (plato.complementos || []).some((g) => grupoNorm(g.grupo) === gn);
            if (usaGrupo) addPlato(item, info);
        }
    }

    for (const item of items) {
        item.platos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        item.platosRelacionados = item.platos;
        delete item._platoIds;
    }
    return items;
}

function construirCatalogoGuarniciones(plantillas, platos) {
    const map = new Map();
    const ensure = (grupo, opcion) => {
        const g = (grupo || '').toString().trim();
        const o = nombreOpcionComplemento(opcion);
        if (!g || !o) return null;
        const key = normalizarKey(g, o);
        if (!map.has(key)) {
            map.set(key, {
                key,
                grupo: g,
                opcion: o,
                etiqueta: etiqueta(g, o),
                platos: []
            });
        }
        return map.get(key);
    };

    for (const plantilla of plantillas || []) {
        for (const op of (plantilla.opciones || [])) {
            ensure(plantilla.nombre, op);
        }
    }

    for (const plato of platos || []) {
        for (const grupo of (plato.complementos || [])) {
            for (const op of (grupo.opciones || [])) {
                ensure(grupo.grupo, op);
            }
        }
    }

    const items = adjuntarPlatosRelacionados([...map.values()], platos)
        .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
    const grupos = [...new Set(items.map((i) => i.grupo))].sort((a, b) => a.localeCompare(b, 'es'));
    return { items, grupos };
}

module.exports = {
    nombreOpcionComplemento,
    adjuntarPlatosRelacionados,
    construirCatalogoGuarniciones
};
