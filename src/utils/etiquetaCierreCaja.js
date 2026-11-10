'use strict';

const { ymdOperativo } = require('./diaOperativoRestaurante');

function mismoDia(a, b) {
  if (!a?.fechaCierre || !b?.fechaCierre) return false;
  return ymdOperativo(a.fechaCierre) === ymdOperativo(b.fechaCierre);
}

/** CAJA 1 DIA, NOCHE o CAJA 2, CAJA 3… sin juntar fusiones. */
function etiquetaSimple(cierre, hermanos) {
  if (!cierre) return '';
  if (cierre.cajaAdicionalNumero) return 'CAJA ' + cierre.cajaAdicionalNumero;
  const base = (hermanos || [])
    .filter((c) => c && c.fechaCierre && !c.cajaAdicionalNumero && c.estado !== 'fusionado' && mismoDia(c, cierre))
    .sort((a, b) => new Date(a.fechaCierre) - new Date(b.fechaCierre));
  if (base[0] && String(base[0]._id) === String(cierre._id)) return 'CAJA 1 DIA';
  return 'NOCHE';
}

function partesEtiqueta(cierre, hermanos) {
  if (Array.isArray(cierre?.etiquetasCaja) && cierre.etiquetasCaja.length) {
    return cierre.etiquetasCaja.filter(Boolean);
  }
  const una = etiquetaSimple(cierre, hermanos);
  return una ? [una] : [];
}

function etiquetaVisible(cierre, hermanos) {
  return partesEtiqueta(cierre, hermanos).join(' + ');
}

function esCierreNoche(cierre, hermanos) {
  const partes = partesEtiqueta(cierre, hermanos);
  return partes.length > 0 && partes.every((p) => p === 'NOCHE');
}

module.exports = {
  etiquetaSimple,
  etiquetaVisible,
  esCierreNoche,
  partesEtiqueta,
};
