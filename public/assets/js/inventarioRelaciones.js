/**
 * Vínculos de Relación de platos.
 * Lo que el usuario agrega o edita queda en `manuales`.
 * Lo que quita queda en `quitadas` y el vínculo automático no lo vuelve a crear.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.InventarioRelaciones = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function norm(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function claveRelacion(plato, rubro) {
        return norm(plato) + '\0' + norm(rubro);
    }

    function sanearItem(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var plato = String(raw.plato || '').trim().slice(0, 160);
        var rubro = String(raw.rubro || '').trim().slice(0, 80);
        if (!plato || !rubro) return null;
        if (raw.quitada === true) return { plato: plato, rubro: rubro, quitada: true };
        var cantidad = raw.cantidad;
        if (cantidad === '—' || cantidad === '-') cantidad = '—';
        else {
            var n = Number(cantidad);
            cantidad = n > 0 ? n : 1;
        }
        var id = Number(raw.id);
        return {
            id: Number.isFinite(id) ? id : 0,
            rubro: rubro,
            plato: plato,
            complemento: String(raw.complemento || '').trim().slice(0, 240),
            cantidad: cantidad,
            unidadNota: String(raw.unidadNota || 'unidad').trim().slice(0, 40) || 'unidad',
            manual: true
        };
    }

    function sanearGuardado(body) {
        var manuales = [];
        var quitadas = [];
        var vistos = {};
        var tumbas = {};
        var lista = [];
        if (Array.isArray(body)) {
            lista = body.map(function (raw) { return { raw: raw, quitada: !!(raw && raw.quitada) }; });
        } else if (body && typeof body === 'object') {
            (body.quitadas || []).forEach(function (raw) { lista.push({ raw: raw, quitada: true }); });
            (body.manuales || []).forEach(function (raw) { lista.push({ raw: raw, quitada: false }); });
            (body.relaciones || []).forEach(function (raw) { lista.push({ raw: raw, quitada: !!(raw && raw.quitada) }); });
        }
        lista.forEach(function (env) {
            var raw = env.raw;
            if (env.quitada && raw && typeof raw === 'object') raw = Object.assign({}, raw, { quitada: true });
            var item = sanearItem(raw);
            if (!item) return;
            var k = claveRelacion(item.plato, item.rubro);
            if (item.quitada) {
                if (tumbas[k]) return;
                tumbas[k] = true;
                quitadas.push({ plato: item.plato, rubro: item.rubro });
                return;
            }
            if (vistos[k]) return;
            vistos[k] = true;
            manuales.push(item);
        });
        quitadas = quitadas.filter(function (q) {
            return !vistos[claveRelacion(q.plato, q.rubro)];
        });
        return { manuales: manuales, quitadas: quitadas };
    }

    function fusionarRelaciones(auto, guardado) {
        var limpio = sanearGuardado(guardado || {});
        var tumbas = {};
        limpio.quitadas.forEach(function (q) {
            tumbas[claveRelacion(q.plato, q.rubro)] = true;
        });
        var out = [];
        var vistos = {};
        var ids = {};
        var siguiente = 1;
        function colocar(item) {
            var k = claveRelacion(item.plato, item.rubro);
            if (tumbas[k] || vistos[k]) return;
            vistos[k] = true;
            var copia = Object.assign({}, item);
            var id = Number(copia.id);
            if (!Number.isFinite(id) || id <= 0 || ids[id]) {
                while (ids[siguiente]) siguiente += 1;
                id = siguiente;
                siguiente += 1;
            }
            ids[id] = true;
            if (id >= siguiente) siguiente = id + 1;
            copia.id = id;
            out.push(copia);
        }
        limpio.manuales.forEach(colocar);
        (auto || []).forEach(function (r) {
            if (!r) return;
            colocar(r);
        });
        return out;
    }

    return {
        norm: norm,
        claveRelacion: claveRelacion,
        sanearGuardado: sanearGuardado,
        fusionarRelaciones: fusionarRelaciones
    };
});
