/**
 * PM2 Configuration for StockSpot
 * Production-ready process management configuration
 */

module.exports = {
  apps: [
    {
      name: "affilly-orchestrator",
      script: "./core/startup/orchestrator.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        AFFILLY_LOG_LEVEL: "DEBUG"
      },
      env_production: {
        NODE_ENV: "production",
        AFFILLY_LOG_LEVEL: "INFO"
      },
      log_file: "./core/startup/logs/orchestrator.log",
      out_file: "./core/startup/logs/orchestrator.out.log",
      error_file: "./core/startup/logs/orchestrator.error.log",
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000
    },
    
    {
      name: "affilly-scheduler",
      script: "python",
      args: ["app/auto_scheduler.py"],
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      interpreter: "none", // Use system interpreter
      env: {
        NODE_ENV: "development",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "scheduler"
      },
      env_production: {
        NODE_ENV: "production", 
        PYTHONPATH: ".",
        AFFILLY_MODULE: "scheduler"
      },
      log_file: "./core/startup/logs/scheduler.log",
      out_file: "./core/startup/logs/scheduler.out.log", 
      error_file: "./core/startup/logs/scheduler.error.log",
      time: true,
      merge_logs: true,
      max_restarts: 15,
      min_uptime: "30s",
      restart_delay: 10000,
      cron_restart: "0 6 * * *" // Restart daily at 6 AM
    },
    
    {
      name: "affilly-dashboard",
      script: "python",
      args: ["app/dashboard.py"],
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      interpreter: "none",
      env: {
        NODE_ENV: "development",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "dashboard",
        PORT: "5000"
      },
      env_production: {
        NODE_ENV: "production",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "dashboard", 
        PORT: "5000"
      },
      log_file: "./core/startup/logs/dashboard.log",
      out_file: "./core/startup/logs/dashboard.out.log",
      error_file: "./core/startup/logs/dashboard.error.log", 
      time: true,
      merge_logs: true,
      max_restarts: 5,
      min_uptime: "10s",
      restart_delay: 5000
    },
    
    {
      name: "affilly-deal-engine",
      script: "python", 
      args: ["app/deal_engine.py"],
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      interpreter: "none",
      env: {
        NODE_ENV: "development",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "deal_engine"
      },
      env_production: {
        NODE_ENV: "production",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "deal_engine"
      },
      log_file: "./core/startup/logs/deal-engine.log", 
      out_file: "./core/startup/logs/deal-engine.out.log",
      error_file: "./core/startup/logs/deal-engine.error.log",
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: "20s", 
      restart_delay: 8000
    },
    
    {
      name: "affilly-posting-engine",
      script: "python",
      args: ["app/posting_engine.py"],
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M", 
      interpreter: "none",
      env: {
        NODE_ENV: "development",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "posting_engine"
      },
      env_production: {
        NODE_ENV: "production",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "posting_engine"
      },
      log_file: "./core/startup/logs/posting-engine.log",
      out_file: "./core/startup/logs/posting-engine.out.log",
      error_file: "./core/startup/logs/posting-engine.error.log",
      time: true,
      merge_logs: true,
      max_restarts: 8,
      min_uptime: "15s",
      restart_delay: 6000
    },
    
    {
      name: "affilly-queue-manager", 
      script: "python",
      args: ["app/queue_manager.py"],
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      interpreter: "none",
      env: {
        NODE_ENV: "development",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "queue_manager"
      },
      env_production: {
        NODE_ENV: "production",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "queue_manager"
      },
      log_file: "./core/startup/logs/queue-manager.log",
      out_file: "./core/startup/logs/queue-manager.out.log",
      error_file: "./core/startup/logs/queue-manager.error.log",
      time: true,
      merge_logs: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000
    },
    
    {
      name: "affilly-website-updater",
      script: "python",
      args: ["app/website_updater.py"], 
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "128M",
      interpreter: "none",
      env: {
        NODE_ENV: "development",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "website_updater"
      },
      env_production: {
        NODE_ENV: "production",
        PYTHONPATH: ".",
        AFFILLY_MODULE: "website_updater"
      },
      log_file: "./core/startup/logs/website-updater.log",
      out_file: "./core/startup/logs/website-updater.out.log", 
      error_file: "./core/startup/logs/website-updater.error.log",
      time: true,
      merge_logs: true,
      max_restarts: 3,
      min_uptime: "10s",
      restart_delay: 10000,
      cron_restart: "0 */6 * * *" // Restart every 6 hours
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: "affilly",
      host: ["your-server.com"],
      ref: "origin/main",
      repo: "https://github.com/Stockspotdeals/StockSpot.git",
      path: "/var/www/affilly",
      "pre-deploy-local": "",
      "post-deploy": "npm install && pm2 reload ecosystem.config.js --env production",
      "pre-setup": "sudo mkdir -p /var/www/affilly && sudo chown affilly:affilly /var/www/affilly"
    }
  }
};