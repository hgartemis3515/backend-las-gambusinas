/**
 * Filtro DIA / NOCHE y día operativo 04:00–04:00 Lima.
 * Requiere apiGet('/cierre-caja/turnos-dia').
 */
(function (w) {
  var TZ = 'America/Lima';
  var HORA_INICIO_CICLO = 4;

  function limaCalendarYMD(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d || new Date());
  }

  function limaHour(d) {
    return Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      hour12: false
    }).format(d || new Date()));
  }

  function addDaysYMD(ymd, delta) {
    var parts = String(ymd).split('-').map(Number);
    var utc = Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    return limaCalendarYMD(new Date(utc + delta * 86400000));
  }

  function limaYMD(d) {
    var date = d || new Date();
    var cal = limaCalendarYMD(date);
    if (limaHour(date) < HORA_INICIO_CICLO) return addDaysYMD(cal, -1);
    return cal;
  }

  function limaDayStart(ymd) {
    return new Date(ymd + 'T04:00:00-05:00');
  }

  function limaDayEnd(ymd) {
    return new Date(addDaysYMD(ymd, 1) + 'T03:59:59.999-05:00');
  }

  function limaHM(d) {
    if (!d) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(d));
  }

  function rangoIso(preset, primerCierreHoyAt) {
    var key = String(preset || '').toLowerCase();
    if (!primerCierreHoyAt || (key !== 'dia' && key !== 'noche')) return null;
    var ymd = limaYMD();
    var corte = new Date(primerCierreHoyAt);
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
    var key = String(preset || '').toLowerCase();
    if (!primerCierreHoyAt) return key === 'dia' ? 'DIA' : key === 'noche' ? 'NOCHE' : '';
    if (key === 'dia') return 'Día · ' + limaYMD() + ' 04:00–' + limaHM(primerCierreHoyAt);
    if (key === 'noche') return 'Noche · ' + limaHM(primerCierreHoyAt) + '–04:00';
    return '';
  }

  /**
   * @param {object} ctx Alpine state
   * @param {object|null} data respuesta /cierre-caja/turnos-dia
   * @param {object} opts
   */
  function applyPayload(ctx, data, opts) {
    var getPeriod = opts.getPeriod;
    var setPeriod = opts.setPeriod;
    var hoyValues = opts.hoyValues || ['hoy', 'Hoy'];
    var diaValue = opts.diaValue || 'dia';
    var nocheValue = opts.nocheValue || 'noche';
    var autoNoche = opts.autoNoche !== false;
    var ymd = limaYMD();

    if (!data || typeof data.limaYMD !== 'string') return false;

    var mismoDia = data.limaYMD === ymd;
    var cantidad = mismoDia ? (Number(data.cantidad) || 0) : 0;
    var hay = mismoDia && data.hayCierreHoy === true && cantidad >= 1 && !!data.primerCierreAt;
    var diaCambio = ctx.turnosLimaYMD && ctx.turnosLimaYMD !== ymd;
    var isTurno = function (v) { return v === diaValue || v === nocheValue; };

    if (diaCambio) {
      ctx._turnosAutoNocheHecho = false;
      if (isTurno(getPeriod())) setPeriod(hoyValues[0]);
    }

    ctx.turnosLimaYMD = ymd;
    ctx.showTurnoDiaNoche = hay;
    ctx.primerCierreHoyAt = hay ? data.primerCierreAt : null;
    ctx.cierresHoyCount = cantidad;

    if (hay) {
      if (autoNoche && !ctx._turnosAutoNocheHecho) {
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
    var data = null;
    try { data = await apiGet('/cierre-caja/turnos-dia'); } catch (e) { data = null; }
    var ok = applyPayload(ctx, data, opts);
    if (ok && typeof opts.onChange === 'function') opts.onChange();
    return ok;
  }

  function startPoll(ctx, opts, ms) {
    if (ctx._turnosPoll) return;
    ctx._turnosPoll = setInterval(function () { refresh(ctx, opts); }, ms || 45000);
    if (!ctx._turnosVisHandler) {
      ctx._turnosVisHandler = function () {
        if (!document.hidden) refresh(ctx, opts);
      };
      document.addEventListener('visibilitychange', ctx._turnosVisHandler);
    }
  }

  w.TurnosDiaNoche = {
    HORA_INICIO_CICLO: HORA_INICIO_CICLO,
    limaYMD: limaYMD,
    limaHM: limaHM,
    limaDayStart: limaDayStart,
    limaDayEnd: limaDayEnd,
    addDaysYMD: addDaysYMD,
    rangoIso: rangoIso,
    etiqueta: etiqueta,
    applyPayload: applyPayload,
    refresh: refresh,
    startPoll: startPoll
  };
})(window);
