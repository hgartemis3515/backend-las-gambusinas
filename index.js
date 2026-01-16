require ('./src/database/database');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const mesasRoutes = require('./src/controllers/mesasController')
const mozosRoutes = require('./src/controllers/mozosController')
const platoRoutes = require('./src/controllers/platoController')
const comandaRoutes = require('./src/controllers/comandaController')
const areaRoutes = require('./src/controllers/areaController')
const boucherRoutes = require('./src/controllers/boucherController')
const clientesRoutes = require('./src/controllers/clientesController')

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const path = require('path');

// Configurar Socket.io con CORS
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://192.168.18.11:3000', 'http://localhost:3001', 'http://192.168.18.11:3001', '*'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Exportar io para usar en controladores
global.io = io;

// Configurar namespaces
const cocinaNamespace = io.of('/cocina');
const mozosNamespace = io.of('/mozos');

// Configurar eventos Socket.io
require('./src/socket/events')(io, cocinaNamespace, mozosNamespace);

var cors = require('cors');

// Configurar CORS para permitir conexiones desde la app móvil
app.use(cors({
  origin: '*', // Permitir todas las conexiones (para desarrollo)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const routes = [mesasRoutes, mozosRoutes, platoRoutes, comandaRoutes, areaRoutes, boucherRoutes, clientesRoutes];

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
server.listen(port, '0.0.0.0', ()=> {
  console.log('servidor corriendo en el puerto', port);
  console.log('Servidor accesible desde:');
  console.log('  - Local: http://localhost:' + port);
  console.log('  - Red local: http://192.168.18.11:' + port);
  console.log('  - Socket.io WebSockets activo en /cocina y /mozos');
});