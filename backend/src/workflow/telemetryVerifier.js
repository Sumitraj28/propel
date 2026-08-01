const { query } = require('../db');
const { checkTicketPolesEnergized } = require('./ticketManager');

async function runTelemetryVerification() {
  try {
    const res = await query(
      `SELECT ticket_id, asset_id FROM tickets WHERE status = 'resolved'`
    );

    for (const tkt of res.rows) {
      const checkRes = await checkTicketPolesEnergized(tkt.ticket_id);
      if (checkRes.allEnergized) {
        console.log(`[VERIFIER] Telemetry confirmed power restored for ticket ${tkt.ticket_id} (${tkt.asset_id}). Auto-verifying...`);
        await query(
          `UPDATE tickets SET status = 'verified', verified_at = NOW() WHERE ticket_id = $1`,
          [tkt.ticket_id]
        );
      }
    }
  } catch (err) {
    console.error('[VERIFIER] Error in telemetry verifier loop:', err);
  }
}

function startTelemetryVerifier(intervalMs = 10000) {
  const timer = setInterval(runTelemetryVerification, intervalMs);
  return () => clearInterval(timer);
}

module.exports = {
  runTelemetryVerification,
  startTelemetryVerifier
};
