/**
 * Parte una línea de comanda por cantidad: el original se queda con el resto
 * (mismo estado) y se agrega una línea nueva con las unidades a entregar.
 * Índices posteriores no cambian: la nueva línea va al final.
 */

const { cantidadUnidadesPlato } = require('./cantidadLineaComanda');

function indicePlatoPorIdLinea(platos, platoId) {
  if (!Array.isArray(platos) || platoId == null) return -1;
  const id = String(platoId);
  let i = platos.findIndex((p) => p && p._id && String(p._id) === id);
  if (i >= 0) return i;
  return platos.findIndex((p) => p && p.platoId != null && String(p.platoId) === id);
}

function clonarLineaPlatoPlain(plato) {
  const raw = typeof plato.toObject === 'function'
    ? plato.toObject({ depopulate: true })
    : JSON.parse(JSON.stringify(plato));
  delete raw._id;
  if (raw.plato && typeof raw.plato === 'object' && raw.plato._id) {
    raw.plato = raw.plato._id;
  }
  if (Array.isArray(raw.complementosSeleccionados)) {
    raw.complementosSeleccionados = raw.complementosSeleccionados.map((c) => {
      const copy = { ...c };
      delete copy._id;
      return copy;
    });
  }
  return raw;
}

/**
 * @returns {{ didSplit: boolean, cantidadEntregar: number, cantidadRestante: number, error?: string }}
 */
function aplicarSeparacionCantidadLinea(comanda, platoIndex, cantidadEntregar) {
  const platos = comanda?.platos;
  if (!platos || platoIndex < 0 || !platos[platoIndex]) {
    return { didSplit: false, cantidadEntregar: 0, cantidadRestante: 0, error: 'Plato no encontrado' };
  }
  const total = cantidadUnidadesPlato(comanda, platoIndex, platos[platoIndex]);
  const n = Math.floor(Number(cantidadEntregar));
  if (!Number.isFinite(n) || n < 1) {
    return { didSplit: false, cantidadEntregar: 0, cantidadRestante: total, error: 'Cantidad a entregar inválida' };
  }
  if (n > total) {
    return {
      didSplit: false,
      cantidadEntregar: n,
      cantidadRestante: total,
      error: `No se puede entregar ${n}: la línea tiene ${total}`
    };
  }
  if (n === total) {
    return { didSplit: false, cantidadEntregar: n, cantidadRestante: 0 };
  }

  const clone = clonarLineaPlatoPlain(platos[platoIndex]);
  const restante = total - n;
  const cants = Array.from(comanda.cantidades || []);
  while (cants.length < platos.length) cants.push(1);
  cants[platoIndex] = restante;
  cants.push(n);
  comanda.cantidades = cants;
  if (typeof platos.push === 'function') {
    platos.push(clone);
  } else {
    comanda.platos = [...platos, clone];
  }
  return { didSplit: true, cantidadEntregar: n, cantidadRestante: restante };
}

module.exports = {
  indicePlatoPorIdLinea,
  clonarLineaPlatoPlain,
  aplicarSeparacionCantidadLinea
};
