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

function htmlCambioGuarnicion(plato) {
  const g = plato?.guarnicionesCambio;
  const salieron = Array.isArray(g?.salieron) ? g.salieron : [];
  const entraron = Array.isArray(g?.entraron) ? g.entraron : [];
  const n = Math.max(salieron.length, entraron.length);
  const partes = [];
  for (let i = 0; i < n; i += 1) {
    const salio = String(salieron[i]?.opcion || salieron[i]?.nombre || '').trim();
    const entro = String(entraron[i]?.opcion || entraron[i]?.nombre || '').trim();
    if (!salio && !entro) continue;
    const izq = salio ? `<s>${escapeHtml(salio)}</s>` : '';
    const der = entro ? escapeHtml(entro) : '';
    partes.push(`${izq}${izq && der ? ' → ' : ''}${der}`);
  }
  if (!partes.length) return '';
  return `<div style="font-size:10px;font-weight:700;line-height:1.2;padding-top:1px;">${partes.join('<br/>')}</div>`;
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

export function tipoCuadroTicket(lineas, { sinMesa = false, reserva = false } = {}) {
  if (reserva) return 'Reserva';
  const tipos = (lineas || [])
    .filter((p) => p && p.eliminado !== true && p.anulado !== true)
    .map((p) => String(p.tipoServicio || 'mesa').toLowerCase());
  const hayExtra = tipos.some((t) => t === 'extra_llevar');
  const hayLlevar = tipos.some((t) => t === 'para_llevar');
  const hayMesa = tipos.some((t) => t !== 'para_llevar' && t !== 'extra_llevar');
  if (sinMesa || (tipos.length > 0 && hayLlevar && !hayMesa && !hayExtra)) return 'Para llevar';
  if (hayExtra) return 'Mesa extra llevar';
  return 'Para Mesa';
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

function textoNombre(v) {
  const s = String(v || '').trim();
  if (!s || s === 'Plato' || s === 'Plato desconocido' || s === 'Sin nombre') return '';
  return s;
}

function nombreProducto(p) {
  const plato = p?.plato && typeof p.plato === 'object' ? p.plato : {};
  return textoNombre(p?.nombreCocinaPedido)
    || textoNombre(p?.nombre)
    || textoNombre(p?.nombreComercial)
    || textoNombre(plato.nombreCocina)
    || textoNombre(plato.nombre)
    || 'Plato';
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

function celdaMozoTicket(mozo) {
  const texto = String(mozo || '—').toLocaleUpperCase('es-PE');
  const n = texto.length;
  const size = n <= 4 ? 26 : n <= 9 ? 20 : n <= 16 ? 15 : 12;
  return `<td style="width:50%;padding:0;border:1px solid #000;vertical-align:middle;text-align:center;">
    <div style="font-size:${size}px;font-weight:800;line-height:1;text-align:center;padding:1px 2px;word-break:break-word;">${escapeHtml(texto)}</div>
  </td>`;
}

/** El nombre del cliente ocupa el lugar del rótulo Tipo. 9px × 1.2 = 10.8px. */
function celdaTipoTicket(tipo, cliente) {
  const nombre = String(cliente || '').trim();
  const linea = nombre
    ? `<div style="font-size:10.8px;font-weight:700;line-height:1.15;letter-spacing:0.3px;padding-bottom:1px;">${escapeHtml(nombre)}</div>`
    : '';
  return `<td style="width:50%;padding:2px 3px;border:1px solid #000;vertical-align:top;">
    ${linea}
    <div style="font-size:12px;font-weight:700;line-height:1.2;">${escapeHtml(tipo || '—')}</div>
  </td>`;
}

function celdaLlena(value) {
  const texto = String(value || '—');
  const n = texto.length;
  const size = n <= 4 ? 26 : n <= 9 ? 20 : n <= 16 ? 15 : 12;
  return `<td style="width:50%;padding:0;border:1px solid #000;vertical-align:middle;text-align:center;">
    <div style="font-size:${size}px;font-weight:800;line-height:1;text-align:center;padding:1px 2px;word-break:break-word;">${escapeHtml(texto)}</div>
  </td>`;
}

function productoEnTicket(p) {
  return p && (p.lineaAnulada || (p.eliminado !== true && p.anulado !== true));
}

function raya(top) {
  return `<span style="position:absolute;left:0;right:0;top:${top};height:0;border-top:1.5px solid #000;"></span>`;
}

function htmlTachado(texto) {
  return `<span style="position:relative;display:inline-block;">${escapeHtml(texto)}${raya('46%')}</span>`;
}

function htmlTachadoDoble(texto) {
  return `<span style="position:relative;display:inline-block;white-space:nowrap;">${escapeHtml(texto)}${raya('34%')}${raya('64%')}</span>`;
}

function htmlTachadoTriple(texto) {
  return `<span style="position:relative;display:inline-block;white-space:nowrap;">${escapeHtml(texto)}${raya('22%')}${raya('50%')}${raya('78%')}</span>`;
}

function htmlNombreEliminado(nombre, usuario) {
  const quien = escapeHtml(usuario || '—');
  return `${htmlTachadoDoble(nombre)} <span style="font-size:11px;font-weight:900;">Anulado</span> <span style="font-weight:700;">${quien}</span>`;
}

function filtrarProductos(datos, { filtrarComandaNumero, filtrarComandaId } = {}) {
  const productos = (datos?.productos || []).filter(productoEnTicket);
  const num = filtrarComandaNumero != null && filtrarComandaNumero !== ''
    ? Number(filtrarComandaNumero)
    : null;
  const id = filtrarComandaId ? String(filtrarComandaId) : '';
  const hayId = Boolean(id) && productos.some((p) => p.comandaId);
  const hayNum = Number.isFinite(num) && productos.some((p) => p.comandaNumber != null);
  if (!hayId && !hayNum) return productos;
  return productos.filter((p) => {
    if (hayId && p.comandaId && String(p.comandaId) === id) return true;
    if (hayNum && p.comandaNumber != null && Number(p.comandaNumber) === num) return true;
    return false;
  });
}

export function filtrarDatosTicketCocina(datos, filtro = {}) {
  const productos = filtrarProductos(datos, filtro);
  const bruto = productos.reduce((s, p) => s + (p.lineaAnulada ? 0 : montoLinea(p)), 0);
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
  const productos = (d.productos || []).filter(productoEnTicket);
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
    if (!p.lineaAnulada) bruto += line;
    const cuadro = esCocina
      ? `<td style="width:18px;padding:3px 2px;vertical-align:middle;">
        <span style="display:inline-block;width:${CUADRO_PX}px;height:${CUADRO_PX}px;border:1.6px solid #000;box-sizing:border-box;"></span>
      </td>`
      : '';
    const marcaLinea = p.lineaAnulada || (!p.lineaAnulada && d.anulacion);
    const cambioG = esCocina ? htmlCambioGuarnicion(p) : '';
    const nombreBase = marcaLinea
      ? htmlNombreEliminado(nombreProducto(p), (p.lineaAnulada && p.lineaAnulada.usuario) || (d.anulacion && d.anulacion.usuario))
      : escapeHtml(nombreProducto(p));
    const nombreCelda = `${nombreBase}${cambioG}`;
    const unitHtml = marcaLinea ? htmlTachadoTriple(fmt(unit)) : fmt(unit);
    const lineHtml = marcaLinea ? htmlTachadoTriple(fmt(line)) : fmt(line);
    filas += `<tr class="prod-item">${cuadro}
      <td style="padding:3px 2px;text-align:center;font-weight:700;width:22px;">${cant}</td>
      <td style="padding:3px 2px;">${nombreCelda}</td>
      <td style="padding:3px 2px;text-align:right;white-space:nowrap;">${unitHtml}</td>
      <td style="padding:3px 2px;text-align:right;white-space:nowrap;font-weight:700;">${lineHtml}</td>
    </tr>`;
  }

  const desc = Number(d.montoDescuento) || 0;
  const neto = Number.isFinite(Number(d.total)) && Number(d.total) > 0
    ? Number(d.total)
    : Math.max(0, bruto - desc);

  let html = '';
  const esReserva = d.reserva === true;
  const tituloCanal = esReserva
    ? (esCocina ? 'COCINA RESERVA' : 'CAJA RESERVA')
    : (esCocina ? 'COCINA' : 'CAJA');
  html += `<div style="text-align:left;font-size:14px;font-weight:800;letter-spacing:1px;line-height:1.1;">${tituloCanal}</div>`;
  if (d.sinTotal === true || (d.anulacion && d.sinTotal !== true)) {
    html += '<div style="text-align:center;font-size:26px;font-weight:900;letter-spacing:1px;padding:6px 0 0;">ANULADO X</div>';
  }
  const clienteTicket = String(d.clienteNombre || d.cliente?.nombre || '').trim();
  const tipoTicket = tipoCuadroTicket(d.productos, {
    sinMesa: d.sinMesa === true || /^sin mesa$/i.test(String(d.mesa || '')),
    reserva: esReserva,
  });
  const fechaLabel = esReserva && d.fechaAtencion ? 'Atención' : 'Fecha';
  const fechaValor = esReserva && d.fechaAtencion ? d.fechaAtencion : fecha;
  html += `<div style="text-align:center;font-size:22px;font-weight:800;letter-spacing:0.5px;line-height:1.15;padding:4px 0 6px;">${escapeHtml(letrero)}</div>`;
  if (d.esPrueba === true) {
    html += '<div style="text-align:center;font-size:18px;font-weight:900;letter-spacing:2px;line-height:1.1;padding:0 0 6px;">PRUEBA</div>';
  }
  if (d.anulacion) {
    html += `<div style="text-align:center;font-size:13px;font-weight:700;line-height:1.35;padding:0 0 6px;">${escapeHtml(d.anulacion.usuario)}<br/>${escapeHtml(d.anulacion.hora)}<br/>${escapeHtml(d.anulacion.motivo)}</div>`;
  }
  html += `<table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
    <tr>${celdaMozoTicket(d.mozo)}${celdaLlena(textoMesaTicket(d.mesa).toLocaleUpperCase('es-PE'))}</tr>
    <tr>${celdaMeta(fechaLabel, fechaValor)}${celdaTipoTicket(tipoTicket, clienteTicket)}</tr>
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

  if (d.sinTotal !== true) {
    if (desc > 0) {
      const mot = d.descuentos?.[0]?.motivo ? ` (${escapeHtml(d.descuentos[0].motivo)})` : '';
      html += `<div style="text-align:right;padding:4px 0 0;font-size:11px;">Descuento${mot}: -${escapeHtml(simbolo)}${fmt(desc)}</div>`;
    }
    html += `<div style="text-align:right;font-size:14px;font-weight:800;padding:4px 0 2px;border-top:1px solid #000;margin-top:4px;">TOTAL ${escapeHtml(simbolo)}${fmt(neto)}</div>`;
  }

  const heightPx = 220 + productos.length * 28 + (d.esPrueba === true ? 24 : 0);
  const wrapOpts = { fontSizeBase: 11, lineHeightBase: 14, pageHeightPx: heightPx, title: 'Ticket cocina' };
  const full = envolverHtmlBoucherTicket(html, wrapOpts);
  return { html: full, heightPx, htmlInner: html };
}

export const TICKET_COCINA_PAPER = EPSON_TM_M30II_RECEIPT;
