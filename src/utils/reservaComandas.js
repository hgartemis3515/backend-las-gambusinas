/**
 * Helpers de comandas extra ligadas a una reserva.
 * PLAN_NUEVA_COMANDA_RESERVA_Y_MESAS_JUNTAS
 */

const idEntidad = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'object') {
    if (v._id != null) return String(v._id);
    if (v.$oid) return String(v.$oid);
  }
  return String(v);
};

const esComandaPrincipalDeReserva = (reserva, comanda) => {
  const gen = reserva?.comandaGenerada;
  const cid = comanda?._id != null ? comanda._id : comanda;
  if (!gen || !cid) return false;
  return idEntidad(gen) === idEntidad(cid);
};

/** Solo borrar la comanda generada cancela la reserva. Una extra no. */
const debeCancelarReservaAlEliminarComanda = (reserva, comanda) =>
  esComandaPrincipalDeReserva(reserva, comanda);

const heredarProgramacionDeComandaPrincipal = (principal) => {
  if (!principal || principal.programadaPorReserva !== true) return null;
  return {
    programadaPorReserva: true,
    fechaCocinaProgramada: principal.fechaCocinaProgramada || null,
    origenCreacion: 'reserva'
  };
};

const mesaGrupoPrincipalId = (mesa) => {
  if (mesa && mesa.esMesaPrincipal === false && mesa.mesaPrincipalId) {
    return mesa.mesaPrincipalId;
  }
  return null;
};

const mesaEstadoEsReserva = (estado) => {
  const st = String(estado || '').toLowerCase();
  return st === 'reservado' || st === 'pendiente_aprobar';
};

module.exports = {
  idEntidad,
  esComandaPrincipalDeReserva,
  debeCancelarReservaAlEliminarComanda,
  heredarProgramacionDeComandaPrincipal,
  mesaGrupoPrincipalId,
  mesaEstadoEsReserva
};
