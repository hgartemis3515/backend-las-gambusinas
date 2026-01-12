# 🔌 Guía de Conexión App Móvil - Backend

## ✅ Cambios Realizados

1. **Backend ahora escucha en todas las interfaces** (`0.0.0.0`)
   - Permite conexiones desde otros dispositivos en la red
   
2. **CORS mejorado**
   - Configurado para aceptar conexiones desde la app móvil

3. **Mensajes de error mejorados**
   - La app ahora muestra mensajes más claros sobre problemas de conexión

## 🔍 Verificación de Conexión

### Paso 1: Verificar que el Backend está corriendo

En la terminal del backend deberías ver:
```
Conectado a MongoDB
✅ Usuario admin creado exitosamente
servidor corriendo en el puerto 3000
Servidor accesible desde:
  - Local: http://localhost:3000
  - Red local: http://192.168.18.11:3000
```

### Paso 2: Verificar tu IP local

**En Windows:**
```bash
ipconfig
```
Busca "Dirección IPv4" (ejemplo: `192.168.1.8`)

**Importante:** Si tu IP es diferente a `192.168.1.8`, actualiza `Las-Gambusinas/apiConfig.js`

### Paso 3: Verificar que el teléfono y computadora están en la misma red WiFi

- Ambos deben estar conectados a la misma red WiFi
- No uses datos móviles en el teléfono

### Paso 4: Probar conexión desde el navegador del teléfono

Abre en el navegador del teléfono:
```
http://TU_IP:8000
```
Deberías ver: "Holiiii xd"

Si no funciona, hay un problema de red o firewall.

### Paso 5: Verificar Firewall de Windows

1. Abre "Firewall de Windows Defender"
2. Permite Node.js a través del firewall
3. O temporalmente desactiva el firewall para probar

## 🛠️ Solución de Problemas

### ❌ Error: "ECONNREFUSED" o "Network Error"

**Causas posibles:**
1. Backend no está corriendo
2. IP incorrecta en `apiConfig.js`
3. Firewall bloqueando la conexión
4. Teléfono y computadora en redes diferentes

**Solución:**
1. Verifica que el backend esté corriendo
2. Verifica la IP con `ipconfig`
3. Actualiza `apiConfig.js` con la IP correcta
4. Verifica el firewall

### ❌ Error: "Usuario o contraseña incorrectos"

**Causas posibles:**
1. El usuario admin no se creó correctamente
2. Credenciales incorrectas

**Solución:**
1. Verifica en la consola del backend que aparezca: `✅ Usuario admin creado exitosamente`
2. Usa exactamente:
   - Usuario: `admin`
   - Contraseña: `12345678`

### ❌ El backend no acepta conexiones

**Solución:**
1. Verifica que el backend esté escuchando en `0.0.0.0` (ya configurado)
2. Reinicia el backend después de los cambios

## 📝 Configuración Actual

**Backend (`index.js`):**
- Escucha en: `0.0.0.0:8000`
- CORS: Configurado para aceptar todas las conexiones

**App Móvil (`apiConfig.js`):**
- URL: `http://192.168.1.8:8000/api/mozos/auth`
- ⚠️ **Actualiza esta IP si tu IP local es diferente**

## 🚀 Próximos Pasos

1. Reinicia el backend
2. Verifica que aparezcan los mensajes de conexión
3. Actualiza la IP en `apiConfig.js` si es necesario
4. Prueba el login desde la app móvil

