const { query, initSchema } = require('./index');

// Haversine distance in meters
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

const PINCODES = ['560001', '560002', '560004', '560011', '560034', '560038', '560066', '560100', '560102'];
const WARDS = ['Ward 1 - Malleshwaram', 'Ward 12 - Indiranagar', 'Ward 45 - Koramangala', 'Ward 88 - Whitefield', 'Ward 102 - Jayanagar'];

async function seedDatabase() {
  console.log('[SEED] Starting synthetic data seeding...');
  await initSchema();

  const substations = [
    { id: 'SUB-01', name: 'Malleshwaram Major Substation', code: 'MLS-01', lat: 13.0035, lon: 77.5700 },
    { id: 'SUB-02', name: 'Indiranagar 220kV Station', code: 'IND-02', lat: 12.9784, lon: 77.6408 },
    { id: 'SUB-03', name: 'Koramangala Distribution Substation', code: 'KRM-03', lat: 12.9352, lon: 77.6245 },
    { id: 'SUB-04', name: 'Whitefield Grid Substation', code: 'WTF-04', lat: 12.9698, lon: 77.7499 }
  ];

  for (const sub of substations) {
    await query(
      `INSERT INTO substations (substation_id, name, code, lat, lon) VALUES ($1, $2, $3, $4, $5)`,
      [sub.id, sub.name, sub.code, sub.lat, sub.lon]
    );
  }

  const feeders = [];
  let feederCounter = 1;
  for (const sub of substations) {
    for (let f = 1; f <= 5; f++) {
      const feederId = `FDR-${String(feederCounter).padStart(3, '0')}`;
      const feeder = {
        id: feederId,
        substationId: sub.id,
        name: `${sub.code} 11kV Feeder ${f}`,
        code: `${sub.code}-F${f}`
      };
      feeders.push(feeder);
      await query(
        `INSERT INTO feeders (feeder_id, substation_id, name, code) VALUES ($1, $2, $3, $4)`,
        [feeder.id, feeder.substationId, feeder.name, feeder.code]
      );
      feederCounter++;
    }
  }

  let dtCounter = 1;
  let poleCounter = 1;
  const dtList = [];
  const polesList = [];

  // Generate ~80 DTs across the 20 feeders (~4 DTs per feeder)
  for (const feeder of feeders) {
    const sub = substations.find(s => s.id === feeder.substationId);
    const numDTs = 4;
    for (let d = 0; d < numDTs; d++) {
      const dtId = `DT-${String(dtCounter).padStart(4, '0')}`;
      // Spread DTs around substation
      const angle = (d * (360 / numDTs) + feederCounter * 15) * (Math.PI / 180);
      const distKm = 0.5 + Math.random() * 1.5;
      const dtLat = sub.lat + (distKm / 111) * Math.cos(angle);
      const dtLon = sub.lon + (distKm / (111 * Math.cos(sub.lat * Math.PI / 180))) * Math.sin(angle);
      const capacityKva = [63, 100, 160, 250][Math.floor(Math.random() * 4)];
      const households = Math.floor(capacityKva * (0.6 + Math.random() * 0.4));

      // 40% known topology, 60% missing topology
      const isKnownTopology = (dtCounter % 10) < 4;

      dtList.push({
        id: dtId,
        feederId: feeder.id,
        lat: dtLat,
        lon: dtLon,
        capacityKva,
        householdsServed: households,
        isKnownTopology
      });

      await query(
        `INSERT INTO transformers (dt_id, feeder_id, lat, lon, capacity_kva, households_served)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [dtId, feeder.id, dtLat, dtLon, capacityKva, households]
      );

      // Generate poles for this DT (e.g. 20 - 45 poles per DT for synthetic scale)
      const numPoles = 25 + Math.floor(Math.random() * 15);
      const dtPoles = [];

      // Main radial spine + 1-2 branches
      let currentParent = null;
      let branchParent = null;

      for (let p = 1; p <= numPoles; p++) {
        const poleId = `P-${String(poleCounter).padStart(6, '0')}`;
        
        let pLat, pLon;
        if (p === 1) {
          // First pole right next to DT
          pLat = dtLat + (Math.random() - 0.5) * 0.0003;
          pLon = dtLon + (Math.random() - 0.5) * 0.0003;
        } else if (p > 15 && p % 8 === 0) {
          // Start a branch
          branchParent = dtPoles[Math.floor(p * 0.4)].id;
          const parentObj = dtPoles.find(dp => dp.id === branchParent);
          pLat = parentObj.lat + (Math.random() - 0.5) * 0.0005;
          pLon = parentObj.lon + (Math.random() - 0.5) * 0.0005;
          currentParent = branchParent;
        } else {
          // Continue along line
          const parentObj = dtPoles[dtPoles.length - 1];
          currentParent = parentObj.id;
          const stepAngle = angle + (Math.random() - 0.5) * 0.5;
          pLat = parentObj.lat + (0.04 / 111) * Math.cos(stepAngle);
          pLon = parentObj.lon + (0.04 / (111 * Math.cos(dtLat * Math.PI / 180))) * Math.sin(stepAngle);
        }

        // ~9% no device_id
        const hasDevice = Math.random() >= 0.09;
        const deviceId = hasDevice ? `KSPDB-SD07-D${String(poleCounter).padStart(4, '0')}-${1000 + Math.floor(Math.random()*9000)}` : null;

        // ~3% missing pincode
        const hasPincode = Math.random() >= 0.03;
        const pincode = hasPincode ? PINCODES[poleCounter % PINCODES.length] : null;

        const ward = WARDS[poleCounter % WARDS.length];

        const poleData = {
          pole_id: poleId,
          feeder_id: feeder.id,
          dt_id: dtId,
          lat: pLat,
          lon: pLon,
          seq_on_line: isKnownTopology ? p : null,
          parent_pole_id: isKnownTopology ? (p === 1 ? null : currentParent) : null,
          pole_type: p === 1 ? 'transformer_pole' : (p % 8 === 0 ? 'junction_pole' : 'tangent'),
          ward,
          pincode,
          device_id: deviceId,
          topology_type: isKnownTopology ? 'known' : 'inferred'
        };

        dtPoles.push(poleData);
        polesList.push(poleData);
        poleCounter++;
      }

      dtCounter++;
    }
  }

  // Impute missing pincodes using nearest pole with pincode
  console.log(`[SEED] Imputing missing pincodes for ~3% of poles...`);
  for (const pole of polesList) {
    if (!pole.pincode) {
      let minDist = Infinity;
      let nearestPincode = '560001';
      for (const other of polesList) {
        if (other.pincode && other.pole_id !== pole.pole_id) {
          const dist = haversineDistance(pole.lat, pole.lon, other.lat, other.lon);
          if (dist < minDist) {
            minDist = dist;
            nearestPincode = other.pincode;
          }
        }
      }
      pole.pincode = nearestPincode;
    }
  }

  // Insert all poles into DB
  console.log(`[SEED] Inserting ${polesList.length} poles into DB...`);
  for (const pole of polesList) {
    await query(
      `INSERT INTO poles (pole_id, feeder_id, dt_id, lat, lon, seq_on_line, parent_pole_id, pole_type, ward, pincode, device_id, topology_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        pole.pole_id, pole.feeder_id, pole.dt_id, pole.lat, pole.lon,
        pole.seq_on_line, pole.parent_pole_id, pole.pole_type, pole.ward,
        pole.pincode, pole.device_id, pole.topology_type
      ]
    );

    // Initialize pole_current_state for all poles with a device
    if (pole.device_id) {
      await query(
        `INSERT INTO pole_current_state (pole_id, device_id, is_energized, last_seen, last_seq, battery_mv, rssi, fw, status)
         VALUES ($1, $2, TRUE, NOW(), 1, 3500, -85, '1.4.2', 'energized')`,
        [pole.pole_id, pole.device_id]
      );
    }
  }

  console.log(`[SEED] Seeding complete! Inserted ${substations.length} substations, ${feeders.length} feeders, ${dtList.length} DTs, and ${polesList.length} poles.`);
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('[SEED] Success');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SEED] Error:', err);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
