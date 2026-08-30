/**
 * Filtro DIA / NOCHE según el primer cierre de caja del día Lima.
 * Requiere apiGet('/cierre-caja/turnos-dia').
 */
(function (w) {
  function limaYMD(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d || new Date());
  }

  function limaDayStart(ymd) {
    return new Date(ymd + 'T00:00:00-05:00');
  }

  function limaDayEnd(ymd) {
    return new Date(ymd + 'T23:59:59.999-05:00');
  }

  function limaHM(d) {
    if (!d) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(d));
  }

  function rangoIso(preset, primerCierreHoyAt) {
    const key = String(preset || '').toLowerCase();
    if (!primerCierreHoyAt || (key !== 'dia' && key !== 'noche')) return null;
    const ymd = limaYMD();
    const corte = new Date(primerCierreHoyAt);
    if (Number.isNaN(corte.getTime())) return null;
    if (key === 'dia') {
      return {
        desde: limaDayStart(ymd).toISOString(),
        hasta: new Date(corte.getTime() - 1).toISOString()
      };
    }
    return {
      desde: corte.toISOString(),
      hasta: limaDayEnd(ymd).toISOString()
    };
  }

  function etiqueta(preset, primerCierreHoyAt) {
    const key = String(preset || '').toLowerCase();
    if (!primerCierreHoyAt) return key === 'dia' ? 'DIA' : key === 'noche' ? 'NOCHE' : '';
    if (key === 'dia') return 'Día · ' + limaYMD() + ' 00:00–' + limaHM(primerCierreHoyAt);
    if (key === 'noche') return 'Noche · ' + limaHM(primerCierreHoyAt) + '–23:59';
    return '';
  }

  /**
   * @param {object} ctx Alpine state
   * @param {object|null} data respuesta /cierre-caja/turnos-dia
   * @param {object} opts
   * @param {() => string} opts.getPeriod
   * @param {(v: string) => void} opts.setPeriod
   * @param {string[]} [opts.hoyValues]
   * @param {string} [opts.diaValue]
   * @param {string} [opts.nocheValue]
   * @param {boolean} [opts.autoNoche] si true, al primer cierre del día pasa a NOCHE cuando el período es Hoy
   */
  function applyPayload(ctx, data, opts) {
    const getPeriod = opts.getPeriod;
    const setPeriod = opts.setPeriod;
    const hoyValues = opts.hoyValues || ['hoy', 'Hoy'];
    const diaValue = opts.diaValue || 'dia';
    const nocheValue = opts.nocheValue || 'noche';
    const autoNoche = opts.autoNoche !== false;
    const ymd = limaYMD();

    if (!data || typeof data.limaYMD !== 'string') return false;

    const mismoDia = data.limaYMD === ymd;
    const cantidad = mismoDia ? (Number(data.cantidad) || 0) : 0;
    const hay = mismoDia && data.hayCierreHoy === true && cantidad >= 1 && !!data.primerCierreAt;
    const diaCambio = ctx.turnosLimaYMD && ctx.turnosLimaYMD !== ymd;
    const isTurno = (v) => v === diaValue || v === nocheValue;

    if (diaCambio) {
      ctx._turnosAutoNocheHecho = false;
      if (isTurno(getPeriod())) setPeriod(hoyValues[0]);
    }

    ctx.turnosLimaYMD = ymd;
    ctx.showTurnoDiaNoche = hay;
    ctx.primerCierreHoyAt = hay ? data.primerCierreAt : null;
    ctx.cierresHoyCount = cantidad;

    if (hay) {
      if (autoNoche && !ctx._turnosAutoNocheHecho && hoyValues.includes(getPeriod())) {
        setPeriod(nocheValue);
      }
      ctx._turnosAutoNocheHecho = true;
    } else {
      ctx._turnosAutoNocheHecho = false;
      if (isTurno(getPeriod())) setPeriod(hoyValues[0]);
    }
    return true;
  }

  async function refresh(ctx, opts) {
    if (typeof apiGet !== 'function') return false;
    let data = null;
    try { data = await apiGet('/cierre-caja/turnos-dia'); } catch (e) { data = null; }
    const ok = applyPayload(ctx, data, opts);
    if (ok && typeof opts.onChange === 'function') opts.onChange();
    return ok;
  }

  function startPoll(ctx, opts, ms) {
    if (ctx._turnosPoll) return;
    ctx._turnosPoll = setInterval(() => refresh(ctx, opts), ms || 45000);
    if (!ctx._turnosVisHandler) {
      ctx._turnosVisHandler = () => {
        if (!document.hidden) refresh(ctx, opts);
      };
      document.addEventListener('visibilitychange', ctx._turnosVisHandler);
    }
  }

  w.TurnosDiaNoche = {
    limaYMD,
    limaHM,
    limaDayStart,
    limaDayEnd,
    rangoIso,
    etiqueta,
    applyPayload,
    refresh,
    startPoll
  };
})(window);
