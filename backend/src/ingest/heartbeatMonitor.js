const { query } = require('../db');

// Threshold: 16 min 30 sec (990 seconds)
const TIMEOUT_SECONDS = 990;

async function checkHeartbeatTimeouts() {
  try {
    const sql = `
      UPDATE pole_current_state
      SET is_energized = FALSE, status = 'dark'
      WHERE is_energized = TRUE
        AND last_seen < NOW() - INTERVAL '${TIMEOUT_SECONDS} seconds'
      RETURNING pole_id, device_id, last_seen;
    `;
    const res = await query(sql);
    if (res.rowCount > 0) {
      console.log(`[HEARTBEAT_MONITOR] Flagged ${res.rowCount} devices as silent heartbeat timeout (dark).`);
    }
  } catch (err) {
    console.error('[HEARTBEAT_MONITOR] Error checking timeouts:', err);
  }
}

function startHeartbeatMonitor(intervalMs = 30000) {
  const timer = setInterval(checkHeartbeatTimeouts, intervalMs);
  return () => clearInterval(timer);
}

module.exports = {
  checkHeartbeatTimeouts,
  startHeartbeatMonitor
};
