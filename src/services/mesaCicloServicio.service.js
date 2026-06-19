/**
 * Resuelve el ciclo de servicio actual de una mesa (visita / pedido).
 * Evita mezclar comandas y bouchers de visitas anteriores.
 */
const moment = require('moment-timezone');
const pedidoModel = require('../database/models/pedido.model');
const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');

const ZONA = 'America/Lima';

const buildFromPedido = (pedido, tipo) => ({
  tipo,
  pedidoId: String(pedido._id),
  comandaIds: (pedido.comandas || []).map((id) => String(id)),
  desde: pedido.fechaApertura || pedido.createdAt || null,
  hasta: pedido.fechaPago || null,
  boucherPrincipalId: pedido.boucher ? String(pedido.boucher) : null,
});

const fallbackPorComandasPagadas = async (mesaId) => {
  const pagadas = await comandaModel
    .find({
      mesas: mesaId,
      status: { $in: ['pagado', 'completado'] },
      tiempoPagado: { $exists: true, $ne: null },
    })
    .select('_id tiempoPagado pedido')
    .sort({ tiempoPagado: -1 })
    .lean();

  if (!pagadas.length) {
    return { tipo: 'ninguno', pedidoId: null, comandaIds: [], desde: null, hasta: null };
  }

  const ultima = pagadas[0];
  if (ultima.pedido) {
    const pedido = await pedidoModel.findById(ultima.pedido).lean();
    if (pedido) {
      return buildFromPedido(pedido, 'fallback_pedido');
    }
  }

  const diaUltimo = moment(ultima.tiempoPagado).tz(ZONA).format('YYYY-MM-DD');
  const comandaIds = pagadas
    .filter(
      (c) =>
        moment(c.tiempoPagado).tz(ZONA).format('YYYY-MM-DD') === diaUltimo
    )
    .map((c) => String(c._id));

  return {
    tipo: 'fallback_dia',
    pedidoId: null,
    comandaIds,
    desde: moment(ultima.tiempoPagado).tz(ZONA).startOf('day').toDate(),
    hasta: ultima.tiempoPagado,
  };
};

const fallbackPorComandasActivas = async (mesaId) => {
  const activas = await comandaModel
    .find({
      mesas: mesaId,
      IsActive: true,
      status: { $nin: ['cancelado', 'anulado'] },
    })
    .select('_id pedido createdAt')
    .sort({ createdAt: -1 })
    .lean();

  if (!activas.length) {
    return null;
  }

  const pedidoIds = [
    ...new Set(activas.map((c) => c.pedido && String(c.pedido)).filter(Boolean)),
  ];
  if (pedidoIds.length === 1) {
    const pedido = await pedidoModel.findById(pedidoIds[0]).lean();
    if (pedido) {
      return buildFromPedido(pedido, 'fallback_activas_pedido');
    }
  }

  return {
    tipo: 'comandas_activas',
    pedidoId: null,
    comandaIds: activas.map((c) => String(c._id)),
    desde: activas[activas.length - 1]?.createdAt || null,
    hasta: null,
  };
};

/**
 * @param {string} mesaId
 * @returns {Promise<{ tipo: string, pedidoId: string|null, comandaIds: string[], desde: Date|null, hasta: Date|null, boucherPrincipalId?: string|null }>}
 */
const obtenerCicloServicioMesa = async (mesaId) => {
  const mesa = await mesasModel.findById(mesaId).select('estado').lean();
  const estadoMesa = (mesa?.estado || '').toLowerCase();

  const pedidoAbierto = await pedidoModel
    .findOne({
      mesa: mesaId,
      estado: 'abierto',
      isActive: { $ne: false },
    })
    .sort({ fechaApertura: -1 })
    .lean();

  if (pedidoAbierto) {
    return buildFromPedido(pedidoAbierto, 'abierto');
  }

  if (['pagado', 'pagando'].includes(estadoMesa)) {
    const pedidoPagado = await pedidoModel
      .findOne({
        mesa: mesaId,
        estado: 'pagado',
        isActive: { $ne: false },
      })
      .sort({ fechaPago: -1, updatedAt: -1 })
      .lean();

    if (pedidoPagado) {
      return buildFromPedido(pedidoPagado, 'pagado');
    }

    return fallbackPorComandasPagadas(mesaId);
  }

  // pendiente_pago: mesa con PPA registrado — sus comandas siguen activas (platos en pedido/en_espera)
  if (['preparado', 'pedido', 'esperando', 'pendiente_pago'].includes(estadoMesa)) {
    const porActivas = await fallbackPorComandasActivas(mesaId);
    if (porActivas) {
      return porActivas;
    }
  }

  return { tipo: 'ninguno', pedidoId: null, comandaIds: [], desde: null, hasta: null };
};

const intersectarComandaIds = (ciclo, comandaIdsOpcional) => {
  if (!Array.isArray(comandaIdsOpcional) || comandaIdsOpcional.length === 0) {
    return ciclo.comandaIds || [];
  }
  const cicloSet = new Set((ciclo.comandaIds || []).map(String));
  if (cicloSet.size === 0) {
    return comandaIdsOpcional.map(String);
  }
  return comandaIdsOpcional.map(String).filter((id) => cicloSet.has(id));
};

const boucherPerteneceAlCiclo = (boucher, ciclo, comandaIdsEfectivos) => {
  if (ciclo.pedidoId) {
    const bp = boucher.pedido?._id || boucher.pedido;
    if (bp) {
      return String(bp) === String(ciclo.pedidoId);
    }
  }

  const ids = comandaIdsEfectivos?.length
    ? comandaIdsEfectivos
    : ciclo.comandaIds;
  if (!ids?.length) {
    return false;
  }

  const set = new Set(ids.map(String));
  const refs = boucher.comandas || [];
  const tieneComanda = refs.some((c) => {
    const id = (c?._id || c)?.toString?.();
    return id && set.has(id);
  });
  if (!tieneComanda) {
    return false;
  }

  if (ciclo.desde && boucher.fechaPago) {
    const desde = new Date(ciclo.desde);
    desde.setMinutes(desde.getMinutes() - 5);
    if (new Date(boucher.fechaPago) < desde) {
      return false;
    }
  }

  if (ciclo.hasta && boucher.fechaPago) {
    const hasta = new Date(ciclo.hasta);
    hasta.setHours(hasta.getHours() + 2);
    if (new Date(boucher.fechaPago) > hasta) {
      return false;
    }
  }

  return true;
};

const filtrarBouchersPorCiclo = (bouchers, ciclo, comandaIdsEfectivos) =>
  (bouchers || []).filter((b) =>
    boucherPerteneceAlCiclo(b, ciclo, comandaIdsEfectivos)
  );

module.exports = {
  obtenerCicloServicioMesa,
  intersectarComandaIds,
  boucherPerteneceAlCiclo,
  filtrarBouchersPorCiclo,
};
