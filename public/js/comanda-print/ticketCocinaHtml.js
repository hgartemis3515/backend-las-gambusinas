/**
 * Ticket de cocina compacto 80 mm: mismo cuerpo que el ticket mozo,
 * sin título de restaurante, cuadrado a la izquierda de cada plato.
 */
import { envolverHtmlBoucherTicket, EPSON_TM_M30II_RECEIPT } from './comandaHtml.js';

const CUADRO_PX = 12;

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function letraRevisionTicket(n) {
  const k = Math.floor(Number(n) || 0);
  if (k < 1) return '';
  let x = k + 1;
  let s = '';
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function ordenarNumerosLetrero(nums) {
  const list = [...nums].filter((n) => Number.isFinite(n));
  if (list.length <= 1) return list;
  const max = Math.max(...list);
  return [max, ...list.filter((n) => n !== max).sort((a, b) => b - a)];
}

export function formatLetreroTicket(comandas) {
  const byN = new Map();
  for (const c of comandas || []) {
    const dia = c?.numeroComandaDia ?? c?.numComanda;
    const hist = c?.comandaNumber;
    const n = (dia != null && dia !== '' && Number.isFinite(Number(dia)))
      ? Number(dia)
      : (hist != null && hist !== '' ? Number(hist) : NaN);
    if (!Number.isFinite(n)) continue;
    const rev = Math.max(0, Math.floor(Number(c.revisionTicket) || 0));
    const prev = byN.get(n);
    if (prev == null || rev > prev) byN.set(n, rev);
  }
  const nums = ordenarNumerosLetrero([...byN.keys()]);
  if (!nums.length) return '';
  return nums.map((n) => `#${n}${letraRevisionTicket(byN.get(n))}`).join('+');
}

function simboloDe(datos) {
  const m = String(datos?.moneda || 'PEN').toUpperCase();
  if (m === 'USD') return '$';
  return 'S/.';
}

function fmt(n) {
  return Number(n || 0).toFixed(2);
}

function nombreProducto(p) {
  return p?.nombre || p?.nombreComercial || p?.plato?.nombre || 'Plato';
}

function montoLinea(p) {
  if (p?.subtotal != null && Number.isFinite(Number(p.subtotal))) return Number(p.subtotal);
  const cant = Number(p?.cantidad) || 1;
  const unit = Number(p?.precio ?? p?.precioUnitario) || 0;
  return cant * unit;
}

function celdaMeta(label, value) {
  return `<td style="width:50%;padding:2px 3px;border:1px solid #000;vertical-align:top;">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(label)}</div>
    <div style="font-size:12px;font-weight:700;line-height:1.2;">${escapeHtml(value || '—')}</div>
  </td>`;
}

function textoMesaTicket(mesa) {
  const s = String(mesa ?? '').trim();
  if (!s || s === '—' || s === '-') return '—';
  if (/^sin mesa$/i.test(s)) return s;
  if (/^m/i.test(s)) return s;
  return `M${s}`;
}

function celdaLlena(value) {
  const texto = String(value || '—');
  const n = texto.length;
  const size = n <= 4 ? 32 : n <= 9 ? 24 : n <= 16 ? 18 : 14;
  return `<td style="width:50%;height:52px;padding:0 2px;border:1px solid #000;vertical-align:middle;text-align:center;">
    <div style="font-size:${size}px;font-weight:800;line-height:1.05;text-align:center;word-break:break-word;">${escapeHtml(texto)}</div>
  </td>`;
}

function filtrarProductos(datos, { filtrarComandaNumero, filtrarComandaId } = {}) {
  let productos = (datos?.productos || []).filter((p) => p && !p.eliminado && !p.anulado);
  const num = filtrarComandaNumero != null && filtrarComandaNumero !== ''
    ? Number(filtrarComandaNumero)
    : null;
  const id = filtrarComandaId ? String(filtrarComandaId) : '';
  if (Number.isFinite(num) && productos.some((p) => p.comandaNumber != null)) {
    return productos.filter((p) => Number(p.comandaNumber) === num);
  }
  if (id && productos.some((p) => p.comandaId)) {
    return productos.filter((p) => String(p.comandaId) === id);
  }
  return productos;
}

export function filtrarDatosTicketCocina(datos, filtro = {}) {
  const productos = filtrarProductos(datos, filtro);
  const bruto = productos.reduce((s, p) => s + montoLinea(p), 0);
  const desc = Number(datos?.montoDescuento) || 0;
  const descAjustado = productos.length && (datos?.productos || []).length
    && productos.length < (datos.productos || []).length
    ? 0
    : desc;
  let letrero = datos?.comandaNumeroDisplay || '';
  if (filtro.filtrarComandaNumero != null && filtro.filtrarComandaNumero !== '') {
    const n = Number(filtro.filtrarComandaNumero);
    const rev = Number(filtro.revisionTicket) || 0;
    if (Number.isFinite(n)) letrero = `#${n}${letraRevisionTicket(rev)}`;
  }
  return {
    ...datos,
    productos,
    comandaNumeroDisplay: letrero,
    subtotal: bruto,
    montoDescuento: descAjustado,
    total: Math.max(0, bruto - descAjustado),
  };
}

/**
 * @returns {{ html: string, heightPx: number }}
 */
export function generarHtmlTicketCocina({ datos, cocina = true }) {
  const d = datos || {};
  const esCocina = cocina !== false;
  const productos = (d.productos || []).filter((p) => p && !p.eliminado && !p.anulado);
  const simbolo = simboloDe(d);
  const letrero = d.comandaNumeroDisplay
    || (d.comandaNumero != null ? `#${d.comandaNumero}` : '#—');
  const fecha = d.fechaPedido
    ? new Date(d.fechaPedido).toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';

  let filas = '';
  let bruto = 0;
  for (const p of productos) {
    const cant = Number(p.cantidad) || 1;
    const unit = Number(p.precio ?? p.precioUnitario) || 0;
    const line = montoLinea(p);
    bruto += line;
    const cuadro = esCocina
      ? `<td style="width:18px;padding:3px 2px;vertical-align:middle;">
        <span style="display:inline-block;width:${CUADRO_PX}px;height:${CUADRO_PX}px;border:1.6px solid #000;box-sizing:border-box;"></span>
      </td>`
      : '';
    filas += `<tr class="prod-item">${cuadro}
      <td style="padding:3px 2px;text-align:center;font-weight:700;width:22px;">${cant}</td>
      <td style="padding:3px 2px;">${escapeHtml(nombreProducto(p))}</td>
      <td style="padding:3px 2px;text-align:right;white-space:nowrap;">${fmt(unit)}</td>
      <td style="padding:3px 2px;text-align:right;white-space:nowrap;font-weight:700;">${fmt(line)}</td>
    </tr>`;
  }

  const desc = Number(d.montoDescuento) || 0;
  const neto = Number.isFinite(Number(d.total)) && Number(d.total) > 0
    ? Number(d.total)
    : Math.max(0, bruto - desc);

  let html = '';
  html += `<div style="text-align:left;font-size:14px;font-weight:800;letter-spacing:1px;line-height:1.1;">${esCocina ? 'COCINA' : 'CAJA'}</div>`;
  html += `<div style="text-align:center;font-size:22px;font-weight:800;letter-spacing:0.5px;line-height:1.15;padding:4px 0 6px;">${escapeHtml(letrero)}</div>`;
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
    <tr>${celdaLlena(String(d.mozo || '—').toLocaleUpperCase('es-PE'))}${celdaLlena(textoMesaTicket(d.mesa).toLocaleUpperCase('es-PE'))}</tr>
    <tr>${celdaMeta('Fecha', fecha)}${celdaMeta('Área', d.area)}</tr>
  </table>`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr>
        ${esCocina ? '<th style="width:18px;border-bottom:1px solid #000;"></th>' : ''}
        <th style="text-align:center;border-bottom:1px solid #000;padding:2px;">Cant</th>
        <th style="text-align:left;border-bottom:1px solid #000;padding:2px;">Plato</th>
        <th style="text-align:right;border-bottom:1px solid #000;padding:2px;">P.Unit</th>
        <th style="text-align:right;border-bottom:1px solid #000;padding:2px;">Total</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>`;

  if (desc > 0) {
    const mot = d.descuentos?.[0]?.motivo ? ` (${escapeHtml(d.descuentos[0].motivo)})` : '';
    html += `<div style="text-align:right;padding:4px 0 0;font-size:11px;">Descuento${mot}: -${escapeHtml(simbolo)}${fmt(desc)}</div>`;
  }
  html += `<div style="text-align:right;font-size:14px;font-weight:800;padding:4px 0 2px;border-top:1px solid #000;margin-top:4px;">TOTAL ${escapeHtml(simbolo)}${fmt(neto)}</div>`;

  const heightPx = 220 + productos.length * 28;
  const wrapOpts = { fontSizeBase: 11, lineHeightBase: 14, pageHeightPx: heightPx, title: 'Ticket cocina' };
  const full = envolverHtmlBoucherTicket(html, wrapOpts);
  return { html: full, heightPx, htmlInner: html };
}

export const TICKET_COCINA_PAPER = EPSON_TM_M30II_RECEIPT;
