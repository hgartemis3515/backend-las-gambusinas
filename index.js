require('dotenv').config();
require ('./src/database/database');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const logger = require('./src/utils/logger');

// FASE 5: Inicializar Redis Cache (opcional - funciona sin Redis)
const redisCache = require('./src/utils/redisCache');
// Inicializar Redis de forma asíncrona sin bloquear el inicio
// Solo un log inicial si Redis está deshabilitado o no disponible
setImmediate(() => {
  redisCache.init().catch(() => {
    // Error ya manejado internamente con un solo log
  });
});

const mesasRoutes = require('./src/controllers/mesasController')
const mozosRoutes = require('./src/controllers/mozosController')
const platoRoutes = require('./src/controllers/platoController')
const comandaRoutes = require('./src/controllers/comandaController')
const areaRoutes = require('./src/controllers/areaController')
const boucherRoutes = require('./src/controllers/boucherController')
const clientesRoutes = require('./src/controllers/clientesController')
const auditoriaRoutes = require('./src/controllers/auditoriaController')
const cierreCajaRoutes = require('./src/controllers/cierreCajaController')
const cierreCajaRestauranteRoutes = require('./src/controllers/cierreCajaRestauranteController')
const adminRoutes = require('./src/controllers/adminController')
const notificacionesRoutes = require('./src/controllers/notificacionesController')
const mensajesRoutes = require('./src/controllers/mensajesController')
const reportesRoutes = require('./src/controllers/reportesController')
const { adminAuth } = require('./src/middleware/adminAuth')

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;
const path = require('path');

// Configurar orígenes permitidos desde variables de entorno
const getAllowedOrigins = () => {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }
  // Fallback para desarrollo: orígenes comunes
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://192.168.18.11:3000',
    'http://192.168.18.11:3001',
    'http://192.168.18.127:3000',
    'http://192.168.18.127:3001'
  ];
};

const allowedOrigins = getAllowedOrigins();
logger.info('Orígenes CORS permitidos:', { origins: allowedOrigins });

// Configurar Socket.io con CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Removido wildcard '*'
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
const adminNamespace = io.of('/admin');

// Configurar eventos Socket.io
require('./src/socket/events')(io, cocinaNamespace, mozosNamespace, adminNamespace);

var cors = require('cors');

// Configurar CORS para permitir conexiones desde la app móvil
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verificar si el origin está en la lista permitida
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS bloqueado para origin:', { origin, allowedOrigins });
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Device-Id', 'X-Source-App'],
  credentials: true
}));

const routes = [mesasRoutes, mozosRoutes, platoRoutes, comandaRoutes, areaRoutes, boucherRoutes, clientesRoutes, auditoriaRoutes, cierreCajaRoutes, cierreCajaRestauranteRoutes, adminRoutes, notificacionesRoutes, mensajesRoutes, reportesRoutes];

// FASE 7: Security Headers (Helmet.js)
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false, // Deshabilitar defaults para control total
    directives: {
      'default-src': ["'self'"],
      'script-src': [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://cdn.jsdelivr.net",
        "https://*.cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com",
        "https://*.cdnjs.cloudflare.com",
        "https://cdn.socket.io",
        "https://*.cdn.socket.io",
        "https://cdn.tailwindcss.com",
        "https://unpkg.com",
        "https://*.unpkg.com"
      ],
      'script-src-attr': ["'unsafe-inline'"], // Permitir onclick inline
      'style-src': [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      'connect-src': [
        "'self'",
        "ws:",      // ✅ FIX: ws: NO ws://
        "wss:",     // ✅ FIX: wss: NO wss://
        "https://cdn.socket.io"
      ],
      'img-src': [
        "'self'",
        "data:",
        "blob:",
        "https:"
      ],
      'font-src': [
        "'self'",
        "https:",
        "data:",
        "https://fonts.gstatic.com"
      ],
      'worker-src': ["'self'", "blob:"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false // Necesario para Socket.io
}));

// FASE 7: Correlation ID Middleware (Request Tracing)
app.use(logger.correlationMiddleware);

app.use(express.json());
app.use('/api',routes);

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Ruta raíz: mostrar el dashboard multi-página (mismo que index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para el panel de administración (sin protección)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Ruta de login (pública) — diseño según pencil-new.pen
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/dashboard/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ============================================
// RUTAS DEL DASHBOARD MULTI-PÁGINA
// Catch-all para navegación directa a cada página
// ============================================
const dashboardPages = [
  'index', 'mesas', 'mozos', 'platos', 'comandas',
  'bouchers', 'clientes', 'auditoria', 'cierre-caja',
  'reportes', 'configuracion'
];

// Rutas sin extensión (ej: /mesas)
dashboardPages.forEach(page => {
  if (page === 'index') return; // La raíz ya está manejada arriba
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// Rutas con extensión .html (ej: /mesas.html) - para compatibilidad
dashboardPages.forEach(page => {
  app.get(`/${page}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// Servir assets del dashboard (públicos)
app.use('/dashboard/assets', express.static(path.join(__dirname, 'public', 'dashboard', 'assets')));

// Proteger solo las rutas HTML del dashboard (no assets)
app.get('/dashboard', (req, res, next) => {
  // Verificar token desde query o cookie (para navegación directa)
  const token = req.query.token || 
                (req.headers.cookie && req.headers.cookie.match(/adminToken=([^;]+)/)?.[1]);
  
  if (token) {
    req.headers.authorization = `Bearer ${token}`;
  }
  
  // Si no hay token, redirigir a login
  if (!req.headers.authorization) {
    return res.redirect('/login');
  }
  
  // Usar middleware de autenticación
  adminAuth(req, res, next);
}, (req, res) => {
  // Dashboard completo (todo en una página) — archivo en dashboard/
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'lasgambusinas-dashboard.html'));
});

// FASE 7: Health Check Endpoint Enterprise Grade (Deep Health Checks)
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0-fase7',
    uptime: Math.round(process.uptime()),
    serverIP: process.env.IP || null,
    serverUrl: process.env.IP && port ? `http://${process.env.IP}:${port}` : null,
    services: {}
  };

  try {
    const os = require('os');
    const mongoose = require('mongoose');
    const redisCache = require('./src/utils/redisCache');
    const fs = require('fs').promises;

    // ============================================
    // MongoDB Health Check (Deep)
    // ============================================
    try {
      const mongoStart = Date.now();
      const dbState = mongoose.connection.readyState;
      const mongoLatency = Date.now() - mongoStart;
      
      let mongoStatus = 'down';
      let replicaSetStatus = 'unknown';
      let connections = 0;
      
      if (dbState === 1) { // Connected
        mongoStatus = 'up';
        connections = mongoose.connection.db?.serverConfig?.s?.pool?.totalConnectionCount || 0;
        
        // Verificar replica set si está configurado
        try {
          const admin = mongoose.connection.db.admin();
          const replStatus = await admin.command({ replSetGetStatus: 1 }).catch(() => null);
          if (replStatus) {
            replicaSetStatus = replStatus.members?.some(m => m.stateStr === 'PRIMARY') ? 'healthy' : 'degraded';
          }
        } catch (e) {
          replicaSetStatus = 'not-configured';
        }
      }
      
      healthStatus.services.mongodb = {
        status: mongoStatus,
        latency: `${mongoLatency}ms`,
        connections: connections,
        replicaSet: replicaSetStatus,
        readyState: dbState
      };
    } catch (error) {
      healthStatus.services.mongodb = {
        status: 'error',
        error: error.message
      };
      healthStatus.status = 'degraded';
    }

    // ============================================
    // Redis Health Check (Deep)
    // ============================================
    try {
      const redisStart = Date.now();
      const cacheStats = await redisCache.getStats();
      const redisLatency = Date.now() - redisStart;
      
      healthStatus.services.redis = {
        status: cacheStats.enabled ? 'up' : 'disabled',
        latency: `${redisLatency}ms`,
        type: cacheStats.type || 'memory',
        hitRate: cacheStats.stats?.hitRate || '0%',
        hits: cacheStats.stats?.hits || 0,
        misses: cacheStats.stats?.misses || 0,
        memory: cacheStats.memorySize || 0
      };
      
      if (!cacheStats.enabled && process.env.NODE_ENV === 'production') {
        healthStatus.status = 'degraded';
      }
    } catch (error) {
      healthStatus.services.redis = {
        status: 'error',
        error: error.message
      };
      healthStatus.status = 'degraded';
    }

    // ============================================
    // WebSocket Health Check
    // ============================================
    try {
      const websocketStats = {
        cocina: global.io?.of('/cocina')?.sockets?.size || 0,
        mozos: global.io?.of('/mozos')?.sockets?.size || 0,
        admin: global.io?.of('/admin')?.sockets?.size || 0,
        total: (global.io?.of('/cocina')?.sockets?.size || 0) + 
               (global.io?.of('/mozos')?.sockets?.size || 0) +
               (global.io?.of('/admin')?.sockets?.size || 0)
      };
      
      healthStatus.services.websockets = websocketStats;
    } catch (error) {
      healthStatus.services.websockets = {
        status: 'error',
        error: error.message
      };
    }

    // ============================================
    // System Resources Health Check
    // ============================================
    try {
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      const cpuUsage = process.cpuUsage();
      const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / process.uptime() * 100).toFixed(2);
      
      healthStatus.services.system = {
        cpu: {
          usage: `${cpuPercent}%`,
          cores: os.cpus().length,
          loadAverage: os.loadavg().map(l => l.toFixed(2))
        },
        memory: {
          used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          systemTotal: `${Math.round(totalMem / 1024 / 1024)}MB`,
          systemUsed: `${Math.round(usedMem / 1024 / 1024)}MB`,
          systemFree: `${Math.round(freeMem / 1024 / 1024)}MB`,
          usagePercent: `${Math.round((usedMem / totalMem) * 100)}%`
        },
        disk: {
          // Verificar espacio en disco (si es posible)
          status: 'ok' // Simplificado, puede mejorarse con diskusage
        }
      };
      
      // Alertar si memoria > 80%
      if ((usedMem / totalMem) > 0.8) {
        healthStatus.status = 'degraded';
        healthStatus.warnings = healthStatus.warnings || [];
        healthStatus.warnings.push('High memory usage detected');
      }
    } catch (error) {
      healthStatus.services.system = {
        status: 'error',
        error: error.message
      };
    }

    // ============================================
    // Platos por tipo y categoría (stats menú)
    // ============================================
    try {
      const platoModel = require('./src/database/models/plato.model');
      const platosPorTipo = await platoModel.aggregate([
        { $group: { _id: '$tipo', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
      const platosPorCategoria = await platoModel.aggregate([
        { $group: { _id: '$categoria', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]);
      const distinctNombres = await platoModel.distinct('nombreLower');
      const platosUnicos = distinctNombres.filter(Boolean).length;
      const platosTotal = await platoModel.countDocuments();
      healthStatus.services.platos = {
        porTipo: platosPorTipo.reduce((acc, x) => { acc[x._id] = x.count; return acc; }, {}),
        porCategoria: platosPorCategoria.length,
        topCategorias: platosPorCategoria.slice(0, 5).map(c => ({ nombre: c._id, count: c.count })),
        platos_unicos: platosUnicos,
        platos_total: platosTotal
      };
    } catch (error) {
      healthStatus.services.platos = { status: 'error', error: error.message };
    }

    // ============================================
    // Response Time
    // ============================================
    healthStatus.responseTime = `${Date.now() - startTime}ms`;
    
    // Si algún servicio crítico está down, cambiar status
    if (healthStatus.services.mongodb?.status === 'down') {
      healthStatus.status = 'error';
    }

    const statusCode = healthStatus.status === 'ok' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', { error: error.message, stack: error.stack });
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: `${Date.now() - startTime}ms`
    });
  }
});

// FASE 7: Metrics Endpoint (Prometheus Format)
app.get('/metrics', async (req, res) => {
  try {
    const os = require('os');
    const mongoose = require('mongoose');
    const redisCache = require('./src/utils/redisCache');
    
    const memUsage = process.memoryUsage();
    const cacheStats = await redisCache.getStats();
    
    // Prometheus metrics format
    const metrics = [
      `# HELP nodejs_uptime_seconds Uptime in seconds`,
      `# TYPE nodejs_uptime_seconds gauge`,
      `nodejs_uptime_seconds ${process.uptime()}`,
      ``,
      `# HELP nodejs_memory_heap_used_bytes Heap memory used in bytes`,
      `# TYPE nodejs_memory_heap_used_bytes gauge`,
      `nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`,
      ``,
      `# HELP nodejs_memory_heap_total_bytes Heap memory total in bytes`,
      `# TYPE nodejs_memory_heap_total_bytes gauge`,
      `nodejs_memory_heap_total_bytes ${memUsage.heapTotal}`,
      ``,
      `# HELP nodejs_memory_rss_bytes Resident set size in bytes`,
      `# TYPE nodejs_memory_rss_bytes gauge`,
      `nodejs_memory_rss_bytes ${memUsage.rss}`,
      ``,
      `# HELP mongodb_connections_active Active MongoDB connections`,
      `# TYPE mongodb_connections_active gauge`,
      `mongodb_connections_active ${mongoose.connection.db?.serverConfig?.s?.pool?.totalConnectionCount || 0}`,
      ``,
      `# HELP redis_cache_hits_total Total Redis cache hits`,
      `# TYPE redis_cache_hits_total counter`,
      `redis_cache_hits_total ${cacheStats.stats?.hits || 0}`,
      ``,
      `# HELP redis_cache_misses_total Total Redis cache misses`,
      `# TYPE redis_cache_misses_total counter`,
      `redis_cache_misses_total ${cacheStats.stats?.misses || 0}`,
      ``,
      `# HELP websocket_connections_total Total WebSocket connections`,
      `# TYPE websocket_connections_total gauge`,
      `websocket_connections_total ${(global.io?.of('/cocina')?.sockets?.size || 0) + (global.io?.of('/mozos')?.sockets?.size || 0)}`,
      ``
    ].join('\n');
    
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    logger.error('Metrics endpoint failed', { error: error.message });
    res.status(500).send(`# ERROR: ${error.message}\n`);
  }
});

// Escuchar en todas las interfaces de red (0.0.0.0) para permitir conexiones desde otros dispositivos
server.listen(port, '0.0.0.0', ()=> {
  logger.info('Servidor iniciado', {
    port,
    nodeEnv: process.env.NODE_ENV || 'development',
    allowedOrigins
  });
  console.log('servidor corriendo en el puerto', port);
  console.log('Servidor accesible desde:');
  console.log('  - Local: http://localhost:' + port);
  console.log('  - Red local: http://192.168.18.11:' + port);
  console.log('  - Socket.io WebSockets activo en /cocina y /mozos');
  console.log('  - Orígenes CORS permitidos:', allowedOrigins.join(', '));
});