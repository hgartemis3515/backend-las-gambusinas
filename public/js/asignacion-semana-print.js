/**
 * Impresión horizontal (A4 landscape) de asignación automática
 * (platos o guarniciones): calendario mensual a página completa + matriz
 * y listas por cocinera (seleccionado ★ / backup ↻ / no seleccionado).
 * La programación sigue siendo semanal; el mes la repite en cada fecha.
 */
(function (global) {
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function safeColor(c, fallback) {
    const s = String(c || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : (fallback || '#d4af37');
  }

  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function groupRows(filas) {
    const map = new Map();
    (filas || []).forEach(function (f) {
      const g = f.grupo || 'Otros';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(f);
    });
    return Array.from(map.entries());
  }

  function cooksBreakdown(perfil, cocineros) {
    return (cocineros || []).map(function (c, ci) {
      const sel = [];
      const nosel = [];
      (perfil.filas || []).forEach(function (f) {
        const rol = f.celdas[ci];
        if (rol === 'primario') sel.push({ nombre: f.nombre, rol: 'primario' });
        else if (rol === 'backup') sel.push({ nombre: f.nombre, rol: 'backup' });
        else nosel.push(f.nombre);
      });
      return { nombre: c.nombre, sel: sel, nosel: nosel };
    });
  }

  function css() {
    return `
@page { size: A4 landscape; margin: 6mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Inter, 'Segoe UI', Arial, sans-serif;
  color: #111;
  background: #fff;
  font-size: 8px;
  line-height: 1.2;
}
.toolbar { margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.toolbar p { margin: 0; color: #555; font-size: 11px; }
.toolbar button {
  font-size: 12px; padding: 6px 12px; background: #d4af37; color: #0a0a0f;
  border: none; border-radius: 6px; cursor: pointer; font-weight: 700;
}
.page-month {
  height: 198mm;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex; justify-content: space-between; align-items: flex-end;
  border-bottom: 2.5px solid #d4af37; padding-bottom: 4px; margin-bottom: 4px;
  flex: 0 0 auto;
}
.header h1 { font-size: 15px; margin: 0; color: #1a1a28; }
.header h1 em { font-style: normal; color: #b8860b; }
.header .meta { font-size: 8px; color: #555; text-align: right; }
.legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 4px; font-size: 7.5px; color: #444; flex: 0 0 auto; }
.legend span { display: inline-flex; align-items: center; gap: 4px; }
.sw { display: inline-block; width: 14px; height: 12px; border: 1px solid #ccc; border-radius: 2px; text-align: center; font-size: 8px; line-height: 12px; }
.sw-p { background: #fff4c2; color: #7a5c00; font-weight: 700; }
.sw-b { background: #e8f1ff; color: #1a4a8a; }
.sw-n { background: #f7f7f7; color: #bbb; }
.sw-s { background: #ffe8e8; }
.hoy-badge { background: #d4af37; color: #1a1a28; padding: 0 4px; border-radius: 3px; font-size: 7px; font-weight: 800; }
.month-title { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 3px; flex: 0 0 auto; }
.month-title h2 { margin: 0; font-size: 14px; color: #1a1a28; }
.month-title span { color: #666; font-size: 8px; }
table.month {
  width: 100%;
  flex: 1 1 auto;
  height: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.month th { background: #1a1a28; color: #fff; padding: 4px; font-size: 9px; text-align: center; letter-spacing: 0.4px; }
.month td.cel { vertical-align: top; border: 1px solid #d0c9a8; padding: 3px 4px; overflow: hidden; }
.month td.out { background: #f3f3f3; color: #aaa; }
.month td.hoy { background: #fff8e0; box-shadow: inset 0 0 0 2px #d4af37; }
.month .num { font-weight: 800; font-size: 11px; float: right; margin: 0 0 2px 6px; }
.month td.out .num { font-weight: 600; color: #bbb; font-size: 9px; }
.franja { border-left: 3px solid var(--c, #d4af37); background: #faf8f0; padding: 1px 4px; margin: 0 0 2px; border-radius: 2px; display: flex; justify-content: space-between; gap: 4px; align-items: baseline; }
.franja .p { font-weight: 800; font-size: 8px; color: #1a1a28; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.franja .h { color: #333; font-variant-numeric: tabular-nums; font-size: 7.5px; white-space: nowrap; }
.vacio { color: #ccc; font-size: 8px; }

.perfil-block { page-break-before: always; }
.perfil-h { display: flex; align-items: baseline; gap: 8px; margin: 0 0 4px; border-bottom: 1px solid #eadca0; padding-bottom: 3px; }
.perfil-h h2 { margin: 0; font-size: 13px; color: #1a1a28; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.usos { font-size: 8px; color: #555; margin: 0 0 6px; }
.stats { font-size: 8px; color: #555; margin: 0 0 6px; }

table.matrix { width: 100%; border-collapse: collapse; table-layout: auto; margin-bottom: 8px; }
.matrix th, .matrix td { border: 1px solid #ddd; padding: 2px 3px; }
.matrix thead th { background: #1a1a28; color: #fff; font-size: 7.5px; font-weight: 700; }
.matrix .item { text-align: left; font-weight: 600; width: 150px; max-width: 160px; }
.matrix .grp td { background: #f0ece0; font-weight: 800; text-align: left; color: #1a1a28; font-size: 8px; }
.cell-p { background: #fff4c2; color: #7a5c00; font-weight: 800; text-align: center; }
.cell-b { background: #e8f1ff; color: #1a4a8a; text-align: center; }
.cell-n { color: #d0d0d0; text-align: center; }
.sin-p td.item { background: #ffe8e8; }
.cook-h { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 8px; max-height: 78px; white-space: nowrap; padding: 4px 2px; }

.cooks { display: flex; flex-wrap: wrap; gap: 8px; }
.cook { width: calc(50% - 4px); border: 1px solid #e0d9b8; border-radius: 4px; padding: 6px; page-break-inside: avoid; }
.cook h3 { margin: 0 0 4px; font-size: 10px; border-bottom: 1px solid #d4af37; padding-bottom: 2px; }
.cols { display: flex; gap: 8px; }
.cols > div { width: 50%; }
.h-sel { color: #7a5c00; font-size: 8px; font-weight: 800; margin: 0 0 3px; text-transform: uppercase; }
.h-no { color: #555; font-size: 8px; font-weight: 800; margin: 0 0 3px; text-transform: uppercase; }
.tag { display: inline-block; background: #fff8dc; border: 1px solid #e6d98a; padding: 0 4px; margin: 0 2px 2px 0; border-radius: 2px; font-size: 7.5px; }
.tag-b { background: #e8f1ff; border-color: #b8cce8; }
.tag-n { background: #f4f4f4; border: 1px solid #ddd; color: #555; font-size: 7px; }
.none { color: #999; font-style: italic; }
.footer { margin-top: 8px; padding-top: 4px; border-top: 1px solid #ccc; font-size: 7.5px; color: #666; display: flex; justify-content: space-between; }
@media print {
  .no-print { display: none !important; }
  body { font-size: 8px; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .page-month { height: 198mm; }
  .month tbody tr { height: 16.6%; }
}
`;
  }

  function monthHtml(mes) {
    if (!mes || !Array.isArray(mes.semanas) || !mes.semanas.length) return '';
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const heads = dias.map(function (d) { return '<th>' + d + '</th>'; }).join('');
    const rows = mes.semanas.map(function (semana) {
      const tds = (semana || []).map(function (cel) {
        const cls = ['cel'];
        if (cel.fueraMes) cls.push('out');
        if (cel.esHoy) cls.push('hoy');
        const franjas = (cel.bloques || []).filter(function (b) { return b.activo !== false; }).map(function (b) {
          return '<div class="franja" style="--c:' + safeColor(b.color) + '">' +
            '<span class="p">' + escapeHtml(b.perfilNombre || '—') + '</span>' +
            '<span class="h">' + escapeHtml(b.horario || '') + '</span></div>';
        }).join('');
        return '<td class="' + cls.join(' ') + '">' +
          '<div class="num">' + (cel.esHoy ? '<span class="hoy-badge">HOY</span> ' : '') + escapeHtml(String(cel.diaMes || '')) + '</div>' +
          (franjas || (cel.fueraMes ? '' : '<div class="vacio">—</div>')) +
          '</td>';
      }).join('');
      return '<tr>' + tds + '</tr>';
    }).join('');
    return '<div class="month-title"><h2>' + escapeHtml(mes.mesNombre || '') + ' ' + escapeHtml(String(mes.anio || '')) +
      '</h2><span>Misma programación cada día de la semana · hora Lima</span></div>' +
      '<table class="month"><thead><tr>' + heads + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function matrixHtml(perfil, cocineros, tipoItem) {
    const cooks = cocineros || [];
    const chunks = chunk(cooks, 8);
    if (!chunks.length) chunks.push([]);
    return chunks.map(function (grupo, gi) {
      const offset = gi * 8;
      const heads = grupo.map(function (c) {
        const vertical = cooks.length > 5;
        return '<th' + (vertical ? ' class="cook-h"' : '') + '>' + escapeHtml(c.nombre) + '</th>';
      }).join('');
      const groups = groupRows(perfil.filas);
      const body = groups.map(function (entry) {
        const grp = entry[0];
        const filas = entry[1];
        const span = 1 + grupo.length;
        const grpRow = '<tr class="grp"><td colspan="' + span + '">' + escapeHtml(grp) + '</td></tr>';
        const rows = filas.map(function (f) {
          const tds = grupo.map(function (_c, i) {
            const rol = f.celdas[offset + i];
            if (rol === 'primario') return '<td class="cell-p">★</td>';
            if (rol === 'backup') return '<td class="cell-b">↻</td>';
            return '<td class="cell-n">·</td>';
          }).join('');
          return '<tr' + (f.sinPrimario ? ' class="sin-p"' : '') + '><td class="item">' +
            escapeHtml(f.nombre) + '</td>' + tds + '</tr>';
        }).join('');
        return grpRow + rows;
      }).join('');
      const extra = chunks.length > 1 ? ' <span style="font-weight:400;color:#d4af37">cocinera(s) ' + (offset + 1) + '–' + (offset + grupo.length) + '</span>' : '';
      return '<table class="matrix"><thead><tr><th class="item">' + escapeHtml(tipoItem) + extra +
        '</th>' + heads + '</tr></thead><tbody>' + body + '</tbody></table>';
    }).join('');
  }

  function cooksHtml(perfil, cocineros) {
    const cards = cooksBreakdown(perfil, cocineros).map(function (c) {
      const sel = c.sel.length
        ? c.sel.map(function (s) {
            return '<span class="tag' + (s.rol === 'backup' ? ' tag-b' : '') + '">' +
              (s.rol === 'primario' ? '★ ' : '↻ ') + escapeHtml(s.nombre) + '</span>';
          }).join('')
        : '<span class="none">Ninguno</span>';
      const nosel = c.nosel.length
        ? c.nosel.map(function (n) {
            return '<span class="tag tag-n">' + escapeHtml(n) + '</span>';
          }).join('')
        : '<span class="none">Todos seleccionados</span>';
      return '<section class="cook"><h3>' + escapeHtml(c.nombre) + '</h3><div class="cols">' +
        '<div><p class="h-sel">Seleccionados (' + c.sel.length + ')</p>' + sel + '</div>' +
        '<div><p class="h-no">No seleccionados (' + c.nosel.length + ')</p>' + nosel + '</div>' +
        '</div></section>';
    }).join('');
    return '<div class="cooks">' + cards + '</div>';
  }

  function perfilSection(perfil, cocineros, tipoItem, tipoItemPlural, first) {
    const filas = perfil.filas || [];
    const conPrimario = filas.filter(function (f) { return !f.sinPrimario; }).length;
    const sinPrimario = filas.length - conPrimario;
    const usos = (perfil.usos || []).map(function (u) {
      return escapeHtml((u.dias || '') + ' ' + (u.horario || '') + (u.etiqueta ? ' · ' + u.etiqueta : ''));
    }).join(' · ');
    return '<section class="perfil-block' + (first ? ' first' : '') + '">' +
      '<div class="perfil-h"><span class="dot" style="background:' + safeColor(perfil.color) + '"></span>' +
      '<h2>' + escapeHtml(perfil.nombre) + '</h2></div>' +
      (usos ? '<p class="usos">Horario esta semana: ' + usos + '</p>' : '') +
      '<p class="stats">' + filas.length + ' ' + escapeHtml(tipoItemPlural) +
      ' · ' + conPrimario + ' con cocinera primaria · ' + sinPrimario + ' sin primario (fila rosada)</p>' +
      matrixHtml(perfil, cocineros, tipoItem) +
      '<h3 style="font-size:11px;margin:10px 0 6px;color:#1a1a28">Por cocinera · seleccionados y no seleccionados</h3>' +
      cooksHtml(perfil, cocineros) +
      '</section>';
  }

  function open(payload) {
    const p = payload || {};
    const titulo = p.titulo || 'Asignación automática';
    const tipoItem = p.tipoItem || 'Plato';
    const tipoItemPlural = p.tipoItemPlural || 'platos';
    const perfiles = p.perfiles || [];
    const cocineros = p.cocineros || [];
    const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
      '<title>' + escapeHtml(titulo) + ' — ' + escapeHtml((p.mes && p.mes.mesNombre) || 'mes') + '</title><style>' + css() + '</style></head><body>' +
      '<div class="toolbar no-print"><p>Destino: <b>Guardar como PDF</b> · orientación <b>Horizontal</b> (A4 landscape). Hoja 1 = mes completo.</p>' +
      '<button type="button" onclick="window.print()">Imprimir / Guardar PDF</button></div>' +
      '<div class="page-month">' +
      '<div class="header"><div><h1>San Benito — <em>' + escapeHtml(titulo) + '</em></h1></div>' +
      '<div class="meta">Generado: ' + escapeHtml(p.generado || '') + '<br>' +
      cocineros.length + ' cocinera(s) en este PDF · ' + perfiles.length + ' perfil(es)</div></div>' +
      '<div class="legend">' +
      '<span><span class="sw sw-p">★</span> Primario</span>' +
      '<span><span class="sw sw-b">↻</span> Backup</span>' +
      '<span><span class="sw sw-n">·</span> No seleccionado</span>' +
      '<span><span class="sw sw-s">&nbsp;</span> Sin primaria</span>' +
      '<span>Fin = hora de cambio de perfil. El mes repite el horario de cada día de la semana.</span>' +
      '</div>' +
      monthHtml(p.mes) +
      '</div>' +
      perfiles.map(function (perfil, i) {
        return perfilSection(perfil, cocineros, tipoItem, tipoItemPlural, i === 0);
      }).join('') +
      '<div class="footer"><span>San Benito · asignación automática · no escribe en el KDS, solo documenta la programación</span>' +
      '<span>' + escapeHtml(p.generado || '') + '</span></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},280);}<\/script>' +
      '</body></html>';

    const w = global.open('', '_blank', 'width=1280,height=820');
    if (!w) {
      if (global.GambusinasNotifications) {
        global.GambusinasNotifications.error('Impresión', 'El navegador bloqueó la ventana. Permite ventanas emergentes y reintenta.');
      } else {
        alert('Permite ventanas emergentes para imprimir el PDF.');
      }
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    try { w.focus(); } catch (e) {}
  }

  global.GambusinasAsignacionPrint = { open: open };
})(window);
