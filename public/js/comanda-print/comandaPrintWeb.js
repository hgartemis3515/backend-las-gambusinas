/**
 * comandaPrintWeb.js — Orchestrator for web-based comanda printing.
 *
 * Provides two entry points:
 *   imprimirComandaWeb(opts)      — Full flow: fetch data → render HTML → print
 *   imprimirComandaDesdeTicket(ticket, opts) — Convenience for cocina/comandas.html
 *
 * Pure browser JS, NO React Native dependencies.
 * Works with injected fetchJson (for auth tokens) or plain fetch.
 */

import {
  generarHtmlComanda,
  aplicarComandaNumeroDisplay,
  formatComandasNumbersLabel,
  mapComandaATicket,
  EPSON_TM_M30II_RECEIPT,
} from './comandaHtml.js';

/**
 * Default JSON fetch helper (no auth). Used when opts.fetchJson is not provided.
 */
async function defaultFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} — ${url}`);
  }
  return res.json();
}

/** GET /comanda-plantilla devuelve { success, plantilla }. Acepta también el objeto plano. */
function unwrapPlantillaComanda(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.configuracion?.comandaPlantilla) {
    return unwrapPlantillaComanda(res.configuracion.comandaPlantilla);
  }
  const inner = res.plantilla;
  if (inner && typeof inner === 'object' && (inner.bloques || inner.visibilidad || inner.restaurante || inner.espaciado)) {
    return inner;
  }
  if (res.bloques || res.visibilidad || res.restaurante || res.espaciado) {
    return res;
  }
  return inner || null;
}

async function obtenerPlantillaComandaViva(fetchJson, plantillaLocal, usarLocal) {
  if (usarLocal) {
    return unwrapPlantillaComanda(plantillaLocal) || plantillaLocal || null;
  }
  const stamp = Date.now();
  const urls = [
    `/api/configuracion/comanda-plantilla?_=${stamp}`,
    `/configuracion/comanda-plantilla?_=${stamp}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchJson(url);
      const fresh = unwrapPlantillaComanda(res);
      if (fresh) return fresh;
    } catch {
      /* siguiente url */
    }
  }
  return unwrapPlantillaComanda(plantillaLocal) || plantillaLocal || null;
}

async function obtenerConfigMonedaViva(fetchJson) {
  try {
    const res = await fetchJson(`/api/configuracion/moneda?_=${Date.now()}`);
    const cfg = (res?.configuracion && typeof res.configuracion === 'object')
      ? res.configuracion
      : res;
    const pct = Number(cfg?.igvPorcentaje);
    if (!Number.isFinite(pct)) return null;
    return {
      igvPorcentaje: pct,
      nombreImpuesto: cfg?.nombreImpuestoPrincipal || cfg?.nombreImpuesto || 'IGV',
    };
  } catch {
    return null;
  }
}

/**
 * Print a comanda by ID or with pre-fetched data.
 *
 * @param {Object} opts
 * @param {string|null} [opts.comandaId] - ID to fetch ticket data from GET /api/comanda/:id/ticket-imprimible
 * @param {Object|null} [opts.datos] - Pre-fetched ticket data (skips the API call if provided)
 * @param {Object|null} [opts.plantilla] - Fallback si falla el GET; por defecto se recarga del servidor
 * @param {boolean} [opts.usarPlantillaLocal] - Si true, no pide al API (vista previa del editor)
 * @param {string} [opts.serverOrigin] - Origin for resolving logo URLs
 * @param {Function} [opts.fetchJson] - Optional fetch wrapper that handles auth tokens etc.
 * @param {Array<number|string>|null} [opts.comandasNumbersOverride] - Override comandasNumbers on the datos
 * @returns {Promise<true|null>} true on success, null on error
 */
export async function imprimirComandaWeb(opts = {}) {
  try {
    const fetchJson = opts.fetchJson || defaultFetchJson;
    const serverOrigin = opts.serverOrigin || (typeof window !== 'undefined' ? window.location.origin : '');

    // 1. Get datos — either provided or fetched
    let datos = opts.datos || null;
    if (!datos && opts.comandaId) {
      const res = await fetchJson(`/api/comanda/${opts.comandaId}/ticket-imprimible`);
      if (res && res.success && res.datos) {
        datos = res.datos;
      } else if (res && res.datos) {
        datos = res.datos;
      }
    }
    if (!datos) {
      console.error('[comandaPrintWeb] No datos provided and no comandaId to fetch');
      return null;
    }

    // 2. Plantilla + IGV vivos del servidor (sin caché). Vista previa puede pasar usarPlantillaLocal.
    const [plantilla, monedaViva] = await Promise.all([
      obtenerPlantillaComandaViva(
        fetchJson,
        opts.plantilla || null,
        opts.usarPlantillaLocal === true
      ),
      obtenerConfigMonedaViva(fetchJson),
    ]);

    // 3. Forzar "Pago: Pendiente" si se imprime sin aprobar desde la tabla
    if (opts.ticketEstado === 'pendiente_aprobacion') {
      datos = { ...datos, tipoPago: 'Pendiente' };
    }

    // 4. Apply comandaNumeroDisplay
    datos = aplicarComandaNumeroDisplay(datos);

    // 5. Merge comandasNumbersOverride if provided
    if (opts.comandasNumbersOverride) {
      datos = { ...datos, comandasNumbers: opts.comandasNumbersOverride };
      datos = aplicarComandaNumeroDisplay(datos);
    }

    if (monedaViva?.igvPorcentaje != null) {
      datos = {
        ...datos,
        igvPorcentaje: monedaViva.igvPorcentaje,
        nombreImpuesto: monedaViva.nombreImpuesto || datos.nombreImpuesto || 'IGV',
      };
    }

    // 6. Generate full HTML
    const { html, heightPx } = generarHtmlComanda({ datos, plantilla, serverOrigin });

    // 7. Open print window (Epson TM-m30II Receipt — 80mm / 226px)
    const popupW = EPSON_TM_M30II_RECEIPT.contentWidthPx + 48;
    const printWin = window.open('', '_blank', `width=${popupW},height=700,scrollbars=yes`);
    if (!printWin) {
      console.error('[comandaPrintWeb] Could not open print window (popup blocked?)');
      alert('No se pudo abrir la ventana de impresión. Permite ventanas emergentes para este sitio.');
      return null;
    }

    printWin.document.write(html);
    printWin.document.close();

    // La impresión la dispara el script embebido en el HTML (tras layout + imágenes).
    return true;
  } catch (err) {
    console.error('[comandaPrintWeb] Error printing comanda:', err);
    return null;
  }
}

/** Si el ticket no fue aprobado en cocina, el ticket impreso debe decir "Pago: Pendiente". */
function resolverTipoPagoImpresion(ticket, tipoPagoFallback = 'Pendiente') {
  if (ticket?.estado === 'pendiente_aprobacion') {
    return 'Pendiente';
  }
  return ticket?.metodoPago || ticket?.tipoPago || tipoPagoFallback || 'Pendiente';
}

function ticketTieneDescuento(ticket) {
  return Number(ticket?.montoDescuento) > 0
    || Number(ticket?.boucher?.montoDescuento) > 0
    || (Array.isArray(ticket?.descuentos) && ticket.descuentos.some((d) => Number(d?.monto) > 0 || Number(d?.porcentaje) > 0));
}

function resolverTotalesTicketImpresion(ticket, productos) {
  const sumaPlatos = (productos || []).reduce((s, p) => s + (Number(p.subtotal) || 0), 0);
  const esReserva = ticket?.origen === 'reserva';
  const totalGuardado = Number(ticket?.total);
  const subtotalGuardado = Number(ticket?.subtotal);
  const tieneDesc = ticketTieneDescuento(ticket);
  if (!tieneDesc && (esReserva || !Number.isFinite(totalGuardado) || totalGuardado === 0) && sumaPlatos > 0) {
    return { subtotal: sumaPlatos, total: sumaPlatos };
  }
  return {
    subtotal: Number.isFinite(subtotalGuardado) ? subtotalGuardado : 0,
    total: Number.isFinite(totalGuardado) ? totalGuardado : 0,
  };
}

/**
 * Maps a ticket object (from aprobacion/PPA) to datos format for printing.
 * Handles flat structure from backend and nested objects from populate.
 */
function mapearTicketADatos(ticket) {
  const comandasNumbers = (() => {
    const nums = new Set();
    (ticket.comandasNumbers || []).forEach((n) => {
      if (n == null || n === '') return;
      const num = Number(n);
      if (!Number.isNaN(num)) nums.add(num);
    });
    (ticket.platos || []).forEach((p) => {
      if (p?.comandaNumber == null || p.comandaNumber === '') return;
      const num = Number(p.comandaNumber);
      if (!Number.isNaN(num)) nums.add(num);
    });
    return [...nums].sort((a, b) => a - b);
  })();

  const comandaNumeroDisplay = formatComandasNumbersLabel(comandasNumbers)
    || (ticket.ticketNumber ? `#${ticket.ticketNumber}` : '');

  const tipoLower = String(ticket.tipo || '').toLowerCase();

  const productos = (ticket.platos || []).map(p => {
    const precio = p.precio || p.plato?.precio || 0;
    const cantidad = p.cantidad || 1;
    return {
      nombre: p.nombre || p.plato?.nombre || 'Plato',
      cantidad,
      precio,
      subtotal: p.subtotal || precio * cantidad,
      tipoServicio: p.tipoServicio || 'mesa',
      complementos: (p.complementosSeleccionados || []).map(c => ({
        grupo: c.grupo || '',
        opcion: c.opcion || '',
        precio: c.precio || 0,
      })),
      notaEspecial: p.notaEspecial || '',
      paraLlevar: p.tipoServicio === 'para_llevar',
    };
  });
  const totales = resolverTotalesTicketImpresion(ticket, productos);
  const montoDescuento = Number(ticket.montoDescuento ?? ticket.boucher?.montoDescuento ?? 0)
    || (Array.isArray(ticket.comandas)
      ? ticket.comandas.reduce((s, c) => s + (Number(c?.montoDescuento) || 0), 0)
      : 0);
  const bruto = Number(ticket.totalSinDescuento ?? ticket.boucher?.totalSinDescuento) > 0
    ? Number(ticket.totalSinDescuento ?? ticket.boucher?.totalSinDescuento)
    : (totales.subtotal || totales.total);
  const totalNeto = montoDescuento > 0
    ? Number(Math.max(0, bruto - montoDescuento).toFixed(2))
    : totales.total;

  return {
    ticketId: ticket._id || ticket.ticketId || null,
    ticketNumber: ticket.ticketNumber || null,
    tipo: tipoLower || null,
    comandaNumero: comandasNumbers[0] ?? ticket.comandaNumero ?? null,
    comandasNumbers,
    comandaNumeroDisplay,
    cantidadComandas: comandasNumbers.filter((n) => n != null).length || 1,
    fechaPedido: ticket.createdAt || ticket.fechaPedido || null,
    mesa: ticket.numMesa || ticket.mesaNumero
      || (typeof ticket.mesa === 'object' ? ticket.mesa?.nummesa : ticket.mesa)
      || '?',
    mozo: ticket.nombreMozo || ticket.mozoNombre
      || (typeof ticket.mozo === 'object' ? ticket.mozo?.name : ticket.mozo)
      || '—',
    area: ticket.area || ticket.mesa?.area?.nombre || '',
    moneda: ticket.moneda === 'USD' ? 'USD' : 'PEN',
    tipoPago: resolverTipoPagoImpresion(ticket),
    observaciones: ticket.observaciones || '',
    productos,
    subtotal: montoDescuento > 0 ? bruto : totales.subtotal,
    igv: ticket.igv || 0,
    igvPorcentaje: ticket.igvPorcentaje,
    nombreImpuesto: ticket.nombreImpuesto,
    total: totalNeto,
    montoDescuento: Number(montoDescuento) || 0,
    totalSinDescuento: montoDescuento > 0 ? bruto : (ticket.totalSinDescuento ?? ticket.boucher?.totalSinDescuento ?? null),
    descuentos: ticket.descuentos?.length ? ticket.descuentos : (ticket.boucher?.descuentos || []),
    cliente: {
      nombre: ticket.cliente?.nombre || ticket.nombreCliente || ticket.clienteNombre || 'Cliente',
      dni: ticket.cliente?.dni || ticket.dniCliente || ticket.clienteDni || '',
    },
    voucherId: ticket.voucherId || ticket.boucher?.voucherId || null,
    montoRecibido: ticket.montoRecibido ?? ticket.boucher?.montoRecibido ?? null,
    vuelto: ticket.vuelto ?? ticket.boucher?.vuelto ?? null,
  };
}

/**
 * Convenience function for cocina/comandas.html dashboard and App Cocina.
 * Resolves comandaId from a ticket object and delegates to imprimirComandaWeb.
 * Works with both TicketAprobacion (comanda_completa) and TicketPagoAdelantado (pago_adelantado).
 *
 * @param {Object} ticket - Ticket object from the cocina dashboard
 * @param {Object} opts - Same options as imprimirComandaWeb
 * @returns {Promise<true|null>}
 */
export async function imprimirComandaDesdeTicket(ticket, opts = {}) {
  const datosFromTicket = mapearTicketADatos(ticket);
  const ticketId = ticket._id || ticket.ticketId || null;
  const tieneSnapshot = Array.isArray(ticket.platos) && ticket.platos.length > 0;

  const printOpts = {
    ...opts,
    ticketEstado: ticket.estado,
    comandasNumbersOverride: ticket.comandasNumbers || opts.comandasNumbersOverride || null,
  };

  if (ticketId && tieneSnapshot) {
    const fetchJson = opts.fetchJson || defaultFetchJson;
    try {
      const res = await fetchJson(`/api/aprobacion/${ticketId}/ticket-imprimible`);
      if (res?.success && res.datos) {
        return imprimirComandaWeb({
          ...printOpts,
          comandaId: null,
          datos: res.datos,
        });
      }
    } catch {
      // Usar snapshot local
    }
    return imprimirComandaWeb({
      ...printOpts,
      comandaId: null,
      datos: datosFromTicket,
    });
  }

  const comandaId = ticket.comandasIds?.[0]
    || ticket.comandaId
    || (Array.isArray(ticket.comandas) && ticket.comandas.length > 0
      ? (typeof ticket.comandas[0] === 'string' ? ticket.comandas[0] : ticket.comandas[0]?._id)
      : null)
    || (ticket.comanda?._id)
    || null;

  if (!comandaId) {
    return imprimirComandaWeb({
      ...printOpts,
      comandaId: null,
      datos: datosFromTicket,
    });
  }

  try {
    const fetchJson = opts.fetchJson || defaultFetchJson;
    const url = ticketId
      ? `/api/comanda/${comandaId}/ticket-imprimible?ticketId=${ticketId}`
      : `/api/comanda/${comandaId}/ticket-imprimible`;
    const res = await fetchJson(url);
    if (res?.success && res.datos) {
      return imprimirComandaWeb({
        ...printOpts,
        comandaId: null,
        datos: res.datos,
      });
    }
  } catch (err) {
    console.warn('[comandaPrintWeb] Failed to fetch ticket-imprimible, using ticket data:', err);
  }

  return imprimirComandaWeb({
    ...printOpts,
    comandaId: null,
    datos: datosFromTicket,
  });
}

// Exponer en window para comandas.html (Alpine.js) y otros scripts no-module
if (typeof window !== 'undefined') {
  window.imprimirComandaWeb = imprimirComandaWeb;
  window.imprimirComandaDesdeTicket = imprimirComandaDesdeTicket;
  window.generarHtmlComanda = generarHtmlComanda;
  window.mapComandaATicket = mapComandaATicket;
  window.aplicarComandaNumeroDisplay = aplicarComandaNumeroDisplay;
}