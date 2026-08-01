const { query } = require('../db');
const batchBuffer = require('../ingest/batchBuffer');
const { detectFaults } = require('../engine/localization');
const { createOrUpdateTickets } = require('../workflow/ticketManager');
const { buildDTGraph } = require('../engine/topologyBuilder');

async function runLocalizationForNetwork() {
  const dtRes = await query(`SELECT * FROM transformers`);
  const polesRes = await query(`SELECT * FROM poles`);
  const statesRes = await query(`SELECT * FROM pole_current_state`);
  const outagesRes = await query(`SELECT * FROM scheduled_outages`);

  const polesByDT = new Map();
  for (const pole of polesRes.rows) {
    if (!polesByDT.has(pole.dt_id)) polesByDT.set(pole.dt_id, []);
    polesByDT.get(pole.dt_id).push(pole);
  }

  const poleStates = new Map();
  for (const state of statesRes.rows) {
    poleStates.set(state.pole_id, {
      is_energized: state.is_energized,
      status: state.status
    });
  }

  const detected = detectFaults(dtRes.rows, polesByDT, poleStates, outagesRes.rows);
  const tickets = await createOrUpdateTickets(detected);
  return { detected, tickets };
}

async function injectSpanFault(poleId) {
  const poleRes = await query(`SELECT * FROM poles WHERE pole_id = $1`, [poleId]);
  if (poleRes.rowCount === 0) throw new Error(`Pole ${poleId} not found`);
  const targetPole = poleRes.rows[0];

  // Fetch all poles under this DT
  const dtPolesRes = await query(`SELECT * FROM poles WHERE dt_id = $1`, [targetPole.dt_id]);
  const dtRes = await query(`SELECT * FROM transformers WHERE dt_id = $1`, [targetPole.dt_id]);
  
  const graph = buildDTGraph(dtRes.rows[0], dtPolesRes.rows);

  // Traverse subtree from targetPole to get all downstream poles
  const affectedPoleIds = [];
  function collectSubtree(id) {
    affectedPoleIds.push(id);
    const node = graph.nodes.get(id);
    if (node) {
      for (const childId of node.children) {
        collectSubtree(childId);
      }
    }
  }
  collectSubtree(poleId);

  // Emit telemetry and update state for affected poles
  for (const pid of affectedPoleIds) {
    const poleObj = graph.nodes.get(pid);
    if (poleObj && poleObj.device_id) {
      // Simulate realistic telemetry: 70% dying gasp power_lost, 30% missing/silent (FW 1.2 case)
      const sendsDyingGasp = Math.random() >= 0.30;
      if (sendsDyingGasp) {
        batchBuffer.enqueue({
          device_id: poleObj.device_id,
          seq: Date.now(),
          pole_id: pid,
          event: 'power_lost',
          energized: false,
          ts: new Date().toISOString(),
          battery_mv: 3450,
          rssi: -88,
          fw: '1.4.2'
        });
      } else {
        // Silent loss: directly update state to dark
        await query(
          `UPDATE pole_current_state SET is_energized = FALSE, status = 'dark', last_seen = NOW() WHERE pole_id = $1`,
          [pid]
        );
      }
    }
  }

  // Force buffer flush & run localization engine
  await batchBuffer.flush();
  const result = await runLocalizationForNetwork();
  return { affectedPoleCount: affectedPoleIds.length, affectedPoleIds, result };
}

async function injectDTFault(dtId) {
  const dtRes = await query(`SELECT * FROM transformers WHERE dt_id = $1`, [dtId]);
  if (dtRes.rowCount === 0) throw new Error(`DT ${dtId} not found`);

  const polesRes = await query(`SELECT * FROM poles WHERE dt_id = $1`, [dtId]);
  for (const pole of polesRes.rows) {
    if (pole.device_id) {
      batchBuffer.enqueue({
        device_id: pole.device_id,
        seq: Date.now(),
        pole_id: pole.pole_id,
        event: 'power_lost',
        energized: false,
        ts: new Date().toISOString(),
        battery_mv: 3450,
        rssi: -90,
        fw: '1.4.2'
      });
    }
  }

  await batchBuffer.flush();
  const result = await runLocalizationForNetwork();
  return { affectedPoleCount: polesRes.rows.length, result };
}

async function injectFeederFault(feederId) {
  const polesRes = await query(`SELECT * FROM poles WHERE feeder_id = $1`, [feederId]);
  if (polesRes.rowCount === 0) throw new Error(`Feeder ${feederId} not found`);

  for (const pole of polesRes.rows) {
    if (pole.device_id) {
      batchBuffer.enqueue({
        device_id: pole.device_id,
        seq: Date.now(),
        pole_id: pole.pole_id,
        event: 'power_lost',
        energized: false,
        ts: new Date().toISOString(),
        battery_mv: 3420,
        rssi: -92,
        fw: '1.4.2'
      });
    }
  }

  await batchBuffer.flush();
  const result = await runLocalizationForNetwork();
  return { affectedPoleCount: polesRes.rows.length, result };
}

async function injectSingleDeadSensor(poleId) {
  const poleRes = await query(`SELECT * FROM poles WHERE pole_id = $1`, [poleId]);
  if (poleRes.rowCount === 0) throw new Error(`Pole ${poleId} not found`);
  const pole = poleRes.rows[0];

  if (!pole.device_id) throw new Error(`Pole ${poleId} has no device fitted`);

  // ONLY set this single pole to dark, downstream stays energized
  batchBuffer.enqueue({
    device_id: pole.device_id,
    seq: Date.now(),
    pole_id: pole.pole_id,
    event: 'power_lost',
    energized: false,
    ts: new Date().toISOString(),
    battery_mv: 2900,
    rssi: -110,
    fw: '1.4.2'
  });

  await batchBuffer.flush();
  const result = await runLocalizationForNetwork();
  return { poleId, status: 'single_dead_sensor_injected', result };
}

async function injectScheduledOutage(targetType, targetId, durationMinutes = 60) {
  const outageId = `OUT-${Date.now()}`;
  const start = new Date();
  const end = new Date(Date.now() + durationMinutes * 60 * 1000);

  await query(
    `INSERT INTO scheduled_outages (id, scope, target_id, start_time, end_time, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [outageId, targetType, targetId, start, end, `Simulated grid maintenance on ${targetType} ${targetId}`]
  );

  return { outageId, targetType, targetId, start, end };
}

async function repairFault(ticketId) {
  const tktRes = await query(`SELECT * FROM tickets WHERE ticket_id = $1`, [ticketId]);
  if (tktRes.rowCount === 0) throw new Error(`Ticket ${ticketId} not found`);
  const ticket = tktRes.rows[0];

  const affectedPoles = ticket.affected_pole_ids || [];

  // Emit restoration telemetry (boot + power_restored)
  for (const poleId of affectedPoles) {
    const poleRes = await query(`SELECT device_id FROM poles WHERE pole_id = $1`, [poleId]);
    const deviceId = poleRes.rows[0]?.device_id;
    if (deviceId) {
      // Boot
      batchBuffer.enqueue({
        device_id: deviceId,
        seq: 0,
        pole_id: poleId,
        event: 'boot',
        energized: true,
        ts: new Date().toISOString(),
        battery_mv: 3600,
        rssi: -82,
        fw: '1.4.2'
      });

      // Power restored
      batchBuffer.enqueue({
        device_id: deviceId,
        seq: Date.now(),
        pole_id: poleId,
        event: 'power_restored',
        energized: true,
        ts: new Date().toISOString(),
        battery_mv: 3600,
        rssi: -82,
        fw: '1.4.2'
      });
    } else {
      await query(
        `UPDATE pole_current_state SET is_energized = TRUE, status = 'energized', last_seen = NOW() WHERE pole_id = $1`,
        [poleId]
      );
    }
  }

  await batchBuffer.flush();

  // Mark ticket resolved (which verifier loop will verify)
  await query(`UPDATE tickets SET status = 'resolved', resolved_at = NOW() WHERE ticket_id = $1`, [ticketId]);

  const result = await runLocalizationForNetwork();
  return { ticketId, repairedPolesCount: affectedPoles.length, result };
}

module.exports = {
  runLocalizationForNetwork,
  injectSpanFault,
  injectDTFault,
  injectFeederFault,
  injectSingleDeadSensor,
  injectScheduledOutage,
  repairFault
};
