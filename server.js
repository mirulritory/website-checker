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

// Map to store active monitoring agents, keyed by user_id and then url
const activeAgents = new Map();

// Map to store the last known status of each monitor, to detect changes
const lastStatusMap = new Map();

// Function to start monitoring for a user
async function startUserMonitoring(userId) {
    if (!activeAgents.has(userId)) {
        activeAgents.set(userId, new Map());
    }
    const userAgents = activeAgents.get(userId);

    const monitors = await db.getActiveMonitorsByUser(userId);
    monitors.forEach(monitor => {
        if (!userAgents.has(monitor.url)) {
            const agent = new WebsiteStatusAgent(monitor);
            agent.on('statusResult', async (result) => {
                const monitorKey = `${result.user_id}:${result.url}`;
                const lastStatus = lastStatusMap.get(monitorKey);
                const newStatus = result.status;

                // Send notification if status changes or it's the first check
                if (lastStatus === undefined || lastStatus !== newStatus) {
                    const username = await db.getUsernameById(result.user_id); // Assumes this function exists
                    const statusText = newStatus === 'online' ? 'The Website is Online' : 'The Website is Offline';
                    const latencyText = result.latency !== null ? `${result.latency} ms` : 'N/A';
                    const message = `Website monitored by <b>${username}</b>\n🌐Website: ${result.url}\n🌐Status: ${statusText}\n🌐Latency: ${latencyText}`;
                    sendTelegramNotification(message);
                }
                lastStatusMap.set(monitorKey, newStatus);

                // Find the websocket for this user and send the result
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && client.userId === userId) {
                        client.send(JSON.stringify({ type: 'statusUpdate', monitor: result }));
                    }
                });
                db.logMonitorResult(result);
            });
            agent.start();
            userAgents.set(monitor.url, agent);
        }
    });
}

// Function to stop a specific monitor
function stopMonitor(userId, url) {
    if (activeAgents.has(userId)) {
        const userAgents = activeAgents.get(userId);
        if (userAgents.has(url)) {
            userAgents.get(url).stop();
            userAgents.delete(url);
        }
    }
    // Also remove from status tracking
    const monitorKey = `${userId}:${url}`;
    lastStatusMap.delete(monitorKey);
}

// Function to stop all monitors for a user
function stopAllUserMonitoring(userId) {
    if (activeAgents.has(userId)) {
        const userAgents = activeAgents.get(userId);
        userAgents.forEach(agent => agent.stop());
        activeAgents.delete(userId);
    }
}

// Add a new monitor
app.post('/api/monitors', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { url, interval } = req.body;
    if (!url || !interval) {
        return res.status(400).json({ error: 'URL and interval are required.' });
    }

    try {
        const newMonitor = await db.upsertActiveMonitor(user.user_id, url, interval);
        // Start monitoring immediately
        startUserMonitoring(user.user_id);
        res.status(201).json(newMonitor);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove a monitor
app.post('/api/monitors/remove', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }

    try {
        await db.removeActiveMonitor(user.user_id, url);
        // Stop the agent for this monitor
        stopMonitor(user.user_id, url);
        res.json({ message: 'Monitor removed successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's monitoring history
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

        const { type, token } = data;
        if (!token) {
            ws.send(JSON.stringify({ error: 'Authentication required.' }));
            return ws.close();
        }

        let userPayload;
        try {
            userPayload = jwt.verify(token, JWT_SECRET);
            ws.userId = userPayload.user_id; // Assign user_id to the websocket connection
        } catch (err) {
            ws.send(JSON.stringify({ error: 'Invalid or expired token.' }));
            return ws.close();
        }

        if (type === 'getMonitors') {
            const monitors = await db.getActiveMonitorsByUser(ws.userId);
            ws.send(JSON.stringify({ type: 'initialMonitors', monitors }));
            // Start monitoring for this user if not already started
            startUserMonitoring(ws.userId);
        }
    });

    ws.on('close', () => {
        // Stop monitoring for this user if they have no other active connections
        let hasOtherConnection = false;
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.userId === ws.userId) {
                hasOtherConnection = true;
            }
        });

        if (!hasOtherConnection && ws.userId) {
            stopAllUserMonitoring(ws.userId);
        }
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