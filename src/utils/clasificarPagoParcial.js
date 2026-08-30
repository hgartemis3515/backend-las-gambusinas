'use strict';

/**
 * Un cobro es PARCIAL si no cubre todos los platos pendientes (o su cantidad
 * completa), o si ya hubo otros bouchers en el mismo pedido (pago en partes).
 * Un solo cobro que cubre todo lo pendiente no es parcial.
 */

function idStr(v) {
  if (v == null) return '';
  if (typeof v === 'object') return String(v._id || v);
  return String(v);
}

function encontrarSeleccion(sels, comandaId, index, platoItem) {
  const cid = String(comandaId);
  const sub = platoItem?._id ? String(platoItem._id) : null;
  return (sels || []).find((s) => {
    if (idStr(s.comandaId) !== cid) return false;
    if (sub && s.platoSubdocId && String(s.platoSubdocId) === sub) return true;
    return Number(s.platoIndex) === Number(index);
  });
}

/**
 * True si la selección cubre todos los platos cobrables (estados dados)
 * a cantidad máxima.
 */
function cubreTodosLosPlatosPendientes(selecciones, comandasValidas, estadosPlatoValidos) {
  const estados = new Set(
    (estadosPlatoValidos && estadosPlatoValidos.length
      ? estadosPlatoValidos
      : ['entregado']
    ).map((e) => String(e).toLowerCase())
  );
  const sels = Array.isArray(selecciones) ? selecciones : [];

  for (const comanda of comandasValidas || []) {
    const platos = comanda.platos || [];
    for (let index = 0; index < platos.length; index++) {
      const platoItem = platos[index];
      if (!platoItem || platoItem.eliminado || platoItem.anulado) continue;
      const estado = String(platoItem.estado || '').toLowerCase();
      if (!estados.has(estado)) continue;
      const sel = encontrarSeleccion(sels, comanda._id, index, platoItem);
      if (!sel) return false;
      const max = Number(comanda.cantidades?.[index] || platoItem.cantidad || 1) || 1;
      const qty = sel.cantidad != null ? Number(sel.cantidad) : max;
      if (!Number.isFinite(qty) || qty < max) return false;
    }
  }
  return true;
}

function esCobroParcialDeVisita({ cubreTodosPendientes, hayBouchersPreviosEnPedido }) {
  return !cubreTodosPendientes || !!hayBouchersPreviosEnPedido;
}

module.exports = {
  cubreTodosLosPlatosPendientes,
  esCobroParcialDeVisita,
};
