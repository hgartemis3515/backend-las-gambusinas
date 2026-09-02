/**
 * Siguiente backup de una regla de asignación automática.
 * Si el plato está en el primario (o en alguien que no es backup), elige el primero.
 * Si ya está en un backup, pasa al siguiente de la cadena.
 */
function elegirSiguienteBackup(regla, cocineroActualId) {
  if (!regla) return null;
  const actual = cocineroActualId != null ? String(cocineroActualId) : '';
  const backups = (regla.backups || [])
    .filter((b) => b && b.cocineroId)
    .slice()
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  if (!backups.length) return null;
  const idx = backups.findIndex((b) => String(b.cocineroId) === actual);
  if (idx === -1) return backups[0];
  return backups[idx + 1] || null;
}

module.exports = { elegirSiguienteBackup };
