(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VentaEspecialOpciones = api;
})(typeof window !== 'undefined' ? window : global, function () {
  function norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function redondear3(n) {
    return Math.round((Number(n) || 0) * 1000) / 1000;
  }

  function metaPlato(nombre, saboresPorUnidad) {
    const n = norm(nombre);
    const esPacha = n.startsWith('pachamanca') && !n.includes('sin sabor');
    const esLena = n.includes('lena');
    const porFicha = Number(saboresPorUnidad);
    const m = n.match(/pachamanca\s+(\d+)\s+sabor/);
    const porNombre = m ? Number(m[1]) : 0;
    const eligeSabores = porFicha >= 1 || porNombre >= 1;
    return {
      esPacha: esPacha,
      esLena: esLena,
      saboresPorPlato: esPacha && eligeSabores ? (porFicha >= 1 ? porFicha : porNombre) : 0
    };
  }

  function esIngredienteSabor(ing) {
    return norm(ing && (ing.complemento || ing.nota || '')).includes('sabor:');
  }

  function corteLenaDe(ing) {
    const c = norm([
      ing && ing.complemento,
      ing && ing.nota,
      ing && ing.rubro,
      ing && ing.productoNombre,
      ing && ing.nombreProducto,
      ing && ing.unidadNota
    ].filter(Boolean).join(' '));
    const esCorte = c.includes('lena') || c.includes('parte pecho') || c.includes('parte pierna');
    if (!esCorte) return '';
    if (c.includes('pecho') || c.includes('pechug')) return 'pechugas';
    if (c.includes('pierna')) return 'piernas';
    return '';
  }

  function cantidadDescarga(opts) {
    const o = opts || {};
    const cant = Number(o.cantPlatos) || 0;
    const factor = Number(o.factor) > 0 ? Number(o.factor) : 1;
    if (!(cant > 0)) return 0;
    const meta = o.meta || {};
    if (meta.esPacha && meta.saboresPorPlato > 0 && esIngredienteSabor(o.ing)) return redondear3(Number(o.saboresElegidos) || 0);
    if (meta.esLena) {
      const corteIng = corteLenaDe(o.ing);
      if (corteIng && corteIng !== o.corteElegido) return 0;
    }
    return redondear3(cant * factor);
  }

  function avisoPlato(opts) {
    const o = opts || {};
    const cant = Number(o.cant) || 0;
    const meta = o.meta;
    if (!(cant > 0) || !meta) return '';
    if (meta.esPacha && meta.saboresPorPlato > 0) {
      const need = meta.saboresPorPlato * cant;
      const got = Number(o.saboresElegidos) || 0;
      if (got !== need) return (o.nombre || 'Pachamanca') + ': elige ' + need + ' sabores (van ' + got + ').';
    }
    return '';
  }

  return {
    metaPlato: metaPlato,
    esIngredienteSabor: esIngredienteSabor,
    corteLenaDe: corteLenaDe,
    cantidadDescarga: cantidadDescarga,
    avisoPlato: avisoPlato
  };
});
