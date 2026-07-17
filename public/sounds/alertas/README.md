# Sonidos de Alertas

Catálogo de sonidos para el sistema de Alertas (`docs/PLAN_CHAT_GRUPAL_Y_ALERTAS.md`).

Coloca aquí los archivos de sonido a los que hacen referencia las claves del
catálogo `ALERTA_SONIDOS` en `src/services/alertaService.js`:

| Clave         | Archivo esperado             | Notas                                        |
|---------------|------------------------------|----------------------------------------------|
| `beep`        | `beep.mp3`                   | Beep corto                                   |
| `doble-beep`  | `doble-beep.mp3`             | Dos tonos                                    |
| `sirena`      | `sirena.mp3`                 | Loop corto hasta fin de duración o ack       |
| `chime`       | `chime.mp3`                  | Campana suave                                |
| `silencio`    | (sin archivo)                | Solo visual                                  |

Convención de URL pública: `/sounds/alertas/<clave>.mp3`

Si un archivo falta, las apps deben caer a un beep por Web Audio / Expo AV
como fallback (no bloquear la alerta).
