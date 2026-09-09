/**
 * Validador del código de serie de platos
 *
 * Reglas:
 * - 1 a 4 caracteres: letras (A-Z) y/o dígitos (0-9)
 * - Regex: ^[A-Z0-9]{1,4}$
 * - Ejemplos válidos: 1, A, L, L1, M23, D345, 12, AB
 * - Obligatorio y único (código de cocina / KDS)
 *
 * Código de mozo: mismo formato, opcional y puede repetirse.
 *
 * Uso: modelo, repository, controller, platos.html (vía API), tests.
 */

const REGEX_CODIGO_PLATO = /^[A-Z0-9]{1,4}$/;

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

    const normalizado = limpio.replace(/[^A-Z0-9]/g, '').slice(0, 4);

    if (!REGEX_CODIGO_PLATO.test(normalizado)) {
        return {
            valido: false,
            error: 'Formato de código inválido: 1 a 4 letras o números (ej. 1, A, L1, M23)'
        };
    }

    return { valido: true, codigo: normalizado };
}

/**
 * Código de mozo: vacío permitido; si hay valor, mismo formato 1-4 A-Z0-9.
 * No es único.
 */
function validarCodigoMozo(codigo) {
    const limpio = String(codigo == null ? '' : codigo).trim().toUpperCase();
    if (!limpio) return { valido: true, codigo: '' };
    return validarCodigoPlato(limpio);
}

module.exports = {
    REGEX_CODIGO_PLATO,
    validarCodigoPlato,
    validarCodigoMozo
};
