/**
 * comandaHtml.js — Generador de HTML 80mm para Ticket de Comanda (NO comprobante fiscal)
 *
 * Formato profesional de ticket térmico 80mm (Epson TM-m30II).
 * Basado en el diseño de boucherHtml.js del app de mozos, adaptado para comandas.
 *
 * Incluye: Encabezado (logo + nombre + eslogan), título COMANDA,
 * datos del pedido (número, fecha, mesa, mozo, área, tipo de pago),
 * tabla de productos (Producto | Cant. | P.Unit | Total) con complementos y notas,
 * subtotal, IGV, total, tipo de moneda, datos del cliente, observaciones.
 *
 * Excluye intencionalmente: RUC, dirección fiscal, serie/correlativo,
 * número de voucher, fecha de pago, URL SUNAT, bloque promo/QR.
 */

// ─── Constants ────────────────────────────────────────────────────────

const PUNTOS_ANCHO = 226;
const BOUCHER_PAPER_MM = 80;
const pxToMm = (px) => (px * 25.4) / 72;

const ALTURA_BASE_PX = 280;
const ALTURA_POR_FILA_PX = 38;
const ALTURA_POR_COMPLEMENTO_PX = 18;
const ALTURA_POR_NOTA_PX = 16;
const PADDING_INFERIOR_PX = 20;

// ─── Inlined: resolveLogoUrl ──────────────────────────────────────────

/**
 * Resolves a logo URL to an absolute URL.
 */
export function resolveLogoUrl(logo, serverOrigin) {
  if (!logo) return '';
  const s = String(logo).trim();
  if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://')) {
    return s;
  }
  if (!serverOrigin) return s;
  if (s.startsWith('/')) return `${serverOrigin}${s}`;
  return `${serverOrigin}/${s}`;
}

// ─── Inlined: envolverHtmlBoucherTicket ───────────────────────────────

/**
 * Wraps inner HTML into a full 80mm thermal-ticket page with print styles.
 */
export function envolverHtmlBoucherTicket(html, { fontSizeBase, lineHeightBase, pageHeightPx }) {
  const w = PUNTOS_ANCHO;
  const h = pageHeightPx ? Math.ceil(pageHeightPx) : null;
  const pageSize = h
    ? `${BOUCHER_PAPER_MM}mm ${pxToMm(h).toFixed(2)}mm`
    : `${BOUCHER_PAPER_MM}mm auto`;
  const bodyHeight = h ? `${h}px` : 'auto';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=${w}, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><title>Comanda</title>
<style>
@page{size:${pageSize};margin:0;}
@media print{
  @page{size:${pageSize};margin:0;}
  html,body{width:${w}px !important;max-width:${w}px !important;margin:0 !important;overflow:hidden !important;}
  body{height:${bodyHeight} !important;padding:4px !important;}
}
*{box-sizing:border-box;}
html{width:${w}px;max-width:${w}px;margin:0;padding:0;overflow:hidden;}
body{margin:0;padding:4px;width:100%;box-sizing:border-box;height:${bodyHeight};max-width:100%;overflow:hidden;font-family:Arial,Helvetica,sans-serif;font-size:${fontSizeBase}px;line-height:${lineHeightBase}px;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
#ticket-root{width:100%;}
table{width:100%;}
.ticket-block{width:100%;}
</style></head><body><div id="ticket-root" class="ticket-block">${html}</div></body></html>`;
}

// ─── Labels ───────────────────────────────────────────────────────────

const ETIQUETAS_DEFAULT_COMANDA = {
  comandaNumero: 'Comanda',
  fechaPedido: 'Fecha',
  mesa: 'Mesa',
  mozo: 'Mozo',
  area: 'Área',
  moneda: 'Moneda',
  tipoPago: 'Pago',
  subtotal: 'Subtotal',
  igv: 'IGV',
  total: 'TOTAL',
  cliente: 'Cliente',
  dni: 'DNI',
  observaciones: 'Obs',
  paraLlevar: 'PARA LLEVAR',
};

// ─── Helpers ──────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function divider(gap = 6) {
  return `<div style="border-top:1px dashed #333;margin:${gap}px 0;width:100%;"></div>`;
}

function filaMeta(etiqueta, valor) {
  return `<tr><td style="width:35%;vertical-align:top;font-weight:600;color:#222;padding:1px 4px 1px 0;font-size:12px;">${etiqueta}</td>` +
    `<td style="vertical-align:top;padding:1px 0;font-size:12px;word-break:break-word;">${valor}</td></tr>`;
}

function formatFecha(date) {
  try {
    const d = new Date(date);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const seg = String(d.getSeconds()).padStart(2, '0');
    return `${dia}/${mes}/${anio} ${hora}:${min}:${seg}`;
  } catch {
    return String(date || '');
  }
}

function getSimboloMoneda(moneda) {
  if (moneda === 'USD') return '$';
  return 'S/.';
}

function getLabelMetodoPago(metodoPago) {
  if (!metodoPago) return 'Pendiente';
  const m = String(metodoPago).toLowerCase();
  if (m === 'efectivo') return 'Efectivo';
  if (m === 'digital') return 'YAPE/PLIN';
  if (m === 'tarjeta') return 'CRÉDITO/DÉBITO';
  if (m === 'pago_adelantado' || m === 'adelantado') return 'Pago Adelantado';
  return metodoPago;
}

/**
 * Estima la altura en px del ticket para calcular el tamaño de página.
 */
function estimarAltura(datos, bloques) {
  let h = ALTURA_BASE_PX;
  const productos = datos.productos || [];
  for (const prod of productos) {
    h += ALTURA_POR_FILA_PX;
    if (prod.complementos?.length) {
      h += prod.complementos.length * ALTURA_POR_COMPLEMENTO_PX;
    }
    if (prod.notaEspecial) {
      h += ALTURA_POR_NOTA_PX;
    }
  }
  if (bloques.mostrarTotales !== false && datos.igv) {
    h += 40;
  }
  if (datos.cliente?.nombre || datos.cliente?.dni) {
    h += 30;
  }
  if (datos.observaciones) {
    h += 24;
  }
  return Math.max(ALTURA_BASE_PX, Math.ceil(h) + PADDING_INFERIOR_PX);
}

// ─── Public functions ─────────────────────────────────────────────────

/**
 * Formatea números de comanda para el campo visible del ticket.
 */
export function formatComandasNumbersLabel(comandasNumbers) {
  const nums = [...new Set(
    (comandasNumbers || [])
      .map((n) => (n != null && n !== '' ? Number(n) : NaN))
      .filter((n) => !Number.isNaN(n))
  )].sort((a, b) => a - b);

  if (nums.length === 0) return '';
  return nums.map((n) => `#${n}`).join('+');
}

/**
 * Aplica display agrupado sobre payload ticket-imprimible o mapComandaATicket.
 */
export function aplicarComandaNumeroDisplay(datos) {
  const label = formatComandasNumbersLabel(datos.comandasNumbers);
  if (label) {
    return { ...datos, comandaNumeroDisplay: label };
  }
  const fallback = datos.comandaNumero != null ? `#${datos.comandaNumero}` : '';
  return { ...datos, comandaNumeroDisplay: fallback };
}

/**
 * Genera el HTML completo de una comanda térmica 80mm.
 * Formato profesional al estilo boucher, adaptado para comanda.
 *
 * @param {Object} params
 * @param {Object} params.datos   - Datos mapeados de la comanda
 * @param {Object} params.plantilla - Plantilla de comanda desde GET /comanda-plantilla
 * @param {string} params.serverOrigin - URL base del servidor (para resolver logo)
 * @returns {{ htmlInner: string, heightPx: number, wrapOpts: object, html: string }}
 */
export function generarHtmlComanda({ datos, plantilla, serverOrigin }) {
  const p = plantilla || {};
  const vis = p.visibilidad || {};
  const bloques = p.bloques || {};
  const esp = p.espaciado || {};
  const etiquetas = { ...ETIQUETAS_DEFAULT_COMANDA, ...(p.etiquetas || {}) };
  const mensajes = p.mensajes || {};

  const lineHeight = esp.lineHeight || 16;
  const fontSize = esp.tamanoFuente || 12;
  const dividerGap = esp.espacioDivider || 6;

  const mostrarPrecios = bloques.mostrarPrecios !== false;
  const mostrarTotal = bloques.mostrarTotal !== false;
  const mostrarIGV = bloques.mostrarIGV !== false && datos.igv > 0;
  const simbolo = getSimboloMoneda(datos.moneda);

  // Logo
  const logoUrl = resolveLogoUrl(p.logo || '', serverOrigin);
  const mostrarLogo = !!logoUrl;
  const mostrarNombre = vis.nombre !== false;
  const mostrarEslogan = vis.eslogan !== false;

  let html = '';

  // === ENCABEZADO ===
  if (bloques.mostrarEncabezado !== false) {
    html += '<div style="text-align:center;width:100%;">';
    if (mostrarLogo) {
      html += `<img src="${escapeHtml(logoUrl)}" style="max-width:100%;max-height:64px;object-fit:contain;margin:0 auto 4px;display:block;" alt="Logo">`;
    }
    if (mostrarNombre) {
      html += `<div style="font-size:16px;font-weight:800;line-height:1.2;">${escapeHtml(p.restaurante?.nombre || 'LAS GAMBUSINAS')}</div>`;
    }
    if (mostrarEslogan && p.restaurante?.eslogan) {
      html += `<div style="font-size:10px;font-weight:500;color:#444;line-height:1.3;">${escapeHtml(p.restaurante.eslogan)}</div>`;
    }
    html += '</div>';
    html += divider(dividerGap);

    // Título COMANDA
    html += `<div style="text-align:center;font-weight:700;font-size:14px;line-height:1.2;width:100%;letter-spacing:2px;">${escapeHtml(p.encabezado?.titulo || 'COMANDA')}</div>`;
    html += divider(dividerGap);
  }

  // === DATOS COMANDA ===
  if (bloques.mostrarDatosComanda !== false) {
    html += '<table style="width:100%;font-size:12px;border-collapse:collapse;table-layout:fixed;">';

    if (vis.comandaNumero !== false) {
      const numeroEtiqueta = datos.comandaNumeroDisplay
        || formatComandasNumbersLabel(datos.comandasNumbers)
        || (datos.comandaNumero != null ? `#${datos.comandaNumero}` : '');
      if (numeroEtiqueta) {
        html += filaMeta(`${etiquetas.comandaNumero}:`, `<strong>${escapeHtml(numeroEtiqueta)}</strong>`);
      }
    }
    if (vis.fechaPedido !== false && datos.fechaPedido) {
      html += filaMeta(`${etiquetas.fechaPedido}:`, escapeHtml(formatFecha(datos.fechaPedido)));
    }
    if (vis.mesa !== false && datos.mesa) {
      html += filaMeta(`${etiquetas.mesa}:`, `<strong>${escapeHtml(String(datos.mesa))}</strong>`);
    }
    if (vis.mozo !== false && datos.mozo) {
      html += filaMeta(`${etiquetas.mozo}:`, escapeHtml(datos.mozo));
    }
    if (vis.area !== false && datos.area) {
      html += filaMeta(`${etiquetas.area}:`, escapeHtml(datos.area));
    }
    if (vis.tipoPago !== false && datos.tipoPago) {
      html += filaMeta(`${etiquetas.tipoPago}:`, escapeHtml(getLabelMetodoPago(datos.tipoPago)));
    }
    if (datos.voucherId) {
      html += filaMeta('Voucher:', escapeHtml(String(datos.voucherId)));
    }
    html += '</table>';
    html += divider(dividerGap);
  }

  // === DETALLE PRODUCTOS ===
  if (bloques.mostrarDetalleProductos !== false && datos.productos?.length) {
    const tblStyle = 'width:100%;font-size:12px;border-collapse:collapse;table-layout:fixed;';
    html += `<table style="${tblStyle}">`;
    html += '<thead><tr style="font-weight:700;border-bottom:1px solid #000;">';
    html += '<th style="text-align:left;width:48%;font-size:12px;">Producto</th>';
    html += '<th style="text-align:center;width:12%;font-size:12px;">Cant.</th>';
    if (mostrarPrecios) {
      html += '<th style="text-align:right;width:20%;font-size:12px;">P.Unit</th>';
      html += '<th style="text-align:right;width:20%;font-size:12px;">Total</th>';
    }
    html += '</tr></thead><tbody>';

    for (const prod of datos.productos) {
      const nombre = escapeHtml(prod.nombre || 'Plato');
      const marcadorPL = prod.paraLlevar ? ` <span style="font-weight:700;">[${escapeHtml(etiquetas.paraLlevar)}]</span>` : '';
      const cantidad = prod.cantidad || 1;
      const precio = prod.precio || 0;
      const subtotalProd = prod.subtotal || (precio * cantidad);

      html += '<tr>';
      html += `<td style="vertical-align:top;font-size:12px;overflow-wrap:break-word;padding:2px 4px 2px 0;">${nombre}${marcadorPL}</td>`;
      html += `<td style="text-align:center;vertical-align:top;font-size:12px;padding:2px 0;">${cantidad}</td>`;
      if (mostrarPrecios) {
        html += `<td style="text-align:right;vertical-align:top;font-size:12px;padding:2px 0;white-space:nowrap;">${precio.toFixed(2)}</td>`;
        html += `<td style="text-align:right;vertical-align:top;font-size:12px;padding:2px 0;white-space:nowrap;">${subtotalProd.toFixed(2)}</td>`;
      }
      html += '</tr>';

      // Complementos
      if (prod.complementos?.length) {
        for (const c of prod.complementos) {
          html += '<tr style="font-size:11px;color:#555;">';
          html += `<td colspan="${mostrarPrecios ? 4 : 2}" style="padding:0 0 2px 8px;">`;
          html += `└ ${escapeHtml(c.grupo || '')}: ${escapeHtml(c.opcion || '')}`;
          if (c.precio > 0) {
            html += ` (+${simbolo}${c.precio.toFixed(2)})`;
          }
          html += '</td></tr>';
        }
      }

      // Nota especial
      if (prod.notaEspecial) {
        html += `<tr style="font-size:10px;font-style:italic;color:#666;">`;
        html += `<td colspan="${mostrarPrecios ? 4 : 2}" style="padding:0 0 2px 8px;">📌 ${escapeHtml(prod.notaEspecial)}</td>`;
        html += '</tr>';
      }
    }
    html += '</tbody></table>';
    html += divider(dividerGap);
  }

  // === TOTALES ===
  if (mostrarTotal && bloques.mostrarTotales !== false) {
    html += '<div style="text-align:right;width:100%;font-size:12px;">';
    const subtotalFinal = datos.subtotal || 0;
    const igvFinal = datos.igv || 0;
    const totalFinal = datos.total || 0;

    if (mostrarPrecios && subtotalFinal > 0) {
      html += `<div style="padding:1px 0;">Subtotal: <span style="font-weight:500;">${simbolo}${subtotalFinal.toFixed(2)}</span></div>`;
    }
    if (mostrarIGV && igvFinal > 0) {
      html += `<div style="padding:1px 0;">IGV (18%): <span style="font-weight:500;">${simbolo}${igvFinal.toFixed(2)}</span></div>`;
    }
    html += `<div style="font-size:14px;font-weight:700;border-top:2px solid #000;padding-top:4px;margin-top:4px;">${escapeHtml(etiquetas.total)}: ${simbolo}${totalFinal.toFixed(2)}</div>`;
    html += '</div>';
    html += divider(dividerGap);
  }

  // === DATOS CLIENTE ===
  if (bloques.mostrarDatosCliente !== false) {
    const clienteName = datos.cliente?.nombre || '';
    const clienteDni = datos.cliente?.dni || '';
    if (clienteName || clienteDni) {
      html += `<div style="border-top:1px dashed #333;margin:${dividerGap}px 0;width:100%;"></div>`;
      html += '<table style="width:100%;font-size:12px;border-collapse:collapse;table-layout:fixed;">';
      if (vis.cliente !== false && clienteName) {
        html += filaMeta(`${etiquetas.cliente}:`, escapeHtml(clienteName));
      }
      if (vis.dniCliente !== false && clienteDni) {
        html += filaMeta(`${etiquetas.dni}:`, escapeHtml(clienteDni));
      }
      html += '</table>';
    }
  }

  // === OBSERVACIONES ===
  if (bloques.mostrarObservaciones !== false && datos.observaciones) {
    html += `<div style="margin-top:4px;font-size:11px;color:#555;width:100%;">`;
    html += `<strong>${etiquetas.observaciones}:</strong> ${escapeHtml(datos.observaciones)}`;
    html += '</div>';
  }

  // === PIE ===
  if (mensajes.pie) {
    html += `<div style="text-align:center;font-size:10px;color:#999;margin-top:8px;">${escapeHtml(mensajes.pie)}</div>`;
  }

  const heightPx = estimarAltura(datos, bloques);
  const wrapOpts = { fontSizeBase: fontSize, lineHeightBase: lineHeight, pageHeightPx: heightPx };

  return {
    htmlInner: html,
    heightPx,
    wrapOpts,
    html: envolverHtmlBoucherTicket(html, wrapOpts),
  };
}

/**
 * Mapa datos reales de comanda + boucher → formato ticket para plantilla comanda.
 * Se usa tanto en App Mozos como en el dashboard.
 */
export function mapComandaATicket(comanda, boucherOpcional, config = {}) {
  const comandasNumbers = boucherOpcional?.comandasNumbers
    || (comanda.comandaNumber ? [comanda.comandaNumber] : []);
  return {
    comandaNumero: comanda.comandaNumber || comanda.comandaNumber || null,
    comandasNumbers,
    fechaPedido: comanda.createdAt || comanda.fechaPedido || new Date(),
    mesa: comanda.mesaNumero || comanda.mesas?.nummesa || (typeof comanda.mesa === 'object' ? comanda.mesa?.nummesa : comanda.mesa) || null,
    mozo: comanda.mozoNombre || comanda.mozos?.name || (typeof comanda.mozo === 'object' ? comanda.mozo?.name : comanda.mozo) || null,
    area: comanda.areaNombre || comanda.mesas?.area?.nombre || null,
    moneda: boucherOpcional?.moneda || config.moneda || 'PEN',
    tipoPago: boucherOpcional?.metodoPagoLabel || boucherOpcional?.metodoPago || 'Pendiente',
    observaciones: comanda.observaciones || '',
    productos: (comanda.platos || [])
      .filter(p => !p.eliminado && !p.anulado)
      .map(p => ({
        nombre: p.plato?.nombre || p.nombre || 'Plato',
        cantidad: p.cantidad || 1,
        precio: p.plato?.precio || p.precio || 0,
        subtotal: (p.plato?.precio || p.precio || 0) * (p.cantidad || 1),
        tipoServicio: p.tipoServicio || 'mesa',
        complementos: (p.complementosSeleccionados || []).map(c => ({
          grupo: c.grupo,
          opcion: c.opcion,
          precio: c.precio || 0,
        })),
        notaEspecial: p.notaEspecial || '',
        paraLlevar: p.tipoServicio === 'para_llevar',
      })),
    subtotal: boucherOpcional?.subtotal ?? comanda.subtotal ?? 0,
    igv: boucherOpcional?.igv ?? comanda.igv ?? 0,
    total: boucherOpcional?.total ?? comanda.total ?? comanda.precioTotal ?? 0,
    cliente: {
      nombre: comanda.clienteNombre || comanda.cliente?.nombre || (typeof boucherOpcional?.cliente === 'object' ? boucherOpcional.cliente?.nombre : null) || 'Invitado',
      dni: comanda.cliente?.dni || (typeof boucherOpcional?.cliente === 'object' ? boucherOpcional.cliente?.dni : null) || '',
    },
    voucherId: boucherOpcional?.voucherId || boucherOpcional?.boucherNumber || null,
  };
}