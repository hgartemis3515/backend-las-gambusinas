/**
 * Consulta GET /api/configuracion como la app de cocina (sin token) para
 * verificar que el backend devuelve vistaCocinaGuarnicionComoPlato=false
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const port = process.env.PORT || 3000;
  try {
    const res = await fetch(`http://localhost:${port}/api/configuracion`);
    if (!res.ok) {
      console.log('HTTP ' + res.status);
      return;
    }
    const data = await res.json();
    const c = data?.configuracion?.cocina || {};
    console.log('GET /api/configuracion → cocina.vistaCocinaGuarnicionComoPlato =', c.vistaCocinaGuarnicionComoPlato);
    console.log('cocina.permitirGuarnicionesSeparadas =', c.permitirGuarnicionesSeparadas);
  } catch (e) {
    console.log('No se pudo conectar al backend:', e.message);
  }
}

main();
