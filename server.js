const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const WebsiteStatusAgent = require('./websiteStatusAgent');
const { router: authRouter } = require('./auth');
const jwt = require('jsonwebtoken');
const db = require('./db');
const fetch = require('node-fetch');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const TELEGRAM_BOT_TOKEN = '7734598468:AAFkx57ZH-R16z9QYseXf7eG6OqCqXDZdeg'; // Replace with your actual bot token
const TELEGRAM_CHAT_ID = '-1002580218358';   // Your channel chat ID

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth API routes
app.use('/api', authRouter);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to extract user from JWT
function getUserFromToken(req) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

// In-memory map to track intervals for each monitor: { user_id:url -> { intervalId, interval_seconds } }
const monitorIntervals = {};

// In-memory map to track last status for each monitor: { user_id:url -> status }
const lastStatusMap = {};

async function updateMonitorIntervals() {
    // Get all active monitors
    const res = await db.query('SELECT * FROM active_monitors');
    const newMonitors = {};
    for (const monitor of res.rows) {
        const key = `${monitor.user_id}:${monitor.url}`;
        newMonitors[key] = monitor.interval_seconds;
        // If not already monitoring, or interval changed, start/restart interval
        if (
            !monitorIntervals[key] ||
            monitorIntervals[key].interval_seconds !== monitor.interval_seconds
        ) {
            if (monitorIntervals[key]) clearInterval(monitorIntervals[key].intervalId);
            monitorIntervals[key] = {
                intervalId: setInterval(() => checkAndLog(monitor), monitor.interval_seconds * 1000),
                interval_seconds: monitor.interval_seconds
            };
        }
    }
    // Remove intervals for monitors that no longer exist
    for (const key in monitorIntervals) {
        if (!newMonitors[key]) {
            clearInterval(monitorIntervals[key].intervalId);
            delete monitorIntervals[key];
        }
    }
}

async function checkAndLog(monitor) {
    console.log(`[Monitor] Checking ${monitor.url} for user ${monitor.user_id}`);
    const agent = new WebsiteStatusAgent();
    const result = await agent.checkStatus(monitor.url);
    let status = result.status;
    let latency = result.latency ?? result.page_load_time;
    let response_code = result.response_code;
    let ip_address = result.ip_address;

    // Compose key for this user and url
    const key = `${monitor.user_id}:${monitor.url}`;
    const prevStatus = lastStatusMap[key];
    const newStatus = status;

    // Only send notification if first check or status changed
    if (prevStatus === undefined || prevStatus !== newStatus) {
        // Fetch username from DB
        const username = await db.getUsernameById(monitor.user_id);
        const statusText = newStatus === 'up' ? 'The Website is Online' : 'The Website is Offline';
        const latencyText = (latency !== undefined && latency !== null) ? `${latency} ms` : 'N/A';
        const message = `Website monitored by <b>${username}</b>\n🌐Website: ${monitor.url}\n🌐Status: ${statusText}\n🌐Latency: ${latencyText}`;
        await sendTelegramNotification(message);
    }
    // Update last known status
    lastStatusMap[key] = newStatus;

    try {
        await db.logMonitorResult({
            url: monitor.url,
            status,
            user_id: monitor.user_id,
            latency,
            response_code,
            performance_metrics: null,
            ip_address
        });
        console.log(`[Monitor] Logged result for ${monitor.url} (user ${monitor.user_id})`);
    } catch (dbErr) {
        console.error(`[Monitor] DB log error for ${monitor.url} (user ${monitor.user_id}):`, dbErr);
    }
}

// On server start, initialize intervals
updateMonitorIntervals();

// Add or update an active monitor
app.post('/api/monitor', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { url, interval_seconds } = req.body;
    if (!url || ![5, 10, 20].includes(Number(interval_seconds))) {
        return res.status(400).json({ error: 'Invalid url or interval' });
    }
    try {
        const monitor = await db.upsertActiveMonitor(user.user_id, url, interval_seconds);
        await updateMonitorIntervals();
        res.json(monitor);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// List active monitors for user
app.get('/api/monitors', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const monitors = await db.getActiveMonitorsByUser(user.user_id);
        res.json(monitors);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove an active monitor
app.delete('/api/monitor', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    try {
        await db.removeActiveMonitor(user.user_id, url);
        await updateMonitorIntervals();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Add /api/history endpoint
app.get('/api/history', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const history = await db.getMonitorHistoryByUser(user.user_id);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            ws.send(JSON.stringify({ error: 'Invalid message format.' }));
            return;
        }
        const { url, token } = data;
        if (!token) {
            ws.send(JSON.stringify({ error: 'Authentication required.' }));
            return;
        }
        try {
            jwt.verify(token, JWT_SECRET);
        } catch (err) {
            ws.send(JSON.stringify({ error: 'Invalid or expired token.' }));
            return;
        }
        const agent = new WebsiteStatusAgent();
        const result = await agent.checkStatus(url);
        ws.send(JSON.stringify(result));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = WebsiteStatusAgent;

async function sendTelegramNotification(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    })
  });
  return res.json();
} 