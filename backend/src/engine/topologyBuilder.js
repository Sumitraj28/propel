// Topology Builder: constructs tree graphs for DTs (handling 40% known vs 60% inferred)

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Builds parent-child graph representation for poles under a DT.
 * Returns: { rootPoleIds: string[], nodes: Map<poleId, Node>, topologyType: 'known'|'inferred' }
 */
function buildDTGraph(dt, poles) {
  if (!poles || poles.length === 0) {
    return { rootPoleIds: [], nodes: new Map(), topologyType: 'known' };
  }

  // Check if this DT has known topology (seq_on_line and parent_pole_id present)
  const isKnown = poles.some(p => p.parent_pole_id !== null || p.seq_on_line !== null);

  const nodes = new Map();
  for (const pole of poles) {
    nodes.set(pole.pole_id, {
      ...pole,
      children: [],
      inferredParent: null
    });
  }

  if (isKnown) {
    const rootPoleIds = [];
    for (const pole of poles) {
      const node = nodes.get(pole.pole_id);
      if (pole.parent_pole_id && nodes.has(pole.parent_pole_id)) {
        const parentNode = nodes.get(pole.parent_pole_id);
        parentNode.children.push(pole.pole_id);
      } else {
        rootPoleIds.push(pole.pole_id);
      }
    }
    return { rootPoleIds, nodes, topologyType: 'known' };
  }

  // Missing topology (60% case) -> Infer geometrically outward from DT
  // 1. Calculate distance of each pole from DT (dt.lat, dt.lon)
  const polesWithDist = poles.map(p => ({
    ...p,
    distFromDT: haversineDistance(dt.lat, dt.lon, p.lat, p.lon)
  }));

  // 2. Sort poles by distance from DT
  polesWithDist.sort((a, b) => a.distFromDT - b.distFromDT);

  const rootPoleIds = [polesWithDist[0].pole_id];
  const processedNodes = [polesWithDist[0]];

  for (let i = 1; i < polesWithDist.length; i++) {
    const current = polesWithDist[i];
    const currentNode = nodes.get(current.pole_id);

    // Find nearest processed pole that is closer to DT than current
    let bestParent = null;
    let minDistance = Infinity;

    for (const candidate of processedNodes) {
      const dist = haversineDistance(current.lat, current.lon, candidate.lat, candidate.lon);
      if (dist < minDistance) {
        minDistance = dist;
        bestParent = candidate;
      }
    }

    if (bestParent) {
      const parentNode = nodes.get(bestParent.pole_id);
      parentNode.children.push(current.pole_id);
      currentNode.inferredParent = bestParent.pole_id;
    } else {
      rootPoleIds.push(current.pole_id);
    }

    processedNodes.push(current);
  }

  return { rootPoleIds, nodes, topologyType: 'inferred' };
}

module.exports = {
  buildDTGraph,
  haversineDistance
};
