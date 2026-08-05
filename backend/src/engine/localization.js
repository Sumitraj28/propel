const { buildDTGraph } = require('./topologyBuilder');

/**
 * Checks whether a scheduled outage is active (with a 30-minute grace window).
 */
function isOutageActive(outage, now = new Date()) {
  const GRACE_MS = 30 * 60 * 1000;
  const start = new Date(outage.start_time).getTime() - GRACE_MS;
  const end = new Date(outage.end_time).getTime() + GRACE_MS;
  const currentTime = now.getTime();
  return currentTime >= start && currentTime <= end;
}

/**
 * Pure localization function.
 * 
 * @param {Array} dtList - Array of DT objects [{ dt_id, feeder_id, lat, lon, capacity_kva, households_served }]
 * @param {Map|Object} polesByDT - Map/Object of dt_id -> Array of pole objects
 * @param {Map|Object} poleStates - Map/Object of pole_id -> { is_energized, status }
 * @param {Array} scheduledOutages - Array of active outage objects [{ scope, target_id, start_time, end_time }]
 * @param {Date} now - Current timestamp
 * 
 * @returns {Array} Array of detected ticket objects
 */
function detectFaults(dtList, polesByDT, poleStates, scheduledOutages = [], now = new Date()) {
  const detectedTickets = [];

  const getState = (poleId) => {
    if (poleStates instanceof Map) {
      return poleStates.get(poleId) || { is_energized: true, status: 'energized' };
    }
    return poleStates[poleId] || { is_energized: true, status: 'energized' };
  };

  // 1. Map active outages
  const activeFeederOutages = new Set();
  const activeDTOutages = new Set();

  for (const outage of scheduledOutages) {
    if (isOutageActive(outage, now)) {
      if (outage.scope === 'feeder') activeFeederOutages.add(outage.target_id);
      if (outage.scope === 'dt') activeDTOutages.add(outage.target_id);
    }
  }

  // 2. Group DTs by Feeder
  const dtByFeeder = new Map();
  for (const dt of dtList) {
    if (!dtByFeeder.has(dt.feeder_id)) {
      dtByFeeder.set(dt.feeder_id, []);
    }
    dtByFeeder.get(dt.feeder_id).push(dt);
  }

  const handledFeeders = new Set();

  // 3. Evaluate Feeder-level Faults
  for (const [feederId, feederDTs] of dtByFeeder.entries()) {
    if (activeFeederOutages.has(feederId)) {
      handledFeeders.add(feederId);
      continue; // Suppressed due to active feeder scheduled outage
    }

    // Feeder fault check applies if there are multiple DTs under feeder, or explicitly marked feeder fault
    let allFeederPolesWithDevices = 0;
    let darkFeederPoles = 0;

    for (const dt of feederDTs) {
      if (activeDTOutages.has(dt.dt_id)) continue;
      const poles = (polesByDT instanceof Map ? polesByDT.get(dt.dt_id) : polesByDT[dt.dt_id]) || [];
      for (const pole of poles) {
        if (pole.device_id) {
          allFeederPolesWithDevices++;
          const state = getState(pole.pole_id);
          if (!state.is_energized) darkFeederPoles++;
        }
      }
    }

    // Feeder fault requires > 1 DT under feeder and ALL poles dark across all DTs
    if (feederDTs.length > 1 && allFeederPolesWithDevices > 0 && darkFeederPoles === allFeederPolesWithDevices) {
      handledFeeders.add(feederId);
      const firstDT = feederDTs[0];

      detectedTickets.push({
        ticket_id: `TKT-FDR-${feederId}-${now.getTime()}`,
        fault_type: 'feeder',
        status: 'detected',
        asset_id: `Feeder:${feederId}`,
        dt_id: firstDT.dt_id,
        feeder_id: feederId,
        lat: firstDT.lat,
        lon: firstDT.lon,
        pincode: firstDT.pincode || '560001',
        affected_pole_count: darkFeederPoles,
        affected_households: feederDTs.reduce((acc, d) => acc + (d.households_served || 70), 0),
        confidence_score: 0.95,
        confidence_level: 'HIGH',
        confidence_reason: `All ${darkFeederPoles} poles across ${feederDTs.length} DTs under Feeder ${feederId} are dark simultaneously.`,
        affected_pole_ids: feederDTs.flatMap(dt => {
          const poles = (polesByDT instanceof Map ? polesByDT.get(dt.dt_id) : polesByDT[dt.dt_id]) || [];
          return poles.map(p => p.pole_id);
        })
      });
    }
  }

  // 4. Process DT-level and Span-level Faults
  for (const dt of dtList) {
    if (handledFeeders.has(dt.feeder_id)) continue; // Already handled under feeder fault
    if (activeDTOutages.has(dt.dt_id) || activeFeederOutages.has(dt.feeder_id)) continue; // Suppressed due to scheduled outage

    const poles = (polesByDT instanceof Map ? polesByDT.get(dt.dt_id) : polesByDT[dt.dt_id]) || [];
    if (poles.length === 0) continue;

    const graph = buildDTGraph(dt, poles);
    const { rootPoleIds, nodes, topologyType } = graph;

    // Helper to evaluate subtree energized state
    function evaluateSubtree(nodeId) {
      const node = nodes.get(nodeId);
      const state = getState(nodeId);
      
      const hasDevice = !!node.device_id;
      const isEnergized = state.is_energized;

      let totalDevices = hasDevice ? 1 : 0;
      let darkDevices = (hasDevice && !isEnergized) ? 1 : 0;
      let liveDevices = (hasDevice && isEnergized) ? 1 : 0;
      let subtreePoles = [nodeId];

      for (const childId of node.children) {
        const childRes = evaluateSubtree(childId);
        totalDevices += childRes.totalDevices;
        darkDevices += childRes.darkDevices;
        liveDevices += childRes.liveDevices;
        subtreePoles = subtreePoles.concat(childRes.subtreePoles);
      }

      return {
        nodeId,
        hasDevice,
        isEnergized,
        totalDevices,
        darkDevices,
        liveDevices,
        subtreePoles,
        isSubtreeAllDark: totalDevices > 0 && darkDevices === totalDevices
      };
    }

    // Evaluate whole DT
    let totalDTPolesWithDevices = 0;
    let darkDTPolesWithDevices = 0;
    for (const pole of poles) {
      if (pole.device_id) {
        totalDTPolesWithDevices++;
        if (!getState(pole.pole_id).is_energized) darkDTPolesWithDevices++;
      }
    }

    // Check DT Fault
    if (totalDTPolesWithDevices > 0 && darkDTPolesWithDevices === totalDTPolesWithDevices) {
      const isHighConf = topologyType === 'known';
      detectedTickets.push({
        ticket_id: `TKT-DT-${dt.dt_id}-${now.getTime()}`,
        fault_type: 'dt',
        status: 'detected',
        asset_id: `DT:${dt.dt_id}`,
        dt_id: dt.dt_id,
        feeder_id: dt.feeder_id,
        lat: dt.lat,
        lon: dt.lon,
        pincode: poles[0]?.pincode || '560001',
        affected_pole_count: poles.length,
        affected_households: dt.households_served || 70,
        confidence_score: isHighConf ? 0.95 : 0.60,
        confidence_level: isHighConf ? 'HIGH' : 'LOW',
        confidence_reason: isHighConf
          ? `Entire DT ${dt.dt_id} is dark with no energized poles downstream.`
          : `Entire DT ${dt.dt_id} is dark (approximate — DT region, topology geometrically inferred).`,
        affected_pole_ids: poles.map(p => p.pole_id)
      });
      continue;
    }

    // Traverse graph to find boundary edges (Span Faults) and single dead sensors
    for (const rootId of rootPoleIds) {
      function checkSpanFaults(nodeId, parentNodeId = null) {
        const node = nodes.get(nodeId);
        const subRes = evaluateSubtree(nodeId);

        // Case A: Single Dead Sensor (This node is dark, but its subtree has live devices)
        if (node.device_id && !getState(nodeId).is_energized && subRes.liveDevices > 0) {
          // Single dead sensor — NOT a fault ticket! Continue recursing into children to find deeper faults.
          for (const childId of node.children) {
            checkSpanFaults(childId, nodeId);
          }
          return;
        }

        // Case B: Boundary Edge (Subtree is completely dark, parent is live or DT itself)
        if (subRes.totalDevices > 0 && subRes.isSubtreeAllDark) {
          const isHighConf = topologyType === 'known';
          const parentObj = parentNodeId ? nodes.get(parentNodeId) : null;
          const parentName = parentObj ? parentObj.pole_id : `DT:${dt.dt_id}`;
          const spanName = `Span:${parentName}->${node.pole_id}`;

          const midLat = parentObj ? (parentObj.lat + node.lat) / 2 : (dt.lat + node.lat) / 2;
          const midLon = parentObj ? (parentObj.lon + node.lon) / 2 : (dt.lon + node.lon) / 2;

          detectedTickets.push({
            ticket_id: `TKT-SPAN-${node.pole_id}-${now.getTime()}`,
            fault_type: 'span',
            status: 'detected',
            asset_id: spanName,
            dt_id: dt.dt_id,
            feeder_id: dt.feeder_id,
            lat: midLat,
            lon: midLon,
            pincode: node.pincode || parentObj?.pincode || '560001',
            affected_pole_count: subRes.subtreePoles.length,
            affected_households: Math.round((dt.households_served || 70) * (subRes.subtreePoles.length / poles.length)),
            confidence_score: isHighConf ? 0.95 : 0.60,
            confidence_level: isHighConf ? 'HIGH' : 'LOW',
            confidence_reason: isHighConf
              ? `High confidence — verified span boundary between live pole ${parentName} and dark pole ${node.pole_id}.`
              : `Low confidence — approximate DT region span between ${parentName} and ${node.pole_id} (topology inferred geometrically).`,
            affected_pole_ids: subRes.subtreePoles
          });

          return;
        }

        // Continue searching children for boundary edges
        for (const childId of node.children) {
          checkSpanFaults(childId, nodeId);
        }
      }

      checkSpanFaults(rootId);
    }
  }

  return detectedTickets;
}

module.exports = {
  detectFaults,
  isOutageActive
};
