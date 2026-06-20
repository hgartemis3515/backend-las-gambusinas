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

/**
 * Print a comanda by ID or with pre-fetched data.
 *
 * @param {Object} opts
 * @param {string|null} [opts.comandaId] - ID to fetch ticket data from GET /api/comanda/:id/ticket-imprimible
 * @param {Object|null} [opts.datos] - Pre-fetched ticket data (skips the API call if provided)
 * @param {Object|null} [opts.plantilla] - Plantilla object; if not provided, fetches from GET /api/configuracion/comanda-plantilla
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

    // 2. Get plantilla — either provided or fetched
    let plantilla = opts.plantilla || null;
    if (!plantilla) {
      try {
        plantilla = await fetchJson('/api/configuracion/comanda-plantilla');
      } catch {
        // Plantilla is optional — generate without it
        plantilla = null;
      }
    }

    // 3. Apply comandaNumeroDisplay
    datos = aplicarComandaNumeroDisplay(datos);

    // 4. Merge comandasNumbersOverride if provided
    if (opts.comandasNumbersOverride) {
      datos = { ...datos, comandasNumbers: opts.comandasNumbersOverride };
      datos = aplicarComandaNumeroDisplay(datos);
    }

    // 5. Generate full HTML
    const { html, heightPx } = generarHtmlComanda({ datos, plantilla, serverOrigin });

    // 6. Open print window (80mm thermal receipt optimized)
    const printWin = window.open('', '_blank', 'width=320,height=600');
    if (!printWin) {
      console.error('[comandaPrintWeb] Could not open print window (popup blocked?)');
      alert('No se pudo abrir la ventana de impresión. Permite ventanas emergentes para este sitio.');
      return null;
    }

    printWin.document.write(html);
    printWin.document.close();

    // Wait for images to load, then print
    const images = printWin.document.querySelectorAll('img');
    const imagePromises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    });

    Promise.all(imagePromises).then(() => {
      setTimeout(() => {
        try { printWin.print(); } catch {}
      }, 150);
    });

    // Fallback: print after delay
    setTimeout(() => {
      try { printWin.print(); } catch {}
    }, 800);

    return true;
  } catch (err) {
    console.error('[comandaPrintWeb] Error printing comanda:', err);
    return null;
  }
}

/**
 * Maps a ticket object (from aprobacion/PPA) to datos format for printing.
 * Handles flat structure from backend and nested objects from populate.
 */
function mapearTicketADatos(ticket) {
  const comandasNumbers = ticket.comandasNumbers || [];
  const comandaNumeroDisplay = formatComandasNumbersLabel(comandasNumbers)
    || (ticket.ticketNumber ? `#${ticket.ticketNumber}` : '');

  return {
    comandaNumero: ticket.ticketNumber || ticket.comandaNumero || null,
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
    tipoPago: ticket.metodoPago || ticket.tipoPago || 'Pendiente',
    observaciones: ticket.observaciones || '',
    productos: (ticket.platos || []).map(p => {
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
    }),
    subtotal: ticket.subtotal || 0,
    igv: ticket.igv || 0,
    total: ticket.total || 0,
    cliente: {
      nombre: ticket.cliente?.nombre || ticket.nombreCliente || ticket.clienteNombre || 'Invitado',
      dni: ticket.cliente?.dni || ticket.dniCliente || ticket.clienteDni || '',
    },
    voucherId: ticket.voucherId || ticket.boucher?.voucherId || null,
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
  // Try to resolve comandaId from multiple possible fields
  const comandaId = ticket.comandasIds?.[0]
    || ticket.comandaId
    || (Array.isArray(ticket.comandas) && ticket.comandas.length > 0
      ? (typeof ticket.comandas[0] === 'string' ? ticket.comandas[0] : ticket.comandas[0]?._id)
      : null)
    || (ticket.comanda?._id)
    || null;

  // Map ticket data to print format
  const datosFromTicket = mapearTicketADatos(ticket);

  if (!comandaId) {
    // No comandaId — print directly with ticket data (no API fetch needed)
    return imprimirComandaWeb({
      ...opts,
      comandaId: null,
      datos: datosFromTicket,
      comandasNumbersOverride: ticket.comandasNumbers || opts.comandasNumbersOverride || null,
    });
  }

  // Try fetching from API for richer data (boucher, populated fields)
  try {
    return await imprimirComandaWeb({
      ...opts,
      comandaId,
      datos: null, // Let imprimirComandaWeb fetch
      comandasNumbersOverride: ticket.comandasNumbers || opts.comandasNumbersOverride || null,
    });
  } catch (err) {
    // Fallback: print with ticket data directly
    console.warn('[comandaPrintWeb] Failed to fetch ticket-imprimible, using ticket data:', err);
    return imprimirComandaWeb({
      ...opts,
      comandaId: null,
      datos: datosFromTicket,
      comandasNumbersOverride: ticket.comandasNumbers || opts.comandasNumbersOverride || null,
    });
  }
}