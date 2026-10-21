/**
 * Fotos de cada letra del ticket al quitar platos.
 * Baja que deja platos: +2 (eliminados, luego restantes).
 * Descuento: +1, ticket normal de lo que queda.
 */
const moment = require('moment-timezone');
const { bumpRevisionTicketOnDoc } = require('./revisionTicket');
const { letraRevisionTicket } = require('./comandasNumbers');
const { historialCuentaComoEliminacion, unidadesEliminadasHistorial } = require('./bajaCantidadPlato');

function numeroVisible(c) {
  if (!c) return null;
  const dia = c.numeroComandaDia;
  if (dia != null && dia !== '' && Number.isFinite(Number(dia))) return Number(dia);
  if (c.comandaNumber != null && c.comandaNumber !== '') return Number(c.comandaNumber);
  return null;
}

function letreroDe(comanda, revision) {
  const n = numeroVisible(comanda);
  if (n == null) return '#—';
  return `#${n}${letraRevisionTicket(revision)}`;
}

function nombreMozo(c) {
  const mozo = c?.mozos;
  if (mozo && typeof mozo === 'object' && mozo.name) return String(mozo.name).trim();
  return String(c?.mozoNombre || '').trim();
}

function textoMesa(c) {
  if (c?.sinMesa) return 'Sin mesa';
  const m = c?.mesas;
  if (m && typeof m === 'object') {
    if (m.nombreCombinado) return String(m.nombreCombinado);
    if (m.nummesa != null && m.nummesa !== '') return String(m.nummesa);
  }
  if (c?.mesaNumero != null && c.mesaNumero !== '') return String(c.mesaNumero);
  return '—';
}

function clienteDe(c) {
  return String(
    c?.clienteNombre
    || c?.clienteNombreParaLlevar
    || (c?.cliente && typeof c.cliente === 'object' ? c.cliente.nombre : '')
    || ''
  ).trim();
}

function nombreDeLinea(linea, comanda, index) {
  const plato = linea?.plato && typeof linea.plato === 'object' ? linea.plato : {};
  const candidatos = [linea?.nombreCocinaPedido, linea?.nombre, plato.nombre, plato.nombreCocina];
  for (const c of candidatos) {
    const s = String(c || '').trim();
    if (s && s !== 'Plato' && s !== 'Plato desconocido' && s !== 'Sin nombre') return s;
  }
  const hist = comanda?.historialPlatos || [];
  for (let i = hist.length - 1; i >= 0; i -= 1) {
    const h = hist[i];
    if (!h || Number(h.lineaIndex) !== index) continue;
    const s = String(h.nombreOriginal || '').trim();
    if (s) return s;
  }
  return 'Plato';
}

function precioDeLinea(linea) {
  if (linea?.precioUnitario != null && Number.isFinite(Number(linea.precioUnitario))) {
    return Number(linea.precioUnitario);
  }
  const plato = linea?.plato && typeof linea.plato === 'object' ? linea.plato : {};
  const n = Number(linea?.precio ?? plato.precio);
  return Number.isFinite(n) ? n : 0;
}

function productoLinea({ nombre, cantidad, precio, tipoServicio, guarnicionesCambio, tachada, usuario, motivo }) {
  const cant = Math.max(1, Math.floor(Number(cantidad) || 1));
  const unit = Number(precio) || 0;
  const base = {
    nombre: nombre || 'Plato',
    cantidad: cant,
    precio: unit,
    subtotal: Number((cant * unit).toFixed(2)),
    tipoServicio: tipoServicio || 'mesa',
    guarnicionesCambio: guarnicionesCambio || null,
  };
  if (!tachada) return base;
  return {
    ...base,
    eliminado: true,
    lineaAnulada: {
      usuario: String(usuario || '').trim() || '—',
      motivo: String(motivo || '').trim() || '—',
    },
  };
}

function indiceDeHistorial(comanda, h) {
  const raw = h?.lineaIndex;
  const n = Number(raw);
  const total = (comanda?.platos || []).length;
  if (raw != null && raw !== '' && Number.isInteger(n) && n >= 0 && n < total) return n;
  const pid = h?.platoId != null ? String(h.platoId) : '';
  const nombre = String(h?.nombreOriginal || '').trim();
  const candidatos = [];
  (comanda.platos || []).forEach((p, i) => {
    if (!p) return;
    const pPid = p.platoId != null ? String(p.platoId) : '';
    if (pid && pPid === pid) candidatos.push(i);
    else if (!pid && nombre && nombreDeLinea(p, comanda, i) === nombre) candidatos.push(i);
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

function parcialesPorLinea(comanda) {
  const map = new Map();
  for (const h of comanda?.historialPlatos || []) {
    if (!historialCuentaComoEliminacion(h)) continue;
    const final = Number(h.cantidadFinal);
    if (!(Number.isFinite(final) && final > 0)) continue;
    const idx = indiceDeHistorial(comanda, h);
    if (idx == null) continue;
    const prev = map.get(idx) || { qty: 0, usuario: '', motivo: '' };
    prev.qty += unidadesEliminadasHistorial(h);
    if (h.usuarioNombre) prev.usuario = String(h.usuarioNombre).trim();
    if (h.motivo) prev.motivo = String(h.motivo).trim();
    map.set(idx, prev);
  }
  return map;
}

function usuarioLinea(linea, parcial) {
  return String(linea?.eliminadoPorNombre || parcial?.usuario || '').trim();
}

function motivoLinea(linea, parcial) {
  return String(linea?.eliminadoRazon || linea?.anuladoRazon || parcial?.motivo || '').trim();
}

function lineasVivas(comanda) {
  const out = [];
  (comanda?.platos || []).forEach((linea, index) => {
    if (!linea || linea.eliminado === true || linea.anulado === true) return;
    const cant = Math.max(1, Math.floor(Number(comanda.cantidades?.[index] || linea.cantidad) || 1));
    out.push(productoLinea({
      nombre: nombreDeLinea(linea, comanda, index),
      cantidad: cant,
      precio: precioDeLinea(linea),
      tipoServicio: linea.tipoServicio,
      guarnicionesCambio: linea.guarnicionesCambio,
      tachada: false,
    }));
  });
  return out;
}

function lineasEliminadas(comanda) {
  const parciales = parcialesPorLinea(comanda);
  const out = [];
  (comanda?.platos || []).forEach((linea, index) => {
    if (!linea) return;
    const parcial = parciales.get(index);
    const qtyLinea = Math.max(1, Math.floor(Number(comanda.cantidades?.[index] || linea.cantidad) || 1));
    const nombre = nombreDeLinea(linea, comanda, index);
    const precio = precioDeLinea(linea);
    const anulada = linea.eliminado === true || linea.anulado === true;
    if (anulada) {
      out.push(productoLinea({
        nombre,
        cantidad: qtyLinea + (parcial?.qty || 0),
        precio,
        tipoServicio: linea.tipoServicio,
        guarnicionesCambio: linea.guarnicionesCambio,
        tachada: true,
        usuario: usuarioLinea(linea, parcial),
        motivo: motivoLinea(linea, parcial),
      }));
      return;
    }
    if (parcial?.qty > 0) {
      out.push(productoLinea({
        nombre,
        cantidad: parcial.qty,
        precio,
        tipoServicio: linea.tipoServicio,
        tachada: true,
        usuario: parcial.usuario,
        motivo: parcial.motivo,
      }));
    }
  });
  return out;
}

function baseDatos(comanda, productos, sinTotal) {
  const rev = Math.max(0, Math.floor(Number(comanda?.revisionTicket) || 0));
  const desc = sinTotal ? 0 : (Number(comanda?.montoDescuento) || 0);
  const motivo = sinTotal ? '' : String(comanda?.motivoDescuento || '').trim();
  const bruto = (productos || []).reduce((s, p) => {
    if (p?.lineaAnulada) return s;
    return s + (Number(p.subtotal) || 0);
  }, 0);
  const reserva = comanda?.origenCreacion === 'reserva'
    || comanda?.programadaPorReserva === true
    || !!comanda?.origenReserva;
  const fechaRaw = comanda?.fechaAtencion || comanda?.origenReserva?.fechaReserva;
  return {
    comandaNumeroDisplay: letreroDe(comanda, rev),
    productos: productos || [],
    mozo: nombreMozo(comanda),
    clienteNombre: clienteDe(comanda),
    mesa: textoMesa(comanda),
    sinMesa: comanda?.sinMesa === true,
    area: comanda?.areaNombre || (comanda?.mesas && comanda.mesas.area && comanda.mesas.area.nombre) || '',
    fechaPedido: comanda?.createdAt || null,
    montoDescuento: desc,
    descuentos: motivo ? [{ motivo }] : [],
    total: sinTotal ? 0 : Math.max(0, Number((bruto - desc).toFixed(2))),
    sinTotal: sinTotal === true,
    anulacion: null,
    esPrueba: comanda?.esPrueba === true,
    reserva,
    fechaAtencion: fechaRaw
      ? moment(fechaRaw).tz('America/Lima').format('DD/MM/YYYY HH:mm')
      : '',
  };
}

function datosTicketVivos(comanda) {
  return baseDatos(comanda, lineasVivas(comanda), false);
}

function datosTicketEliminados(comanda) {
  return baseDatos(comanda, lineasEliminadas(comanda), true);
}

function yaTiene(comanda, rev) {
  return (comanda?.historialLetrasTicket || []).some((h) => Number(h?.revision) === Number(rev));
}

function pushFoto(comanda, datos, revision, tipo, usuario, motivo) {
  if (!Array.isArray(comanda.historialLetrasTicket)) comanda.historialLetrasTicket = [];
  const sinTotal = tipo === 'eliminados';
  const letrero = letreroDe(comanda, revision);
  const datosOut = {
    ...(datos || {}),
    comandaNumeroDisplay: letrero,
    sinTotal,
    anulacion: null,
  };
  if (sinTotal) {
    datosOut.montoDescuento = 0;
    datosOut.descuentos = [];
    datosOut.total = 0;
  }
  const foto = {
    revision,
    tipo,
    letrero,
    sinTotal,
    total: sinTotal ? null : (Number.isFinite(Number(datosOut.total)) ? Number(datosOut.total) : null),
    creadoAt: new Date(),
    usuarioNombre: usuario ? String(usuario) : null,
    motivo: motivo ? String(motivo) : null,
    datos: datosOut,
  };
  comanda.historialLetrasTicket.push(foto);
  if (typeof comanda.markModified === 'function') comanda.markModified('historialLetrasTicket');
  return foto;
}

function asegurarFoto(comanda, datos, { usuario, motivo } = {}) {
  if (!datos) return null;
  const rev = Math.max(0, Math.floor(Number(comanda?.revisionTicket) || 0));
  if (yaTiene(comanda, rev)) return null;
  const tipo = rev === 0 ? 'original' : 'restantes';
  return pushFoto(comanda, datos, rev, tipo, usuario, motivo);
}

/** Baja parcial. Null si no queda ningún plato vivo (el caller sube 1 letra). */
function registrarParejaBaja(comanda, { datosAntes, usuario, motivo } = {}) {
  const quedan = (comanda?.platos || []).some((p) => p && p.eliminado !== true && p.anulado !== true);
  if (!quedan) return null;
  asegurarFoto(comanda, datosAntes, { usuario, motivo });
  const revElim = bumpRevisionTicketOnDoc(comanda);
  const eliminados = pushFoto(comanda, datosTicketEliminados(comanda), revElim, 'eliminados', usuario, motivo);
  const revRest = bumpRevisionTicketOnDoc(comanda);
  const restantes = pushFoto(comanda, datosTicketVivos(comanda), revRest, 'restantes', usuario, motivo);
  return { eliminados, restantes };
}

/** Marcado en Configuración → Cocina. Si falta el campo, queda activo. */
async function bajaPlatoLetrasActiva() {
  try {
    const configuracionRepository = require('../repository/configuracion.repository');
    const cfg = await configuracionRepository.obtenerConfiguracion();
    return cfg?.cocina?.ticketsBajaPlatoLetras !== false;
  } catch (err) {
    return true;
  }
}

/** Descuento o quitar descuento: una letra, ticket de lo que queda. datosAntes es el estado previo. */
function registrarLetraRestantes(comanda, { datosAntes, usuario, motivo } = {}) {
  asegurarFoto(comanda, datosAntes, { usuario, motivo });
  const rev = bumpRevisionTicketOnDoc(comanda);
  return pushFoto(comanda, datosTicketVivos(comanda), rev, 'restantes', usuario, motivo);
}

module.exports = {
  datosTicketVivos,
  datosTicketEliminados,
  registrarParejaBaja,
  registrarLetraRestantes,
  bajaPlatoLetrasActiva,
};
