/**
 * FASE 7: PM2 Ecosystem Configuration Enterprise Grade
 * Inspiración: Netflix Node.js Cluster Architecture
 * Features: Zero-downtime reload, Memory leak detection, Graceful shutdown, Cron restart
 */

module.exports = {
  apps: [
    {
      name: 'las-gambusinas-backend',
      script: './index.js',
      
      // ============================================
      // Cluster Mode (Multi-CPU)
      // ============================================
      instances: process.env.PM2_INSTANCES || 'max', // 4-8 workers según CPU cores
      exec_mode: 'cluster', // Cluster mode para balanceo de carga
      
      // ============================================
      // Resource Limits (Memory Leak Detection)
      // ============================================
      max_memory_restart: '1G', // Auto-restart si uso RAM >1GB (previene OOM)
      min_uptime: '10s', // Evita restart loops infinitos
      max_restarts: 10, // Máximo 10 restarts en 1 minuto (circuit breaker)
      
      // ============================================
      // Auto Restart (Exponential Backoff)
      // ============================================
      autorestart: true,
      restart_delay: 4000, // Delay inicial entre restarts
      exp_backoff_restart_delay: 100, // Exponential backoff base
      
      // ============================================
      // Graceful Shutdown (Zero-Downtime)
      // ============================================
      kill_timeout: 30000, // 30s para cerrar conexiones WebSocket activas
      wait_ready: true, // Esperar señal 'ready' antes de marcar como online
      listen_timeout: 10000, // Timeout para escuchar en puerto
      shutdown_with_message: true, // Enviar mensaje antes de shutdown
      
      // ============================================
      // Cron Restart (Daily Maintenance)
      // ============================================
      cron_restart: '0 3 * * *', // Restart diario a las 3am (baja carga)
      
      // ============================================
      // Logging (Structured)
      // ============================================
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true, // Un solo archivo por tipo (no por worker)
      log_type: 'json', // JSON structured logs
      
      // ============================================
      // Environment Variables
      // ============================================
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
        PM2_INSTANCES: process.env.PM2_INSTANCES || 'max'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || 3000,
        PM2_INSTANCES: 1 // Solo 1 worker en desarrollo
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: process.env.PORT || 3000,
        PM2_INSTANCES: 2 // 2 workers en staging
      },
      
      // ============================================
      // Advanced Configuration
      // ============================================
      instance_var: 'INSTANCE_ID', // Variable de entorno con ID de instancia
      increment_var: 'PORT', // Incrementar puerto por instancia (no usado en cluster)
      
      // ============================================
      // Health Check
      // ============================================
      health_check_grace_period: 3000, // Grace period antes de health check
      health_check_url: 'http://localhost:3000/health', // Endpoint de health check
      
      // ============================================
      // PM2 Plus / Monitoring
      // ============================================
      pmx: true, // Habilitar PM2 Plus metrics
      
      // ============================================
      // Source Maps (Error Tracking)
      // ============================================
      source_map_support: true, // Soporte para source maps en errores
      
      // ============================================
      // Watch Mode (Development Only)
      // ============================================
      watch: false, // Deshabilitado en producción (usa nodemon en dev)
      ignore_watch: [
        'node_modules',
        'logs',
        'backups',
        '*.log',
        '.git'
      ],
      
      // ============================================
      // Node Args (V8 Optimizations)
      // ============================================
      node_args: [
        '--max-old-space-size=1024', // Limitar heap a 1GB
        '--expose-gc' // Exponer garbage collector para monitoring
      ]
    }
  ]
};

