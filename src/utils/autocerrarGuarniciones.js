/**
 * Auto-cierre de guarniciones al pasar el plato principal a recoger.
 * PLAN AGRUPACION_GUARNICIONES_AUTOCIERRE §3.1 / §7.1
 *
 * Cierra SOLO los extras de ese platoIndex. No atribuye extras sin asignar
 * al cocinero del principal.
 */

function indicesPendientesGuarnicion(plato, { soloIndex = null } = {}) {
    const comps = plato?.complementosSeleccionados || [];
    const out = [];
    comps.forEach((c, i) => {
        if (!c || c.eliminado || c.estadoCocina === 'recoger') return;
        if (soloIndex != null && i !== soloIndex) return;
        out.push(i);
    });
    return out;
}

function buildAutocierreGuarnicionesSet(plato, platoIndex, ahora) {
    const comps = plato?.complementosSeleccionados || [];
    const autoSet = {};
    comps.forEach((c, ci) => {
        if (!c || c.eliminado || c.estadoCocina === 'recoger') return;
        const prefix = `platos.${platoIndex}.complementosSeleccionados.${ci}`;
        autoSet[`${prefix}.estadoCocina`] = 'recoger';
        const tenia = c.procesandoPor && c.procesandoPor.cocineroId;
        if (tenia) {
            autoSet[`${prefix}.procesadoPor`] = {
                cocineroId: c.procesandoPor.cocineroId,
                nombre: c.procesandoPor.nombre || null,
                alias: c.procesandoPor.alias || null,
                timestamp: ahora,
                tomadoEn: c.procesandoPor.timestamp || null
            };
        } else {
            autoSet[`${prefix}.procesadoPor`] = {
                cocineroId: null,
                nombre: null,
                alias: null,
                timestamp: ahora
            };
        }
        autoSet[`${prefix}.procesandoPor`] = {
            cocineroId: null,
            nombre: null,
            alias: null,
            timestamp: null
        };
    });
    return autoSet;
}

function agrupacionGuarnicionesOn(cocinaCfg) {
    const cfg = cocinaCfg || {};
    return cfg.permitirGuarnicionesSeparadas !== false
        && cfg.deshabilitarAgrupacionGuarniciones !== true;
}

module.exports = {
    indicesPendientesGuarnicion,
    buildAutocierreGuarnicionesSet,
    agrupacionGuarnicionesOn
};
