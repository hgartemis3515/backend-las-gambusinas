# Río Lindo: objetivo, instalación local y conexión entre computadoras

Revisión: **17 de noviembre de 2026, hora de Lima**.

## Objetivo

Ejecutar el backend, la aplicación de cocina y su panel launcher en una segunda computadora, conservando los datos en el MongoDB que ya existe en esta computadora.

La comunicación prevista es: **Cocina en PC B → Backend en PC B → MongoDB en PC A**. El launcher en B controla los procesos y comprueba MongoDB leyendo la configuración del backend. La aplicación de cocina accede a la base a través del backend; el navegador no debe recibir la contraseña de MongoDB.

- **PC A, esta máquina:** MongoDB, puerto `27017`, base existente `lasgambusinas`. IP Ethernet observada: `192.168.50.156`, pendiente de reservar y confirmar antes del despliegue.
- **PC B, otra máquina:** backend en `3020`, cocina en `3021` y launcher. Su IP todavía debe obtenerse en esa computadora.

La [guía de instalación en la otra computadora](./GUIA_OTRA_COMPUTADORA.md) contiene los pasos de red, autenticación, instalación, configuración y aceptación.

## Repositorios descargados

Los tres clones están dentro de `C:\Users\W11\Desktop\GAMBUSINAS`:

- `backend-rio-lindo`: [repositorio](https://github.com/linareskiara005-hub/backend-rio-lindo), commit revisado `70af54d35220206f8bb12b963ab1796fc6b68fd3`.
- `appcocina-rio-lindo`: [repositorio](https://github.com/linareskiara005-hub/appcocina-rio-lindo), commit revisado `b0f471d657dbd5c69b0a23b5824ff6ac2de0fbc0`.
- `las-gambusinas-launcher-rio-lindo`: [repositorio solicitado](https://github.com/linareskiara005-hub/las-gambusinas-launcher), commit revisado `55bab13aa2371cc3bcdd0bde169ee51f6b8065d`.

El sufijo del tercer directorio evita sobrescribir `las-gambusinas-launcher`, que pertenece a otro remoto y contiene cambios locales. Los proyectos anteriores se conservaron.

## Dependencias y configuración preparadas aquí

Entorno utilizado: Windows, Node.js `v24.13.0`, npm `11.6.2`.

- Backend: `npm.cmd install --no-audit --no-fund` terminó correctamente. El repositorio no traía lock; se generó `package-lock.json`, ignorado por su `.gitignore`.
- Cocina: `npm.cmd ci --legacy-peer-deps --no-audit --no-fund` terminó correctamente. El intento normal de `ci` falló por un conflicto entre React 18 y la dependencia heredada de React Native AsyncStorage. Se conservó el lock existente.
- Launcher: `npm.cmd ci --no-audit --no-fund` terminó correctamente.

Los avisos de dependencias obsoletas emitidos por npm no se resolvieron mediante actualizaciones de versiones. No se hizo una auditoría de seguridad ni una actualización masiva de paquetes.

Se crearon archivos `.env` locales ignorados por Git:

- `backend-rio-lindo/.env`: puerto `3020`, MongoDB actual vía loopback y base `lasgambusinas`, `MODO_REPLICA=true`, Redis desactivado, HTTPS adicional desactivado y facturación desactivada. Se conservó privadamente el `JWT_SECRET` configurado en el backend existente para mantener coherencia de tokens.
- `appcocina-rio-lindo/.env`: backend `127.0.0.1:3020`, hosts locales permitidos y apertura automática del navegador desactivada. Su script `npm start` fija el puerto `3021`.

Estas direcciones son para esta computadora. Al llevarlos a B hay que reemplazar la URI de MongoDB por la dirección de A y la dirección pública del backend por la de B, como indica la guía. No publicar ni copiar secretos dentro del frontend.

## Comprobaciones de arranque

- Cocina completó `npm.cmd run build`: **Compiled successfully**. El compilador advirtió que el bundle principal es grande.
- El backend se inició en `3020` con un proceso de MongoDB separado, limitado a loopback en `27220`, directorio de prueba dentro de `.local` y base `rio_lindo_prueba`.
- `/health` respondió con MongoDB `up`; el estado general fue `degraded` con Redis desactivado. Se verificó por separado el resultado de MongoDB.
- La respuesta CORS autorizó el origen de cocina `http://127.0.0.1:3021`.
- El handshake de transporte Socket.IO respondió HTTP `200` y un paquete de apertura válido. Esto verifica transporte; no acredita sesión de cocinero ni eventos de pedidos entre dos servidores.
- El comprobador Mongoose del launcher hizo conexión y `ping` al MongoDB actual con resultado correcto. Esta comprobación no ejecutó el arranque del backend contra la base operativa.

Al probar con la base vacía aparecieron avisos de índices sobre las colecciones `mesas` y `clientes` aún inexistentes. El backend pudo iniciar y responder. No se crearon usuarios ni pedidos en la base operativa para realizar esta prueba.

- Cocina arrancó en modo desarrollo en `3021`, compiló correctamente y respondió HTTP `200`.
- El launcher se abrió con el perfil aislado y se verificó visualmente su interfaz, el indicador de conexión MongoDB correcta y los indicadores HTTP de backend/cocina durante la prueba. Sus botones muestran «Detenido» para procesos iniciados externamente; la comprobación HTTP es independiente.
- Al terminar se detuvieron backend, cocina y MongoDB de prueba. El launcher quedó abierto sin servicios propios iniciados. MongoDB operativo y los servicios anteriores continuaron ejecutándose.

No se ha efectuado una prueba completa de login, pedido y persistencia desde la PC B. No se ejecutó la suite completa de tests de los repositorios.

## Abrir el launcher de Río Lindo

Desde la raíz de los proyectos:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\docs\rio-lindo\abrir-launcher-rio-lindo.ps1
```

El [wrapper](./abrir-launcher-rio-lindo.ps1) y su [bootstrap](./launcher-aislado.cjs) usan un perfil propio bajo `docs\rio-lindo\.local\launcher`, con las rutas de los clones nuevos. El cambio de `APPDATA` afecta únicamente al proceso del launcher y a sus hijos; no modifica la variable global de Windows. También se separa explícitamente el directorio `userData` de Electron.

El panel abre con los arranques automáticos y las actualizaciones automáticas desactivados. Usar los botones individuales de backend y cocina cuando corresponda. El botón global también contempla facturación, fuera de este alcance. No iniciar un servicio desde el panel mientras otra instancia ocupa su puerto.

**Importante:** el `.env` local del backend apunta a la base existente. Iniciarlo desde el launcher permite que la aplicación escriba en ella; `MODO_REPLICA=true` no es un modo de solo lectura. Las pruebas de arranque aquí descritas utilizaron otra instancia de MongoDB mediante una variable de entorno temporal, sin cambiar ese `.env`.

Para trasladar el acceso a B, copiar ambos archivos a `GAMBUSINAS\docs\rio-lindo`, excluir `.local` y ejecutar el wrapper allí para generar las rutas de B.

## Qué falta para cumplir el objetivo en la otra PC

1. Confirmar la IP de B y la conectividad LAN o VPN con A.
2. Respaldar y preparar autenticación, escucha privada y firewall de MongoDB en A. Hoy solo escucha en `127.0.0.1`, así que B todavía no puede acceder.
3. Instalar los clones y configurar sus `.env` en B, sin cambiar el nombre de la base existente.
4. Elegir entre trasladar todos los clientes a un único backend B o conservar dos backends con Redis compartido y responsabilidades coordinadas. Compartir MongoDB por sí solo no distribuye eventos Socket.IO.
5. Validar desde B el login, un pedido controlado, la actualización en vivo, la persistencia y la recuperación después de reiniciar.

La preparación local queda separada de estos pasos pendientes. No se modificaron el servicio MongoDB operativo, su autenticación, su escucha de red ni el firewall de esta computadora.
