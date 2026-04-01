# 🚀 Instrucciones para Iniciar el Sistema Las Gambusinas

Este documento contiene las instrucciones paso a paso para iniciar las 3 aplicaciones del sistema.

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

- ✅ **Node.js** (versión 14 o superior) - Recomendado: LTS (versión 18 o superior)
- ✅ **MongoDB** (corriendo en localhost:27017)
- ✅ **npm** (viene incluido con Node.js)
- ✅ **Expo CLI** (para la app móvil): `npm install -g expo-cli`

---

## 📦 Instalación de Dependencias

### ⚠️ IMPORTANTE: Instalación con Versiones Exactas

Para evitar vulnerabilidades e incompatibilidades, **SIEMPRE** usa los scripts de instalación proporcionados que instalan las versiones exactas especificadas en los `package-lock.json`.

### Opción 1: Instalación Automática (Recomendada)

**Windows:**
```bash
# Ejecuta el script desde la raíz del proyecto
instalar-dependencias.bat
```

Este script:
- ✅ Instala todas las dependencias de los 3 proyectos automáticamente
- ✅ Usa `npm ci` para instalar versiones exactas del `package-lock.json`
- ✅ Evita vulnerabilidades e incompatibilidades
- ✅ Verifica que Node.js y npm estén instalados

### Opción 2: Instalación Individual

Si solo necesitas instalar dependencias de un proyecto específico:

```bash
# Ejecuta el script interactivo
instalar-dependencias-individual.bat
```

### Opción 3: Instalación Manual

Si prefieres instalar manualmente, usa `npm ci` en lugar de `npm install`:

```bash
# Backend
cd Backend-LasGambusinas
npm ci --legacy-peer-deps

# App Cocina
cd ../appcocina
npm ci --legacy-peer-deps

# App Móvil
cd ../Las-Gambusinas
npm ci --legacy-peer-deps
```

**Nota:** El flag `--legacy-peer-deps` es necesario para resolver algunos conflictos de dependencias entre paquetes.

### ¿Por qué usar `npm ci` en lugar de `npm install`?

- ✅ **Instala versiones exactas** del `package-lock.json` (no actualiza dependencias)
- ✅ **Más rápido** que `npm install`
- ✅ **Más confiable** para entornos de producción y desarrollo
- ✅ **Evita vulnerabilidades** al usar versiones probadas y validadas
- ✅ **Reproducible** - mismo resultado en todas las máquinas

---

## 🔧 Configuración Inicial

### 1. Verificar MongoDB

Asegúrate de que MongoDB esté corriendo:

```bash
# En Windows (si MongoDB está como servicio, debería estar corriendo automáticamente)
# Verifica en el Administrador de Tareas o ejecuta:
mongod
```

Si no tienes MongoDB instalado, descárgalo desde: https://www.mongodb.com/try/download/community

---

## 🎯 Orden de Inicio (IMPORTANTE)

**Siempre inicia en este orden:**
1. **Backend** (primero)
2. **App Cocina** (segundo)
3. **App Móvil** (tercero)

---

## 1️⃣ BACKEND - Backend-LasGambusinas

### Paso 1: Navegar a la carpeta
```bash
cd Backend-LasGambusinas
```

### Paso 2: Instalar dependencias (solo la primera vez)

**Opción A: Usar el script automático (Recomendado)**
```bash
# Desde la raíz del proyecto
instalar-dependencias.bat
```

**Opción B: Instalación manual**
```bash
npm ci --legacy-peer-deps
```

**⚠️ IMPORTANTE:** Usa `npm ci` en lugar de `npm install` para instalar las versiones exactas y evitar vulnerabilidades.

### Paso 3: Crear archivo .env
Crea un archivo llamado `.env` en la carpeta `Backend-LasGambusinas` con el siguiente contenido:

```env
DBLOCAL=mongodb://localhost:27017/lasgambusinas
PORT=8000
```

### Paso 4: Iniciar el servidor
```bash
npm start
```

**✅ Verificación:** Deberías ver en la consola:
```
Conectado a MongoDB
servidor corriendo en el puerto 8000
```

**⚠️ IMPORTANTE:** Deja esta terminal abierta. El backend debe estar corriendo antes de iniciar las otras aplicaciones.

---

## 2️⃣ APP COCINA - appcocina

### Paso 1: Abrir una NUEVA terminal
Abre una nueva ventana de terminal (mantén la del backend abierta).

### Paso 2: Navegar a la carpeta
```bash
cd appcocina
```

### Paso 3: Instalar dependencias (solo la primera vez)

**Opción A: Usar el script automático (Recomendado)**
```bash
# Desde la raíz del proyecto
instalar-dependencias.bat
```

**Opción B: Instalación manual**
```bash
npm ci --legacy-peer-deps
```

**⚠️ IMPORTANTE:** Usa `npm ci` en lugar de `npm install` para instalar las versiones exactas y evitar vulnerabilidades.

### Paso 4: Crear archivo .env
Crea un archivo llamado `.env` en la carpeta `appcocina` con el siguiente contenido:

```env
REACT_APP_API_COMANDA=http://localhost:8000/api/comanda
```

**⚠️ NOTA:** Asegúrate de usar `http://localhost:8000` (no `localhost:3000`)

### Paso 5: Iniciar la aplicación
```bash
npm start
```

**✅ Verificación:** 
- Se abrirá automáticamente tu navegador en `http://localhost:3000`
- Deberías ver la interfaz de cocina con las comandas

**⚠️ IMPORTANTE:** Deja esta terminal abierta también.

---

## 3️⃣ APP MÓVIL - Las-Gambusinas

### Paso 1: Obtener tu IP local
Antes de iniciar, necesitas conocer la IP de tu computadora en la red local:

**En Windows:**
```bash
ipconfig
```
Busca la dirección IPv4 (ejemplo: `192.168.1.8`)

**En Mac/Linux:**
```bash
ifconfig
# o
ip addr show
```

### Paso 2: Configurar la IP en apiConfig.js
Abre el archivo `Las-Gambusinas/apiConfig.js` y actualiza la IP:

```javascript
// Cambia 192.168.1.8 por TU IP local
export const LOGIN_AUTH_API = 'http://TU_IP_AQUI:8000/api/mozos/auth';
export const COMANDA_API = 'http://TU_IP_AQUI:8000/api/comanda';
export const DISHES_API = 'http://TU_IP_AQUI:8000/api/platos';
export const COMANDASEARCH_API_GET = 'http://TU_IP_AQUI:8000/api/comanda';
export const SELECTABLE_API_GET = 'http://TU_IP_AQUI:8000/api/mesas';
export const COMANDA_API_SEARCH_BY_DATE = 'http://TU_IP_AQUI:8000/api/comanda/fecha';
```

**Ejemplo:**
```javascript
export const LOGIN_AUTH_API = 'http://192.168.1.8:8000/api/mozos/auth';
export const COMANDA_API = 'http://192.168.1.8:8000/api/comanda';
// ... etc
```

### Paso 3: Abrir una NUEVA terminal
Abre otra nueva ventana de terminal (mantén las anteriores abiertas).

### Paso 4: Navegar a la carpeta
```bash
cd Las-Gambusinas
```

### Paso 5: Instalar dependencias (solo la primera vez)

**Opción A: Usar el script automático (Recomendado)**
```bash
# Desde la raíz del proyecto
instalar-dependencias.bat
```

**Opción B: Instalación manual**
```bash
npm ci --legacy-peer-deps
```

**⚠️ IMPORTANTE:** Usa `npm ci` en lugar de `npm install` para instalar las versiones exactas y evitar vulnerabilidades.

### Paso 6: Iniciar Expo
```bash
npm start
# o
expo start
```

**✅ Verificación:**
- Se abrirá la interfaz de Expo
- Escanea el código QR con la app Expo Go en tu celular
- O presiona `a` para Android o `i` para iOS (si tienes emulador)

---

## ✅ Verificación Final

Una vez que los 3 servicios estén corriendo:

1. **Backend:** Terminal mostrando "servidor corriendo en el puerto 8000"
2. **App Cocina:** Navegador abierto en `http://localhost:3000`
3. **App Móvil:** Expo corriendo y app conectada

### Prueba de Conexión

1. En la **App Móvil**, intenta hacer login con un mozo existente
2. En la **App Cocina**, deberías ver las comandas actualizándose cada 3 segundos
3. Crea una comanda desde la **App Móvil** y verifica que aparezca en la **App Cocina**

---

## 🔍 Solución de Problemas

### ❌ Error: "Cannot connect to MongoDB"
**Solución:**
- Verifica que MongoDB esté corriendo: `mongod`
- Verifica la cadena de conexión en `.env`: `mongodb://localhost:27017/lasgambusinas`

### ❌ Error: "Network request failed" en App Móvil
**Solución:**
- Verifica que la IP en `apiConfig.js` sea correcta
- Asegúrate de que el celular y la computadora estén en la misma red WiFi
- Verifica que el backend esté corriendo en el puerto 8000
- Desactiva temporalmente el firewall de Windows si es necesario

### ❌ Error: "ECONNREFUSED" en App Cocina
**Solución:**
- Verifica que el backend esté corriendo
- Verifica el archivo `.env` de appcocina: debe ser `http://localhost:8000/api/comanda`
- Reinicia la app cocina después de crear el `.env`

### ❌ Puerto 8000 ya está en uso
**Solución:**
- Cambia el puerto en `Backend-LasGambusinas/.env` a otro (ej: `PORT=8001`)
- Actualiza también `appcocina/.env` y `Las-Gambusinas/apiConfig.js` con el nuevo puerto

### ❌ Puerto 3000 ya está en uso
**Solución:**
- La app cocina usará automáticamente el siguiente puerto disponible (3001, 3002, etc.)
- O puedes especificar otro puerto: `PORT=3001 npm start`

---

## 🛠️ Solución de Problemas de Instalación de Dependencias

### ❌ Error: "npm ci" falla con errores de dependencias

**Causa probable:** Conflictos entre versiones o caché corrupto.

**Solución paso a paso:**

```bash
# 1. Limpiar caché de npm
npm cache clean --force

# 2. Eliminar node_modules y package-lock.json
rm -rf node_modules package-lock.json

# 3. Reinstalar desde cero
npm install --legacy-peer-deps

# 4. Si aún falla, usar instalación con fuerza
npm install --legacy-peer-deps --force
```

### ❌ Error: "ERESOLVE unable to resolve dependency tree"

**Solución:**

```bash
# Opción 1: Usar legacy peer deps
npm install --legacy-peer-deps

# Opción 2: Usar force
npm install --force

# Opción 3: Desactivar verificación estricta temporalmente
npm config set legacy-peer-deps true
npm install
npm config set legacy-peer-deps false
```

### ❌ Vulnerabilidades detectadas (npm audit)

**IMPORTANTE:** El estado actual del sistema funciona correctamente. Si `npm audit` muestra vulnerabilidades, evalúa:

1. **Verificar criticidad:**
```bash
npm audit
```

2. **Revisar detalles:**
```bash
npm audit --json > audit-report.json
```

3. **Si son vulnerabilidades bajas/moderadas en devDependencies:**
   - Generalmente NO afectan producción
   - Pueden ignorarse si el sistema funciona

4. **Si quieres intentar corregirlas (con precaución):**
```bash
# Revisar qué cambiaría
npm audit fix --dry-run

# Si los cambios son seguros, aplicar
npm audit fix

# Si hay conflictos, usar force (puede romper compatibilidad)
npm audit fix --force
```

**⚠️ ADVERTENCIA:** `npm audit fix --force` puede actualizar dependencias a versiones incompatibles. Si el sistema funciona, es mejor NO usar este comando.

### ❌ Error: "gyp ERR!" o errores de compilación native

**Causa:** Dependencias que requieren compilación (node-gyp, python, visual studio build tools).

**Solución Windows:**

1. Instalar Windows Build Tools:
```bash
npm install -g windows-build-tools
```

2. O instalar manualmente:
   - Python 2.7 o 3.x
   - Visual Studio Build Tools (Desktop development with C++)

3. Reinstalar:
```bash
npm rebuild
```

### ❌ Error: "EACCES permission denied"

**Solución:**

```bash
# Opción 1: Usar sudo (Mac/Linux)
sudo npm install --legacy-peer-deps

# Opción 2: Corregir permisos de npm
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Opción 3: Usar nvm para gestionar Node.js sin sudo
```

### ❌ Error: "ENOSPC: no space left on device"

**Solución:**
- Liberar espacio en disco
- Limpiar caché global: `npm cache clean --force`
- Eliminar node_modules no usados: `npm prune`

### ❌ La instalación queda "stuck" o muy lenta

**Solución:**

```bash
# 1. Cancelar con Ctrl+C
# 2. Limpiar todo
npm cache clean --force
rm -rf node_modules

# 3. Usar registro alternativo si hay problemas de red
npm install --registry=https://registry.npmmirror.com --legacy-peer-deps

# 4. O con verbose para ver progreso
npm install --legacy-peer-deps --verbose
```

### ❌ Error en Expo/React Native: "Expo SDK" issues

**Solución:**
```bash
# Limpiar caché de Expo
expo start -c

# O reinstalar Expo CLI
npm uninstall -g expo-cli
npm install -g expo-cli

# Limpiar y reinstalar todo
rm -rf node_modules
rm package-lock.json
npm install --legacy-peer-deps
```

---

## 🔄 Procedimiento de Reinstalación Completa

Si nada funciona, hacer una reinstalación limpia:

```bash
# Desde cada carpeta del proyecto:

# 1. Limpiar todo
rm -rf node_modules package-lock.json

# 2. Limpiar caché global (opcional)
npm cache clean --force

# 3. Reinstalar
npm install --legacy-peer-deps

# 4. Si hay errores de permisos, puede que necesites:
# Windows: Ejecutar terminal como administrador
# Mac/Linux: sudo npm install --legacy-peer-deps
```

---

## ✅ Verificación de Instalación Correcta

Para verificar que las dependencias se instalaron correctamente:

```bash
# Verificar que no hay errores
npm list --depth=0

# Verificar vulnerabilidades
npm audit

# Verificar scripts disponibles
npm run
```

### Indicadores de instalación exitosa:
- ✅ `npm list --depth=0` no muestra errores (WARN de peer deps es normal)
- ✅ `npm start` inicia el servidor sin errores de módulos
- ✅ No hay errores de "Cannot find module" al ejecutar

---

## 📝 Resumen de Archivos .env Necesarios

### Backend-LasGambusinas/.env
```env
DBLOCAL=mongodb://localhost:27017/lasgambusinas
PORT=8000
```

### appcocina/.env
```env
REACT_APP_API_COMANDA=http://localhost:8000/api/comanda
```

### Las-Gambusinas/apiConfig.js
```javascript
// Actualizar manualmente con tu IP local
export const LOGIN_AUTH_API = 'http://TU_IP:8000/api/mozos/auth';
// ... etc
```

---

## 🎯 Comandos Rápidos (Resumen)

### Instalación Inicial (Una sola vez)

**Opción 1: Script Automático (Recomendado)**
```bash
# Desde la raíz del proyecto
instalar-dependencias.bat
```

**Opción 2: Manual**
```bash
# Terminal 1 - Backend
cd Backend-LasGambusinas
npm ci --legacy-peer-deps
cd ..

# Terminal 2 - App Cocina
cd appcocina
npm ci --legacy-peer-deps
cd ..

# Terminal 3 - App Móvil
cd Las-Gambusinas
npm ci --legacy-peer-deps
cd ..
```

### Iniciar los Servicios

```bash
# Terminal 1 - Backend
cd Backend-LasGambusinas
npm start

# Terminal 2 - App Cocina
cd appcocina
npm start

# Terminal 3 - App Móvil
cd Las-Gambusinas
npm start
```

---

## 📞 Estructura de Puertos

- **Backend:** `http://localhost:8000`
- **App Cocina:** `http://localhost:3000`
- **App Móvil:** Expo usa puertos dinámicos (19000, 19001, etc.)

---

---

## 🔒 Seguridad y Versiones de Dependencias

### ¿Por qué usar versiones exactas?

El proyecto incluye archivos `package-lock.json` que especifican las versiones exactas de todas las dependencias. Esto garantiza:

- ✅ **Reproducibilidad:** Mismo resultado en todas las máquinas
- ✅ **Seguridad:** Versiones probadas y validadas sin vulnerabilidades conocidas
- ✅ **Estabilidad:** Evita incompatibilidades por actualizaciones automáticas
- ✅ **Consistencia:** Mismo comportamiento en desarrollo y producción

### Comandos de Instalación Segura

| Comando | Descripción | Cuándo Usar |
|---------|-------------|-------------|
| `npm ci` | Instala versiones exactas del `package-lock.json` | ✅ **SIEMPRE** (recomendado) |
| `npm install` | Instala y puede actualizar dependencias | ❌ Solo si necesitas actualizar |
| `npm ci --legacy-peer-deps` | Instala con resolución de conflictos | ✅ Si hay conflictos de peer dependencies |

### Verificar Versiones Instaladas

Para verificar que las versiones son correctas:

```bash
# Ver versión de Node.js
node --version

# Ver versión de npm
npm --version

# Ver dependencias instaladas en un proyecto
cd Backend-LasGambusinas
npm list --depth=0
```

---

**¡Listo!** Ahora deberías tener las 3 aplicaciones corriendo y comunicándose correctamente. 🎉

