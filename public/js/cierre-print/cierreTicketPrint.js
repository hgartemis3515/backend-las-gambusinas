/**
 * Ticket térmico 80mm de cierre de caja (estilo comanda).
 */
import {
  envolverHtmlBoucherTicket,
  EPSON_TM_M30II_RECEIPT,
} from '../comanda-print/comandaHtml.js';

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

function fmtFecha(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(d);
  }
}

function fmtDia(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('es-PE');
  } catch {
    return String(d);
  }
}

function money(n) {
  return Number(n || 0).toFixed(2);
}

export function generarHtmlCierreTicket(datos) {
  const fontSize = 11;
  const fontSizeSm = 10;
  const fontTitle = 14;
  const lineas = Array.isArray(datos?.comandas) ? datos.comandas : [];
  const simbolo = 'S/.';

  let html = '';
  html += `<div style="text-align:center;font-weight:700;font-size:${fontTitle}px;letter-spacing:0.4px;">CIERRE DE CAJA</div>`;
  html += `<div style="text-align:center;font-size:${fontSizeSm}px;margin-top:2px;">San Benito</div>`;
  html += divider(8);
  html += `<div style="font-size:${fontSizeSm}px;">`;
  html += `<div>Cierre: ${escapeHtml(fmtFecha(datos.fechaCierre))}</div>`;
  html += `<div>Período: ${escapeHtml(fmtDia(datos.periodoInicio))} - ${escapeHtml(fmtDia(datos.periodoFin))}</div>`;
  if (datos.usuarioAdmin) {
    html += `<div>Usuario: ${escapeHtml(datos.usuarioAdmin)}</div>`;
  }
  html += `</div>`;
  html += divider(8);

  const thNum = 'text-align:right;padding:0 0 3px 2px;font-weight:700;';
  const tdNum = 'padding:1px 0 1px 2px;text-align:right;vertical-align:top;white-space:nowrap;';
  html += `<table style="width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed;">`;
  html += `<thead><tr>
    <th style="text-align:left;padding:0 0 3px 0;width:16%;">Cmd</th>
    <th style="text-align:left;padding:0 0 3px 2px;width:16%;">Mesa</th>
    <th style="${thNum}width:22%;">Subt.</th>
    <th style="${thNum}width:22%;">Desc.</th>
    <th style="${thNum}width:24%;">Total</th>
  </tr></thead><tbody>`;

  for (const c of lineas) {
    const subt = Number(c.bruto ?? c.subtotal) || 0;
    const desc = Number(c.descuento) || 0;
    const tot = Number(c.total) || 0;
    html += `<tr>
      <td style="padding:1px 0;vertical-align:top;">#${escapeHtml(c.comandaNumber ?? '')}</td>
      <td style="padding:1px 2px;vertical-align:top;">${escapeHtml(c.mesa || '—')}</td>
      <td style="${tdNum}">${money(subt)}</td>
      <td style="${tdNum}">${desc > 0 ? '-' + money(desc) : '—'}</td>
      <td style="${tdNum}font-weight:600;">${money(tot)}</td>
    </tr>`;
  }
  html += `</tbody></table>`;
  html += divider(8);

  const total = Number(datos.total) || 0;

  html += `<div style="text-align:right;font-size:${fontSize}px;">`;
  html += `<div style="font-size:13px;font-weight:700;border-top:2px solid #000;padding-top:4px;margin-top:4px;">TOTAL: ${simbolo}${money(total)}</div>`;
  html += `</div>`;
  html += `<div style="text-align:center;font-size:9px;margin-top:8px;">${lineas.length} comanda${lineas.length === 1 ? '' : 's'}</div>`;

  const pageHeightPx = 280 + lineas.length * 18 + 80;
  return envolverHtmlBoucherTicket(html, {
    fontSizeBase: fontSize,
    lineHeightBase: 14,
    pageHeightPx,
  });
}

function abrirImpresion(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,width=400,height=700');
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error('El navegador bloqueó la ventana de impresión');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function imprimirCierreTicket(cierreId, opts = {}) {
  if (!cierreId) throw new Error('Falta el id de cierre');
  const fetchJson = opts.fetchJson || (async (endpoint) => {
    if (typeof window.apiGet === 'function') return window.apiGet(endpoint);
    const res = await fetch('/api' + endpoint);
    if (!res.ok) throw new Error('No se pudo cargar el cierre');
    return res.json();
  });
  const res = await fetchJson('/cierre-caja/' + cierreId + '/ticket-imprimible');
  if (!res || res.success === false || !res.datos) {
    throw new Error(res?.message || res?.error || 'No se pudo armar el ticket de cierre');
  }
  const html = generarHtmlCierreTicket(res.datos);
  abrirImpresion(html);
  return { ok: true };
}

if (typeof window !== 'undefined') {
  window.imprimirCierreTicket = imprimirCierreTicket;
  window.EPSON_TM_M30II_RECEIPT = window.EPSON_TM_M30II_RECEIPT || EPSON_TM_M30II_RECEIPT;
}
