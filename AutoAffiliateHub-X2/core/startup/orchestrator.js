/**
 * StockSpot System Orchestrator - Node.js
 * Auto-starts and monitors all StockSpot subsystems
 */

import { exec, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AfillyOrchestrator {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../../');
        this.logDir = path.join(__dirname, 'logs');
        this.processes = new Map();
        this.retryCount = new Map();
        this.maxRetries = 5;
        this.retryDelay = 5000; // 5 seconds initial delay
        
        // Core Affilly modules/components
        this.modules = {
            'scheduler': {
                script: 'app/auto_scheduler.py',
                type: 'python',
                description: 'Main autonomous scheduler',
                critical: true
            },
            'dashboard': {
                script: 'app/dashboard.py',
                type: 'python', 
                description: 'Web dashboard interface',
                critical: false
            },
            'deal_engine': {
                script: 'app/deal_engine.py',
                type: 'python',
                description: 'Deal discovery engine',
                critical: true
            },
            'posting_engine': {
                script: 'app/posting_engine.py',
                type: 'python',
                description: 'Social media posting engine',
                critical: true
            },
            'queue_manager': {
                script: 'app/queue_manager.py',
                type: 'python',
                description: 'Priority queue management',
                critical: true
            }
        };
        
        this.ensureLogDirectory();
        this.setupGracefulShutdown();
    }
    
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        // Console output
        console.log(logMessage);
        
        // File output
        const logFile = path.join(this.logDir, 'startup.log');
        fs.appendFileSync(logFile, logMessage + '\n');
        
        // Also log to system health if it's a health check
        if (level === 'HEALTH') {
            const healthFile = path.join(this.logDir, 'system_health.log');
            fs.appendFileSync(healthFile, logMessage + '\n');
        }
    }
    
    async detectEnvironment() {
        try {
            // Check if we're in a cloud environment
            const isAWS = process.env.AWS_REGION || 
                         fs.existsSync('/sys/hypervisor/uuid') ||
                         await this.checkCommand('curl -s http://169.254.169.254/latest/meta-data/');
            
            const isGCP = process.env.GOOGLE_CLOUD_PROJECT ||
                         await this.checkCommand('curl -s -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/');
            
            const isAzure = process.env.AZURE_CLIENT_ID ||
                           await this.checkCommand('curl -s -H "Metadata: true" http://169.254.169.254/metadata/');
            
            const isDocker = fs.existsSync('/.dockerenv');
            
            if (isAWS) return 'aws';
            if (isGCP) return 'gcp'; 
            if (isAzure) return 'azure';
            if (isDocker) return 'docker';
            if (process.platform === 'linux' && !process.env.HOME?.includes('/Users/')) return 'linux-server';
            
            return 'local'; // Windows/Mac development
            
        } catch (error) {
            this.log(`Environment detection error: ${error.message}`, 'WARN');
            return 'local';
        }
    }
    
    async checkCommand(command) {
        return new Promise((resolve) => {
            exec(command, { timeout: 3000 }, (error) => {
                resolve(!error);
            });
        });
    }
    
    async startModule(moduleName) {
        const moduleConfig = this.modules[moduleName];
        if (!moduleConfig) {
            this.log(`Unknown module: ${moduleName}`, 'ERROR');
            return false;
        }
        
        try {
            this.log(`Starting ${moduleName} (${moduleConfig.description})...`);
            
            // Build command based on script type
            let command, args;
            const scriptPath = path.join(this.projectRoot, moduleConfig.script);
            
            if (moduleConfig.type === 'python') {
                // Use Python from virtual environment if available
                const venvPython = path.join(this.projectRoot, '.venv', 'Scripts', 'python.exe');
                command = fs.existsSync(venvPython) ? venvPython : 'python';
                args = [scriptPath];
            } else if (moduleConfig.type === 'node') {
                command = 'node';
                args = [scriptPath];
            } else {
                throw new Error(`Unsupported script type: ${moduleConfig.type}`);
            }
            
            // Spawn the process
            const child = spawn(command, args, {
                cwd: this.projectRoot,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PYTHONPATH: this.projectRoot
                }
            });
            
            // Store process reference
            this.processes.set(moduleName, child);
            
            // Handle process output
            child.stdout?.on('data', (data) => {
                this.log(`[${moduleName}] ${data.toString().trim()}`);
            });
            
            child.stderr?.on('data', (data) => {
                this.log(`[${moduleName}] ERROR: ${data.toString().trim()}`, 'ERROR');
            });
            
            // Handle process exit
            child.on('exit', (code, signal) => {
                this.processes.delete(moduleName);
                
                if (code === 0) {
                    this.log(`${moduleName} exited normally`);
                } else {
                    this.log(`${moduleName} crashed with code ${code}, signal ${signal}`, 'ERROR');
                    
                    // Auto-restart critical modules
                    if (moduleConfig.critical) {
                        this.scheduleRestart(moduleName);
                    }
                }
            });
            
            child.on('error', (error) => {
                this.log(`${moduleName} spawn error: ${error.message}`, 'ERROR');
                this.scheduleRestart(moduleName);
            });
            
            // Reset retry count on successful start
            this.retryCount.set(moduleName, 0);
            this.log(`✅ ${moduleName} started successfully (PID: ${child.pid})`);
            
            return true;
            
        } catch (error) {
            this.log(`❌ Failed to start ${moduleName}: ${error.message}`, 'ERROR');
            this.scheduleRestart(moduleName);
            return false;
        }
    }
    
    scheduleRestart(moduleName) {
        const currentRetries = this.retryCount.get(moduleName) || 0;
        
        if (currentRetries >= this.maxRetries) {
            this.log(`${moduleName} exceeded max retries (${this.maxRetries}), giving up`, 'ERROR');
            return;
        }
        
        const delay = this.retryDelay * Math.pow(2, currentRetries); // Exponential backoff
        this.retryCount.set(moduleName, currentRetries + 1);
        
        this.log(`Scheduling ${moduleName} restart in ${delay}ms (attempt ${currentRetries + 1}/${this.maxRetries})`);
        
        setTimeout(() => {
            this.startModule(moduleName);
        }, delay);
    }
    
    async startAllModules() {
        this.log('🚀 Starting AutoAffiliateHub-X2 orchestration...');
        
        const environment = await this.detectEnvironment();
        this.log(`Environment detected: ${environment}`);
        
        // Start modules in dependency order
        const startOrder = ['queue_manager', 'deal_engine', 'posting_engine', 'scheduler', 'dashboard'];
        
        for (const moduleName of startOrder) {
            await this.startModule(moduleName);
            // Small delay between starts to avoid resource contention
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        this.log('✅ All modules started, beginning health monitoring...');
        this.startHealthMonitoring();
    }
    
    startHealthMonitoring() {
        // Health check every 5 minutes
        setInterval(() => {
            this.performHealthCheck();
        }, 5 * 60 * 1000);
        
        // Initial health check after 30 seconds
        setTimeout(() => {
            this.performHealthCheck();
        }, 30000);
    }
    
    performHealthCheck() {
        const timestamp = new Date().toISOString();
        let healthyModules = 0;
        let totalModules = Object.keys(this.modules).length;
        
        for (const [moduleName, process] of this.processes) {
            if (process && !process.killed) {
                healthyModules++;
            } else {
                this.log(`Health check: ${moduleName} is not running`, 'WARN');
                
                // Restart critical modules automatically
                if (this.modules[moduleName]?.critical) {
                    this.log(`Auto-restarting critical module: ${moduleName}`);
                    this.startModule(moduleName);
                }
            }
        }
        
        const healthStatus = `${healthyModules}/${totalModules} modules healthy`;
        this.log(`Health Check: ${healthStatus}`, 'HEALTH');
        
        // Log system resources if available
        if (process.memoryUsage) {
            const memory = process.memoryUsage();
            const memoryMB = Math.round(memory.rss / 1024 / 1024);
            this.log(`Memory usage: ${memoryMB}MB RSS`, 'HEALTH');
        }
    }
    
    setupGracefulShutdown() {
        const shutdown = (signal) => {
            this.log(`Received ${signal}, shutting down gracefully...`);
            
            // Stop all processes
            for (const [moduleName, process] of this.processes) {
                if (process && !process.killed) {
                    this.log(`Stopping ${moduleName}...`);
                    process.kill('SIGTERM');
                }
            }
            
            // Force exit after 30 seconds
            setTimeout(() => {
                this.log('Force exit after timeout');
                process.exit(1);
            }, 30000);
            
            // Graceful exit when all processes are stopped
            const checkExit = setInterval(() => {
                if (this.processes.size === 0) {
                    clearInterval(checkExit);
                    this.log('✅ All processes stopped, exiting gracefully');
                    process.exit(0);
                }
            }, 1000);
        };
        
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGQUIT', () => shutdown('SIGQUIT'));
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.log(`Uncaught exception: ${error.message}`, 'ERROR');
            console.error(error.stack);
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            this.log(`Unhandled rejection at ${promise}: ${reason}`, 'ERROR');
        });
    }
    
    getStatus() {
        const status = {
            timestamp: new Date().toISOString(),
            modules: {},
            totalProcesses: this.processes.size
        };
        
        for (const moduleName of Object.keys(this.modules)) {
            const process = this.processes.get(moduleName);
            status.modules[moduleName] = {
                running: !!(process && !process.killed),
                pid: process?.pid || null,
                retries: this.retryCount.get(moduleName) || 0
            };
        }
        
        return status;
    }
}

// Main execution
async function main() {
    const orchestrator = new AfillyOrchestrator();
    
    // Handle command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--status')) {
        console.log(JSON.stringify(orchestrator.getStatus(), null, 2));
        return;
    }
    
    if (args.includes('--help')) {
        console.log(`
AutoAffiliateHub-X2 Orchestrator

Usage:
  node orchestrator.js           Start all modules
  node orchestrator.js --status  Show current status
  node orchestrator.js --help    Show this help

Environment Variables:
  NODE_ENV=production           Set production mode
  AFFILLY_LOG_LEVEL=DEBUG       Set log level
        `);
        return;
    }
    
    // Start the orchestration
    await orchestrator.startAllModules();
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Orchestrator startup failed:', error);
        process.exit(1);
    });
}

export default AfillyOrchestrator;