/**
 * Validador del código de serie de platos
 *
 * Reglas:
 * - 1 letra mayúscula + 1 a 3 dígitos
 * - Regex: ^[A-Z][0-9]{1,3}$
 * - Ejemplos válidos: L1, L92, L923, M23, D345, C5, P100
 * - Obligatorio y único
 *
 * Uso: modelo, repository, controller, platos.html (vía API), tests.
 */

const REGEX_CODIGO_PLATO = /^[A-Z][0-9]{1,3}$/;

/**
 * Valida y normaliza un código de plato.
 * @param {string|undefined|null} codigo - Código entrante
 * @returns {{ valido: boolean, codigo?: string, error?: string }}
 */
function validarCodigoPlato(codigo) {
    const limpio = String(codigo == null ? '' : codigo).trim().toUpperCase();

    if (!limpio) {
        return { valido: false, error: 'El código del plato es obligatorio' };
    }

    // Forzar mayúscula solo en el primer carácter (la entrada ya viene uppercased)
    const normalizado = limpio.charAt(0).toUpperCase() + limpio.slice(1);

    if (!REGEX_CODIGO_PLATO.test(normalizado)) {
        return {
            valido: false,
            error: 'Formato de código inválido: debe ser una letra mayúscula seguida de 1 a 3 números (ej. L1, M23, D345)'
        };
    }

    return { valido: true, codigo: normalizado };
}

module.exports = {
    REGEX_CODIGO_PLATO,
    validarCodigoPlato
};