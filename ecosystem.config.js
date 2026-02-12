/**
 * FASE 5: PM2 Ecosystem Configuration
 * 
 * Clustering Multi-CPU para escalar a 100+ mesas
 * Workers: número de CPUs disponibles
 * Sticky sessions para WebSocket con Redis adapter
 */

module.exports = {
  apps: [
    {
      name: 'las-gambusinas-backend',
      script: './index.js',
      instances: process.env.PM2_INSTANCES || 'max', // Usar todos los CPUs disponibles
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || 3000
      },
      // Logs
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Advanced
      instance_var: 'INSTANCE_ID',
      increment_var: 'PORT',
      
      // Health check
      health_check_grace_period: 3000,
      
      // PM2 Plus (opcional)
      pmx: true,
      
      // Source map support
      source_map_support: true
    }
  ]
};

