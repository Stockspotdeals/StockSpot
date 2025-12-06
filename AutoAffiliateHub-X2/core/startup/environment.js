/**
 * Environment Detection Module
 * Detects runtime environment and sets appropriate configurations
 */

import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

class EnvironmentDetector {
    constructor() {
        this.detected = null;
        this.config = null;
    }
    
    async detect() {
        if (this.detected) return this.detected;
        
        try {
            // Check for cloud environments
            if (await this.isAWS()) {
                this.detected = 'aws';
            } else if (await this.isGCP()) {
                this.detected = 'gcp';
            } else if (await this.isAzure()) {
                this.detected = 'azure';
            } else if (await this.isDocker()) {
                this.detected = 'docker';
            } else if (await this.isLinuxServer()) {
                this.detected = 'linux-server';
            } else if (process.platform === 'win32') {
                this.detected = 'windows';
            } else if (process.platform === 'darwin') {
                this.detected = 'macos';
            } else {
                this.detected = 'local';
            }
            
            this.config = this.getEnvironmentConfig(this.detected);
            return this.detected;
            
        } catch (error) {
            console.warn('Environment detection failed:', error.message);
            this.detected = 'local';
            this.config = this.getEnvironmentConfig('local');
            return this.detected;
        }
    }
    
    async isAWS() {
        try {
            // Check for AWS metadata service
            await execAsync('curl -s -m 2 http://169.254.169.254/latest/meta-data/instance-id', { timeout: 3000 });
            return true;
        } catch {
            // Check for AWS environment variables
            return !!(process.env.AWS_REGION || 
                     process.env.AWS_DEFAULT_REGION || 
                     process.env.AWS_LAMBDA_FUNCTION_NAME ||
                     fs.existsSync('/sys/hypervisor/uuid'));
        }
    }
    
    async isGCP() {
        try {
            await execAsync('curl -s -H "Metadata-Flavor: Google" -m 2 http://169.254.169.254/computeMetadata/v1/instance/', { timeout: 3000 });
            return true;
        } catch {
            return !!(process.env.GOOGLE_CLOUD_PROJECT || 
                     process.env.GCLOUD_PROJECT ||
                     process.env.GOOGLE_APPLICATION_CREDENTIALS);
        }
    }
    
    async isAzure() {
        try {
            await execAsync('curl -s -H "Metadata: true" -m 2 http://169.254.169.254/metadata/instance?api-version=2021-02-01', { timeout: 3000 });
            return true;
        } catch {
            return !!(process.env.AZURE_CLIENT_ID || 
                     process.env.AZURE_TENANT_ID ||
                     process.env.WEBSITE_SITE_NAME); // Azure App Service
        }
    }
    
    async isDocker() {
        return fs.existsSync('/.dockerenv') || 
               fs.existsSync('/proc/1/cgroup') && 
               fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker');
    }
    
    async isLinuxServer() {
        if (process.platform !== 'linux') return false;
        
        // Check for server indicators
        const serverIndicators = [
            !process.env.DISPLAY,                    // No GUI
            fs.existsSync('/etc/systemd/system'),    // Systemd
            fs.existsSync('/var/log/syslog'),        // System logs
            !fs.existsSync('/home/' + os.userInfo().username + '/Desktop') // No desktop
        ];
        
        return serverIndicators.filter(Boolean).length >= 2;
    }
    
    getEnvironmentConfig(environment) {
        const configs = {
            'aws': {
                processManager: 'pm2',
                logLevel: 'info',
                autoRestart: true,
                maxRestarts: 10,
                restartDelay: 5000,
                monitoring: {
                    enabled: true,
                    interval: 60000,
                    healthCheck: true
                },
                resources: {
                    maxMemory: '1GB',
                    maxCpu: '80%'
                },
                persistence: {
                    enabled: true,
                    location: '/var/log/affilly'
                }
            },
            
            'gcp': {
                processManager: 'pm2',
                logLevel: 'info', 
                autoRestart: true,
                maxRestarts: 10,
                restartDelay: 5000,
                monitoring: {
                    enabled: true,
                    interval: 60000,
                    healthCheck: true,
                    stackdriver: true
                },
                resources: {
                    maxMemory: '1GB',
                    maxCpu: '80%'
                },
                persistence: {
                    enabled: true,
                    location: '/var/log/affilly'
                }
            },
            
            'azure': {
                processManager: 'pm2',
                logLevel: 'info',
                autoRestart: true, 
                maxRestarts: 10,
                restartDelay: 5000,
                monitoring: {
                    enabled: true,
                    interval: 60000,
                    healthCheck: true,
                    applicationInsights: true
                },
                resources: {
                    maxMemory: '1GB',
                    maxCpu: '80%'
                },
                persistence: {
                    enabled: true,
                    location: process.env.HOME + '/LogFiles/Application' || '/tmp/affilly'
                }
            },
            
            'docker': {
                processManager: 'direct',
                logLevel: 'info',
                autoRestart: true,
                maxRestarts: 5,
                restartDelay: 3000,
                monitoring: {
                    enabled: true,
                    interval: 30000,
                    healthCheck: true
                },
                resources: {
                    maxMemory: '512MB',
                    maxCpu: '70%'
                },
                persistence: {
                    enabled: true,
                    location: '/app/logs'
                }
            },
            
            'linux-server': {
                processManager: 'systemd',
                logLevel: 'info',
                autoRestart: true,
                maxRestarts: 10,
                restartDelay: 5000,
                monitoring: {
                    enabled: true,
                    interval: 60000,
                    healthCheck: true,
                    systemd: true
                },
                resources: {
                    maxMemory: '2GB',
                    maxCpu: '85%'
                },
                persistence: {
                    enabled: true,
                    location: '/var/log/affilly'
                }
            },
            
            'windows': {
                processManager: 'direct',
                logLevel: 'debug',
                autoRestart: true,
                maxRestarts: 3,
                restartDelay: 5000,
                monitoring: {
                    enabled: true,
                    interval: 30000,
                    healthCheck: false
                },
                resources: {
                    maxMemory: '1GB',
                    maxCpu: '70%'
                },
                persistence: {
                    enabled: true,
                    location: path.join(os.homedir(), 'AppData', 'Local', 'Affilly', 'logs')
                }
            },
            
            'macos': {
                processManager: 'direct',
                logLevel: 'debug',
                autoRestart: true,
                maxRestarts: 3,
                restartDelay: 5000,
                monitoring: {
                    enabled: true,
                    interval: 30000,
                    healthCheck: false
                },
                resources: {
                    maxMemory: '1GB',
                    maxCpu: '70%'
                },
                persistence: {
                    enabled: true,
                    location: path.join(os.homedir(), 'Library', 'Logs', 'Affilly')
                }
            },
            
            'local': {
                processManager: 'direct',
                logLevel: 'debug',
                autoRestart: true,
                maxRestarts: 3,
                restartDelay: 3000,
                monitoring: {
                    enabled: true,
                    interval: 30000,
                    healthCheck: false
                },
                resources: {
                    maxMemory: '512MB',
                    maxCpu: '60%'
                },
                persistence: {
                    enabled: true,
                    location: './logs'
                }
            }
        };
        
        return configs[environment] || configs['local'];
    }
    
    getConfig() {
        return this.config;
    }
    
    isProduction() {
        return ['aws', 'gcp', 'azure', 'linux-server'].includes(this.detected);
    }
    
    isDevelopment() {
        return ['windows', 'macos', 'local'].includes(this.detected);
    }
    
    supportsSystemd() {
        return ['linux-server'].includes(this.detected);
    }
    
    supportsPM2() {
        return ['aws', 'gcp', 'azure', 'docker'].includes(this.detected);
    }
    
    getLogDirectory() {
        return this.config?.persistence?.location || './logs';
    }
    
    getProcessManager() {
        return this.config?.processManager || 'direct';
    }
    
    shouldEnableMonitoring() {
        return this.config?.monitoring?.enabled || false;
    }
    
    getRestartPolicy() {
        return {
            maxRestarts: this.config?.maxRestarts || 3,
            restartDelay: this.config?.restartDelay || 5000,
            autoRestart: this.config?.autoRestart || true
        };
    }
    
    getResourceLimits() {
        return this.config?.resources || {
            maxMemory: '512MB',
            maxCpu: '60%'
        };
    }
}

// Export singleton instance
const environmentDetector = new EnvironmentDetector();

export default environmentDetector;