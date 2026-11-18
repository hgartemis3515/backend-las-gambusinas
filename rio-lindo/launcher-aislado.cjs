// Perfil local separado. No modifica el codigo ni la configuracion del launcher original.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const launcherDir = process.env.RIO_LINDO_LAUNCHER_DIR;
const profileDir = process.env.RIO_LINDO_PROFILE_ROOT;
if (!launcherDir || !profileDir) {
  throw new Error('Ejecuta abrir-launcher-rio-lindo.ps1 para preparar las rutas y el perfil.');
}
fs.mkdirSync(profileDir, { recursive: true });
// config-store.js usa APPDATA. El cambio afecta solo este proceso y sus hijos.
process.env.APPDATA = profileDir;
app.setPath('userData', path.join(profileDir, 'electron'));
app.setAppPath(launcherDir);
app.setName('Rio Lindo Launcher local');
require(path.join(launcherDir, 'src', 'main.js'));
