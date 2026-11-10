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

  function esSegmento(preset) {
    var key = String(preset || '').toLowerCase();
    return key === 'dia' || key === 'noche' || key.indexOf('caja-') === 0;
  }

  function buscarSegmento(ctx, preset) {
    var segs = (ctx && ctx.turnosSegmentos) || [];
    var key = String(preset || '').toLowerCase();
    for (var i = 0; i < segs.length; i++) {
      if (String(segs[i].id).toLowerCase() === key) return segs[i];
    }
    return null;
  }

  function contiene(preset, createdAt, ctx) {
    if (!esSegmento(preset) || !createdAt) return false;
    var seg = buscarSegmento(ctx, preset);
    var t = new Date(createdAt).getTime();
    if (!Number.isFinite(t)) return false;
    var ymd = limaYMD();
    if (t < limaDayStart(ymd).getTime() || t > limaDayEnd(ymd).getTime()) return false;
    if (!seg) {
      var key = String(preset || '').toLowerCase();
      var corte = ctx && ctx.primerCierreHoyAt ? new Date(ctx.primerCierreHoyAt).getTime() : NaN;
      if (!Number.isFinite(corte)) return false;
      if (key === 'dia') return t < corte;
      if (key === 'noche') return t >= corte;
      return false;
    }
    var desde = new Date(seg.desde).getTime();
    var hasta = new Date(seg.hasta).getTime();
    if (String(seg.id) === 'noche') {
      if (t < desde || t > hasta) return false;
      var excl = seg.excluir || [];
      for (var i = 0; i < excl.length; i++) {
        var a = new Date(excl[i].desde).getTime();
        var b = new Date(excl[i].hasta).getTime();
        if (excl[i].abierto) {
          if (t >= a && t <= b) return false;
        } else if (t >= a && t < b) return false;
      }
      return true;
    }
    if (seg.abierto) return t >= desde && t <= hasta;
    return t >= desde && t < hasta;
  }

  function rangoDe(preset, ctx) {
    var seg = buscarSegmento(ctx, preset);
    if (seg) return { desde: seg.desde, hasta: seg.hasta, excluir: seg.excluir || [] };
    return rangoIso(preset, ctx && ctx.primerCierreHoyAt);
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

  function etiqueta(preset, primerCierreHoyAt, ctx) {
    var seg = buscarSegmento(ctx, preset);
    if (seg) return seg.label + ' · ' + limaHM(seg.desde) + '–' + limaHM(seg.hasta);
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
    var isTurno = function (v) {
      var s = String(v || '');
      return s === diaValue || s === nocheValue || s === 'dia' || s === 'noche' || s === 'DIA' || s === 'NOCHE' || s.indexOf('caja-') === 0;
    };

    if (diaCambio) {
      ctx._turnosAutoNocheHecho = false;
      ctx._periodoActivoVisto = '';
      if (isTurno(getPeriod())) setPeriod(hoyValues[0]);
    }

    ctx.turnosLimaYMD = ymd;
    ctx.showTurnoDiaNoche = hay;
    ctx.primerCierreHoyAt = hay ? data.primerCierreAt : null;
    ctx.cierresHoyCount = cantidad;
    ctx.turnosSegmentos = hay && Array.isArray(data.segmentos) ? data.segmentos : [];
    ctx.turnosCajas = ctx.turnosSegmentos.filter(function (s) { return String(s.id).indexOf('caja-') === 0; });

    var activo = mismoDia && data.periodoActivo ? data.periodoActivo : (hay ? 'noche' : 'hoy');
    if (autoNoche && activo !== ctx._periodoActivoVisto) {
      if (activo === 'hoy') {
        if (isTurno(getPeriod())) setPeriod(hoyValues[0]);
      } else if (activo === 'noche') {
        setPeriod(nocheValue);
      } else if (String(activo).indexOf('caja-') === 0) {
        setPeriod(activo);
      }
      ctx._periodoActivoVisto = activo;
      ctx._turnosAutoNocheHecho = hay;
    } else if (!hay) {
      ctx._turnosAutoNocheHecho = false;
      ctx._periodoActivoVisto = 'hoy';
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
    esSegmento: esSegmento,
    contiene: contiene,
    rangoDe: rangoDe,
    rangoIso: rangoIso,
    etiqueta: etiqueta,
    applyPayload: applyPayload,
    refresh: refresh,
    startPoll: startPoll
  };
})(window);
