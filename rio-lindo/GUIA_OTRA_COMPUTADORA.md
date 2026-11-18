# Río Lindo: instalación en otra computadora con MongoDB central

Fecha de revisión: 17 de noviembre de 2026, hora de Lima.

## 1. Objetivo y función de cada repositorio

La **PC A** es esta computadora: conserva el MongoDB existente y sus datos. Su IP Ethernet observada es `192.168.50.156`; debe confirmarse y reservarse en el router antes de usarla como dirección permanente.

La **PC B** es la otra computadora: ejecutará `backend-rio-lindo` en el puerto `3020`, `appcocina-rio-lindo` en `3021` y el launcher para controlarlos. Su dirección se representa como `IP_PC_B` hasta verificarla.

El navegador de cocina se comunica por HTTP y Socket.IO con el backend de la PC B. El backend se comunica con MongoDB en la PC A, puerto `27017`, base `lasgambusinas`. El launcher inicia procesos y permite comprobar conexiones; cocina y launcher no deben guardar credenciales de MongoDB en código público ni establecer una conexión de base de datos desde el navegador.

Repositorios:

- [appcocina-rio-lindo](https://github.com/linareskiara005-hub/appcocina-rio-lindo).
- [backend-rio-lindo](https://github.com/linareskiara005-hub/backend-rio-lindo).
- [las-gambusinas-launcher](https://github.com/linareskiara005-hub/las-gambusinas-launcher), clonado aquí como `las-gambusinas-launcher-rio-lindo` para conservar el launcher anterior.

Esta guía describe el despliegue pendiente en la PC B. Las comprobaciones locales de instalación y arranque se registran por separado en los documentos de esta carpeta.

## 2. Estado confirmado y datos pendientes

En la PC A se comprobó:

- Servicio Windows `MongoDB` iniciado y automático; instalación en `C:\Program Files\MongoDB\Server\8.2`.
- Configuración `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg`.
- MongoDB escucha únicamente en `127.0.0.1:27017`. Actualmente otra computadora no puede conectarse directamente.
- La URI local utiliza la base `lasgambusinas`, sin credenciales. No está configurado `security.authorization`.
- MongoDB respondió al comando `ping`. Es una instancia standalone, sin replica set configurado.
- El backend existente en `3000` respondió a `/health` con MongoDB `up` y Redis deshabilitado, usando memoria. El estado general era `degraded`.
- Los puertos `3000`, `3001` y `5174` ya estaban ocupados; los puertos elegidos para Río Lindo son `3020` y `3021`.

Falta confirmar en la PC B: IP fija/reservada, conexión a la misma LAN o VPN, permisos de instalación, puertos libres, acceso a los repositorios y prueba real de cocina. Esta guía no implica que esos cambios remotos ya estén realizados.

## 3. Elegir cómo convivirán los backends

### Opción A: un único backend operativo para todos los clientes

Es la propuesta más simple para evitar coordinación entre servidores. Después de probar y planificar el cambio, se detiene el backend anterior de la PC A, se inicia el de la PC B con `MODO_REPLICA=false` y se actualizan **todos** los clientes, incluidos mozos, administración y facturación, hacia `http://IP_PC_B:3020`.

MongoDB permanece en la PC A. Esta migración no se ha realizado. El backend B asumirá los trabajos automáticos; antes del primer arranque revisar sus archivos `data/*.json`, porque sin modo réplica puede importar datos al MongoDB compartido. El nombre de los archivos y los datos históricos deben corresponder al sistema real, no a un conjunto de demostración.

### Opción B: mantener también el backend actual de la PC A

Usar `MODO_REPLICA=true` en Río Lindo. En el código revisado, evita reimportar JSON y duplicar los barridos principales; el backend A conserva esa responsabilidad. No es un modo de solo lectura: el backend B puede modificar pedidos y siguen existiendo inicializaciones, índices y un seed de tipos de plato.

Compartir MongoDB no distribuye automáticamente los eventos de cocina. Si mozos envían pedidos al backend A y cocina escucha al B, deben configurarse y probarse ambos con el mismo Redis y adaptador Socket.IO. El [adaptador Redis de Socket.IO](https://socket.io/docs/v4/redis-adapter/) retransmite eventos entre servidores mediante Pub/Sub.

En ambos backends se necesita `REDIS_ENABLED=true` y `REDIS_URL` apuntando al mismo servicio Redis privado y autenticado. También hay que comprobar caché, namespaces, salas, eventos y trabajos/colas de ambos procesos. Redis no está desplegado ni validado como parte de esta guía. Dejarlo deshabilitado sirve para una prueba local, pero no acredita comunicación en tiempo real entre dos backends.

`MODO_REPLICA` es una variable propia de la aplicación. No crea un replica set MongoDB ni requiere agregar `replicaSet=rs0` a la URI.

## 4. Preparar las dos computadoras

1. Reservar la IP de la PC A y la PC B en el router; comprobarlas con `ipconfig`.
2. Usar una red privada de confianza. Entre locales/redes diferentes, utilizar una VPN con rutas privadas; no publicar MongoDB mediante redirección de puertos del router.
3. Evitar suspensión de la PC A: si se apaga o pierde red, el backend B pierde acceso a los datos.
4. Instalar en la PC B Git, Node.js/npm compatibles con los proyectos y un navegador. Usar las versiones verificadas en el registro local como referencia.
5. Instalar MongoDB Shell (`mongosh`) en A y B para el diagnóstico/autenticación, y MongoDB Database Tools (`mongodump`) en A si no están disponibles. No hace falta instalar otro servidor MongoDB en B.
6. Acordar una ventana de mantenimiento para la autenticación: afecta a todos los consumidores de la base, incluso los que siguen en esta computadora.

## 5. Respaldar antes de habilitar acceso remoto

Los comandos siguientes son instrucciones para la ventana de mantenimiento; no fueron ejecutados al redactar esta guía.

En la PC A, pausar escrituras y detener ordenadamente los backends y trabajos que escriben en MongoDB. Una copia lógica de una instancia standalone debe hacerse sin escrituras concurrentes para obtener datos coherentes.

En PowerShell, después de instalar Database Tools y verificar su acceso:

```powershell
$respaldo = Join-Path 'C:\Users\W11\Desktop\GAMBUSINAS\_respaldos' ('antes-rio-lindo-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
mongodump --uri 'mongodb://127.0.0.1:27017/lasgambusinas' --out $respaldo
if ($LASTEXITCODE -ne 0) { throw 'Falló el respaldo; no continuar.' }
Get-ChildItem -LiteralPath $respaldo -Recurse -File | Select-Object FullName,Length
```

Guardar también una copia del `mongod.cfg` y de las configuraciones de los consumidores, en una ubicación privada. Verificar el respaldo y, si se prueba restauración, hacerlo en otra instancia o base aislada. No probar `mongorestore --drop` contra la base operativa.

## 6. Preparar usuarios y autenticación en la PC A

Todavía con MongoDB limitado a loopback, abrir:

```powershell
mongosh 'mongodb://127.0.0.1:27017/admin'
```

En `mongosh`, sustituir `USUARIO_ADMIN` y `USUARIO_APP` por nombres definitivos. Las contraseñas se introducen en el prompt y se guardan en un gestor privado; no se escriben en esta documentación ni en Git.

```javascript
use admin
db.createUser({
  user: "USUARIO_ADMIN",
  pwd: passwordPrompt(),
  roles: [{ role: "root", db: "admin" }]
})
use lasgambusinas
db.createUser({
  user: "USUARIO_APP",
  pwd: passwordPrompt(),
  roles: [{ role: "readWrite", db: "lasgambusinas" }]
})
```

La cuenta administrativa se reserva para mantenimiento; el backend usa la cuenta de aplicación. Si ya existen usuarios, comprobar sus roles en lugar de volver a crearlos. En producción pueden crearse cuentas de aplicación distintas para cada backend con el mismo alcance de base.

Antes de activar `authorization`, preparar y guardar las URI autenticadas de **todos** los consumidores: backend actual, backend Río Lindo, servicios, scripts de respaldo y herramientas que accedan directamente a MongoDB. No reiniciarlos hasta terminar la configuración del servicio.

URI del backend actual, que continúa en la PC A:

```dotenv
DBLOCAL=mongodb://USUARIO_APP:CLAVE_CODIFICADA_URI@127.0.0.1:27017/lasgambusinas?authSource=lasgambusinas
```

URI del backend Río Lindo en la PC B:

```dotenv
DBLOCAL=mongodb://USUARIO_APP:CLAVE_CODIFICADA_URI@192.168.50.156:27017/lasgambusinas?authSource=lasgambusinas
```

Sustituir los marcadores y codificar los caracteres especiales de usuario/contraseña para una URI. No cambiar `authSource` a `admin` si el usuario de aplicación se creó en `lasgambusinas`. `DBLOCAL` tiene prioridad sobre `MONGODB_URI`; eliminar o actualizar una `DBLOCAL` antigua para evitar conectar al destino incorrecto.

El [control de acceso de MongoDB](https://www.mongodb.com/docs/manual/tutorial/enable-authentication/) exige autenticación y aplica los roles asignados. Este paso requiere actualizar todos los consumidores antes de reiniciarlos.

## 7. Habilitar únicamente la interfaz privada de MongoDB

En la PC A, editar `mongod.cfg` como administrador, conservando sus secciones existentes. Ajustar las claves siguientes; no reemplazar el archivo entero:

```yaml
net:
  port: 27017
  bindIp: 127.0.0.1,192.168.50.156
security:
  authorization: enabled
```

Conservar el `storage.dbPath` existente (`C:\Program Files\MongoDB\Server\8.2\data`) y las rutas de logs. Usar la IP privada vigente si cambió. No agregar `bindIpAll` ni `0.0.0.0`: MongoDB recomienda limitar la escucha a las [interfaces de redes de confianza](https://www.mongodb.com/docs/manual/core/security-mongodb-configuration/).

Antes de reiniciar el servicio, crear una regla restringida. En PowerShell como administrador de la PC A:

```powershell
$ipMongo = '192.168.50.156'
$ipBackend = Read-Host 'IP privada real de la PC B'
New-NetFirewallRule -DisplayName 'MongoDB Rio Lindo PC B' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $ipMongo -LocalPort 27017 -RemoteAddress $ipBackend -Profile Private
Restart-Service -Name MongoDB
Get-Service -Name MongoDB
```

Verificar que la interfaz conectada tenga perfil Privado y revisar reglas existentes: una regla permisiva anterior puede seguir dando acceso a más equipos aunque esta nueva sea restringida. Para una VPN, adaptar direcciones y perfil a la interfaz real, manteniendo autorizado solamente el origen necesario. La autenticación no cifra el tráfico; utilizar la red privada de confianza y VPN/TLS cuando corresponda.

Comprobar acceso autenticado local en la PC A y remoto desde la PC B, con prompt de contraseña:

```powershell
# En A
mongosh 'mongodb://127.0.0.1:27017/lasgambusinas' --username 'USUARIO_APP' --authenticationDatabase 'lasgambusinas' --password
# En B
Test-NetConnection 192.168.50.156 -Port 27017
mongosh 'mongodb://192.168.50.156:27017/lasgambusinas' --username 'USUARIO_APP' --authenticationDatabase 'lasgambusinas' --password
```

Dentro de `mongosh`: `db.runCommand({ ping: 1 })`. Verificar además que una consulta protegida sin autenticar sea rechazada. Después, reiniciar únicamente los consumidores acordados, ya con sus nuevas URI.

## 8. Descargar e instalar en la PC B

Ejemplo para un usuario Windows llamado `W11`. Si la otra computadora usa otro usuario, sustituir la ruta raíz. No sobrescribir carpetas existentes ni mezclar estos clones con los proyectos anteriores.

```powershell
$raizRio = 'C:\Users\W11\Desktop\GAMBUSINAS'
New-Item -ItemType Directory -Path $raizRio -Force | Out-Null
Set-Location -LiteralPath $raizRio
git clone https://github.com/linareskiara005-hub/backend-rio-lindo.git backend-rio-lindo
git clone https://github.com/linareskiara005-hub/appcocina-rio-lindo.git appcocina-rio-lindo
git clone https://github.com/linareskiara005-hub/las-gambusinas-launcher.git las-gambusinas-launcher-rio-lindo
```

Si los repositorios son privados, iniciar sesión mediante el gestor de credenciales de Git. No incluir tokens en las URL. Si una carpeta ya existe, comprobar `git remote -v` y `git status` antes de actualizarla.

Instalar, comprobando que cada comando finalice con código cero:

```powershell
Set-Location -LiteralPath "$raizRio\backend-rio-lindo"
npm.cmd install
Set-Location -LiteralPath "$raizRio\appcocina-rio-lindo"
npm.cmd ci --legacy-peer-deps
Set-Location -LiteralPath "$raizRio\las-gambusinas-launcher-rio-lindo"
npm.cmd ci
```

El backend descargado originalmente no incluía `package-lock.json`, por eso requiere `install`. Conservar el lock generado como referencia de la instalación. Cocina requiere la opción indicada por las dependencias de su lock. No ejecutar actualizaciones masivas de dependencias durante este despliegue.

## 9. Configurar backend y cocina en la PC B

Crear un `.env` privado en `backend-rio-lindo`, tomando su `.env.example` como base. Ejemplo de convivencia con el backend A:

```dotenv
PORT=3020
IP=IP_PC_B
DBLOCAL=mongodb://USUARIO_APP:CLAVE_CODIFICADA_URI@192.168.50.156:27017/lasgambusinas?authSource=lasgambusinas
NODE_ENV=development
JWT_SECRET=SECRETO_PRIVADO_ACORDADO
MODO_REPLICA=true
ALLOWED_ORIGINS=http://IP_PC_B:3021,http://localhost:3021,http://127.0.0.1:3021
REDIS_ENABLED=false
FACTURACION_HABILITADA=false
FACTURACION_WORKER=false
```

Este Redis deshabilitado solo permite validar el backend B y sus propios clientes. Para la opción B operativa, reemplazarlo por Redis compartido y comprobar la integración entre servidores antes de habilitar el uso diario. Para la opción A, establecer `MODO_REPLICA=false` durante el cambio planificado. Revisar facturación por separado antes de trasladar esa responsabilidad.

Mantener un `JWT_SECRET` coherente entre los servidores que deban aceptar los mismos tokens, obtenido de la configuración privada; no inventar otro durante una migración de sesiones. No colocar este secreto en `REACT_APP_*`: esas variables se incorporan al frontend público.

Crear `.env` en `appcocina-rio-lindo`:

```dotenv
PORT=3021
REACT_APP_IP=IP_PC_B
REACT_APP_API_COMANDA=http://IP_PC_B:3020/api/comanda
REACT_APP_ALLOWED_HOSTS=localhost,127.0.0.1,IP_PC_B
BROWSER=none
```

Sustituir todas las apariciones de `IP_PC_B`. Aquí debe ir la IP del backend B, no la IP del MongoDB A. Cocina usa el puerto de backend `3020` en `src/config/apiConfig.js`; no basta cambiar solo el puerto del launcher si se elige otro.

La configuración `kdsConfig` guardada en el navegador tiene prioridad sobre `.env`; después sigue `REACT_APP_IP` y luego `REACT_APP_API_COMANDA`. Si apunta a un servidor anterior, cambiar la dirección en la configuración de cocina o quitar únicamente esa entrada desde las herramientas del navegador. Reiniciar `npm start` después de editar `.env`; si se sirve un build, reconstruirlo.

## 10. Arranque y configuración del launcher

Primero comprobar manualmente el backend, en una terminal de la PC B:

```powershell
Set-Location -LiteralPath 'C:\Users\W11\Desktop\GAMBUSINAS\backend-rio-lindo'
npm.cmd start
```

En otra terminal:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3020/health'
Set-Location -LiteralPath 'C:\Users\W11\Desktop\GAMBUSINAS\appcocina-rio-lindo'
npm.cmd start
```

Abrir `http://localhost:3021` en la PC B. Para clientes de otras computadoras, permitir en el firewall B los puertos necesarios `3020/3021` en perfil Privado y con orígenes concretos autorizados. Comprobar cada puerto antes de agregar reglas.

Detener con `Ctrl+C` los procesos iniciados en las terminales antes de iniciarlos desde el launcher, para evitar dos procesos intentando usar el mismo puerto.

Usar [abrir-launcher-rio-lindo.ps1](./abrir-launcher-rio-lindo.ps1) para abrir el launcher con un perfil separado del existente. Copiar juntos este archivo y [launcher-aislado.cjs](./launcher-aislado.cjs) dentro de `GAMBUSINAS\docs\rio-lindo` en B. No copiar `.local`: contiene el perfil y las rutas absolutas de A. El wrapper calcula las rutas desde su ubicación y crea un perfil nuevo en B.

Desde la carpeta raíz de los proyectos:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\docs\rio-lindo\abrir-launcher-rio-lindo.ps1
```

Esta opción de ejecución solo afecta a ese proceso de PowerShell. El perfil se guarda en `docs\rio-lindo\.local\launcher\LasGambusinas\launcher-config.json`; el wrapper conserva su configuración en las aperturas siguientes. Si se trasladan las carpetas después de la primera apertura, corregir ahí las rutas.

En su configuración revisar:

- `paths.backend`: carpeta `backend-rio-lindo`; `paths.cocina`: carpeta `appcocina-rio-lindo`.
- `ports.backend=3020`, `ports.cocina=3021`, `publicBaseUrl=http://127.0.0.1:3020`.
- `npmScripts.backend=start`, `npmScripts.cocina=start`, `autoUpdate=false`.
- `autoStartServicesOnLauncherOpen=false`, `autoStartLauncherWithWindows=false` y `autoStartExpoWithServices=false` durante validación.

El launcher original guarda su perfil bajo `%APPDATA%\LasGambusinas` y trae rutas/URL de otros proyectos. El wrapper permite aislarlo. No usar descarga global ni autoarranque global sin revisar: esas secuencias incluyen facturación y pueden intentar iniciar más servicios. Para el objetivo actual, iniciar solo backend y cocina con sus controles individuales.

El chequeo de MongoDB del launcher usa Mongoose y lee el `.env` del backend; no requiere `mongosh`. El botón «Abrir MongoDB» conserva una dirección local fija y no demuestra acceso a la base remota. Ese chequeo no sustituye una prueba de cocina. No instalar un MongoDB nuevo en B para resolver un fallo de acceso a A.

Para abrir el launcher al iniciar sesión en Windows, crear un acceso directo a `powershell.exe` con los argumentos `-NoProfile -ExecutionPolicy Bypass -File "RUTA_COMPLETA\docs\rio-lindo\abrir-launcher-rio-lindo.ps1"` y colocarlo en la carpeta de Inicio del usuario de B. Mantener desactivada la casilla nativa de inicio con Windows: su acceso ejecuta `npm start` y omite el perfil aislado. Este acceso abre el panel; los dos servicios se inician con sus botones individuales. El arranque desatendido exclusivo de backend y cocina requiere adaptar el launcher o configurar tareas separadas y validar el orden; no está habilitado por este trabajo.

## 11. Prueba de aceptación y operación diaria

1. Desde B, confirmar TCP a A:27017, autenticación y `ping`.
2. Consultar `/health` en B:3020 y comprobar específicamente MongoDB `up`; un HTTP 200 o un estado general `degraded` por sí solos no acreditan todos los servicios.
3. Abrir cocina, iniciar sesión y verificar la URL REST y la conexión Socket.IO `/cocina` al backend B.
4. Acordar un pedido de prueba identificable, verificar su aparición, cambio de estado y persistencia al recargar. No alterar pedidos reales para probar.
5. Si conviven dos backends, crear el pedido desde un cliente del A y actualizarlo desde cocina B; confirmar recepción de eventos en ambas direcciones sin recarga y ausencia de trabajos duplicados.
6. Verificar recuperación tras un reinicio controlado de B y una reconexión de red. Registrar resultados y cerrar/anular el pedido de prueba mediante el flujo normal autorizado.

Orden diario: PC A y MongoDB; Redis si corresponde; backend responsable de trabajos automáticos; backend B si es adicional; cocina. El launcher puede centralizar los controles después de comprobar sus rutas.

Si falla el despliegue, detener primero los procesos nuevos en B y restaurar el servicio anterior con su configuración de conexión ya autenticada. Revisar red, URI, usuario, perfil de firewall y logs. No desactivar autenticación ni restaurar datos productivos como primera respuesta. Si se revierte la escucha remota, conservar loopback y cerrar la regla de acceso B; los datos siguen en el mismo `dbPath`.

El objetivo se considera cumplido cuando la otra computadora arranca sus componentes, el backend usa el MongoDB central autenticado y cocina recibe y persiste los cambios del flujo real elegido. La instalación local, por sí sola, no completa esa validación remota.
