const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const WebsiteStatusAgent = require('./websiteStatusAgent');
const { router: authRouter } = require('./auth');
const jwt = require('jsonwebtoken');
const db = require('./db');
const fetch = require('node-fetch');

// Load environment variables
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7734598468:AAFkx57ZH-R16z9QYseXf7eG6OqCqXDZdeg'; 
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1002580218358';   

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

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

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
        if (userAgents && !userAgents.has(monitor.url)) {
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
                    
                    // Send Telegram notification with error handling
                    try {
                        const telegramResult = await sendTelegramNotification(message);
                        if (telegramResult.error) {
                            console.error('Telegram notification failed:', telegramResult.error);
                        }
                    } catch (error) {
                        console.error('Error sending Telegram notification:', error.message);
                    }
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

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }

    try {
        const newMonitor = await db.upsertActiveMonitor(user.user_id, url);
        // Start monitoring immediately
        startUserMonitoring(user.user_id);
        res.status(201).json(newMonitor);
    } catch (err) {
        console.error('Error creating monitor:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
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
        console.error('Error removing monitor:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Get user's monitoring history
app.get('/api/history', authenticateToken, async (req, res) => {
    try {
        const logs = await db.getMonitorHistoryByUser(req.user.user_id);
        
        // Enhance logs with planned downtime info
        const enhancedLogs = await Promise.all(logs.map(async log => {
            if (log.status === 'offline') {
                const downtime = await db.query(
                    `SELECT * FROM planned_downtime 
                     WHERE url = $1 AND status = 'scheduled'
                     AND $2 BETWEEN start_time AND end_time
                     LIMIT 1`,
                    [log.url, log.timestamp]
                );
                
                if (downtime.rows.length > 0) {
                    return {
                        ...log,
                        status: 'maintenance',
                        error_message: downtime.rows[0].reason
                    };
                }
            }
            return log;
        }));
        
        res.json(enhancedLogs);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile
app.get('/api/profile', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const profile = await db.getUserProfile(user.user_id);
        res.json(profile);
    } catch (err) {
        console.error('Error getting profile:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Get user's websites
app.get('/api/profile/websites', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const websites = await db.getUserWebsites(user.user_id);
        res.json(websites);
    } catch (err) {
        console.error('Error getting websites:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Add website to user's list
app.post('/api/profile/websites', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }
    
    try {
        const website = await db.addUserWebsite(user.user_id, url);
        res.status(201).json(website);
    } catch (err) {
        console.error('Error adding website:', err);
        
        // Handle specific error cases
        if (err.message.includes('already registered by another user')) {
            res.status(409).json({ error: 'This URL is already registered by another user.' });
        } else if (err.message.includes('already in your list')) {
            res.status(409).json({ error: 'This URL is already in your list.' });
        } else {
            res.status(500).json({ error: 'Server error: ' + err.message });
        }
    }
});

// Remove website from user's list
app.delete('/api/profile/websites', async (req, res) => {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required.' });
    }
    
    try {
        await db.removeUserWebsite(user.user_id, url);
        res.json({ message: 'Website removed successfully.' });
    } catch (err) {
        console.error('Error removing website:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Add planned downtime
app.post('/api/planned-downtime', authenticateToken, async (req, res) => {
    try {
        const { url, reason, start_time, end_time } = req.body;
        
        if (!url || !reason || !start_time || !end_time) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // The frontend sends local time as datetime-local format (YYYY-MM-DDTHH:MM)
        // We need to convert this to UTC properly
        const startTimeLocal = new Date(start_time + ':00');
        const endTimeLocal = new Date(end_time + ':00');
        
        // Convert to UTC by adjusting for timezone offset
        const startTimeUTC = new Date(startTimeLocal.getTime() - (startTimeLocal.getTimezoneOffset() * 60000));
        const endTimeUTC = new Date(endTimeLocal.getTime() - (endTimeLocal.getTimezoneOffset() * 60000));
        
        const downtime = await db.addPlannedDowntime(
            req.user.user_id,
            url,
            reason,
            startTimeUTC,
            endTimeUTC
        );

        res.json(downtime);
    } catch (error) {
        console.error('Error scheduling planned downtime:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's planned downtime
app.get('/api/planned-downtime', authenticateToken, async (req, res) => {
    try {
        const { url, timestamp } = req.query;
        if (url && timestamp) {
            // This is for checking specific downtime at a timestamp (used by history)
            const downtime = await db.query(
                `SELECT * FROM planned_downtime 
                 WHERE url = $1 AND status = 'scheduled'
                 AND $2 BETWEEN start_time AND end_time
                 LIMIT 1`,
                [url, new Date(timestamp)]
            );

            if (downtime.rows.length > 0) {
                res.json(downtime.rows[0]);
            } else {
                res.json(null);
            }
        } else {
            // This is for getting all user's planned downtime (used by profile page)
            const downtime = await db.getUserPlannedDowntime(req.user.user_id);
            res.json(downtime);
        }
    } catch (error) {
        console.error('Error checking planned downtime:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's planned downtime for profile page
app.get('/api/profile/planned-downtime', authenticateToken, async (req, res) => {
    try {
        const downtime = await db.getUserPlannedDowntime(req.user.user_id);
        res.json(downtime);
    } catch (error) {
        console.error('Error fetching user planned downtime:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Cancel/Delete planned downtime
app.delete('/api/planned-downtime/:id', authenticateToken, async (req, res) => {
    try {
        const maintenanceId = req.params.id;
        
        // First check if the maintenance belongs to the user
        const maintenance = await db.query(
            'SELECT * FROM planned_downtime WHERE id = $1 AND user_id = $2',
            [maintenanceId, req.user.user_id]
        );

        if (maintenance.rows.length === 0) {
            return res.status(404).json({ error: 'Maintenance not found or unauthorized' });
        }

        // Update status to cancelled instead of deleting
        await db.updatePlannedDowntimeStatus(maintenanceId, 'cancelled');
        
        res.json({ message: 'Maintenance cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling planned downtime:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get top 5 most monitored URLs across all users
app.get('/api/top-monitored-urls', async (req, res) => {
    try {
        const topUrls = await db.getTopMonitoredUrls();
        res.json(topUrls);
    } catch (error) {
        console.error('Error fetching top monitored URLs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

wss.on('connection', (ws) => {
    console.log(`New WebSocket connection established (Total connections: ${wss.clients.size})`);
    
    ws.on('message', async (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.log('Invalid message format received');
            ws.send(JSON.stringify({ error: 'Invalid message format.' }));
            return;
        }

        const { type, token } = data;
        if (!token) {
            console.log('No token provided in WebSocket message');
            ws.send(JSON.stringify({ error: 'Authentication required.' }));
            return ws.close();
        }

        let userPayload;
        try {
            userPayload = jwt.verify(token, JWT_SECRET);
            ws.userId = userPayload.user_id; // Assign user_id to the websocket connection
            console.log(`User ${ws.userId} authenticated (Total active users: ${new Set([...wss.clients].map(client => client.userId).filter(id => id)).size})`);
        } catch (err) {
            console.log('Invalid or expired token provided');
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
        // Only log if we have a valid userId
        if (ws.userId) {
            console.log(`User ${ws.userId} disconnected (Remaining connections: ${wss.clients.size})`);
        } else {
            console.log('Unauthenticated connection closed');
        }
        
        // Don't stop monitoring - let it continue running server-side
        // This allows monitoring to persist even when user signs out or closes browser
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initialize database schema (add phone number column if needed)
    try {
        await db.addPhoneNumberColumn();
        await db.addErrorMessageColumn();
        await db.migrateActiveMonitors();
        await db.createApplicationOwnerTable();
        await db.addUrlUniqueConstraint();
        await db.createPlannedDowntimeTable();
    } catch (err) {
        console.log('Error initializing database schema:', err.message);
    }
    
    // Validate Telegram bot configuration
    try {
        const telegramValid = await validateTelegramBot();
        if (telegramValid) {
            console.log('Telegram bot configuration validated successfully');
            
            // Test chat access
            const chatAccessValid = await testTelegramChatAccess();
            if (chatAccessValid) {
                console.log('Telegram chat access validated successfully');
                
                // Test sending a message
                const testResult = await testTelegramBot();
                if (testResult) {
                    console.log('Telegram bot message sending test successful');
                } else {
                    console.warn('Telegram bot message sending test failed - notifications may not work');
                }
            } else {
                console.warn('Telegram chat access test failed - notifications may not work');
            }
        } else {
            console.warn('Telegram bot configuration validation failed - notifications may not work');
        }
    } catch (err) {
        console.warn('Failed to validate Telegram bot configuration:', err.message);
    }
    
    // Log server status every 30 seconds
    setInterval(() => {
        const activeConnections = wss.clients.size;
        const activeUsers = new Set([...wss.clients].map(client => client.userId).filter(id => id));
        console.log(`Server Status - Active connections: ${activeConnections}, Active users: ${activeUsers.size} (${[...activeUsers].join(', ')})`);
    }, 30000);
});

module.exports = WebsiteStatusAgent;

// Function to test if bot can access the chat
async function testTelegramChatAccess() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Telegram configuration missing: BOT_TOKEN or CHAT_ID not set');
    return false;
  }
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${TELEGRAM_CHAT_ID}`;
    
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Validation timeout')), 5000);
    });
    
    // Create the fetch promise
    const fetchPromise = fetch(url);
    
    // Race between fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    const data = await response.json();
    
    if (data.ok && data.result) {
      console.log(`Telegram chat access validated: ${data.result.title || data.result.username || data.result.first_name}`);
      return true;
    } else {
      console.error('Failed to access Telegram chat:', data);
      return false;
    }
  } catch (error) {
    console.error('Failed to test Telegram chat access:', error.message);
    return false;
  }
}

// Function to test Telegram bot message sending
async function testTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Telegram configuration missing: BOT_TOKEN or CHAT_ID not set');
    return false;
  }
  
  try {
    const testMessage = '🤖 Bot test message - Website monitoring system is online';
    const result = await sendTelegramNotification(testMessage, 1);
    
    if (result.error) {
      console.error('Telegram bot test failed:', result.error);
      return false;
    } else {
      console.log('Telegram bot test successful');
      return true;
    }
  } catch (error) {
    console.error('Telegram bot test failed:', error.message);
    return false;
  }
}

// Function to validate Telegram bot token
async function validateTelegramBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('Telegram bot token not configured');
    return false;
  }
  
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
    
    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Validation timeout')), 5000);
    });
    
    // Create the fetch promise
    const fetchPromise = fetch(url);
    
    // Race between fetch and timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    const data = await response.json();
    
    if (data.ok && data.result) {
      console.log(`Telegram bot validated: @${data.result.username}`);
      return true;
    } else {
      console.error('Invalid Telegram bot token:', data);
      return false;
    }
  } catch (error) {
    console.error('Failed to validate Telegram bot:', error.message);
    return false;
  }
}

async function sendTelegramNotification(message, retries = 3) {
  // Check if Telegram configuration is set up
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Telegram configuration missing: BOT_TOKEN or CHAT_ID not set');
    return { error: 'Telegram configuration missing' };
  }
  
  // Validate bot token format (should be numbers:letters)
  if (!TELEGRAM_BOT_TOKEN.match(/^\d+:[A-Za-z0-9_-]+$/)) {
    console.error('Invalid Telegram bot token format:', TELEGRAM_BOT_TOKEN);
    return { error: 'Invalid Telegram bot token format' };
  }
  
  // Validate chat ID format
  if (!TELEGRAM_CHAT_ID.match(/^-?\d+$/)) {
    console.error('Invalid Telegram chat ID format:', TELEGRAM_CHAT_ID);
    return { error: 'Invalid Telegram chat ID format' };
  }
  
  // Validate message
  if (!message || typeof message !== 'string') {
    console.error('Invalid message format');
    return { error: 'Invalid message format' };
  }
  
  // Check message length (Telegram limit is 4096 characters)
  if (message.length > 4096) {
    console.error('Message too long for Telegram (max 4096 characters)');
    return { error: 'Message too long for Telegram' };
  }
  
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  console.log(`Attempting to send Telegram notification (${retries} retries available)`);
  console.log(`Target URL: ${url.replace(TELEGRAM_BOT_TOKEN, '***')}`);
  console.log(`Chat ID: ${TELEGRAM_CHAT_ID}`);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Telegram notification attempt ${attempt}/${retries}`);
      
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 10000);
      });
      
      // Create the fetch promise
      const fetchPromise = fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML'
        })
      });
      
      // Race between fetch and timeout
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error(`Telegram API error (attempt ${attempt}):`, errorData);
        
        // Handle specific Telegram API errors
        if (errorData.error_code === 401) {
          console.error('Telegram bot token is invalid or unauthorized');
          return { error: 'Telegram bot token is invalid or unauthorized' };
        } else if (errorData.error_code === 400) {
          console.error('Telegram API bad request:', errorData.description);
          return { error: `Telegram API bad request: ${errorData.description}` };
        } else if (errorData.error_code === 403) {
          console.error('Telegram bot is not a member of the chat');
          return { error: 'Telegram bot is not a member of the chat' };
        } else if (errorData.error_code === 404) {
          console.error('Telegram chat not found');
          return { error: 'Telegram chat not found' };
        }
        
        if (attempt === retries) {
          return { error: `Telegram API error: ${res.status} ${res.statusText}` };
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      
      const result = await res.json();
      if (attempt > 1) {
        console.log(`Telegram notification sent successfully on attempt ${attempt}`);
      } else {
        console.log('Telegram notification sent successfully');
      }
      return result;
      
    } catch (error) {
      console.error(`Telegram notification attempt ${attempt} failed:`, error.message);
      
      // Check for specific error types
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        console.error('Network timeout detected - this might be due to network issues or firewall settings');
        console.error('Possible solutions:');
        console.error('1. Check your internet connection');
        console.error('2. Check if your firewall is blocking outbound HTTPS connections');
        console.error('3. Check if your network allows connections to api.telegram.org');
        console.error('4. Try using a VPN if you\'re behind a corporate firewall');
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        console.error('Network connection issue detected - check internet connection and firewall settings');
      }
      
      if (attempt === retries) {
        console.error(`Telegram notification failed after ${retries} attempts`);
        return { error: `Telegram notification failed after ${retries} attempts: ${error.message}` };
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = 1000 * attempt;
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
} 