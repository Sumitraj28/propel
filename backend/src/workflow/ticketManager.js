const { query } = require('../db');
const { generateAISummary } = require('../ai/summaryGenerator');

async function createOrUpdateTickets(detectedTickets) {
  const processedTickets = [];

  for (const tkt of detectedTickets) {
    // Check if an open ticket for this asset already exists
    const checkSql = `
      SELECT ticket_id, status FROM tickets
      WHERE asset_id = $1 AND status NOT IN ('verified', 'closed')
      LIMIT 1;
    `;
    const existing = await query(checkSql, [tkt.asset_id]);

    if (existing.rowCount > 0) {
      // Already tracked open ticket
      processedTickets.push(existing.rows[0]);
      continue;
    }

    // Generate AI Summary gracefully
    const aiSummary = await generateAISummary(tkt);

    const insertSql = `
      INSERT INTO tickets (
        ticket_id, fault_type, status, asset_id, dt_id, feeder_id,
        lat, lon, pincode, affected_pole_count, affected_households,
        confidence_score, confidence_level, confidence_reason, ai_summary,
        affected_pole_ids, detected_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, NOW()
      )
      RETURNING *;
    `;

    const res = await query(insertSql, [
      tkt.ticket_id,
      tkt.fault_type,
      tkt.status,
      tkt.asset_id,
      tkt.dt_id,
      tkt.feeder_id,
      tkt.lat,
      tkt.lon,
      tkt.pincode,
      tkt.affected_pole_count,
      tkt.affected_households,
      tkt.confidence_score,
      tkt.confidence_level,
      tkt.confidence_reason,
      aiSummary,
      tkt.affected_pole_ids
    ]);

    processedTickets.push(res.rows[0]);
  }

  return processedTickets;
}

async function updateTicketStatus(ticketId, newStatus) {
  const validTransitions = ['acknowledged', 'crew_assigned', 'resolved', 'verified', 'closed'];
  if (!validTransitions.includes(newStatus)) {
    throw new Error(`Invalid ticket status: ${newStatus}`);
  }

  // If attempting to set 'resolved', verify telemetry first!
  if (newStatus === 'resolved') {
    const verifyRes = await checkTicketPolesEnergized(ticketId);
    if (!verifyRes.allEnergized) {
      const err = new Error(
        `Cannot mark resolved: ${verifyRes.darkCount} of ${verifyRes.totalCount} poles associated with this fault are still dark according to telemetry.`
      );
      err.statusCode = 400;
      err.darkPoleIds = verifyRes.darkPoleIds;
      throw err;
    }
  }

  const timestampCol = {
    acknowledged: 'acknowledged_at',
    crew_assigned: 'assigned_at',
    resolved: 'resolved_at',
    verified: 'verified_at',
    closed: 'verified_at'
  }[newStatus];

  const sql = `
    UPDATE tickets
    SET status = $1, ${timestampCol} = COALESCE(${timestampCol}, NOW())
    WHERE ticket_id = $2
    RETURNING *;
  `;

  const res = await query(sql, [newStatus, ticketId]);
  if (res.rowCount === 0) {
    const err = new Error(`Ticket ${ticketId} not found`);
    err.statusCode = 404;
    throw err;
  }

  return res.rows[0];
}

async function checkTicketPolesEnergized(ticketId) {
  const tktRes = await query(`SELECT affected_pole_ids FROM tickets WHERE ticket_id = $1`, [ticketId]);
  if (tktRes.rowCount === 0) return { allEnergized: false, darkCount: 0, totalCount: 0, darkPoleIds: [] };

  const poleIds = tktRes.rows[0].affected_pole_ids || [];
  if (poleIds.length === 0) return { allEnergized: true, darkCount: 0, totalCount: 0, darkPoleIds: [] };

  const statesRes = await query(
    `SELECT pole_id, is_energized FROM pole_current_state WHERE pole_id = ANY($1::text[])`,
    [poleIds]
  );

  const darkPoleIds = [];
  for (const row of statesRes.rows) {
    if (!row.is_energized) {
      darkPoleIds.push(row.pole_id);
    }
  }

  return {
    allEnergized: darkPoleIds.length === 0,
    darkCount: darkPoleIds.length,
    totalCount: poleIds.length,
    darkPoleIds
  };
}

module.exports = {
  createOrUpdateTickets,
  updateTicketStatus,
  checkTicketPolesEnergized
};
