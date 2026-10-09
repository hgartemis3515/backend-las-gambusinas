const TIPOS = ['crudo', 'cocido'];

function aporte(clase, cantidad) {
    const n = Number(cantidad);
    if (!Number.isFinite(n)) return 0;
    if (clase === 'ingreso') return n;
    if (clase === 'egreso') return -n;
    return n;
}

function filaDesdeSumas(saldoInicial, ingresos, egreso, regulacion) {
    const total = saldoInicial + ingresos;
    const saldoFinal = total - egreso;
    const baja = saldoFinal + regulacion;
    return { saldoInicial, ingresos, total, egreso, saldoFinal, regulacion, baja };
}

function clave(platoId, tipo) {
    return `${String(platoId)}:${tipo}`;
}

/**
 * Kardex por plato activo y tipo en [desde, hasta].
 * Movimientos con fecha anterior a `desde` arman el saldo inicial.
 */
function armarKardex(platos, movimientos, desde, hasta) {
    const activos = (platos || []).filter((p) => p && p.isActive !== false);
    const sumas = new Map();
    for (const p of activos) {
        for (const tipo of TIPOS) {
            sumas.set(clave(p._id, tipo), { antes: 0, ingresos: 0, egreso: 0, regulacion: 0 });
        }
    }
    const desdeMs = new Date(desde).getTime();
    const hastaMs = new Date(hasta).getTime();
    for (const m of movimientos || []) {
        const bucket = sumas.get(clave(m.plato, m.tipoProducto));
        if (!bucket) continue;
        const t = new Date(m.fecha).getTime();
        if (!Number.isFinite(t) || t > hastaMs) continue;
        const delta = aporte(m.clase, m.cantidad);
        if (t < desdeMs) {
            bucket.antes += delta;
            continue;
        }
        if (m.clase === 'ingreso') bucket.ingresos += Number(m.cantidad) || 0;
        else if (m.clase === 'egreso') bucket.egreso += Number(m.cantidad) || 0;
        else bucket.regulacion += Number(m.cantidad) || 0;
    }
    return activos.map((p) => {
        const umbral = p.alertaCritica || {};
        return TIPOS.map((tipo) => {
            const b = sumas.get(clave(p._id, tipo));
            const fila = filaDesdeSumas(b.antes, b.ingresos, b.egreso, b.regulacion);
            const minimo = Number(tipo === 'crudo' ? umbral.crudo : umbral.cocido) || 0;
            return {
                plato: String(p._id),
                platoId: p.id,
                nombre: p.nombre,
                tipoProducto: tipo,
                ...fila,
                umbral: minimo,
                critico: minimo > 0 && fila.baja <= minimo
            };
        });
    }).flat();
}

function alertasDeFilas(filas) {
    return (filas || [])
        .filter((f) => f.critico)
        .map((f) => ({
            plato: f.plato,
            platoId: f.platoId,
            nombre: f.nombre,
            tipoProducto: f.tipoProducto,
            saldo: f.baja,
            umbral: f.umbral
        }));
}

function mismaAlerta(a, b) {
    return a.plato === b.plato && a.tipoProducto === b.tipoProducto && a.saldo === b.saldo && a.umbral === b.umbral;
}

function cambioDeAlerta(antes, despues, plato, tipo) {
    const prev = (antes || []).find((a) => a.plato === plato && a.tipoProducto === tipo);
    const next = (despues || []).find((a) => a.plato === plato && a.tipoProducto === tipo);
    if (!prev && !next) return null;
    if (prev && next && mismaAlerta(prev, next)) return null;
    return {
        plato,
        tipoProducto: tipo,
        entro: !!next,
        saldo: next ? next.saldo : (prev ? prev.saldo : 0),
        umbral: next ? next.umbral : (prev ? prev.umbral : 0),
        nombre: (next || prev).nombre
    };
}

module.exports = {
    TIPOS,
    aporte,
    filaDesdeSumas,
    armarKardex,
    alertasDeFilas,
    cambioDeAlerta
};
