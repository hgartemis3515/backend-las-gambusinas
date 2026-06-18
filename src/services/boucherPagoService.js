/**
 * Servicio de pago de bouchers — totales y pagos parciales por plato.
 * Mantiene compatibilidad con pago total (sin platosSeleccionados).
 */
const moment = require('moment-timezone');
const comandaModel = require('../database/models/comanda.model');
const pedidoModel = require('../database/models/pedido.model');
const mesasModel = require('../database/models/mesas.model');
const configuracionRepository = require('../repository/configuracion.repository');
const calculosPrecios = require('../utils/calculosPrecios');
const { crearBoucher } = require('../repository/boucher.repository');
const {
  validarComandasParaPagar,
  validarPlatosSeleccionadosParaPago,
  marcarPlatosComoPagados,
  getComandasParaPagar,
  calcularTotalPendienteMesa,
  recalcularEstadoMesa,
  ensurePlatosPopulated,
} = require('../repository/comanda.repository');

function esPagoParcial(platosSeleccionados) {
  return Array.isArray(platosSeleccionados) && platosSeleccionados.length > 0;
}

function buildPlatoBoucherLine(comanda, platoItem, index, cantidad) {
  const plato = platoItem.plato || platoItem;
  const precio = plato.precio || platoItem.precio || 0;
  const qty = cantidad || comanda.cantidades?.[index] || 1;
  const subtotal = precio * qty;

  const cocineroInfo = platoItem.procesadoPor || platoItem.procesandoPor || null;
  const cocineroNombre = cocineroInfo?.alias || cocineroInfo?.nombre || null;
  const cocineroId = cocineroInfo?.cocineroId || null;

  let tiempoPreparacion = null;
  const tiempoInicio = platoItem.tiempos?.en_espera;
  const tiempoFin = platoItem.tiempos?.recoger;
  if (tiempoInicio && tiempoFin) {
    const diffMs = new Date(tiempoFin).getTime() - new Date(tiempoInicio).getTime();
    if (diffMs > 0) {
      const segundos = Math.floor(diffMs / 1000);
      const minutos = Math.floor(segundos / 60);
      const seg = segundos % 60;
      tiempoPreparacion = `${minutos.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
    }
  }

 return {
    plato: plato._id || plato,
    platoId: platoItem.platoId || plato.id || null,
    platoSubdocId: platoItem._id?.toString?.() || null,
    nombre: plato.nombre || 'Plato',
    precio,
    cantidad: qty,
    subtotal,
    comandaNumber: comanda.comandaNumber || null,
    complementosSeleccionados: platoItem.complementosSeleccionados || [],
    // NUEVO: Tipo de servicio (Mesa vs Para llevar)
    tipoServicio: platoItem.tipoServicio || 'mesa',
    cocinero: cocineroNombre,
    cocineroId,
    tiempoPreparacion,
  };
}

function calcularTotalesConDescuentos(comandasValidas, platosParaBoucher, configMoneda, esParcial) {
  const subtotal = platosParaBoucher.reduce((sum, p) => sum + (p.subtotal || 0), 0);
  const totales = calculosPrecios.calcularTotales(subtotal, configMoneda);
  const totalSinDescuento = totales.total;
  let totalConDescuento = totalSinDescuento;
  let montoDescuento = 0;
  const descuentos = [];

  comandasValidas.forEach((comanda) => {
    if (comanda.descuento > 0) {
      descuentos.push({
        comandaNumber: comanda.comandaNumber || null,
        porcentaje: comanda.descuento,
        motivo: comanda.motivoDescuento || 'Sin motivo',
        monto: comanda.montoDescuento || 0,
        aplicadoPor: comanda.descuentoAplicadoPor || null,
      });
    }
  });

  if (!esParcial) {
    const comandasConDescuento = comandasValidas.filter((c) => c.descuento > 0);
    if (comandasConDescuento.length > 0) {
      const totalDesdeComandas = comandasValidas.reduce((sum, c) => {
        if (c.descuento > 0 && c.totalCalculado != null) {
          return sum + c.totalCalculado;
        }
        return (
          sum +
          (c.platos || []).reduce((s, p, i) => {
            if (!p.eliminado && (p.estado || '').toLowerCase() !== 'pagado') {
              const precio = p.plato?.precio || p.precio || 0;
              const cant = c.cantidades?.[i] || 1;
              return s + precio * cant;
            }
            return s;
          }, 0) *
            (1 + (configMoneda.igvPorcentaje || 18) / 100)
        );
      }, 0);
      totalConDescuento = Math.max(0, Number(totalDesdeComandas.toFixed(2)));
      montoDescuento = Number((totalSinDescuento - totalConDescuento).toFixed(2));
    }
  } else {
    // Prorratear descuento por subtotal de platos seleccionados vs comanda completa
    let descuentoAplicado = 0;
    for (const comanda of comandasValidas) {
      if (!(comanda.descuento > 0 && comanda.montoDescuento > 0)) continue;
      const subComandaTotal = (comanda.platos || []).reduce((s, p, i) => {
        if (!p.eliminado && !p.anulado) {
          const precio = p.plato?.precio || p.precio || 0;
          return s + precio * (comanda.cantidades?.[i] || 1);
        }
        return s;
      }, 0);
      if (subComandaTotal <= 0) continue;
      const subSeleccion = platosParaBoucher
        .filter((p) => p.comandaNumber === comanda.comandaNumber)
        .reduce((s, p) => s + (p.subtotal || 0), 0);
      const ratio = Math.min(1, subSeleccion / subComandaTotal);
      descuentoAplicado += (comanda.montoDescuento || 0) * ratio;
    }
    if (descuentoAplicado > 0) {
      montoDescuento = Number(descuentoAplicado.toFixed(2));
      totalConDescuento = Math.max(0, Number((totalSinDescuento - montoDescuento).toFixed(2)));
    }
  }

  return {
    subtotal: totales.subtotalSinIGV,
    igv: totales.igv,
    total: totalConDescuento,
    totalSinDescuento,
    montoDescuento,
    totalConDescuento,
    descuentos,
  };
}

async function cerrarPedidoSiMesaCompleta(mesaId, boucherId, clienteId, mesaPagadaCompletamente) {
  if (!mesaPagadaCompletamente) return;
  try {
    const pedidoAbierto = await pedidoModel.findOne({
      mesa: mesaId,
      estado: 'abierto',
      isActive: true,
    });
    if (pedidoAbierto) {
      pedidoAbierto.estado = 'pagado';
      pedidoAbierto.fechaPago = new Date();
      pedidoAbierto.boucher = boucherId;
      if (clienteId) pedidoAbierto.cliente = clienteId;
      await pedidoAbierto.save();
    }
  } catch (err) {
    console.error('⚠️ Error al cerrar pedido (no crítico):', err.message);
  }
}

async function construirResumenPago(mesaId) {
  const comandas = await getComandasParaPagar(mesaId);
  const totalPendiente = await calcularTotalPendienteMesa(mesaId);
  const mesa = await mesasModel.findById(mesaId).select('nummesa estado nombreCombinado').lean();
  return {
    mesaPagadaCompletamente: comandas.length === 0,
    totalPendiente,
    cantidadComandasPendientes: comandas.length,
    comandas,
    mesa: mesa
      ? { _id: mesa._id, nummesa: mesa.nummesa, estado: mesa.estado, nombreCombinado: mesa.nombreCombinado }
      : { _id: mesaId },
  };
}

/**
 * Procesa pago total o parcial.
 * @param {object} params
 * @returns {Promise<{ boucher: object, resumen: object }>}
 */
async function procesarPagoBoucher(params) {
  const { mesaId, mozoId, clienteId, comandasIds, platosSeleccionados, observaciones } = params;
  const parcial = esPagoParcial(platosSeleccionados);
  const configMoneda = await configuracionRepository.obtenerConfiguracionMoneda();
  const zona = configMoneda.zonaHoraria || 'America/Lima';
  const ahoraPago = moment().tz(zona).toDate();

  let comandasValidas;
  let platosParaBoucher;
  let comandasIdsAfectadas;
  let seleccionesParaMarcar;

  if (parcial) {
    const validacion = await validarPlatosSeleccionadosParaPago(mesaId, platosSeleccionados);
    comandasValidas = validacion.comandas;
    platosParaBoucher = validacion.platosParaBoucher;
    comandasIdsAfectadas = validacion.comandasIds;
    seleccionesParaMarcar = validacion.selecciones;
  } else {
    comandasValidas = await validarComandasParaPagar(mesaId, comandasIds);
    comandasIdsAfectadas = comandasIds;
    platosParaBoucher = [];
    seleccionesParaMarcar = [];

    comandasValidas.forEach((comanda) => {
      (comanda.platos || []).forEach((platoItem, index) => {
        if (!platoItem.eliminado && !platoItem.anulado) {
          const estado = (platoItem.estado || '').toLowerCase();
          if (estado === 'entregado' || estado === 'pagado') {
            const cantidad = comanda.cantidades?.[index] || 1;
            platosParaBoucher.push(buildPlatoBoucherLine(comanda, platoItem, index, cantidad));
            if (estado === 'entregado') {
              seleccionesParaMarcar.push({
                comandaId: comanda._id.toString(),
                platoIndex: index,
                cantidad,
              });
            }
          }
        }
      });
    });
  }

  if (platosParaBoucher.length === 0) {
    const err = new Error('No hay platos válidos para crear el boucher');
    err.statusCode = 400;
    throw err;
  }

  const totales = calcularTotalesConDescuentos(
    comandasValidas,
    platosParaBoucher,
    configMoneda,
    parcial
  );

  const primeraComanda = comandasValidas[0];
  const mesa = primeraComanda.mesas;
  const mozo = primeraComanda.mozos;

  let pedidoId = primeraComanda?.pedido || null;
  if (!pedidoId) {
    const pedidoAbierto = await pedidoModel
      .findOne({ mesa: mesaId, estado: 'abierto', isActive: true })
      .select('_id')
      .lean();
    pedidoId = pedidoAbierto?._id || null;
  }

  const boucherData = {
    mesa: mesaId,
    numMesa: mesa?.nummesa || null,
    mozo: mozoId,
    nombreMozo: mozo?.name || 'N/A',
    cliente: clienteId || null,
    pedido: pedidoId,
    comandas: comandasIdsAfectadas,
    comandasNumbers: [...new Set(comandasValidas.map((c) => c.comandaNumber).filter((n) => n != null))],
    platos: platosParaBoucher,
    subtotal: totales.subtotal,
    igv: totales.igv,
    total: totales.total,
    totalSinDescuento: totales.totalSinDescuento,
    montoDescuento: totales.montoDescuento,
    totalConDescuento: totales.totalConDescuento,
    descuentos: totales.descuentos,
    observaciones: observaciones || '',
    fechaPedido: primeraComanda?.createdAt || primeraComanda?.fecha || new Date(),
    fechaPago: ahoraPago,
    fechaPagoString: moment(ahoraPago).tz(zona).format('DD/MM/YYYY HH:mm:ss'),
    esPagoParcial: parcial,
    configuracionIGV: {
      igvPorcentaje: configMoneda.igvPorcentaje,
      preciosIncluyenIGV: configMoneda.preciosIncluyenIGV,
      nombreImpuesto: configMoneda.nombreImpuestoPrincipal || 'IGV',
      moneda: configMoneda.moneda,
      simboloMoneda: configMoneda.simboloMoneda,
    },
  };

  const boucherCreado = await crearBoucher(boucherData);

  const comandasCompletamentePagadas = await marcarPlatosComoPagados(
    seleccionesParaMarcar,
    { clienteId, ahoraPago }
  );

  // Pago total legacy: marcar comandas completas si no es parcial
  if (!parcial) {
    await Promise.all(
      comandasIdsAfectadas.map(async (comandaId) => {
        await comandaModel.findByIdAndUpdate(comandaId, {
          status: 'pagado',
          IsActive: false,
          cliente: clienteId || null,
          tiempoPagado: ahoraPago,
        });
      })
    );
  } else {
    for (const comandaId of comandasCompletamentePagadas) {
      await comandaModel.findByIdAndUpdate(comandaId, {
        status: 'pagado',
        IsActive: false,
        cliente: clienteId || null,
        tiempoPagado: ahoraPago,
      });
    }
    // Comandas con pago parcial pendiente: mantener status entregado
    for (const comanda of comandasValidas) {
      const cid = comanda._id.toString();
      if (!comandasCompletamentePagadas.includes(cid)) {
        await comandaModel.findByIdAndUpdate(comanda._id, {
          status: 'entregado',
          IsActive: true,
          cliente: clienteId || null,
        });
      }
    }
  }

  await recalcularEstadoMesa(mesaId);

  const resumen = await construirResumenPago(mesaId);
  await cerrarPedidoSiMesaCompleta(
    mesaId,
    boucherCreado._id,
    clienteId,
    resumen.mesaPagadaCompletamente
  );

  if (resumen.mesaPagadaCompletamente) {
    await mesasModel.findByIdAndUpdate(mesaId, { estado: 'pagado' });
    resumen.mesa.estado = 'pagado';
  }

  return { boucher: boucherCreado, resumen };
}

module.exports = {
  procesarPagoBoucher,
  esPagoParcial,
  construirResumenPago,
};
