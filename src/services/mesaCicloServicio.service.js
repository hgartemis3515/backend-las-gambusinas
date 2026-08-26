/**
 * Resuelve el ciclo de servicio actual de una mesa (visita / pedido).
 * Evita mezclar comandas y bouchers de visitas anteriores.
 */
const moment = require('moment-timezone');
const pedidoModel = require('../database/models/pedido.model');
const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');
const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');

const ZONA = 'America/Lima';
const VENTANA_CICLO_MS = 3 * 60 * 60 * 1000;

const buildFromPedido = (pedido, tipo) => ({
  tipo,
  pedidoId: String(pedido._id),
  comandaIds: (pedido.comandas || []).map((id) => String(id)),
  desde: pedido.fechaApertura || pedido.createdAt || null,
  hasta: pedido.fechaPago || null,
  boucherPrincipalId: pedido.boucher ? String(pedido.boucher) : null,
});

const fallbackPorComandasPagadas = async (mesaId) => {
  // PLAN_PLANTILLA_COMANDAS: tras pago normal las comandas quedan en status 'pendiente_aprobar'
  // (con tiempoPagado) mientras esperan aprobación de cocina. Incluirlas en el ciclo
  // para que Ver pedido / reimprimir comanda funcionen en mesa pagado/pendiente_aprobar.
  // Priorizar comandas IsActive=true (del ciclo actual); si no hay, buscar también IsActive=false
  // (comandas cerradas del mismo día).
  const horizonteHoras = 12;
  const haceHoras = moment().tz(ZONA).subtract(horizonteHoras, 'hours').toDate();

  // Intento 1: comandas IsActive=true del ciclo actual (pendiente_aprobar / pagado recientes)
  let pagadas = await comandaModel
    .find({
      mesas: mesaId,
      IsActive: true,
      status: { $in: ['pendiente_aprobar', 'pagado', 'entregado'] },
      tiempoPagado: { $exists: true, $ne: null, $gte: haceHoras },
    })
    .select('_id tiempoPagado pedido')
    .sort({ tiempoPagado: -1 })
    .lean();

  // Intento 2: ciclo ya cerrado (IsActive=false), solo últimas 24h — nunca todo el historial del día.
  if (!pagadas.length) {
    const hace24h = moment().tz(ZONA).subtract(24, 'hours').toDate();
    pagadas = await comandaModel
      .find({
        mesas: mesaId,
        status: { $in: ['pagado', 'completado', 'entregado', 'pendiente_aprobar'] },
        tiempoPagado: { $exists: true, $ne: null, $gte: hace24h },
      })
      .select('_id tiempoPagado pedido')
      .sort({ tiempoPagado: -1 })
      .lean();
  }

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

  const tUltima = new Date(ultima.tiempoPagado).getTime();
  const comandaIds = pagadas
    .filter((c) => tUltima - new Date(c.tiempoPagado).getTime() <= VENTANA_CICLO_MS)
    .map((c) => String(c._id));

  return {
    tipo: 'fallback_ultimo_pago',
    pedidoId: null,
    comandaIds,
    desde: new Date(tUltima - VENTANA_CICLO_MS),
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

  const newest = activas[0];
  const pedidoIdNewest = newest?.pedido ? String(newest.pedido) : null;
  if (pedidoIdNewest) {
    const pedido = await pedidoModel.findById(pedidoIdNewest).lean();
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
 * IDs de comandas del cobro más reciente (TPA + ticket de aprobación),
 * para no mezclar visitas anteriores del mismo pedido/mesa.
 */
const obtenerComandaIdsDeTicketsRecientes = async (mesaId, pedidoId) => {
  const hace12h = moment().tz(ZONA).subtract(12, 'hours').toDate();
  const filtro = {
    mesa: mesaId,
    estado: 'aprobado',
    fechaAprobacion: { $gte: hace12h },
  };

  const [tas, tpas] = await Promise.all([
    ticketAprobacionModel.find(filtro).select('comandas fechaAprobacion pedido').sort({ fechaAprobacion: -1 }).limit(20).lean(),
    ticketPagoAdelantadoModel.find(filtro).select('comandas fechaAprobacion pedido').sort({ fechaAprobacion: -1 }).limit(20).lean(),
  ]);

  let tickets = [...(tas || []), ...(tpas || [])].sort(
    (a, b) => new Date(b.fechaAprobacion || 0) - new Date(a.fechaAprobacion || 0)
  );
  if (!tickets.length) return [];

  if (pedidoId) {
    const pid = String(pedidoId);
    const delPedido = tickets.filter((t) => !t.pedido || String(t.pedido) === pid);
    if (delPedido.length) tickets = delPedido;
  }

  const t0 = new Date(tickets[0].fechaAprobacion || 0).getTime();
  const ids = new Set();
  for (const t of tickets) {
    const tA = new Date(t.fechaAprobacion || 0).getTime();
    if (t0 - tA > VENTANA_CICLO_MS) continue;
    (t.comandas || []).forEach((id) => ids.add(String(id)));
  }
  return [...ids];
};

/**
 * @param {string} mesaId
 * @returns {Promise<{ tipo: string, pedidoId: string|null, comandaIds: string[], desde: Date|null, hasta: Date|null, boucherPrincipalId?: string|null }>}
 */
const obtenerCicloServicioMesa = async (mesaId) => {
  const mesa = await mesasModel.findById(mesaId).select('estado').lean();
  const estadoMesa = (mesa?.estado || '').toLowerCase();

  // PLAN_PLANTILLA_COMANDAS: mesa libre → ciclo cerrado, sin comandas activas.
  // Las comandas del ciclo anterior quedaron IsActive=false al liberar; no deben regresar.
  if (estadoMesa === 'libre') {
    return { tipo: 'ninguno', pedidoId: null, comandaIds: [], desde: null, hasta: null };
  }

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

  // pagado / pagando / pendiente_aprobar: ciclo del último pedido pagado o en aprobación.
  // pendiente_aprobar comparte la semántica de "pago registrado, esperando liberación".
  if (['pagado', 'pagando', 'pendiente_aprobar'].includes(estadoMesa)) {
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

    // Si no hay pedido pagado activo (caso pendiente_aprobar sin pedido formal),
    // recuperar el ciclo desde las comandas pagadas/entregadas más recientes.
    return fallbackPorComandasPagadas(mesaId);
  }

  // pendiente_pago: mesa con PPA registrado — sus comandas siguen activas (platos en pedido/en_espera)
  if (['preparado', 'pedido', 'esperando', 'pendiente_pago', 'reportado', 'reservado'].includes(estadoMesa)) {
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
  const explicit = comandaIdsOpcional.map(String);
  const cicloSet = new Set((ciclo.comandaIds || []).map(String));
  if (cicloSet.size === 0) {
    return explicit;
  }
  const intersected = explicit.filter((id) => cicloSet.has(id));
  // IDs explícitos del cliente (ComandaDetalle/Inicio) tienen prioridad si el pedido no los lista aún
  return intersected.length > 0 ? intersected : explicit;
};

const boucherPerteneceAlCiclo = (boucher, ciclo, comandaIdsEfectivos) => {
  const idsExplicitos = Array.isArray(comandaIdsEfectivos) && comandaIdsEfectivos.length > 0
    ? comandaIdsEfectivos.map(String)
    : null;

  // Si el cliente envió comandaIds, el boucher debe referenciar al menos una de esas comandas
  if (idsExplicitos) {
    const set = new Set(idsExplicitos);
    const refs = boucher.comandas || [];
    const tieneComanda = refs.some((c) => {
      const id = (c?._id || c)?.toString?.();
      return id && set.has(id);
    });
    if (!tieneComanda) {
      return false;
    }
  }

  if (ciclo.pedidoId) {
    const bp = boucher.pedido?._id || boucher.pedido;
    if (bp) {
      return String(bp) === String(ciclo.pedidoId);
    }
  }

  const ids = idsExplicitos || (ciclo.comandaIds || []).map(String);
  if (!ids.length) {
    return false;
  }

  const set = new Set(ids);
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
  obtenerComandaIdsDeTicketsRecientes,
};
