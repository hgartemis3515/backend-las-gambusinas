# Plan de creación: Launcher nativo (Windows) — Las Gambusinas

**Versión del documento:** 1.2  
**Alcance:** Ejecutable con **ventana nativa** que orqueste el backend, la aplicación web de cocina, el flujo de desarrollo/build de la app de mozos (Expo), **inicio automático al encender/iniciar sesión**, **estado de MongoDB**, **estado de las tres piezas del sistema**, **actualización de los tres repositorios**, y **gestión / avisos sobre datos locales JSON** (incl. escenarios de primera ejecución).

---

## 1. Objetivo del producto

El launcher debe permitir a operación o soporte:

1. **Iniciar y detener** de forma controlada el servidor **Backend-LasGambusinas** (Node/Express, típicamente puerto **3000**).
2. **Iniciar y detener** la aplicación **appcocina** (CRA / `react-scripts`, en este proyecto suele usarse **PORT=3001** vía `.env`).
3. **Gestionar la app de mozos** (`Las-Gambusinas`, Expo): arranque del entorno de desarrollo (Metro/Expo) y **disparo de generación de APK** (EAS Build o build local con Android SDK).
4. Ofrecer un **panel en ventana nativa** (no depender solo del navegador del usuario) con estado de servicios, logs básicos y accesos rápidos (abrir cocina, abrir panel admin servido por el mismo backend en `http://<host>:3000/...`).
5. Configurar **inicio automático con el sistema** (encendido / inicio de sesión en Windows) y, en la misma pantalla, **inicio automático de servicios** (backend, cocina, opcional Expo) tras abrir el launcher.
6. **Supervisar MongoDB** (conectividad y estado coherente con el backend).
7. Mostrar **estado unificado de las tres aplicaciones**: backend API, app cocina (web), app mozos (Expo / APK).
8. Gestionar **actualización desde Git** de los tres repositorios (con comprobaciones y confirmaciones).
9. Gestionar datos en carpeta **`data/`** del backend: hoy existen varios `*.json`; el plan contempla un archivo **`data.json`** (o manifiesto equivalente) como **palanca y señal** para “hay datos / restauración”, y primera apertura del launcher con **alertas** según corresponda (ver §10–§11).

El **panel administrativo web** no es un cuarto servidor: se sirve desde el **mismo backend** (`public/`, rutas como `/`, `/login`, `/admin`). El launcher no debe “duplicar” ese panel; solo debe **abrirlo en el navegador** o embeber un `WebView` si en el futuro se desea (evaluar coste/beneficio).

---

## 2. Principios de arquitectura (recomendados)

### 2.1. Proceso separado del backend HTTP

El launcher **no debe** ejecutarse dentro del mismo proceso que `index.js` del API que atiende tablets, cocina y red del local. Motivos:

- Reinicios del backend no deben cerrar el panel de control.
- Evitar acoplar la superficie de ataque del API con la capacidad de **lanzar procesos** (`npm`, `expo`, `eas`).

**Recomendación:** un proyecto dedicado (por ejemplo `launcher/` en la raíz del monorepo o junto al backend) que genere un **.exe**; ese proceso es padre de los hijos (Node backend, React cocina, Metro Expo).

### 2.2. Seguridad si se expone API de control

Si en alguna iteración el launcher expone HTTP (p. ej. para telemetría o UI web embebida):

- Enlazar **solo `127.0.0.1`** (no `0.0.0.0`).
- Autenticación local (token en archivo no versionado, o header compartido generado en primera ejecución).
- Nunca reutilizar el mismo puerto y rutas que el POS expuesto a la LAN sin aislamiento.

### 2.3. Orden de arranque y salud

1. Levantar **backend** primero.
2. **Health-check** (p. ej. `GET http://127.0.0.1:3000/` o un endpoint ligero de estado si se añade en el futuro) con reintentos y timeout.
3. Levantar **appcocina** cuando el backend esté sano (o en paralelo con reintentos en la UI de cocina, menos deseable).
4. **Expo** es independiente para desarrollo; para APK es un flujo **batch** aparte.

---

## 3. Ventana nativa: opciones técnicas

| Opción | Ventajas | Inconvenientes |
|--------|------------|----------------|
| **Electron** | Ecosistema maduro, HTML/CSS/JS para el panel, fácil empaquetar `.exe`, tray icon, auto-updater posible. | Mayor tamaño del instalador, consumo de RAM. |
| **Tauri** | Binario más liviano, buena integración con sistema. | Curva Rust/toolchain; equipo debe asumirlo. |
| **.NET (WPF/WinUI)** | Nativo Windows, excelente UX desktop. | Segundo stack (C#) si el resto es JS. |

**Recomendación inicial para el equipo actual (stack JS):** **Electron** o, si se prioriza peso, **Tauri**. Ambos cubren ventana nativa, bandeja del sistema y registro de inicio automático vía APIs del SO o tareas programadas.

---

## 4. Funcionalidades del panel (MVP → evolución)

### 4.1. MVP

- Campos o archivo de configuración: rutas absolutas a `Backend-LasGambusinas`, `appcocina`, `Las-Gambusinas`.
- Botones **Iniciar / Detener** por servicio (backend, cocina, expo dev).
- Indicadores de estado (PID, puerto, último error).
- **MongoDB:** semáforo y comprobación previa al backend (§6).
- **Vista “Estado de las 3 apps”** (§7).
- Área de **log** (stdout/stderr agregados o últimas N líneas).
- Enlaces: “Abrir cocina en navegador”, “Abrir admin (según URL base configurada)”.
- Al cerrar el launcher: opción **“Detener todos los servicios hijos”** (importante para no dejar Node huérfano).

### 4.2. Fase 2

- Perfiles: **Desarrollo** vs **Producción** (p. ej. `node index.js` vs `pm2` o Docker si se adopta).
- **Git:** fetch / estado / pull por repositorio (§8).
- Botón **Generar APK (EAS)** con selección de perfil (`preview` / `production`).
- **Inicio automático** al encender/iniciar sesión y al abrir el launcher (§5).
- Diagnóstico: comprobar puertos ocupados, versión de Node, presencia de `android`/`JAVA_HOME` si build local.

### 4.3. Fase 3 (opcional)

- **Datos `data/` y `data.json`:** listado, eliminación controlada, asistente primera vez y alertas (§10–§11).
- Instalación de último APK en dispositivo USB vía **adb** (política de dispositivos y drivers).
- Actualizaciones del launcher (auto-update firmado).

---

## 5. Inicio automático en Windows

### 5.1. Requisitos de producto

- **Inicio con el sistema (Windows):** checkbox **“Ejecutar launcher al iniciar sesión”** (equivalente a “cuando se encienda el sistema” para el usuario operativo: el launcher queda en bandeja o minimizado).
- **Inicio automático de servicios:** independiente del anterior — checkbox **“Al abrir el launcher, iniciar backend y cocina automáticamente”** (y tercer checkbox opcional para **Expo**).
- Combinaciones típicas: (1) solo launcher en login; (2) launcher + servicios tras un **retraso** configurable para evitar fallos si MongoDB o el disco aún no están listos.

### 5.2. Mecanismos recomendados

1. **Carpeta Inicio de Windows** (`shell:startup`): acceso directo al `.exe` del launcher. Simple, reversible por el usuario sin admin.
2. **Tarea programada (Task Scheduler)** con “Al iniciar sesión”: más control (retraso, usuario, condiciones de red). Puede requerir elevación según política IT.

**Recomendación:** implementar **Inicio** vía acceso directo en Startup para el MVP; documentar alternativa con Tarea programada para entornos restringidos.

### 5.3. Auto-arranque de servicios dentro del launcher

Si “inicio automático del sistema” significa levantar backend + cocina sin clic:

- Guardar preferencia en `%APPDATA%\LasGambusinas\launcher-settings.json` (o ruta similar).
- Al abrir el launcher, si la opción está activa, ejecutar la secuencia de arranque con **retraso configurable** (p. ej. 10–30 s) para dar tiempo a red/disco en arranque frío.

**Advertencia:** en servidores compartidos, el inicio silencioso puede interferir con actualizaciones o backups; dejar siempre opción de **modo solo launcher** sin auto-start de hijos.

### 5.4. Resumen de preferencias (inicio automático)

| Preferencia | Efecto |
|-------------|--------|
| Iniciar launcher con Windows | Acceso directo o tarea programada → abre el `.exe` al login. |
| Iniciar servicios al abrir launcher | Tras leer config, ejecuta secuencia backend → health → cocina (y opc. Expo). |
| Retraso tras login / arranque | Espera N ms antes de servicios (red, MongoDB, antivirus). |

---

## 6. Verificación de estado: MongoDB

El backend usa **MongoDB** (`DBLOCAL` o `MONGODB_URI` en `.env`; ver `src/database/database.js`). Sin conexión válida el proceso puede terminar al inicio.

**En el launcher:**

1. **Lectura segura de `.env`** del backend (solo ruta configurada): extraer URI sin mostrar contraseña en claro en pantalla (enmascarar como ya hace el backend en consola).
2. **Comprobación de conectividad** antes o en paralelo al arranque del backend:
   - Opción A: ejecutar `mongosh "<uri>" --eval "db.runCommand({ ping: 1 })"` si `mongosh` está instalado.
   - Opción B: pequeño script Node temporal que use `mongoose.connect` con timeout corto y salga con código 0/1.
   - Opción C (futuro): endpoint `GET /api/health` solo en `127.0.0.1` que incluya `mongoose.connection.readyState` (requiere backend levantado — útil como segunda capa).

**UI:** semáforo **MongoDB: conectado / error / comprobando**, último mensaje de error y enlace a documentación interna (servicio Windows `MongoDB`, Docker, Atlas).

**Recomendación:** no arrancar el backend desde el launcher si el ping a MongoDB falla de forma persistente (configurable: “forzar arranque igualmente” para depuración).

---

## 7. Estado de las tres aplicaciones

Vista unificada en el panel (tabla o tarjetas):

| Pieza | Qué se monitoriza | Cómo (indicativo) |
|-------|-------------------|-------------------|
| **Backend** | Proceso vivo, puerto 3000, HTTP 200 en `/` o health | PID del hijo + petición HTTP local |
| **App cocina** | Proceso `react-scripts`, puerto configurado (p. ej. 3001) | PID + HTTP a `http://127.0.0.1:3001` |
| **App mozos** | Modo dev: Metro/Expo; modo prod: no aplica proceso local | Puerto Metro (p. ej. 8081) o estado “solo APK en dispositivos” |

**Nota:** el panel admin web **no** cuenta como cuarta app: se sirve desde el backend una vez este está **arriba**.

**Recomendación:** refresco periódico (cada 5–15 s) + botón “Actualizar ahora”; evitar polling agresivo.

---

## 8. Actualización de los tres repositorios (Git)

Sección **“Código”** en el launcher, una tarjeta por repo (`Backend-LasGambusinas`, `appcocina`, `Las-Gambusinas`):

- Mostrar **rama actual**, **último commit** (`git rev-parse --short HEAD`), **estado** (limpio / cambios locales) vía `git status -sb`.
- Botón **“Obtener cambios”** (`git fetch`) y **“Actualizar rama”** (`git pull` con la rama actual), siempre con **confirmación** y **log** de salida.
- **Advertencias obligatorias en UI:**
  - Si hay **cambios sin commit**, el `pull` puede fallar o fusionar: mostrar diff resumido o bloquear pull hasta confirmación explícita.
  - Tras actualizar backend o cocina, sugerir **reiniciar** el servicio afectado.
  - Para **mozos**, tras `pull` recordar **reinstalar** si cambió `package.json` (`npm install`) y revisar **compatibilidad Expo**.

**Recomendación:** no ejecutar `git` con privilegios elevados por defecto; registrar ruta del ejecutable `git` si no está en `PATH`.

---

## 9. Generación del APK (app mozos)

- **Recomendado:** **EAS Build** (el proyecto Expo ya define `extra.eas.projectId` en `app.json`). El launcher ejecuta `eas build` con perfil elegido y muestra enlace/estado.
- **Alternativa local:** `expo prebuild` + Gradle; requiere Android SDK, JDK alineado, keystore; más mantenimiento.

**Sugerencia:** el botón “Crear APK” no debe bloquear la UI; usar subproceso asíncrono y barra de progreso/indeterminado + log.

---

## 10. Carpeta JSON del backend, `data.json` y borrado de datos

### 10.1. Estado actual del repositorio (referencia)

En `Backend-LasGambusinas/data/` existen **varios** archivos (`mesas.json`, `platos.json`, `mozos.json`, etc.). Al conectar MongoDB, el backend **importa desde esos JSON** al inicio (ver `src/database/database.js`). La **fuente de verdad operativa** del negocio en producción es **MongoDB**; los JSON actúan como **semilla / respaldo / importación**.

### 10.2. Objetivo de producto: `data.json` y “borrar todo”

Se pide explícitamente poder **eliminar `data.json`** como acción para **eliminar todos los datos** (desde la perspectiva del operador / instalación limpia).

**Recomendación de implementación (elegir una y documentarla en código):**

1. **Opción A — Archivo único `data/data.json`:** introducir (en backend o en despliegue) un archivo agregado o **manifiesto** `data.json` que el launcher trate como **señal de “instalación con datos de ejemplo / migrados”**. Eliminarlo implica “no hay paquete de datos local” y el sistema puede arrancar solo con MongoDB vacío o política de importación definida.
2. **Opción B — Sin `data.json` hasta migrar:** el launcher considera “sin datos locales JSON” cuando **no existe** `data/data.json` (o la ruta acordada); la acción “Eliminar datos JSON” borra **todos** los `*.json` bajo `data/` **excepto** `.gitkeep` si aplica, o mueve a papelera.

**Importante:** borrar solo archivos JSON **no borra por sí las colecciones de MongoDB**. Para un “reset total” del negocio hace falta flujo aparte (p. ej. script `dropDatabase` o limpieza por colección) con **doble confirmación** y backup. El launcher debe **etiquetar** claramente:

- **“Limpiar JSON local / semillas”** (afecta reimport al siguiente arranque).
- **“Reset base de datos MongoDB”** (destructivo, solo avanzado).

### 10.3. Acciones en el launcher (UI)

- Listar `data/*.json` con tamaño y fecha.
- Botón **“Eliminar data.json”** (o el nombre final del manifiesto) con modal de confirmación.
- Opcional: **“Vaciar carpeta data (todos los .json)”** con la misma advertencia sobre MongoDB.

---

## 11. Primera apertura del launcher: dos situaciones

El launcher persiste un archivo propio, p. ej. `%APPDATA%\LasGambusinas\launcher-state.json`, con entre otros:

- `firstLaunchCompletedAt` (timestamp),
- `lastKnownDataJsonPresent` (boolean),
- opcionalmente hash o tamaño del manifiesto para detectar cambios.

### Situación 1 — Ya hay datos registrados (hay `data.json` o manifiesto / JSON con contenido)

Al abrir el launcher **por primera vez** (o cuando se detecte incoherencia tras actualización):

- Si existe **`data/data.json`** (o criterio equivalente: carpeta `data/` con archivos considerados “no vacíos” según reglas de negocio):
  - Mostrar **alerta no bloqueante** (banner o modal): *“Se detectaron datos locales en el backend (`data/`). Si desea una instalación limpia, elimine el manifiesto / los JSON indicados en la documentación o use ‘Preparar datos limpios’. Esto no sustituye un backup ni el vaciado de MongoDB.”*
  - Ofrecer accesos: **Abrir carpeta `data/`**, **Documentación**, **Eliminar data.json** (con confirmación).

### Situación 2 — No hay `data.json` (estado “bueno” para instalación limpia)

- Si **no** existe `data/data.json` (y la política acordada es “sin manifiesto = sin paquete de datos opcional”):
  - Mostrar indicador **verde** tipo *“Sin archivo de datos agregado: instalación coherente con política limpia”* (ajustar redacción a la opción A/B elegida).
  - No mostrar alerta de restablecimiento salvo otras señales (p. ej. MongoDB con muchas colecciones y JSON ausente — caso avanzado).

**Recomendación UX:** la primera vez que se abre el launcher, ejecutar un **asistente corto** (rutas a los tres repos, comprobar Git, comprobar MongoDB, revisar `data/`) y guardar `firstLaunchCompletedAt` al finalizar, para no repetir el asistente salvo menú “Volver a configurar”.

---

## 12. Configuración persistente (ampliada)

Archivo sugerido (ejemplo conceptual):

```json
{
  "paths": {
    "backend": "E:\\PROYECTOGAMBUSINAS\\Backend-LasGambusinas",
    "cocina": "E:\\PROYECTOGAMBUSINAS\\appcocina",
    "mozos": "E:\\PROYECTOGAMBUSINAS\\Las-Gambusinas"
  },
  "ports": { "backend": 3000, "cocina": 3001, "expoMetro": 8081 },
  "publicBaseUrl": "http://192.168.x.x:3000",
  "autoStartLauncherWithWindows": false,
  "autoStartServicesOnLauncherOpen": false,
  "autoStartExpoWithServices": false,
  "delaysMs": { "afterBoot": 15000, "betweenServiceStarts": 2000 },
  "mongodb": {
    "checkBeforeBackendStart": true,
    "mongoshPath": "mongosh"
  },
  "git": { "executable": "git" },
  "dataManifestPath": "data/data.json",
  "showFirstRunWizard": true
}
```

- `publicBaseUrl` sirve para abrir enlaces del admin/cocina desde otras máquinas; en el mismo PC puede usarse `http://127.0.0.1:3000`.
- No versionar secretos ni rutas absolutas de máquinas reales en git; documentar un `launcher.config.example.json`.
- `dataManifestPath` debe alinearse con lo que implemente el backend o el paquete de despliegue (ver §10).

---

## 13. Dependencias en el PC destino

- **Node.js LTS** instalado y en `PATH` (o documentar versión embebida si en el futuro se empaqueta runtime — aumenta tamaño del instalador).
- **npm** funcional; para EAS, **cuenta Expo** y login (`eas login`) en la máquina de build.
- Para desarrollo mozos: **Expo CLI** vía `npx` para reducir dependencias globales.
- Opcional: **mongosh** o **MongoDB Shell** para comprobaciones rápidas de MongoDB.

---

## 14. Plan de implementación por fases (actualizado)

| Fase | Entregable |
|------|------------|
| **F0** | Requisitos: usuario del PC, política antivirus, decisión `data.json` / manifiesto vs solo `data/*.json`, política de reset MongoDB. |
| **F1** | Esqueleto Electron/Tauri + config + estado persistente del launcher. |
| **F2** | Spawn backend/cocina; health HTTP; stop en cascada. |
| **F3** | Panel **estado 3 apps** + MongoDB check antes de arranque. |
| **F4** | **Inicio automático** Windows + auto-servicios al abrir + retrasos. |
| **F5** | **Git** fetch/status/pull por repo + logs. |
| **F6** | **Mozos:** Expo dev + **APK (EAS)** asíncrono. |
| **F7** | **Datos:** listado `data/`, eliminar `data.json` / vaciado controlado + **asistente primera vez** y alertas §11. |
| **F8** | Instalador, icono, pruebas en PC limpio. |

---

## 15. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Puerto 3000/3001 ocupado | Detector en panel + mensaje claro + sugerencia de proceso (`Get-NetTCPConnection` / documentación). |
| Antivirus bloquea Node hijo | Firma del .exe del launcher; exclusiones documentadas solo en entorno controlado. |
| Usuario cierra consola “equivocada” | Toda la salida canalizada al panel del launcher; evitar ventanas `cmd` sueltas si es posible. |
| IP del servidor cambia | Flujo de “editar config” y recordatorio de alinear `appcocina/.env` y dispositivos mozos (`apiConfig` ya orientado a configuración en app). |
| Confusión JSON vs MongoDB | UI con textos explícitos y flujos separados “semilla local” vs “reset BD” (§10). |
| `git pull` rompe entorno | Bloqueo si hay cambios locales sin commit; ofrecer stash solo a usuarios avanzados. |

---

## 16. Relación con el repositorio actual

- **Backend:** `npm start` / `npm run dev` — ver `package.json`.
- **Cocina:** `npm start` — `react-scripts`; puerto en `.env` del proyecto cocina.
- **Mozos:** Expo en `Las-Gambusinas`; APK vía EAS o pipeline local.

El launcher **no sustituye** la documentación de despliegue del backend; la complementa para el escenario **“PC Windows en el local”**. La convivencia **MongoDB + importación desde `data/*.json`** debe reflejarse en los textos del launcher y en cualquier acción destructiva.

---

## 17. Implementación en el monorepo

Proyecto **Electron** en la raíz del monorepo: carpeta **`launcher/`** (`npm start` para desarrollo, `npm run dist` para instalador Windows). Incluye `README.md`, `launcher.config.example.json`, proceso principal con **ProcessManager**, comprobación **MongoDB** (mongoose), estado HTTP, **Git**, datos **`data/` / manifiesto**, **EAS build** y acceso directo de inicio en Windows vía `scripts/create-shortcut.ps1`.

---

*Documento generado para planificación interna; actualizar versiones y fechas conforme avance la implementación.*
