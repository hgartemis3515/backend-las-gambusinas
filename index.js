require ('./src/database/database');
const express = require('express');

const mesasRoutes = require('./src/controllers/mesasController')
const mozosRoutes = require('./src/controllers/mozosController')
const platoRoutes = require('./src/controllers/platoController')
const comandaRoutes = require('./src/controllers/comandaController')

const app = express();
const port = process.env.PORT || 3000;

var cors = require('cors');

// Configurar CORS para permitir conexiones desde la app móvil
app.use(cors({
  origin: '*', // Permitir todas las conexiones (para desarrollo)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const routes = [mesasRoutes, mozosRoutes, platoRoutes, comandaRoutes];

app.use(express.json());
app.use('/api',routes);


app.get('/', (req, res)=>{
  res.send("Holiiii xd")
});

// Escuchar en todas las interfaces de red (0.0.0.0) para permitir conexiones desde otros dispositivos
app.listen(port, '0.0.0.0', ()=> {
  console.log('servidor corriendo en el puerto', port);
  console.log('Servidor accesible desde:');
  console.log('  - Local: http://localhost:' + port);
  console.log('  - Red local: http://192.168.18.11:' + port);
});