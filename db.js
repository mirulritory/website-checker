// agent_monitor_logs table structure (merged with active_monitors):
// CREATE TABLE agent_monitor_logs (
//   url TEXT NOT NULL,
//   status TEXT NOT NULL,           -- 'online', 'offline', 'active', 'inactive'
//   "timestamp" TIMESTAMP NOT NULL,
//   user_id INTEGER NOT NULL,
//   latency INTEGER,
//   ssl_status TEXT,
//   ssl_expiry TIMESTAMP,
//   response_code INTEGER,
//   page_load_time INTEGER,
//   performance_metrics JSONB,
//   ip_address TEXT
// );
// 
// Note: This table now serves both purposes:
// - Active monitors (status = 'active'/'inactive')
// - Monitoring results (status = 'online'/'offline')

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'psm.postgres.database.azure.com',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'Nbn_1259',
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false } // For cloud DBs like Azure
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  upsertActiveMonitor: async (user_id, url) => {
    // First, check if there's already an active monitor for this user/url
    const existingMonitor = await pool.query(
      `SELECT * FROM agent_monitor_logs 
       WHERE user_id = $1 AND url = $2 AND status = 'active'
       ORDER BY "timestamp" DESC LIMIT 1`,
      [user_id, url]
    );

    if (existingMonitor.rows.length > 0) {
      // Update existing active monitor
      const res = await pool.query(
        `UPDATE agent_monitor_logs 
         SET "timestamp" = NOW()
         WHERE user_id = $1 AND url = $2 AND status = 'active'
         RETURNING *`,
        [user_id, url]
      );
      return res.rows[0];
    } else {
      // Insert new active monitor
      const res = await pool.query(
        `INSERT INTO agent_monitor_logs (user_id, url, status, "timestamp")
         VALUES ($1, $2, 'active', NOW())
         RETURNING *`,
        [user_id, url]
      );
      return res.rows[0];
    }
  },
  getActiveMonitorsByUser: async (user_id) => {
    // Get active monitors from agent_monitor_logs
    const res = await pool.query(
      `SELECT DISTINCT ON (url) url, "timestamp", user_id
       FROM agent_monitor_logs 
       WHERE user_id = $1 AND status = 'active'
       ORDER BY url, "timestamp" DESC`,
      [user_id]
    );
    return res.rows;
  },
  removeActiveMonitor: async (user_id, url) => {
    // Mark as inactive in agent_monitor_logs
    await pool.query(
      `UPDATE agent_monitor_logs 
       SET status = 'inactive', "timestamp" = NOW()
       WHERE user_id = $1 AND url = $2 AND status = 'active'`,
      [user_id, url]
    );
  },
  logMonitorResult: async (log) => {
    await pool.query(
      `INSERT INTO agent_monitor_logs (url, status, "timestamp", user_id, latency, response_code, page_load_time, performance_metrics, ip_address, error_message)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9)`,
      [
        log.url,
        log.status,
        log.user_id,
        log.latency,
        log.response_code,
        log.page_load_time,
        log.performance_metrics ? JSON.stringify(log.performance_metrics) : null,
        log.ip_address,
        log.error_message
      ]
    );
  },
  getMonitorHistoryByUser: async (user_id) => {
    const res = await pool.query(
      `SELECT * FROM agent_monitor_logs 
       WHERE user_id = $1 AND status IN ('online', 'offline', 'maintenance') 
       ORDER BY "timestamp" DESC`,
      [user_id]
    );
    return res.rows;
  },
  getUsernameById: async (user_id) => {
    const res = await pool.query('SELECT username FROM users WHERE user_id = $1', [user_id]);
    return res.rows.length > 0 ? res.rows[0].username : null;
  },
  // Get monitoring statistics for a user
  getMonitoringStats: async (user_id) => {
    const res = await pool.query(`
      SELECT 
        COUNT(DISTINCT url) as total_monitors,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_monitors,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_checks,
        COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_checks,
        AVG(latency) as avg_latency
      FROM agent_monitor_logs 
      WHERE user_id = $1
    `, [user_id]);
    return res.rows[0];
  },
  // Add phone number to users table if it doesn't exist
  addPhoneNumberColumn: async () => {
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)
      `);
      console.log('Phone number column added to users table');
    } catch (err) {
      console.log('Phone number column already exists or error:', err.message);
    }
  },
  // Add error_message column to agent_monitor_logs table if it doesn't exist
  addErrorMessageColumn: async () => {
    try {
      await pool.query(`
        ALTER TABLE agent_monitor_logs 
        ADD COLUMN IF NOT EXISTS error_message TEXT
      `);
      console.log('Error message column added to agent_monitor_logs table');
    } catch (err) {
      console.log('Error message column already exists or error:', err.message);
    }
  },
  // Migrate active_monitors data to agent_monitor_logs and drop the table
  migrateActiveMonitors: async () => {
    try {
      // Check if active_monitors table exists
      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'active_monitors'
        );
      `);

      if (tableExists.rows[0].exists) {
        // Get all active monitors
        const activeMonitors = await pool.query('SELECT * FROM active_monitors');

        for (const monitor of activeMonitors.rows) {
          // Insert a log entry for each active monitor with current timestamp
          await pool.query(`
            INSERT INTO agent_monitor_logs 
            (url, status, "timestamp", user_id, latency, response_code, page_load_time, performance_metrics, ip_address)
            VALUES ($1, 'active', NOW(), $2, NULL, NULL, NULL, NULL, NULL)
            ON CONFLICT DO NOTHING
          `, [monitor.url, monitor.user_id]);
        }

        console.log(`Migrated ${activeMonitors.rows.length} active monitors to agent_monitor_logs`);

        // Drop the active_monitors table
        await pool.query('DROP TABLE active_monitors');
        console.log('Dropped active_monitors table');
      } else {
        console.log('active_monitors table does not exist, skipping migration');
      }
    } catch (err) {
      console.log('Error migrating active monitors:', err.message);
    }
  },
  // Create application_owner table if it doesn't exist
  createApplicationOwnerTable: async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS application_owner (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          url TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, url),
          UNIQUE(url)
        )
      `);
      console.log('Application owner table created or already exists');
    } catch (err) {
      console.log('Error creating application_owner table:', err.message);
    }
  },
  // Add unique constraint on url column if it doesn't exist
  addUrlUniqueConstraint: async () => {
    try {
      await pool.query(`
        ALTER TABLE application_owner 
        ADD CONSTRAINT IF NOT EXISTS application_owner_url_unique UNIQUE (url)
      `);
      console.log('URL unique constraint added to application_owner table');
    } catch (err) {
      console.log('URL unique constraint already exists or error:', err.message);
    }
  },
  // Get user profile data (username, email, phone_number)
  getUserProfile: async (user_id) => {
    const res = await pool.query(
      'SELECT username, email, phone_number FROM users WHERE user_id = $1',
      [user_id]
    );
    return res.rows[0];
  },
  // Add website to user's application list
  addUserWebsite: async (user_id, url) => {
    // First check if the URL already exists for any user
    const existingUrl = await pool.query(
      `SELECT user_id, url FROM application_owner WHERE url = $1`,
      [url]
    );
    
    if (existingUrl.rows.length > 0) {
      // URL already exists for another user
      throw new Error('This URL is already registered by another user.');
    }
    
    // Check if the URL already exists for this user
    const existingUserUrl = await pool.query(
      `SELECT user_id, url FROM application_owner WHERE user_id = $1 AND url = $2`,
      [user_id, url]
    );
    
    if (existingUserUrl.rows.length > 0) {
      // URL already exists for this user
      throw new Error('This URL is already in your list.');
    }
    
    // Insert the new URL
    const res = await pool.query(
      `INSERT INTO application_owner (user_id, url)
       VALUES ($1, $2)
       RETURNING *`,
      [user_id, url]
    );
    return res.rows[0];
  },
  // Get user's website list
  getUserWebsites: async (user_id) => {
    const res = await pool.query(
      'SELECT * FROM application_owner WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );
    return res.rows;
  },
  // Remove website from user's list
  removeUserWebsite: async (user_id, url) => {
    await pool.query(
      'DELETE FROM application_owner WHERE user_id = $1 AND url = $2',
      [user_id, url]
    );
  },
  // Create planned_downtime table if it doesn't exist
  createPlannedDowntimeTable: async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS planned_downtime (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          url TEXT NOT NULL,
          reason TEXT NOT NULL,
          start_time TIMESTAMP NOT NULL,
          end_time TIMESTAMP NOT NULL,
          status TEXT DEFAULT 'scheduled',
          created_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
      `);
      console.log('Planned downtime table created or already exists');
    } catch (err) {
      console.log('Error creating planned_downtime table:', err.message);
    }
  },
  // Add planned downtime
  addPlannedDowntime: async (user_id, url, reason, start_time, end_time) => {
    const res = await pool.query(
      `INSERT INTO planned_downtime (user_id, url, reason, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, url, reason, start_time, end_time]
    );
    return res.rows[0];
  },
  // Get active planned downtime for a URL
  getActivePlannedDowntime: async (url) => {
    console.log(`\n=== CHECKING PLANNED DOWNTIME FOR URL: ${url} ===`);
    
    // Use local timezone instead of database server time
    const now = new Date();
    console.log(`Current local time:`, now.toISOString());
    console.log(`Current local time (local):`, now.toString());
    
    // First, let's see ALL planned downtime for this URL to debug
    const allDowntime = await pool.query(
      `SELECT * FROM planned_downtime 
        WHERE url = $1 AND status = 'scheduled'
        ORDER BY start_time DESC`,
      [url]
    );
    
    console.log(`All scheduled downtime for ${url}:`, allDowntime.rows);
    
    // Check each maintenance record individually using local time
    for (const downtime of allDowntime.rows) {
      // Parse the times as local time (since we're storing them as local time)
      let startTime, endTime;
      
      try {
        // Handle different possible formats
        if (typeof downtime.start_time === 'string') {
          startTime = new Date(downtime.start_time);
        } else {
          startTime = new Date(downtime.start_time);
        }
        
        if (typeof downtime.end_time === 'string') {
          endTime = new Date(downtime.end_time);
        } else {
          endTime = new Date(downtime.end_time);
        }
        
        // Validate the dates
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          console.log(`⚠️ Invalid date format for maintenance ID ${downtime.id}`);
          continue;
        }
        
        const isActive = now >= startTime && now <= endTime;
        
        console.log(`\n--- Maintenance ID ${downtime.id} ---`);
        console.log(`Start time (DB): ${downtime.start_time}`);
        console.log(`End time (DB): ${downtime.end_time}`);
        console.log(`Start time (parsed): ${startTime.toISOString()}`);
        console.log(`End time (parsed): ${endTime.toISOString()}`);
        console.log(`Current time: ${now.toISOString()}`);
        console.log(`Is active: ${isActive}`);
        console.log(`Reason: ${downtime.reason}`);
        
        if (isActive) {
          console.log(`✅ FOUND ACTIVE MAINTENANCE:`, downtime);
          return downtime;
        }
      } catch (error) {
        console.log(`⚠️ Error parsing dates for maintenance ID ${downtime.id}:`, error.message);
        continue;
      }
    }
    
    console.log(`❌ No active downtime found for ${url}`);
    return null;
  },

  getPlannedDowntimeAtTime: async (url, timestamp) => {
    // Convert timestamp to Date object if it's a string
    const checkTime = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
    const res = await pool.query(
      `SELECT * FROM planned_downtime 
        WHERE url = $1 
        AND status = 'scheduled'
        ORDER BY start_time DESC`,
      [url]
    );
    
    // Check each maintenance record using local time comparison
    for (const downtime of res.rows) {
      const startTime = new Date(downtime.start_time);
      const endTime = new Date(downtime.end_time);
      
      if (checkTime >= startTime && checkTime <= endTime) {
        return downtime;
      }
    }
    
    return null;
  },

  // Get user's planned downtime
  getUserPlannedDowntime: async (user_id) => {
    const res = await pool.query(
      `SELECT 
        id,
        user_id,
        url,
        reason,
        start_time::text as start_time,
        end_time::text as end_time,
        status,
        created_at
       FROM planned_downtime 
       WHERE user_id = $1 
       ORDER BY start_time DESC`,
      [user_id]
    );
    return res.rows;
  },
  // Update planned downtime status
  updatePlannedDowntimeStatus: async (id, status) => {
    await pool.query(
      'UPDATE planned_downtime SET status = $1 WHERE id = $2',
      [status, id]
    );
  },
  // Get top 5 most monitored URLs across all users
  getTopMonitoredUrls: async () => {
    const res = await pool.query(`
      SELECT 
        url,
        COUNT(*) as monitor_count,
        COUNT(DISTINCT user_id) as unique_users
      FROM agent_monitor_logs 
      WHERE status IN ('active', 'online', 'offline', 'maintenance')
      GROUP BY url 
      ORDER BY monitor_count DESC, unique_users DESC
      LIMIT 5
    `);
    return res.rows;
  }
}; 