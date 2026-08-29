/**
 * Sanitiza el config visual de Personalizar (Ver Cocina Completo).
 *
 * Contrato: toda opción del panel debe sobrevivir a Guardar / Cargar perfil.
 * - Claves de la whitelist (conocidas) siempre pasan.
 * - Claves camelCase nuevas del panel también pasan (para no perder opciones
 *   futuras si el frontend se despliega antes que este archivo).
 * - Valores: null | boolean | number finito | string acotado. Sin objetos.
 */

const { claveNombreComplemento } = require('./nombreComplementoCanonico');

const CLAVE_RE = /^[a-zA-Z][a-zA-Z0-9]{0,80}$/;
const BLOQUEADAS = new Set([
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'deshabilitarOrdenSecuencialGuarniciones',
    'password',
    'token',
    'secret',
    'jwt',
    'nombre',
    '_id',
    'id',
    'createdAt',
    'updatedAt',
    'creadoPor',
    'actualizadoPor',
    'activo',
]);

/** Claves conocidas del panel Personalizar. Documentación + fast-path; no es excluyente. */
const PERFIL_VER_COCINA_KEYS = new Set([
    'tamanioFuentePlato', 'tamanioFuenteDetalle', 'tamanioFuenteCronometro', 'tamanioFuenteCocinero',
    'tiempoAmarillo', 'tiempoRojo', 'modoNocturno', 'modoAgrupacion', 'mostrarMesas', 'modoTimers',
    'maxTimersVisibles', 'mostrarCabeceraCocinero', 'colorPorCocinero', 'mostrarCocineroTomado',
    'umbralCargaAlta', 'umbralSobrecarga', 'estiloTemporizador', 'intensidadAlerta',
    'mostrarEtiquetaPlato', 'mostrarIconoCocinero', 'fuenteFamilia', 'fuenteFamiliaCustom',
    'colorFondo', 'colorTextoPrincipal', 'colorTextoPlato', 'colorTextoDetalle', 'colorTextoSecundario', 'colorAcento', 'colorAlertaAmarilla',
    'colorAlertaRoja', 'colorFilaPlato', 'espaciadoFilas', 'pesoFuentePlato', 'layoutColumnas',
    'disposicionTarjeta', 'animacionesTarjetas',
    'icono', 'mostrarNotificacionEntrada', 'textoNotificacionEntrada', 'duracionNotificacionEntrada',
    'mostrarComplementos',
    'layoutColumnasGuarniciones', 'diferenciarDisenoGuarniciones',
    'ocultarCronometroGuarniciones', 'ocultarCuadroGuarniciones',
    'ocultarBuscadorPlatos', 'mostrarContadorGuarniciones',
    'contadorGuarnicionesConPronombre', 'colorTextoContadorGuarniciones',
    'tamanioFuenteContadorGuarniciones', 'fuenteFamiliaContadorGuarniciones',
    'contadorGuarnicionesClaves',
    'mostrarTitulosListasSplit',
    'tituloListaPlatos', 'tituloListaGuarniciones', 'referenciaPadreGuarnicion',
    'grosorSeparadorSplit', 'colorSeparadorSplit',
    'alinearTituloListaSplit', 'colorTituloListaSplit', 'tamanioTituloListaSplit',
    'pesoTituloListaSplit', 'fuenteFamiliaTituloListaSplit',
    'mostrarPronombreCocineroGuarnicion',
    'heredarEstiloPronombrePadre', 'colorTextoPronombreGuarnicion',
    'tamanioFuentePronombreGuarnicion', 'fuenteFamiliaPronombreGuarnicion',
    'notasJuntoAGuarniciones', 'cuadroGuarnicionSiHayNota',
    'mostrarTablaNotas', 'tituloTablaNotas', 'colorTextoNotas',
    'tamanioFuenteNotas', 'pesoFuenteNotas', 'fuenteFamiliaNotas', 'alinearTablaNotas',
    'fuenteFamiliaGuarnicion', 'tamanioFuenteGuarnicion', 'pesoFuenteGuarnicion',
    'colorTextoGuarnicion', 'colorTextoPadreGuarnicion', 'tamanioFuentePadreGuarnicion',
    'colorFondoGuarnicion', 'colorAcentoGuarnicion', 'espaciadoFilasGuarnicion',
    'numeroSecForma', 'numeroSecColor', 'numeroSecContorno', 'numeroSecFondo', 'numeroSecPeso',
    'numeroSecGlow', 'numeroSecTamanio', 'numeroSecPrefijo',
    'cantidadColor', 'cantidadContorno', 'cantidadFondo', 'cantidadTamanio',
    'cantidadGrosorContorno', 'cantidadRadio', 'cantidadPeso', 'cantidadSeguirAlerta',
    'cronometroColor', 'cronometroContorno', 'cronometroFondo',
    'cronometroContornoLetra', 'cronometroFondoTexto',
    'cronometroForma', 'cronometroAncho', 'cronometroAlto', 'cronometroRadio',
    'numeroSecAncho', 'numeroSecAlto',
    'tarjetaRadio', 'tarjetaPadding', 'tarjetaGap',
    'colorDegradadoTarjeta', 'degradadoTarjeta', 'colorFondoTarjeta',
    'quitarNombreCocineroTarjeta', 'ocultarAtencionUrgente', 'animacionesAlerta',
    'animacionAtencion', 'animacionUrgente', 'colorAnimacionAtencion', 'colorAnimacionUrgente',
    'emojisAnimacionAtencion', 'tamanioEmojiAtencion', 'cantidadEmojiAtencion',
    'emojisAnimacionUrgente', 'tamanioEmojiUrgente', 'cantidadEmojiUrgente',
    'autoAgrandamiento', 'autoAcomodamiento', 'aprovecharEspacio',
    'tamanioCronometroCabecera',
]);

function esClavePerfilVerCocina(k) {
    if (typeof k !== 'string' || BLOQUEADAS.has(k)) return false;
    return CLAVE_RE.test(k);
}

function valorPerfilSeguro(v) {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'boolean') return v;
    if (t === 'number') return Number.isFinite(v) ? v : undefined;
    if (t === 'string') return v.length > 2000 ? v.slice(0, 2000) : v;
    if (Array.isArray(v)) {
        const out = [];
        for (const item of v.slice(0, 8)) {
            if (typeof item !== 'string') continue;
            const s = item.length > 80 ? item.slice(0, 80) : item;
            if (s) out.push(s);
            if (out.length >= 3) break;
        }
        return out;
    }
    return undefined;
}

function sanitizarClavesContadorPerfil(v) {
    if (v == null) return null;
    let list = v;
    if (typeof list === 'string') list = list.split(/[,|]/);
    if (!Array.isArray(list)) return undefined;
    const seen = new Set();
    const out = [];
    for (const item of list.slice(0, 8)) {
        const raw = typeof item === 'string' ? item : (item && (item.clave || item.nombre));
        if (typeof raw !== 'string' || !raw) continue;
        const k = claveNombreComplemento(raw.length > 80 ? raw.slice(0, 80) : raw);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(k);
        if (out.length >= 3) break;
    }
    return out;
}

function sanitizarConfigPerfilVerCocina(config) {
    const sanitizado = {};
    if (!config || typeof config !== 'object' || Array.isArray(config)) return sanitizado;
    for (const [k, v] of Object.entries(config)) {
        if (!esClavePerfilVerCocina(k)) continue;
        if (k === 'contadorGuarnicionesClaves') {
            const claves = sanitizarClavesContadorPerfil(v);
            if (claves === undefined) continue;
            sanitizado[k] = claves;
            continue;
        }
        const safe = valorPerfilSeguro(v);
        if (safe === undefined) continue;
        sanitizado[k] = safe;
    }
    return sanitizado;
}

function fusionarConfigPerfilVerCocina(actual, incomingSanitizado) {
    const base = sanitizarConfigPerfilVerCocina(actual);
    const next = (incomingSanitizado && typeof incomingSanitizado === 'object')
        ? incomingSanitizado
        : {};
    return { ...base, ...next };
}

/**
 * Snapshot de Vista y alertas de las tablas KDS.
 * Contrato igual que Ver Cocina: toda opción del panel sobrevive a Guardar.
 * La lista documenta claves conocidas; camelCase nuevas también pasan.
 */
const PERFIL_TABLAS_KDS_KEYS = new Set([
    'tamanoFuente',
    'tamanoFuentePlatos',
    'tamanoTarjeta',
    'columnasGrid',
    'filasGrid',
    'ordenamientoDefault',
    'modoVista',
    'mostrarBadgeGuarnicion',
    'juntarGuarnicionesVisualKds',
    'usarNombreCocinaEnTablaKds',
    'ordenColaFuente',
    'ordenColaTamano',
    'ordenColaColor',
    'ordenColaMostrarHash',
    'ordenColaCuadroColor',
    'ordenColaCuadroTamano',
    'cantidadPlatoColor',
    'cantidadPlatoFondo',
    'cantidadPlatoTamano',
    'mozoNombreFuente',
    'mozoNombreTamano',
    'mozoNombreColor',
    'alertYellowMinutes',
    'alertRedMinutes',
    'alertCriticalMinutes',
    'timbreClave',
    'timbreVolumen',
    'sonidoNuevaComanda',
    'sonidoFinalizar',
    'sonidoEntregar',
    'timbreFinalizarClave',
    'timbreEntregarClave',
]);

function sanitizarConfigPerfilTablasKds(config) {
    const sanitizado = {};
    if (!config || typeof config !== 'object' || Array.isArray(config)) return sanitizado;
    for (const [k, v] of Object.entries(config)) {
        if (!esClavePerfilVerCocina(k)) continue;
        const safe = valorPerfilSeguro(v);
        if (safe === undefined) continue;
        sanitizado[k] = safe;
    }
    return sanitizado;
}

function fusionarConfigPerfilTablasKds(actual, incomingSanitizado) {
    const base = sanitizarConfigPerfilTablasKds(actual);
    const next = (incomingSanitizado && typeof incomingSanitizado === 'object')
        ? incomingSanitizado
        : {};
    return { ...base, ...sanitizarConfigPerfilTablasKds(next) };
}

module.exports = {
    PERFIL_VER_COCINA_KEYS,
    PERFIL_TABLAS_KDS_KEYS,
    sanitizarConfigPerfilVerCocina,
    fusionarConfigPerfilVerCocina,
    sanitizarConfigPerfilTablasKds,
    fusionarConfigPerfilTablasKds,
};
