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
 * @param {string} url
 * @returns {Promise<any>}
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
 * @param {string} [opts.serverOrigin] - Origin for resolving logo URLs (defaults to window.location.origin)
 * @param {Function} [opts.fetchJson] - Optional fetch wrapper that handles auth tokens etc.
 * @param {Array<number|string>|null} [opts.comandasNumbersOverride] - Override comandasNumbers on the datos
 * @returns {Promise<true|null>} true on success, null on error
 */
export async function imprimirComandaWeb(opts = {}) {
  try {
    const fetchJson = opts.fetchJson || defaultFetchJson;
    const serverOrigin = opts.serverOrigin || window.location.origin;

    // 1. Get datos — either provided or fetched
    let datos = opts.datos || null;
    if (!datos && opts.comandaId) {
      datos = await fetchJson(`/api/comanda/${opts.comandaId}/ticket-imprimible`);
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
      // Re-apply display with the override
      datos = aplicarComandaNumeroDisplay(datos);
    }

    // 5. Generate full HTML
    const { html } = generarHtmlComanda({ datos, plantilla, serverOrigin });

    // 6. Open print window
    const printWin = window.open('', '_blank', 'width=320,height=600');
    if (!printWin) {
      console.error('[comandaPrintWeb] Could not open print window (popup blocked?)');
      return null;
    }

    printWin.document.write(html);
    printWin.document.close();

    // Wait for images to load, then print
    printWin.onload = () => {
      setTimeout(() => {
        printWin.print();
      }, 200);
    };

    // Fallback: if onload already fired or doesn't fire, print after a short delay
    setTimeout(() => {
      try {
        printWin.print();
      } catch {
        // Already printed or window closed
      }
    }, 600);

    return true;
  } catch (err) {
    console.error('[comandaPrintWeb] Error printing comanda:', err);
    return null;
  }
}

/**
 * Convenience function for cocina/comandas.html dashboard.
 * Resolves comandaId from a ticket object and delegates to imprimirComandaWeb.
 *
 * @param {Object} ticket - Ticket object from the cocina dashboard
 * @param {string|null} [ticket.comandasIds] - Array of comanda IDs (uses first one)
 * @param {string|null} [ticket.comandaId] - Single comanda ID (fallback)
 * @param {Array} [ticket.comandasNumbers] - Comanda numbers to override display label
 * @param {Object} opts - Same options as imprimirComandaWeb (fetchJson, plantilla, serverOrigin, etc.)
 * @returns {Promise<true|null>}
 */
export async function imprimirComandaDesdeTicket(ticket, opts = {}) {
  // Resolver comandaId desde múltiples campos posibles del ticket
  const comandaId = ticket.comandasIds?.[0]
    || ticket.comandaId
    || ticket.comandas?.[0]
    || (ticket.comanda?._id)
    || null;

  if (!comandaId) {
    console.warn('[comandaPrintWeb] No comandaId found in ticket, printing with ticket data only');
    // Fallback: intentamos imprimir con datos del ticket directamente (sin fetch)
    return imprimirComandaWeb({
      ...opts,
      comandaId: null,
      datos: {
        comandaNumero: ticket.ticketNumber || ticket.comandasNumbers?.[0] || '?',
        comandasNumbers: ticket.comandasNumbers || [],
        comandaNumeroDisplay: ticket.comandasNumbers?.length > 1
          ? ticket.comandasNumbers.filter((n) => n != null).sort((a, b) => a - b).map((n) => `#${n}`).join('+')
          : (ticket.ticketNumber ? `#${ticket.ticketNumber}` : (ticket.comandasNumbers?.[0] ? `#${ticket.comandasNumbers[0]}` : '')),
        fechaPedido: ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('es-PE') : '',
        mesa: ticket.numMesa || ticket.mesaNumero || '?',
        mozo: ticket.nombreMozo || ticket.mozoNombre || '—',
        area: ticket.area || '',
        moneda: ticket.moneda === 'USD' ? 'USD' : 'Soles',
        tipoPago: ticket.metodoPagoLabel || ticket.metodoPago || 'Pendiente',
        observaciones: ticket.observaciones || '',
        productos: (ticket.platos || []).map(p => ({
          nombre: p.nombre || 'Plato',
          cantidad: p.cantidad || 1,
          precio: p.precio || 0,
          subtotal: p.subtotal || (p.precio || 0) * (p.cantidad || 1),
          tipoServicio: p.tipoServicio || 'mesa',
          complementos: (p.complementosSeleccionados || []).map(c => ({ grupo: c.grupo, opcion: c.opcion })),
          notaEspecial: p.notaEspecial || '',
          paraLlevar: p.tipoServicio === 'para_llevar',
        })),
        subtotal: ticket.subtotal || 0,
        total: ticket.total || 0,
        cliente: {
          nombre: ticket.cliente?.nombre || ticket.nombreCliente || 'Invitado',
          dni: ticket.cliente?.dni || ticket.dniCliente || '',
        },
      },
      comandasNumbersOverride: ticket.comandasNumbers || opts.comandasNumbersOverride || null,
    });
  }

  return imprimirComandaWeb({
    ...opts,
    comandaId,
    comandasNumbersOverride: ticket.comandasNumbers || opts.comandasNumbersOverride || null,
  });
}