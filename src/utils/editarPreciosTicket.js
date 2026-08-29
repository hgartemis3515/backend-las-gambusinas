/**
 * Recalcula precios de líneas en un ticket de aprobación / PPA (admin).
 * El snapshot del ticket es lo que cocina imprime y muestra.
 */

function round2(n) {
  return Number((Number(n) || 0).toFixed(2));
}

function aplicarPreciosEnLineasTicket(ticket, platosInput) {
  if (!ticket || !Array.isArray(ticket.platos) || !Array.isArray(platosInput) || !platosInput.length) {
    return { changed: false, cambiosComanda: [] };
  }

  const precioPorClave = new Map();
  const precioPorIndex = [];
  platosInput.forEach((p, i) => {
    const precio = Number(p && p.precio);
    if (!Number.isFinite(precio) || precio < 0) return;
    const val = round2(precio);
    const clave = String((p && (p.platoLineaId || p._id)) || '').trim();
    if (clave) precioPorClave.set(clave, val);
    precioPorIndex[i] = val;
  });

  let changed = false;
  const cambiosComanda = [];

  ticket.platos.forEach((linea, i) => {
    if (!linea || linea.eliminado) return;
    const clave = String(linea.platoLineaId || linea._id || '').trim();
    let precio;
    if (clave && precioPorClave.has(clave)) precio = precioPorClave.get(clave);
    else if (precioPorIndex[i] != null) precio = precioPorIndex[i];
    if (precio == null) return;

    const cant = Math.max(1, Number(linea.cantidad) || 1);
    const subtotal = round2(precio * cant);
    if (round2(linea.precio) === precio && round2(linea.subtotal) === subtotal) return;

    linea.precio = precio;
    linea.subtotal = subtotal;
    changed = true;
    if (linea.comandaId && linea.platoLineaId) {
      cambiosComanda.push({
        comandaId: String(linea.comandaId),
        platoLineaId: String(linea.platoLineaId),
        precio,
      });
    }
  });

  if (!changed) return { changed: false, cambiosComanda: [] };

  const bruto = round2(ticket.platos.reduce((s, p) => {
    if (!p || p.eliminado) return s;
    return s + (Number(p.subtotal) || round2((Number(p.precio) || 0) * (Number(p.cantidad) || 1)));
  }, 0));

  const descArr = Array.isArray(ticket.descuentos) ? ticket.descuentos : [];
  const pct = Number(descArr[0] && descArr[0].porcentaje) || 0;
  let montoDesc = Number(ticket.montoDescuento) || 0;
  if (pct > 0) {
    montoDesc = round2(bruto * (pct / 100));
    descArr[0].monto = montoDesc;
  } else if (montoDesc > bruto) {
    montoDesc = bruto;
  }

  ticket.subtotal = bruto;
  ticket.totalSinDescuento = bruto;
  ticket.montoDescuento = montoDesc;
  ticket.total = round2(Math.max(0, bruto - montoDesc));
  try { ticket.markModified('platos'); } catch (_) { /* pojo / test */ }
  try { if (descArr.length) ticket.markModified('descuentos'); } catch (_) { /* pojo / test */ }

  return { changed: true, cambiosComanda, bruto, neto: ticket.total };
}

async function sincronizarPreciosComandaYBoucher(cambiosComanda, boucherId, { skipBoucher } = {}) {
  const comandasAfectadas = [];
  if (Array.isArray(cambiosComanda) && cambiosComanda.length) {
    const Comanda = require('../database/models/comanda.model');
    const grouped = new Map();
    for (const c of cambiosComanda) {
      if (!c || !c.comandaId) continue;
      if (!grouped.has(c.comandaId)) grouped.set(c.comandaId, []);
      grouped.get(c.comandaId).push(c);
    }
    for (const [comandaId, items] of grouped) {
      const comanda = await Comanda.findById(comandaId);
      if (!comanda) continue;
      let mod = false;
      for (const it of items) {
        const plato = comanda.platos.id(it.platoLineaId);
        if (!plato) continue;
        plato.precio = it.precio;
        plato.precioUnitario = it.precio;
        mod = true;
      }
      if (mod) {
        comanda.markModified('platos');
        await comanda.save();
        comandasAfectadas.push(comandaId);
      }
    }
  }

  if (!skipBoucher && boucherId) {
    const Boucher = require('../database/models/boucher.model');
    const boucher = await Boucher.findById(boucherId);
    if (boucher && Array.isArray(boucher.platos)) {
      const precioPorLinea = new Map(
        (cambiosComanda || []).map((c) => [String(c.platoLineaId), c.precio])
      );
      let mod = false;
      for (const bp of boucher.platos) {
        const id = String(bp.platoLineaId || '');
        if (!id || !precioPorLinea.has(id)) continue;
        const precio = precioPorLinea.get(id);
        const cant = Math.max(1, Number(bp.cantidad) || 1);
        bp.precio = precio;
        bp.subtotal = round2(precio * cant);
        mod = true;
      }
      if (mod) {
        const bruto = round2(boucher.platos.reduce((s, p) => (
          p && p.eliminado ? s : s + (Number(p.subtotal) || 0)
        ), 0));
        const md = Number(boucher.montoDescuento) || 0;
        boucher.subtotal = bruto;
        boucher.totalSinDescuento = bruto;
        boucher.total = round2(Math.max(0, bruto - md));
        if (boucher.totalConDescuento != null) boucher.totalConDescuento = boucher.total;
        boucher.markModified('platos');
        await boucher.save();
      }
    }
  }

  return comandasAfectadas;
}

module.exports = {
  round2,
  aplicarPreciosEnLineasTicket,
  sincronizarPreciosComandaYBoucher,
};
