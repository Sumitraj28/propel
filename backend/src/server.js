const express = require('express');
const cors = require('cors');
const config = require('./config');
const { query, initSchema } = require('./db');
const batchBuffer = require('./ingest/batchBuffer');
const { startHeartbeatMonitor } = require('./ingest/heartbeatMonitor');
const { startTelemetryVerifier } = require('./workflow/telemetryVerifier');
const { updateTicketStatus } = require('./workflow/ticketManager');
const {
  injectSpanFault,
  injectDTFault,
  injectFeederFault,
  injectSingleDeadSensor,
  injectScheduledOutage,
  repairFault,
  runLocalizationForNetwork
} = require('./simulator/faultSimulator');
const { seedDatabase } = require('./db/seed');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Telemetry Ingest Endpoint (Hot path, < 5ms response time)
app.post('/telemetry', (req, res) => {
  const payload = req.body;

  if (!payload || !payload.device_id || payload.seq === undefined || !payload.pole_id) {
    return res.status(400).json({ error: 'Invalid telemetry payload structure' });
  }

  // Enqueue for batch insertion & async DB write
  batchBuffer.enqueue(payload);

  // Trigger immediate background localization check if power_lost
  if (payload.event === 'power_lost' || payload.energized === false) {
    setImmediate(() => {
      runLocalizationForNetwork().catch(err => console.error('[SERVER] Localization error:', err));
    });
  }

  return res.status(202).json({ status: 'accepted', device_id: payload.device_id, seq: payload.seq });
});

// 2. Network Data for Leaflet Map UI (Substations, Feeders, DTs, Poles & Current States)
app.get('/api/network', async (req, res) => {
  try {
    const subs = await query(`SELECT * FROM substations`);
    const feeders = await query(`SELECT * FROM feeders`);
    const dts = await query(`SELECT * FROM transformers`);
    const poles = await query(`
      SELECT p.*, s.is_energized, s.status, s.last_seen, s.battery_mv, s.rssi, s.fw
      FROM poles p
      LEFT JOIN pole_current_state s ON p.pole_id = s.pole_id
    `);

    res.json({
      substations: subs.rows,
      feeders: feeders.rows,
      transformers: dts.rows,
      poles: poles.rows
    });
  } catch (err) {
    console.error('[API] /api/network error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Tickets Endpoint
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await query(`SELECT * FROM tickets ORDER BY detected_at DESC`);
    res.json(tickets.rows);
  } catch (err) {
    console.error('[API] /api/tickets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update Ticket Status (with Resolution Telemetry Check)
app.post('/api/tickets/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await updateTicketStatus(req.params.id, status);
    res.json(updated);
  } catch (err) {
    console.error('[API] /api/tickets/:id/status error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.message, darkPoleIds: err.darkPoleIds });
  }
});

// 4. Scheduled Outages Feed API
app.get('/scheduled-outages', async (req, res) => {
  try {
    const outages = await query(`SELECT * FROM scheduled_outages ORDER BY start_time DESC`);
    res.json(outages.rows);
  } catch (err) {
    console.error('[API] /scheduled-outages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Simulator UI API Endpoints
app.post('/api/simulator/inject', async (req, res) => {
  try {
    const { type, targetId } = req.body;
    let result;
    if (type === 'span') result = await injectSpanFault(targetId);
    else if (type === 'dt') result = await injectDTFault(targetId);
    else if (type === 'feeder') result = await injectFeederFault(targetId);
    else if (type === 'dead_sensor') result = await injectSingleDeadSensor(targetId);
    else throw new Error(`Unknown fault type: ${type}`);

    res.json({ success: true, result });
  } catch (err) {
    console.error('[API] /api/simulator/inject error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/simulator/outage', async (req, res) => {
  try {
    const { scope, targetId, durationMinutes } = req.body;
    const result = await injectScheduledOutage(scope, targetId, durationMinutes || 60);
    // Re-run scan
    await runLocalizationForNetwork();
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/simulator/repair', async (req, res) => {
  try {
    const { ticketId } = req.body;
    const result = await repairFault(ticketId);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[API] /api/simulator/repair error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/simulator/seed', async (req, res) => {
  try {
    await seedDatabase();
    res.json({ success: true, message: 'Database re-seeded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Background Services & Server
async function startServer() {
  try {
    // Check DB connection & Seed if empty
    const checkTable = await query(`SELECT to_regclass('public.poles') as exists`);
    if (!checkTable.rows[0].exists) {
      console.log('[SERVER] DB tables missing. Auto-seeding database...');
      await seedDatabase();
    } else {
      const poleCount = await query(`SELECT count(*) FROM poles`);
      if (parseInt(poleCount.rows[0].count, 10) === 0) {
        console.log('[SERVER] DB empty. Auto-seeding database...');
        await seedDatabase();
      }
    }

    startHeartbeatMonitor(30000);
    startTelemetryVerifier(10000);

    // Initial localization scan
    await runLocalizationForNetwork();

    app.listen(config.port, () => {
      console.log(`⚡ KSPDB Backend Service running on port ${config.port}`);
    });
  } catch (err) {
    console.error('[SERVER] Startup failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
