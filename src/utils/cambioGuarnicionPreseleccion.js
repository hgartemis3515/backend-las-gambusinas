/**
 * Uso G: el mozo cambió las guarniciones marcadas del catálogo.
 * Una línea de plato cuenta 1 aunque elija 3 guarniciones distintas.
 * MIX / variante (nombre cocina) no entran en la comparación.
 */
const {
  claveGrupo,
  grupoNombreCocina,
  preseleccionGuarnicionesDeCatalogo,
} = require('./preseleccionGuarniciones');

function snapshotItem(item) {
  const grupo = String(item?.grupo || '').trim();
  const opcion = String(item?.opcion || item?.nombre || '').trim();
  const n = Number(item?.cantidad);
  const cantidad = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return { grupo, opcion, cantidad };
}

function claveItem(item) {
  const s = snapshotItem(item);
  return `${s.grupo.toLowerCase()}|${s.opcion.toLowerCase()}|${s.cantidad}`;
}

function mapaDesdeLista(list) {
  const map = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const s = snapshotItem(raw);
    if (!s.grupo || !s.opcion) continue;
    map.set(claveItem(s), s);
  }
  return map;
}

function setsIguales(a, b) {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) {
    if (!b.has(k)) return false;
  }
  return true;
}

/** Complementos de la línea que sí son guarnición (no MIX / anexar nombre). */
function guarnicionesElegidasDeLinea(platoCompleto, seleccionados) {
  const skip = new Set(
    (platoCompleto?.complementos || [])
      .filter(grupoNombreCocina)
      .map((g) => claveGrupo(g.grupo))
  );
  return (Array.isArray(seleccionados) ? seleccionados : []).filter((c) => {
    const k = claveGrupo(c?.grupo);
    if (!k || skip.has(k)) return false;
    return !!(c?.opcion || c?.nombre);
  });
}

/**
 * @param {object} platoCompleto catálogo
 * @param {Array} seleccionados complementos de la línea (después de fusionar)
 * @param {Array} [snapshotMarca] marcas ya persistidas; si hay, no se recalcan del catálogo vivo
 */
function calcularCambioGuarnicionPreseleccion(platoCompleto, seleccionados, snapshotMarca) {
  const A = Array.isArray(snapshotMarca) && snapshotMarca.length > 0
    ? snapshotMarca
    : preseleccionGuarnicionesDeCatalogo(platoCompleto);
  const B = guarnicionesElegidasDeLinea(platoCompleto, seleccionados);
  const setA = mapaDesdeLista(A);
  const setB = mapaDesdeLista(B);
  const cambio = setA.size > 0 && !setsIguales(setA, setB);
  const salieron = [];
  const entraron = [];
  if (cambio) {
    for (const [k, v] of setA) {
      if (!setB.has(k)) salieron.push(v);
    }
    for (const [k, v] of setB) {
      if (!setA.has(k)) entraron.push(v);
    }
  }
  return {
    cambioGuarnicionPreseleccion: cambio,
    guarnicionesMarcaSnapshot: Array.from(setA.values()),
    guarnicionesCambio: { salieron, entraron },
  };
}

function aplicarCambioGuarnicionAPlato(plato, platoCompleto, opts = {}) {
  if (!plato) return plato;
  const snap = opts.snapshotExistente || plato.guarnicionesMarcaSnapshot;
  const r = calcularCambioGuarnicionPreseleccion(
    platoCompleto,
    plato.complementosSeleccionados,
    snap
  );
  plato.cambioGuarnicionPreseleccion = r.cambioGuarnicionPreseleccion;
  plato.guarnicionesMarcaSnapshot = r.guarnicionesMarcaSnapshot;
  plato.guarnicionesCambio = r.guarnicionesCambio;
  return plato;
}

module.exports = {
  claveItem,
  guarnicionesElegidasDeLinea,
  calcularCambioGuarnicionPreseleccion,
  aplicarCambioGuarnicionAPlato,
};
