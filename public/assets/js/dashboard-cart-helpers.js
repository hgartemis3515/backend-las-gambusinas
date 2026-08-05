/**
 * dashboard-cart-helpers.js
 * Helpers compartidos para los modales Crear Comanda y Crear Reserva del dashboard.
 * Valida complementos de platos, calcula extras de precio y construye el payload
 * hacia el backend. Framework-agnostic (vanilla JS).
 */

(function (global) {
  'use strict';

  // ============ MEJORA: Centralización de reglas de complementos ============

  /**
   * Normaliza un grupo de complemento y sus opciones a un formato predecible.
   * Soporta formatos legacy (string[] en opciones) y v3 ({ nombre, precio }[]).
   * @param {Object} grupo - Grupo de complemento crudo desde el modelo plato.
   * @returns {Object} Grupo normalizado.
   */
  function normalizarGrupo(grupo) {
    if (!grupo || typeof grupo !== 'object') return null;
    const opciones = (Array.isArray(grupo.opciones) ? grupo.opciones : [])
      .map(op => {
        if (typeof op === 'string') return { nombre: op, precio: 0 };
        return { nombre: op?.nombre ?? '', precio: Number(op?.precio ?? 0) || 0 };
      });

    // Alineado a App Mozos ModalComplementos: legacy seleccionMultiple → modos/límites
    let modo = grupo.modoSeleccion;
    let maxGrupo = grupo.maxUnidadesGrupo;
    let minGrupo = grupo.minUnidadesGrupo;
    let maxOp = grupo.maxUnidadesPorOpcion;
    if (!modo) {
      modo = grupo.seleccionMultiple ? 'cantidades' : 'opciones';
      if (maxGrupo == null) maxGrupo = grupo.seleccionMultiple ? null : 1;
      if (minGrupo == null) minGrupo = grupo.obligatorio ? 1 : 0;
      if (maxOp == null) maxOp = grupo.seleccionMultiple ? null : 1;
    }

    return {
      grupo: String(grupo.grupo ?? grupo.nombre ?? ''),
      obligatorio: !!grupo.obligatorio,
      modoSeleccion: modo === 'cantidades' ? 'cantidades' : 'opciones',
      maxUnidadesGrupo: maxGrupo != null && maxGrupo !== '' ? Number(maxGrupo) : null,
      minUnidadesGrupo: minGrupo != null && minGrupo !== '' ? Number(minGrupo) : null,
      maxUnidadesPorOpcion: maxOp != null && maxOp !== '' ? Number(maxOp) : null,
      seleccionMultiple: !!grupo.seleccionMultiple,
      opciones
    };
  }

  /**
   * Estado de un grupo (mensajes como en App Mozos).
   */
  function estadoGrupo(grupoRaw, seleccion) {
    const g = normalizarGrupo(grupoRaw);
    if (!g) return { esValido: true, mensaje: '', totalUnidades: 0, modoSeleccion: 'opciones', obligatorio: false };
    const totalUnidades = totalSeleccionadoEnGrupo(seleccion, g.grupo);
    const minUnidades = g.minUnidadesGrupo != null ? g.minUnidadesGrupo : (g.obligatorio ? 1 : 0);
    const maxUnidades = g.maxUnidadesGrupo;
    let esValido = true;
    let mensaje = '';
    if (totalUnidades < minUnidades) {
      esValido = false;
      mensaje = `Faltan ${minUnidades - totalUnidades} unidad(es)`;
    } else if (maxUnidades != null && totalUnidades > maxUnidades) {
      esValido = false;
      mensaje = `Excedido (máx: ${maxUnidades})`;
    } else if (maxUnidades != null && totalUnidades === maxUnidades) {
      mensaje = '✓ Máximo alcanzado';
    } else if (totalUnidades >= minUnidades && minUnidades > 0) {
      mensaje = '✓ Completo';
    } else if (totalUnidades > 0) {
      mensaje = `${totalUnidades} seleccionada(s)`;
    }
    return {
      esValido,
      mensaje,
      totalUnidades,
      minUnidades,
      maxUnidades,
      modoSeleccion: g.modoSeleccion,
      obligatorio: g.obligatorio,
      grupo: g.grupo,
      opciones: g.opciones
    };
  }

  /** Normaliza todos los grupos de un plato (para el panel UI). */
  function normalizarComplementosPlato(plato) {
    return (Array.isArray(plato?.complementos) ? plato.complementos : [])
      .map(normalizarGrupo)
      .filter(g => g && g.grupo && g.opciones.length > 0);
  }

  /**
   * Obtiene la cantidad total seleccionada en un grupo.
   * @param {Array} seleccion - [{ grupo, opcion, cantidad, precio }]
   * @param {String} grupoNombre
   * @returns {Number}
   */
  function totalSeleccionadoEnGrupo(seleccion, grupoNombre) {
    return (seleccion || [])
      .filter(s => s && s.grupo === grupoNombre)
      .reduce((acc, s) => acc + (Number(s.cantidad) || 0), 0);
  }

  /**
   * Obtiene la cantidad seleccionada de una opción específica dentro de un grupo.
   */
  function cantidadOpcion(seleccion, grupoNombre, opcionNombre) {
    const s = (seleccion || []).find(x => x.grupo === grupoNombre && x.opcion === opcionNombre);
    return s ? (Number(s.cantidad) || 0) : 0;
  }

  /**
   * Valida la selección de complementos contra las reglas de un plato.
   * Devuelve un array de errores (vacío = válido).
   * @param {Object} plato - Plato con array `complementos` (grupos).
   * @param {Array} seleccion - complementosSeleccionados actuales.
   * @returns {Array<String>} errores
   */
  function validarComplementos(plato, seleccion) {
    const errores = [];
    const grupos = Array.isArray(plato?.complementos) ? plato.complementos : [];
    if (!grupos.length) return errores;

    for (const raw of grupos) {
      const g = normalizarGrupo(raw);
      if (!g) continue;
      const total = totalSeleccionadoEnGrupo(seleccion, g.grupo);

      if (g.obligatorio) {
        const minReq = g.minUnidadesGrupo != null ? g.minUnidadesGrupo : 1;
        if (total < minReq) {
          errores.push(`El grupo "${g.grupo}" es obligatorio${minReq > 1 ? ` (mín. ${minReq} unidades)` : ''}`);
        }
      }
      if (g.minUnidadesGrupo != null && total < g.minUnidadesGrupo) {
        if (!g.obligatorio && total > 0) {
          errores.push(`"${g.grupo}" requiere mínimo ${g.minUnidadesGrupo} unidades`);
        }
      }
      if (g.maxUnidadesGrupo != null && total > g.maxUnidadesGrupo) {
        errores.push(`"${g.grupo}" excede el máximo de ${g.maxUnidadesGrupo} unidades`);
      }

      // Validar por opción
      for (const op of g.opciones) {
        const cantOp = cantidadOpcion(seleccion, g.grupo, op.nombre);
        if (g.maxUnidadesPorOpcion != null && cantOp > g.maxUnidadesPorOpcion) {
          errores.push(`"${op.nombre}" en "${g.grupo}" excede el máximo de ${g.maxUnidadesPorOpcion} unidades`);
        }
      }
    }
    return errores;
  }

  /**
   * Calcula el extra total de los complementos (suma de precio × cantidad).
   * Respeta plato.complementosAfectanPrecio.
   * @param {Object} plato
   * @param {Array} seleccion
   * @returns {Number} extraTotal
   */
  function calcularExtraComplementos(plato, seleccion) {
    if (plato?.complementosAfectanPrecio === false) return 0;
    const grupos = Array.isArray(plato?.complementos) ? plato.complementos : [];
    if (!grupos.length || !Array.isArray(seleccion) || !seleccion.length) return 0;

    let extra = 0;
    for (const s of seleccion) {
      if (!s || !s.grupo || !s.opcion) continue;
      const g = grupos.find(x => String(x.grupo) === s.grupo || String(x.nombre) === s.grupo);
      if (!g) continue;
      const op = (g.opciones || []).find(o =>
        (typeof o === 'string' ? o : o?.nombre) === s.opcion
      );
      const precioOp = op ? (typeof op === 'string' ? 0 : (Number(op.precio) || 0)) : (Number(s.precio) || 0);
      extra += precioOp * (Number(s.cantidad) || 0);
    }
    return Math.round(extra * 100) / 100;
  }

  /**
   * Calcula el precio unitario efectivo del plato (base + extra).
   * @param {Object} plato
   * @param {Array} seleccion
   * @returns {Number}
   */
  function calcularPrecioUnitario(plato, seleccion) {
    const base = Number(plato?.precio || 0);
    const extra = calcularExtraComplementos(plato, seleccion);
    return Math.round((base + extra) * 100) / 100;
  }

  /**
   * Resumen compacto de complementos para mostrar en el carrito.
   * @param {Array} seleccion
   * @returns {String} ej: "+ Pollo, + Arroz (×2)"
   */
  function resumenComplementosTexto(seleccion) {
    if (!Array.isArray(seleccion) || !seleccion.length) return '';
    return seleccion
      .filter(s => s && s.opcion)
      .map(s => `+ ${s.opcion}${(Number(s.cantidad) || 0) > 1 ? ` (×${s.cantidad})` : ''}`)
      .join(', ');
  }

  // ============ MEJORA: Constructor de item de carrito unificado ============

  /**
   * Construye un item de carrito con complementos y notaEspecial,
   * alineado al contrato que espera agregarComanda en el backend.
   * @param {Object} plato - Plato del menú (con complementos si tiene)
   * @param {Object} opts - { tipoServicio, complementosSeleccionados, notaEspecial }
   * @returns {Object} item de carrito
   */
  function construirItemCarrito(plato, opts = {}) {
    const complementosSeleccionados = (opts.complementosSeleccionados || []).map(c => ({
      grupo: String(c.grupo || ''),
      opcion: String(c.opcion || ''),
      cantidad: Number(c.cantidad) || 1,
      precio: Number(c.precio) || 0
    }));
    const extra = calcularExtraComplementos(plato, complementosSeleccionados);
    return {
      _id: plato._id || null,                 // ObjectId (comanda)
      platoId: plato.id || plato._id || null, // num id o ObjectId según contexto
      nombre: plato.nombre,
      estado: 'en_espera',
      tipoServicio: opts.tipoServicio === 'para_llevar' ? 'para_llevar' : 'mesa',
      cantidad: 1,
      complementosSeleccionados,
      notaEspecial: opts.notaEspecial || '',
      // Campos de presentación (no se envían al backend, el BE los recalcula):
      precioBase: Number(plato.precio || 0),
      extraComplementos: extra,
      precioUnitario: Math.round((Number(plato.precio || 0) + extra) * 100) / 100
    };
  }

  /**
   * Compara dos items de carrito para saber si son el "mismo" plato+config
   * (mismo plato, mismo tipoServicio, mismos complementos, misma nota).
   * Permite agrupar cantidades en el carrito.
   */
  function mismoItemCarrito(a, b) {
    if (!a || !b) return false;
    if ((a._id || a.platoId || a.plato) !== (b._id || b.platoId || b.plato)) return false;
    if ((a.tipoServicio || 'mesa') !== (b.tipoServicio || 'mesa')) return false;
    if ((a.notaEspecial || '') !== (b.notaEspecial || '')) return false;
    // Comparar complementos
    const ca = a.complementosSeleccionados || [];
    const cb = b.complementosSeleccionados || [];
    if (ca.length !== cb.length) return false;
    const norm = arr => arr.map(x => `${x.grupo}::${x.opcion}::${x.cantidad}`).sort().join('|');
    return norm(ca) === norm(cb);
  }

  // ============ MEJORA: Cálculo de total del carrito (memoizable) ============

  /**
   * Calcula el total de un carrito (array de items con precioUnitario y cantidad).
   * @param {Array} carrito
   * @returns {Number}
   */
  function totalCarrito(carrito) {
    if (!Array.isArray(carrito)) return 0;
    return carrito.reduce((acc, item) => {
      const pu = Number(item.precioUnitario != null ? item.precioUnitario : (item.precioBase || item.precio || 0));
      return acc + pu * (Number(item.cantidad) || 0);
    }, 0);
  }

  /**
   * Cuenta el total de unidades en el carrito.
   */
  function totalUnidadesCarrito(carrito) {
    if (!Array.isArray(carrito)) return 0;
    return carrito.reduce((acc, item) => acc + (Number(item.cantidad) || 0), 0);
  }

  // ============ Export ============
  global.DashboardCartHelpers = {
    normalizarGrupo,
    normalizarComplementosPlato,
    estadoGrupo,
    validarComplementos,
    calcularExtraComplementos,
    calcularPrecioUnitario,
    resumenComplementosTexto,
    construirItemCarrito,
    mismoItemCarrito,
    totalCarrito,
    totalUnidadesCarrito,
    totalSeleccionadoEnGrupo,
    cantidadOpcion
  };
})(window);
