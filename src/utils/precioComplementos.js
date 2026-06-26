/**
 * Utilidad central de precios de complementos (v3.0).
 *
 * Funciones:
 *  - normalizarOpcion(op): string | { nombre, precio } → { nombre, precio }
 *  - getNombreOpcion(op): extraer nombre legible
 *  - getPrecioOpcion(grupo, nombreOpcion): buscar precio en config del grupo
 *  - calcularPrecioUnitarioConComplementos(precioBase, complementosSeleccionados)
 *  - calcularResumenComplementos(complementosSeleccionados)
 *  - enriquecerComplementosConPrecio(complementosPlato, complementosSeleccionados, opciones)
 *
 * Reglas:
 *  - Precio omitido o 0 → no suma.
 *  - Cantidades v2.0: extra = precioOpción × cantidadComplemento.
 *  - Si plato.complementosAfectanPrecio === false → extra = 0 (solo informativo).
 *  - Snapshot: el precio se copia al crear/editar comanda; el menú puede cambiar después.
 */

const logger = require('./logger');

/**
 * Normaliza una opción de complemento a formato objeto.
 * Acepta string legacy ("Pollo") u objeto ({ nombre, precio }).
 */
function normalizarOpcion(op) {
  if (op == null) return { nombre: '', precio: 0 };
  if (typeof op === 'string') return { nombre: op.trim(), precio: 0 };
  if (typeof op === 'object') {
    const nombre = String(op.nombre ?? op.opcion ?? '').trim();
    const precio = Number(op.precio);
    return {
      nombre,
      precio: Number.isFinite(precio) && precio > 0 ? precio : 0
    };
  }
  return { nombre: String(op).trim(), precio: 0 };
}

/**
 * Extrae el nombre de una opción (string u objeto).
 */
function getNombreOpcion(op) {
  if (op == null) return '';
  if (typeof op === 'string') return op.trim();
  return String(op.nombre ?? op.opcion ?? '').trim();
}

/**
 * Normaliza un array de opciones.
 */
function normalizarOpciones(opciones) {
  if (!Array.isArray(opciones)) return [];
  return opciones
    .map(normalizarOpcion)
    .filter((o) => o.nombre.length > 0);
}

/**
 * Busca el precio configurado de una opción dentro de un grupo.
 * Comparación case-insensitive por nombre.
 * @returns {number} precio (0 si no encuentra)
 */
function getPrecioOpcion(grupo, nombreOpcion) {
  if (!grupo || !nombreOpcion) return 0;
  const target = String(nombreOpcion).trim().toLowerCase();
  const opciones = normalizarOpciones(grupo.opciones);
  const encontrada = opciones.find((o) => o.nombre.toLowerCase() === target);
  return encontrada ? encontrada.precio : 0;
}

/**
 * Calcula el precio unitario de una línea de plato con complementos.
 *
 * @param {number} precioBase - plato.precio
 * @param {Array} complementosSeleccionados - [{ grupo, opcion, cantidad, precio? }]
 * @param {Object} [opciones]
 * @param {boolean} [opciones.afectanPrecio=true] - si false, extras = 0
 * @returns {{ precioUnitario: number, extraComplementos: number, desglose: Array }}
 */
function calcularPrecioUnitarioConComplementos(precioBase, complementosSeleccionados, opciones = {}) {
  const afectanPrecio = opciones.afectanPrecio !== false;
  const base = Number(precioBase) || 0;
  const selecciones = Array.isArray(complementosSeleccionados) ? complementosSeleccionados : [];

  let extra = 0;
  const desglose = [];

  for (const sel of selecciones) {
    const cantidad = Math.max(1, Number(sel.cantidad) || 1);
    const precioUnit = Number(sel.precio) || 0;
    const monto = afectanPrecio ? precioUnit * cantidad : 0;
    extra += monto;
    desglose.push({
      grupo: sel.grupo || '',
      opcion: getNombreOpcion(sel.opcion),
      cantidad,
      precioUnitario: precioUnit,
      monto
    });
  }

  return {
    precioUnitario: base + extra,
    extraComplementos: extra,
    desglose
  };
}

/**
 * Calcula totales para el resumen de impresión.
 * @returns {{ totalUnidades: number, extraComplementos: number }}
 */
function calcularResumenComplementos(complementosSeleccionados, opciones = {}) {
  const afectanPrecio = opciones.afectanPrecio !== false;
  const selecciones = Array.isArray(complementosSeleccionados) ? complementosSeleccionados : [];

  let totalUnidades = 0;
  let extra = 0;

  for (const sel of selecciones) {
    const cantidad = Math.max(1, Number(sel.cantidad) || 1);
    totalUnidades += cantidad;
    if (afectanPrecio) {
      extra += (Number(sel.precio) || 0) * cantidad;
    }
  }

  return {
    totalUnidades,
    extraComplementos: extra
  };
}

/**
 * Enriquece los complementos seleccionados con el precio snapshot desde la config del plato.
 * Garantiza que el precio venga del menú (fuente de verdad), no del cliente.
 *
 * @param {Array} complementosPlato - grupos configurados en el plato
 * @param {Array} complementosSeleccionados - selecciones del mozo (sin precio o con precio cliente)
 * @param {Object} [opciones]
 * @param {boolean} [opciones.afectanPrecio=true] - si false, snapshot = 0
 * @returns {Array} selecciones enriquecidas con precio snapshot
 */
function enriquecerComplementosConPrecio(complementosPlato, complementosSeleccionados, opciones = {}) {
  const afectanPrecio = opciones.afectanPrecio !== false;
  const gruposPlato = Array.isArray(complementosPlato) ? complementosPlato : [];
  const selecciones = Array.isArray(complementosSeleccionados) ? complementosSeleccionados : [];

  return selecciones.map((sel) => {
    const grupoConfig = gruposPlato.find((g) => g && g.grupo === sel.grupo) || null;
    let precioSnapshot = 0;

    if (afectanPrecio && grupoConfig) {
      precioSnapshot = getPrecioOpcion(grupoConfig, getNombreOpcion(sel.opcion));
    }

    return {
      grupo: sel.grupo || '',
      opcion: getNombreOpcion(sel.opcion),
      cantidad: Math.max(1, Number(sel.cantidad) || 1),
      precio: precioSnapshot
    };
  });
}

/**
 * Devuelve un texto compacto para el resumen de impresión.
 * Ej: "4 uds." o "4 uds. (+S/. 12.00)"
 *
 * @param {Array} complementosSeleccionados
 * @param {Object} [flags] - { mostrarCantidad, mostrarMontoExtra }
 * @param {string} [simbolo='S/.']
 */
function textoResumenComplementos(complementosSeleccionados, flags = {}, simbolo = 'S/.') {
  const mostrarCantidad = flags.mostrarCantidad !== false;
  const mostrarMontoExtra = flags.mostrarMontoExtra !== false;

  const { totalUnidades, extraComplementos } = calcularResumenComplementos(complementosSeleccionados);
  if (totalUnidades === 0) return '';

  const partes = [];
  if (mostrarCantidad) {
    partes.push(`${totalUnidades} ${totalUnidades === 1 ? 'ud.' : 'uds.'}`);
  }
  if (mostrarMontoExtra && extraComplementos > 0) {
    partes.push(`(+${simbolo}${extraComplementos.toFixed(2)})`);
  }
  return partes.join(' ').trim();
}

module.exports = {
  normalizarOpcion,
  getNombreOpcion,
  normalizarOpciones,
  getPrecioOpcion,
  calcularPrecioUnitarioConComplementos,
  calcularResumenComplementos,
  enriquecerComplementosConPrecio,
  textoResumenComplementos
};
