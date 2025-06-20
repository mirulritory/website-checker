// agent_monitor_logs table structure:
// CREATE TABLE agent_monitor_logs (
//   url TEXT NOT NULL,
//   status TEXT NOT NULL,
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
  upsertActiveMonitor: async (user_id, url, interval_seconds) => {
    // Insert or update the monitor for this user/url
    const res = await pool.query(
      `INSERT INTO active_monitors (user_id, url, interval_seconds)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, url) DO UPDATE SET interval_seconds = EXCLUDED.interval_seconds
       RETURNING *`,
      [user_id, url, interval_seconds]
    );
    return res.rows[0];
  },
  getActiveMonitorsByUser: async (user_id) => {
    const res = await pool.query(
      'SELECT * FROM active_monitors WHERE user_id = $1',
      [user_id]
    );
    return res.rows;
  },
  removeActiveMonitor: async (user_id, url) => {
    await pool.query(
      'DELETE FROM active_monitors WHERE user_id = $1 AND url = $2',
      [user_id, url]
    );
  },
  logMonitorResult: async (log) => {
    await pool.query(
      `INSERT INTO agent_monitor_logs (url, status, "timestamp", user_id, latency, response_code, page_load_time, performance_metrics, ip_address)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8)`,
      [
        log.url,
        log.status,
        log.user_id,
        log.latency,
        log.response_code,
        log.page_load_time,
        log.performance_metrics ? JSON.stringify(log.performance_metrics) : null,
        log.ip_address
      ]
    );
  },
  getMonitorHistoryByUser: async (user_id) => {
    const res = await pool.query(
      'SELECT * FROM agent_monitor_logs WHERE user_id = $1 ORDER BY "timestamp" DESC',
      [user_id]
    );
    return res.rows;
  },
  getUsernameById: async (user_id) => {
    const res = await pool.query('SELECT username FROM users WHERE user_id = $1', [user_id]);
    return res.rows.length > 0 ? res.rows[0].username : null;
  }
}; 