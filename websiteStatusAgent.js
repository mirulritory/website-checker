const fetch = require('node-fetch');
const dns = require('dns').promises;
const { EventEmitter } = require('events');

class WebsiteStatusAgent extends EventEmitter {
    constructor(monitor) {
        super();
        this.monitor = monitor;
        this.intervalId = null;
    }

    start() {
        // Perform an immediate check, then start the interval
        this.checkStatus();
        this.intervalId = setInterval(() => this.checkStatus(), this.monitor.interval_seconds * 1000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async checkStatus() {
        const { url, user_id } = this.monitor;
        const result = {
            url,
            user_id,
            status: 'offline',
            latency: null,
            response_code: null,
            ip_address: null,
            timestamp: new Date().toISOString()
        };

        const startTime = Date.now();
        try {
            // Get IP address first
            try {
                const urlObj = new URL(url);
                const addresses = await dns.lookup(urlObj.hostname);
                result.ip_address = addresses.address;
            } catch (dnsErr) {
                // Ignore DNS errors for now, but they will likely cause fetch to fail
            }

            const response = await fetch(url, { method: 'GET', redirect: 'follow', timeout: 10000 });
            result.latency = Date.now() - startTime;
            result.response_code = response.status;

            if (response.ok) {
                result.status = 'online';
            }
        } catch (error) {
            result.latency = Date.now() - startTime;
        }

        this.emit('statusResult', result);
    }
}

module.exports = WebsiteStatusAgent; 