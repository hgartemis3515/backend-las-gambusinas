require ('./src/database/database');
const express = require('express');

const mesasRoutes = require('./src/controllers/mesasController')
const mozosRoutes = require('./src/controllers/mozosController')
const platoRoutes = require('./src/controllers/platoController')
const comandaRoutes = require('./src/controllers/comandaController')
const areaRoutes = require('./src/controllers/areaController')

const app = express();
const port = process.env.PORT || 3000;
const path = require('path');

var cors = require('cors');

// Configurar CORS para permitir conexiones desde la app móvil
app.use(cors({
  origin: '*', // Permitir todas las conexiones (para desarrollo)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const routes = [mesasRoutes, mozosRoutes, platoRoutes, comandaRoutes, areaRoutes];

app.use(express.json());
app.use('/api',routes);

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Ruta para el panel de administración
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res)=>{
  res.send(`
    <html>
      <head>
        <title>Las Gambusinas - Backend</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            text-align: center;
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          }
          h1 { color: #333; margin-bottom: 20px; }
          a {
            display: inline-block;
            margin-top: 20px;
            padding: 15px 30px;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            transition: transform 0.3s;
          }
          a:hover {
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🍽️ Las Gambusinas</h1>
          <p>Backend API funcionando correctamente</p>
          <a href="/admin">🔧 Ir al Panel de Administración</a>
        </div>
      </body>
    </html>
  `);
});

// Escuchar en todas las interfaces de red (0.0.0.0) para permitir conexiones desde otros dispositivos
app.listen(port, '0.0.0.0', ()=> {
  console.log('servidor corriendo en el puerto', port);
  console.log('Servidor accesible desde:');
  console.log('  - Local: http://localhost:' + port);
  console.log('  - Red local: http://192.168.18.11:' + port);
});