'use strict';

/** Lo que la tarjeta del KDS pinta. Igual que la app de cocina (sosTablaKds). */
const ESTADOS_TARJETA_KDS = new Set(['en_espera', 'ingresante', 'pedido', 'recoger']);

/** Ya salió de cocina y el pendiente es el cobro. */
const ESTADOS_COBRO = new Set(['pendiente_aprobar', 'entregado', 'pagado']);

function platoVisibleEnTablaKds(plato) {
  if (!plato || typeof plato !== 'object') return false;
  if (plato.eliminado === true || plato.anulado === true) return false;
  const estado = String(plato.estado || '').toLowerCase();
  if (estado === 'pendiente') return false;
  if (plato.tipoServicio === 'para_llevar' || plato.paraLlevar === true) {
    const ticket = String((plato.pagoAdelantado || {}).estadoTicket || '').toLowerCase();
    if (ticket !== 'aprobado') return false;
  }
  return ESTADOS_TARJETA_KDS.has(estado || 'en_espera');
}

function comandaEnTablaKds(comanda) {
  return (comanda?.platos || []).some(platoVisibleEnTablaKds);
}

/** Número del día. Nunca el histórico (comandaNumber). */
function numeroDia(comanda) {
  if (!comanda || typeof comanda !== 'object') return null;
  const n = Number(comanda.numeroComandaDia);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function esEstadoCobro(status) {
  return ESTADOS_COBRO.has(String(status || '').toLowerCase());
}

function idDe(doc) {
  if (!doc || typeof doc !== 'object' || doc._id == null) return '';
  return String(doc._id);
}

/**
 * KDS visible y todavía en cocina → entregar.
 * KDS en estado de cobro, o ticket pendiente y no está en cocina → cobrar.
 * Un mismo id no sale en las dos listas: manda el estado de cocina.
 */
function clasificarBloqueo({ kds = [], tickets = [] } = {}) {
  const entregar = new Map();
  const cobrar = new Map();

  for (const c of kds) {
    if (!comandaEnTablaKds(c)) continue;
    const id = idDe(c);
    if (!id) continue;
    const destino = esEstadoCobro(c.status) ? cobrar : entregar;
    if (!destino.has(id)) destino.set(id, numeroDia(c));
  }

  for (const t of tickets) {
    const comandas = (t?.comandas || []).filter((c) => c && typeof c === 'object' && c._id);
    if (!comandas.length) {
      const key = 'ticket-' + String(t?._id || ('sin-' + cobrar.size));
      if (!cobrar.has(key)) cobrar.set(key, null);
      continue;
    }
    for (const c of comandas) {
      const id = idDe(c);
      if (!id || entregar.has(id) || cobrar.has(id)) continue;
      cobrar.set(id, numeroDia(c));
    }
  }

  return resumir(entregar, cobrar);
}

function resumir(entregar, cobrar) {
  return {
    entregar: numerosDe(entregar),
    cobrar: numerosDe(cobrar),
    sinEntregar: sinNumero(entregar),
    sinCobrar: sinNumero(cobrar),
  };
}

function numerosDe(mapa) {
  return [...new Set([...mapa.values()].filter((n) => n != null))].sort((a, b) => a - b);
}

function sinNumero(mapa) {
  let n = 0;
  for (const v of mapa.values()) if (v == null) n += 1;
  return n;
}

function frase(verbo, numeros, sinNumeroCount) {
  const trozos = [];
  if (numeros.length === 1) trozos.push(`la comanda #${numeros[0]}`);
  else if (numeros.length > 1) trozos.push(`las comandas ${numeros.map((n) => '#' + n).join(', ')}`);
  if (sinNumeroCount === 1) trozos.push('una comanda sin número del día');
  else if (sinNumeroCount > 1) trozos.push(`${sinNumeroCount} comandas sin número del día`);
  if (!trozos.length) return '';
  return `Falta ${verbo} ${trozos.join(' y ')}`;
}

function mensajeBloqueoCierre(clasif = {}) {
  const cobrar = frase('cobrar', clasif.cobrar || [], clasif.sinCobrar || 0);
  const entregar = frase('entregar', clasif.entregar || [], clasif.sinEntregar || 0);
  const partes = [cobrar, entregar].filter(Boolean);
  return partes.length ? partes.join('. ') + '.' : '';
}

module.exports = {
  ESTADOS_TARJETA_KDS,
  platoVisibleEnTablaKds,
  comandaEnTablaKds,
  numeroDia,
  esEstadoCobro,
  clasificarBloqueo,
  mensajeBloqueoCierre,
};
