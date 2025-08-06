const fetch = require('node-fetch');
const dns = require('dns').promises;
const { EventEmitter } = require('events');
const https = require('https');
const http = require('http');
const db = require('./db');

class WebsiteStatusAgent extends EventEmitter {
    constructor(monitor) {
        super();
        this.monitor = monitor;
        this.intervalId = null;
        this.agentId = `agent_${monitor.user_id}_${Date.now()}`;
        this.isRunning = false;
        this.healthStatus = 'healthy';
        this.lastCheckTime = null;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
        this.performanceMetrics = {
            averageLatency: 0,
            successRate: 100,
            totalChecks: 0,
            successfulChecks: 0
        };
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.healthStatus = 'healthy';
        console.log(`Agent ${this.agentId} started monitoring ${this.monitor.url}`);
        
        // Perform an immediate check, then start the interval (fixed 10 seconds)
        this.checkStatus();
        this.intervalId = setInterval(() => this.checkStatus(), 10000);
        
        // Emit agent status
        this.emit('agentStatus', {
            agentId: this.agentId,
            status: 'started',
            url: this.monitor.url,
            interval: 10,
            timestamp: new Date().toISOString()
        });
    }

    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        this.healthStatus = 'stopped';
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        console.log(`Agent ${this.agentId} stopped monitoring ${this.monitor.url}`);
        
        // Emit agent status
        this.emit('agentStatus', {
            agentId: this.agentId,
            status: 'stopped',
            url: this.monitor.url,
            timestamp: new Date().toISOString()
        });
    }

    async checkStatus() {
        if (!this.isRunning) return;
        
        const { url, user_id } = this.monitor;
        const startTime = Date.now();
        
        const result = {
            url,
            user_id,
            agentId: this.agentId,
            status: 'offline',
            latency: null,
            response_code: null,
            ip_address: null,
            timestamp: new Date().toISOString(),
            ssl_status: null,
            ssl_expiry: null,
            page_load_time: null,
            performance_metrics: null,
            error_message: null,
            agent_health: this.healthStatus
        };

        try {
            // Check for active planned downtime first
            const plannedDowntime = await db.getActivePlannedDowntime(url);
            console.log(`Checking planned downtime for ${url}:`, plannedDowntime);
            if (plannedDowntime) {
                console.log(`Website ${url} is in planned maintenance:`, plannedDowntime.reason);
                // Website is in planned maintenance
                result.status = 'maintenance';
                result.error_message = plannedDowntime.reason;
                result.latency = 0;
                result.response_code = 503; // Service Unavailable
                
                this.lastCheckTime = Date.now();
                this.performanceMetrics.totalChecks++;
                
                // Emit the result
                this.emit('statusResult', result);
                return;
            }

            console.log(`No planned downtime found, checking actual website status for ${url}`);
            
            // Enhanced DNS lookup with timeout
            const ipAddress = await this.resolveDNS(url);
            result.ip_address = ipAddress;
            console.log(`DNS resolved to: ${ipAddress}`);

            // Enhanced HTTP/HTTPS check
            const response = await this.performHttpCheck(url);
            result.latency = Date.now() - startTime;
            result.response_code = response.status;
            result.page_load_time = response.loadTime || result.latency;
            result.ssl_status = response.sslStatus;
            result.ssl_expiry = response.sslExpiry;
            
            console.log(`HTTP response: ${response.status}, latency: ${result.latency}ms`);

            if (response.status >= 200 && response.status < 400) {
                result.status = 'online';
                this.consecutiveFailures = 0;
                this.performanceMetrics.successfulChecks++;
                console.log(`Website ${url} is ONLINE`);
            } else {
                result.status = 'offline';
                result.error_message = `HTTP ${response.status}`;
                this.consecutiveFailures++;
                console.log(`Website ${url} is OFFLINE (HTTP ${response.status})`);
            }

        } catch (error) {
            result.latency = Date.now() - startTime;
            result.status = 'offline';
            result.error_message = error.message;
            this.consecutiveFailures++;
            console.log(`Error checking website ${url}:`, error.message);
        }

        // Update performance metrics
        this.updatePerformanceMetrics(result);
        result.performance_metrics = this.performanceMetrics;

        // Update agent health based on consecutive failures
        this.updateAgentHealth();

        this.lastCheckTime = new Date().toISOString();
        this.emit('statusResult', result);
    }

    async resolveDNS(url) {
        try {
            const urlObj = new URL(url);
            const addresses = await Promise.race([
                dns.lookup(urlObj.hostname),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('DNS timeout')), 5000)
                )
            ]);
            return addresses.address;
        } catch (error) {
            throw new Error(`DNS resolution failed: ${error.message}`);
        }
    }

    async performHttpCheck(url) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;
            
            const startTime = Date.now();
            const req = client.request(url, {
                method: 'GET',
                timeout: 10000,
                headers: {
                    'User-Agent': 'WebsiteStatusAgent/1.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'close'
                }
            }, (res) => {
                const loadTime = Date.now() - startTime;
                
                let sslStatus = null;
                let sslExpiry = null;
                
                if (isHttps && res.socket) {
                    const cert = res.socket.getPeerCertificate();
                    if (cert && cert.valid_to) {
                        sslStatus = 'valid';
                        sslExpiry = new Date(cert.valid_to).toISOString();
                    } else {
                        sslStatus = 'invalid';
                    }
                }
                
                resolve({
                    status: res.statusCode,
                    loadTime,
                    sslStatus,
                    sslExpiry
                });
            });

            req.on('error', (error) => {
                reject(new Error(`HTTP request failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    updatePerformanceMetrics(result) {
        this.performanceMetrics.totalChecks++;
        
        if (result.latency) {
            const currentAvg = this.performanceMetrics.averageLatency;
            const totalChecks = this.performanceMetrics.totalChecks;
            this.performanceMetrics.averageLatency = 
                ((currentAvg * (totalChecks - 1)) + result.latency) / totalChecks;
        }
        
        this.performanceMetrics.successRate = 
            (this.performanceMetrics.successfulChecks / this.performanceMetrics.totalChecks) * 100;
    }

    updateAgentHealth() {
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            this.healthStatus = 'degraded';
        } else if (this.consecutiveFailures === 0) {
            this.healthStatus = 'healthy';
        } else {
            this.healthStatus = 'warning';
        }
    }

    getAgentInfo() {
        return {
            agentId: this.agentId,
            url: this.monitor.url,
            interval: 10,
            isRunning: this.isRunning,
            healthStatus: this.healthStatus,
            lastCheckTime: this.lastCheckTime,
            consecutiveFailures: this.consecutiveFailures,
            performanceMetrics: this.performanceMetrics
        };
    }

    updateInterval(newInterval) {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = setInterval(() => this.checkStatus(), 10000);
            
            this.emit('agentStatus', {
                agentId: this.agentId,
                status: 'interval_updated',
                url: this.monitor.url,
                interval: 10,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = WebsiteStatusAgent; 