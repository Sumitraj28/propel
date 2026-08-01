#!/usr/bin/env node

const {
  injectSpanFault,
  injectDTFault,
  injectFeederFault,
  injectSingleDeadSensor,
  injectScheduledOutage,
  repairFault,
  runLocalizationForNetwork
} = require('./faultSimulator');
const { seedDatabase } = require('../db/seed');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const target = args[1];

  console.log(`\n⚡ KSPDB Fault Simulator CLI`);
  console.log(`========================================`);

  try {
    switch (command.toLowerCase()) {
      case 'seed':
        console.log('Seeding synthetic database...');
        await seedDatabase();
        break;

      case 'span':
        if (!target) throw new Error('Please specify a pole ID (e.g. node cli.js span P-000002)');
        console.log(`Injecting Span Fault starting at pole ${target}...`);
        const spanRes = await injectSpanFault(target);
        console.log(`✅ Span fault injected. Affected ${spanRes.affectedPoleCount} poles downstream.`);
        console.log(`Detected tickets:`, JSON.stringify(spanRes.result.tickets, null, 2));
        break;

      case 'dt':
        if (!target) throw new Error('Please specify a DT ID (e.g. node cli.js dt DT-0001)');
        console.log(`Injecting DT Fault for transformer ${target}...`);
        const dtRes = await injectDTFault(target);
        console.log(`✅ DT fault injected. Affected ${dtRes.affectedPoleCount} poles under DT.`);
        console.log(`Detected tickets:`, JSON.stringify(dtRes.result.tickets, null, 2));
        break;

      case 'feeder':
        if (!target) throw new Error('Please specify a Feeder ID (e.g. node cli.js feeder FDR-001)');
        console.log(`Injecting Feeder Fault for ${target}...`);
        const fdrRes = await injectFeederFault(target);
        console.log(`✅ Feeder fault injected. Affected ${fdrRes.affectedPoleCount} poles.`);
        console.log(`Detected tickets:`, JSON.stringify(fdrRes.result.tickets, null, 2));
        break;

      case 'dead-sensor':
      case 'deadsensor':
        if (!target) throw new Error('Please specify a pole ID (e.g. node cli.js dead-sensor P-000005)');
        console.log(`Injecting Single Dead Sensor at pole ${target}...`);
        const sensorRes = await injectSingleDeadSensor(target);
        console.log(`✅ Single dead sensor injected for pole ${target}. Downstream remains energized.`);
        console.log(`Detected tickets (should be 0):`, sensorRes.result.tickets.length);
        break;

      case 'outage':
        if (!target) throw new Error('Please specify scope:target (e.g. node cli.js outage dt:DT-0001 or feeder:FDR-001)');
        const [scope, targetId] = target.split(':');
        console.log(`Injecting Scheduled Outage for ${scope} ${targetId}...`);
        const outageRes = await injectScheduledOutage(scope, targetId);
        console.log(`✅ Scheduled outage created:`, outageRes);
        break;

      case 'repair':
        if (!target) throw new Error('Please specify a Ticket ID (e.g. node cli.js repair TKT-SPAN-P-000002-12345)');
        console.log(`Repairing fault for ticket ${target}...`);
        const repairRes = await repairFault(target);
        console.log(`✅ Fault repaired. ${repairRes.repairedPolesCount} poles restored.`);
        break;

      case 'run-localization':
      case 'eval':
        console.log('Running localization engine scan across current network state...');
        const evalRes = await runLocalizationForNetwork();
        console.log(`Detected tickets (${evalRes.tickets.length}):`, JSON.stringify(evalRes.tickets, null, 2));
        break;

      default:
        console.log(`
Usage:
  node src/simulator/cli.js <command> [target]

Commands:
  seed                             Re-seed database with synthetic substations, DTs & poles
  span <pole_id>                   Inject span fault starting at pole_id
  dt <dt_id>                       Inject transformer fault for dt_id
  feeder <feeder_id>               Inject feeder fault for feeder_id
  dead-sensor <pole_id>            Inject single dead sensor failure (no fault ticket)
  outage <dt:DT_ID|feeder:FDR_ID>  Create scheduled outage for DT or Feeder
  repair <ticket_id>               Repair fault and send restoration telemetry
  eval                             Run localization scan across current network state
        `);
        break;
    }
  } catch (err) {
    console.error(`❌ Simulator Error: ${err.message}`);
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}
