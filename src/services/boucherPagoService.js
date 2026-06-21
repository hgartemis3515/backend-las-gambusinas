/**
 * Servicio de pago de bouchers — totales y pagos parciales por plato.
 * Mantiene compatibilidad con pago total (sin platosSeleccionados).
 */
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const comandaModel = require('../database/models/comanda.model');
const pedidoModel = require('../database/models/pedido.model');
const mesasModel = require('../database/models/mesas.model');
const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const configuracionRepository = require('../repository/configuracion.repository');
const calculosPrecios = require('../utils/calculosPrecios');
const { crearBoucher } = require('../repository/boucher.repository');
const ticketAprobacionRepository = require('../repository/ticketAprobacion.repository');
const {
  validarComandasParaPagar,
  validarPlatosSeleccionadosParaPago,
  marcarPlatosComoPagados,
  getComandasParaPagar,
  calcularTotalPendienteMesa,
  recalcularEstadoMesa,
  ensurePlatosPopulated,
} = require('../repository/comanda.repository');

const METODOS_PAGO_VALIDOS = ['efectivo', 'digital', 'tarjeta'];
const MONEDAS_VALIDAS = ['PEN', 'USD'];

const METODO_PAGO_LABELS = {
  efectivo: 'Efectivo',
  digital: 'YAPE/PLIN',
  tarjeta: 'CRÉDITO/DÉBITO',
};

function labelMetodoPago(metodo) {
  return METODO_PAGO_LABELS[metodo] || metodo || 'Efectivo';
}

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
    notaEspecial: platoItem.notaEspecial || '',
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

async function cerrarPedidoSiMesaCompleta(mesaId, boucherId, clienteId, mesaListaParaLiberar) {
  // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 1):
  // Solo cerrar el pedido cuando la mesa está LISTA PARA LIBERAR
  // (cobro completo + todos los tickets aprobados). Antes se cerraba con solo
  // 'mesaPagadaCompletamente' (cobro completo), lo que rompía el ciclo si
  // faltaba aprobación de cocina de un pago parcial.
  if (!mesaListaParaLiberar) return;
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

  // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 1):
  // Distinguir dos conceptos antes fusionados:
  //   - cobroCompleto: NO quedan platos 'entregado' en el ciclo → ya se cobró todo.
  //   - mesaListaParaLiberar: cobro completo Y no quedan tickets 'pendiente_aprobacion'
  //     en el ciclo actual Y no quedan platos 'pendiente' (esperando aprobación).
  // El frontend usa `cobroCompleto` para saber si quedan platos por cobrar,
  // y `mesaListaParaLiberar` para saber si la mesa puede pasar a 'pagado'.
  const platosEntregadosPendientes = (comandas || []).some((c) =>
    (c.platos || []).some((p) => {
      if (p.eliminado || p.anulado) return false;
      return (p.estado || '').toLowerCase() === 'entregado';
    })
  );
  const cobroCompleto = !platosEntregadosPendientes && totalPendiente <= 0;

  let mesaListaParaLiberar = false;
  if (cobroCompleto) {
    // Verificar que no queden platos en 'pendiente' (cobrados, esperando cocina)
    const platosPendientesAprobacion = (comandas || []).some((c) =>
      (c.platos || []).some((p) => {
        if (p.eliminado || p.anulado) return false;
        return (p.estado || '').toLowerCase() === 'pendiente';
      })
    );

    let ticketsPendientes = false;
    if (!platosPendientesAprobacion) {
      // Buscar tickets del ciclo (por mesa) aún pendientes de aprobación
      try {
        const inicioDia = moment().tz('America/Lima').startOf('day').toDate();
        const finDia = moment().tz('America/Lima').endOf('day').toDate();
        const count = await ticketAprobacionModel.countDocuments({
          mesa: mesaId,
          estado: 'pendiente_aprobacion',
          createdAt: { $gte: inicioDia, $lte: finDia },
          isActive: true,
        });
        ticketsPendientes = count > 0;
      } catch (e) {
        // Si la consulta falla, ser conservador: no liberar
        ticketsPendientes = true;
      }
    }
    mesaListaParaLiberar = !platosPendientesAprobacion && !ticketsPendientes;
  }

  return {
    // Alias legacy: mesaPagadaCompletamente = ya se cobró todo (no implica liberable)
    mesaPagadaCompletamente: cobroCompleto,
    cobroCompleto,
    mesaListaParaLiberar,
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
 * Soporta pagos adelantados (PPA): cuando esPagoAdelantado=true,
 * no exige platos en estado 'entregado' y marca el boucher como PPA.
 * @param {object} params
 * @returns {Promise<{ boucher: object, resumen: object }>}
 */
async function procesarPagoBoucher(params) {
  const {
    mesaId,
    mozoId,
    clienteId,
    comandasIds,
    platosSeleccionados,
    observaciones,
    metodoPago,
    montoRecibido,
    vuelto: vueltoCliente,
    moneda = 'PEN',
    tipoCambioUsd = null,
    esPagoAdelantado = false,
  } = params;
  const parcial = esPagoParcial(platosSeleccionados);
  const configMoneda = await configuracionRepository.obtenerConfiguracionMoneda();
  const zona = configMoneda.zonaHoraria || 'America/Lima';
  const ahoraPago = moment().tz(zona).toDate();

  // 🔥 Validar método de pago (requerido)
  if (!metodoPago || !METODOS_PAGO_VALIDOS.includes(metodoPago)) {
    const err = new Error('Debe indicar un método de pago válido (efectivo, digital, tarjeta)');
    err.statusCode = 400;
    throw err;
  }

  // 🔥 Validar moneda
  const monedaNormalizada = (moneda || 'PEN').toUpperCase();
  if (!MONEDAS_VALIDAS.includes(monedaNormalizada)) {
    const err = new Error('Moneda inválida. Debe ser PEN o USD');
    err.statusCode = 400;
    throw err;
  }

  // 🔥 Validar tipo de cambio si moneda es USD
  let tipoCambioFinal = null;
  if (monedaNormalizada === 'USD') {
    tipoCambioFinal =
      tipoCambioUsd != null ? Number(tipoCambioUsd) : configMoneda.tipoCambioUsd ?? null;
    if (!tipoCambioFinal || tipoCambioFinal <= 0) {
      const err = new Error(
        'No se puede cobrar en USD porque el tipo de cambio no está configurado en el sistema'
      );
      err.statusCode = 400;
      throw err;
    }
  }

  let comandasValidas;
  let platosParaBoucher;
  let comandasIdsAfectadas;
  let seleccionesParaMarcar;

  if (parcial) {
    const validacion = await validarPlatosSeleccionadosParaPago(mesaId, platosSeleccionados, esPagoAdelantado);
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

  // 🔥 Calcular total en la moneda seleccionada para validar efectivo y vuelto
  // totales.total está en PEN (moneda base del sistema)
  const totalBase = totales.total;
  let totalEnMonedaCobro = totalBase;
  if (monedaNormalizada === 'USD' && tipoCambioFinal) {
    totalEnMonedaCobro = Math.round((totalBase / tipoCambioFinal) * 100) / 100;
  }

  // 🔥 Validar y calcular datos de pago en efectivo
  let montoRecibidoFinal = null;
  let vueltoFinal = null;
  if (metodoPago === 'efectivo') {
    const montoRecibidoNum = Number(montoRecibido);
    if (montoRecibido == null || Number.isNaN(montoRecibidoNum)) {
      const err = new Error('Para pago en efectivo debe indicar el monto recibido');
      err.statusCode = 400;
      throw err;
    }
    if (montoRecibidoNum < totalEnMonedaCobro) {
      const err = new Error(
        `El monto recibido (${montoRecibidoNum}) no puede ser menor al total a cobrar (${totalEnMonedaCobro})`
      );
      err.statusCode = 400;
      throw err;
    }
    montoRecibidoFinal = Math.round(montoRecibidoNum * 100) / 100;
    // Backend recalcula el vuelto con el total real del boucher (autoritativo)
    const calc = calculosPrecios.calcularVuelto(totalEnMonedaCobro, montoRecibidoFinal);
    vueltoFinal = calc.vuelto;
    if (vueltoCliente != null) {
      const vueltoClienteNum = Number(vueltoCliente);
      if (!Number.isNaN(vueltoClienteNum) && Math.abs(vueltoClienteNum - vueltoFinal) > 0.02) {
        console.warn(
          `⚠️ [PAGO] Vuelto del frontend (${vueltoClienteNum}) difiere del backend (${vueltoFinal}); se usa backend`
        );
      }
    }
  }

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
    // 🔥 PAGO ADELANTADO (PPA)
    esPagoAdelantado: esPagoAdelantado || false,
    // 🔥 Datos de pago
    metodoPago,
    metodoPagoLabel: labelMetodoPago(metodoPago),
    montoRecibido: montoRecibidoFinal,
    vuelto: vueltoFinal,
    moneda: monedaNormalizada,
    tipoCambioUsd: monedaNormalizada === 'USD' ? tipoCambioFinal : null,
    configuracionIGV: {
      igvPorcentaje: configMoneda.igvPorcentaje,
      preciosIncluyenIGV: configMoneda.preciosIncluyenIGV,
      nombreImpuesto: configMoneda.nombreImpuestoPrincipal || 'IGV',
      moneda: configMoneda.moneda,
      simboloMoneda: configMoneda.simboloMoneda,
    },
  };

  const boucherCreado = await crearBoucher(boucherData);

  // 🔥 PAGO ADELANTADO (PPA): No marcar platos como pagados ni cambiar estados.
  // Los platos quedan en su estado actual y se crea un TPA por separado.
  // El TPA se encarga de la transición de estados (pedido → en_espera) al ser aprobado.
  let ticketAprobacionCreado = null;
  if (!esPagoAdelantado) {
    // PLAN_PLANTILLA_COMANDAS: en pago normal, los platos pasan a 'pendiente'
    // (NO a 'pagado') porque ahora requieren aprobación de cocina antes de
    // entrar al KDS. La mesa terminará en 'pendiente_aprobar', no 'pagado'.
    // El boucher se sigue creando idéntico (registro contable intacto).
    const comandasCompletamentePagadas = await marcarPlatosComoPagados(
      seleccionesParaMarcar,
      { clienteId, ahoraPago },
      { estadoPlato: 'pendiente' }
    );

    // PLAN_PLANTILLA_COMANDAS: tras pago normal, la comanda queda en status 'pendiente_aprobar'
    // hasta que cocina apruebe (entonces → 'pagado'). Antes se usaba 'entregado' (legacy),
    // pero eso confundía al dashboard comandas.html que mostraba "Entregado" en vez de
    // "Pendiente de aprobación".
    // Pago total legacy: marcar comandas completas si no es parcial
    if (!parcial) {
      await Promise.all(
        comandasIdsAfectadas.map(async (comandaId) => {
          await comandaModel.findByIdAndUpdate(comandaId, {
            status: 'pendiente_aprobar',
            IsActive: true,
            cliente: clienteId || null,
            tiempoPagado: ahoraPago,
          });
        })
      );
    } else {
      for (const comandaId of comandasCompletamentePagadas) {
        await comandaModel.findByIdAndUpdate(comandaId, {
          status: 'pendiente_aprobar',
          IsActive: true,
          cliente: clienteId || null,
          tiempoPagado: ahoraPago,
        });
      }
      // Comandas con pago parcial pendiente: seguir marcándolas como pendiente_aprobar
      // porque los platos pagados requieren aprobación de cocina igualmente.
      for (const comanda of comandasValidas) {
        const cid = comanda._id.toString();
        if (!comandasCompletamentePagadas.includes(cid)) {
          await comandaModel.findByIdAndUpdate(comanda._id, {
            status: 'pendiente_aprobar',
            IsActive: true,
            cliente: clienteId || null,
          });
        }
      }
    }
  }

  await recalcularEstadoMesa(mesaId);

  const resumen = await construirResumenPago(mesaId);

  // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 2):
  // Crear un TicketAprobacion por CADA cobro normal (parcial o total), con snapshot
  // de SOLO los platos de este boucher. La mesa pasa a 'pendiente_aprobar' tras el
  // primer cobro del ciclo y solo va a 'pagado' cuando cocina aprueba el último
  // ticket pendiente del pedido (ver ticketAprobacion.repository.aprobarTicket).
  if (!esPagoAdelantado && platosParaBoucher.length > 0) {
    // Mesa siempre a pendiente_aprobar mientras haya tickets sin aprobar
    const mesaDoc = await mesasModel.findById(mesaId);
    if (mesaDoc && mesaDoc.estado !== 'reportado' && mesaDoc.estado !== 'pagado') {
      mesaDoc.estado = 'pendiente_aprobar';
      await mesaDoc.save();
      resumen.mesa.estado = 'pendiente_aprobar';
    }

    // Snapshot de platos para el ticket (solo los platos de este cobro)
    const platosSnapshot = platosParaBoucher.map((p) => ({
      comandaId: comandasIdsAfectadas.find((cid) =>
        comandasValidas.find((c) => c._id.toString() === cid.toString() && c.comandaNumber === p.comandaNumber)
      ) || null,
      comandaNumber: p.comandaNumber || null,
      platoLineaId: p.platoSubdocId ? (mongoose.Types.ObjectId.isValid(p.platoSubdocId) ? p.platoSubdocId : null) : null,
      plato: p.plato,
      platoId: p.platoId,
      nombre: p.nombre,
      precio: p.precio,
      cantidad: p.cantidad,
      subtotal: p.subtotal,
      tipoServicio: p.tipoServicio || 'mesa',
      complementosSeleccionados: p.complementosSeleccionados || [],
      notaEspecial: p.notaEspecial || '',
    }));

    try {
      const clienteDoc = clienteId
        ? await mongoose.model('Cliente').findById(clienteId).select('nombre dni').lean()
        : null;

      ticketAprobacionCreado = await ticketAprobacionRepository.crearTicketAprobacion({
        comandas: comandasIdsAfectadas,
        comandasNumbers: boucherData.comandasNumbers,
        mesa: mesaId,
        numMesa: boucherData.numMesa,
        mozo: mozoId,
        nombreMozo: boucherData.nombreMozo,
        mozoNombre: boucherData.nombreMozo,
        pedido: pedidoId,
        // tipo: 'pago_parcial' si no cubre toda la mesa, 'comanda_completa' si sí
        tipo: resumen.cobroCompleto ? 'comanda_completa' : 'pago_parcial',
        platos: platosSnapshot,
        subtotal: totales.subtotal,
        igv: totales.igv,
        total: totales.total,
        boucher: boucherCreado._id,
        voucherId: boucherCreado.voucherId || boucherCreado.boucherNumber || null,
        moneda: monedaNormalizada,
        metodoPago,
        cliente: clienteId || null,
        clienteNombre: clienteDoc?.nombre || null,
        clienteDni: clienteDoc?.dni || null,
        observaciones: observaciones || '',
        sourceApp: 'mozos',
      });

      // Auditoría: comanda enviada a aprobación
      try {
        const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
        await AuditoriaAcciones.create({
          accion: 'COMANDA_ENVIADA_APROBACION',
          entidadId: ticketAprobacionCreado._id,
          entidadTipo: 'comanda',
          usuario: null,
          datosAntes: null,
          datosDespues: {
            ticketId: ticketAprobacionCreado._id,
            ticketNumber: ticketAprobacionCreado.ticketNumber,
            mesaEstado: 'pendiente_aprobar',
            tipo: ticketAprobacionCreado.tipo,
          },
          metadata: {
            mesaId,
            numMesa: boucherData.numMesa,
            mozoId,
            mozoNombre: boucherData.nombreMozo,
            comandasNumbers: boucherData.comandasNumbers,
            boucherId: boucherCreado._id,
            total: totales.total,
            tipo: ticketAprobacionCreado.tipo,
            esPagoParcial: parcial,
          },
        });
      } catch (auditErr) {
        console.warn('⚠️ No se pudo registrar auditoría COMANDA_ENVIADA_APROBACION:', auditErr.message);
      }
    } catch (ticketErr) {
      // No bloquear el pago si falla la creación del ticket; se notifica y sigue.
      console.error('❌ Error creando TicketAprobacion (no crítico):', ticketErr.message);
    }
  }

  // Cerrar pedido solo cuando la mesa esté lista para liberar (cobro completo
  // + todos los tickets aprobados). En un flujo normal, esto será false aquí
  // porque acabamos de crear un ticket pendiente; el cierre real ocurre al
  // aprobar el último ticket (ver ticketAprobacion.repository.aprobarTicket).
  await cerrarPedidoSiMesaCompleta(
    mesaId,
    boucherCreado._id,
    clienteId,
    resumen.mesaListaParaLiberar
  );

  return { boucher: boucherCreado, resumen, ticketAprobacion: ticketAprobacionCreado };
}

module.exports = {
  procesarPagoBoucher,
  esPagoParcial,
  construirResumenPago,
  labelMetodoPago,
  METODOS_PAGO_VALIDOS,
  METODO_PAGO_LABELS,
};
