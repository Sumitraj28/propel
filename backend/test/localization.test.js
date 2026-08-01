const { detectFaults } = require('../src/engine/localization');

describe('Localization Engine Unit Tests', () => {
  const sampleDT = {
    dt_id: 'DT-0001',
    feeder_id: 'FDR-001',
    lat: 12.9716,
    lon: 77.5946,
    capacity_kva: 100,
    households_served: 70
  };

  const knownPoles = [
    { pole_id: 'P-001', feeder_id: 'FDR-001', dt_id: 'DT-0001', lat: 12.9716, lon: 77.5946, seq_on_line: 1, parent_pole_id: null, device_id: 'DEV-001', pincode: '560001' },
    { pole_id: 'P-002', feeder_id: 'FDR-001', dt_id: 'DT-0001', lat: 12.9720, lon: 77.5950, seq_on_line: 2, parent_pole_id: 'P-001', device_id: 'DEV-002', pincode: '560001' },
    { pole_id: 'P-003', feeder_id: 'FDR-001', dt_id: 'DT-0001', lat: 12.9724, lon: 77.5954, seq_on_line: 3, parent_pole_id: 'P-002', device_id: 'DEV-003', pincode: '560001' },
    { pole_id: 'P-004', feeder_id: 'FDR-001', dt_id: 'DT-0001', lat: 12.9728, lon: 77.5958, seq_on_line: 4, parent_pole_id: 'P-003', device_id: 'DEV-004', pincode: '560001' }
  ];

  test('1. Span Fault (Known Topology): P-001 live, P-002 dark (and downstream P-003, P-004 dark) -> Exactly 1 Span Ticket (P-001->P-002), HIGH confidence', () => {
    const poleStates = {
      'P-001': { is_energized: true, status: 'energized' },
      'P-002': { is_energized: false, status: 'dark' },
      'P-003': { is_energized: false, status: 'dark' },
      'P-004': { is_energized: false, status: 'dark' }
    };

    const tickets = detectFaults([sampleDT], { 'DT-0001': knownPoles }, poleStates);

    expect(tickets).toHaveLength(1);
    const tkt = tickets[0];
    expect(tkt.fault_type).toBe('span');
    expect(tkt.asset_id).toBe('Span:P-001->P-002');
    expect(tkt.confidence_level).toBe('HIGH');
    expect(tkt.confidence_score).toBe(0.95);
    expect(tkt.affected_pole_count).toBe(3);
    expect(tkt.affected_pole_ids).toEqual(expect.arrayContaining(['P-002', 'P-003', 'P-004']));
  });

  test('2. DT Fault (Known Topology): All poles dark under DT -> 1 DT Fault Ticket, HIGH confidence', () => {
    const poleStates = {
      'P-001': { is_energized: false, status: 'dark' },
      'P-002': { is_energized: false, status: 'dark' },
      'P-003': { is_energized: false, status: 'dark' },
      'P-004': { is_energized: false, status: 'dark' }
    };

    const tickets = detectFaults([sampleDT], { 'DT-0001': knownPoles }, poleStates);

    expect(tickets).toHaveLength(1);
    const tkt = tickets[0];
    expect(tkt.fault_type).toBe('dt');
    expect(tkt.asset_id).toBe('DT:DT-0001');
    expect(tkt.confidence_level).toBe('HIGH');
    expect(tkt.affected_pole_count).toBe(4);
  });

  test('3. Single Dead Sensor (NOT a Fault): P-002 dark, BUT downstream P-003 & P-004 are energized -> 0 Tickets', () => {
    const poleStates = {
      'P-001': { is_energized: true, status: 'energized' },
      'P-002': { is_energized: false, status: 'dark' }, // Sensor failure
      'P-003': { is_energized: true, status: 'energized' },
      'P-004': { is_energized: true, status: 'energized' }
    };

    const tickets = detectFaults([sampleDT], { 'DT-0001': knownPoles }, poleStates);

    expect(tickets).toHaveLength(0);
  });

  test('4. Inferred Topology Span Fault (60% case): parent_pole_id = null -> Inferred tree, LOW confidence (0.60)', () => {
    const inferredPoles = knownPoles.map(p => ({
      ...p,
      seq_on_line: null,
      parent_pole_id: null,
      topology_type: 'inferred'
    }));

    const poleStates = {
      'P-001': { is_energized: true, status: 'energized' },
      'P-002': { is_energized: false, status: 'dark' },
      'P-003': { is_energized: false, status: 'dark' },
      'P-004': { is_energized: false, status: 'dark' }
    };

    const tickets = detectFaults([sampleDT], { 'DT-0001': inferredPoles }, poleStates);

    expect(tickets.length).toBeGreaterThanOrEqual(1);
    const tkt = tickets[0];
    expect(tkt.confidence_level).toBe('LOW');
    expect(tkt.confidence_score).toBe(0.60);
    expect(tkt.confidence_reason).toContain('topology inferred geometrically');
  });

  test('5. Multiple Simultaneous Independent Faults: 2 separate DTs with broken spans -> 2 distinct tickets', () => {
    const dt2 = { ...sampleDT, dt_id: 'DT-0002' };
    const dt2Poles = [
      { pole_id: 'P-101', feeder_id: 'FDR-001', dt_id: 'DT-0002', lat: 13.0, lon: 77.6, seq_on_line: 1, parent_pole_id: null, device_id: 'DEV-101' },
      { pole_id: 'P-102', feeder_id: 'FDR-001', dt_id: 'DT-0002', lat: 13.001, lon: 77.601, seq_on_line: 2, parent_pole_id: 'P-101', device_id: 'DEV-102' }
    ];

    const poleStates = {
      // Fault 1 on DT-0001
      'P-001': { is_energized: true, status: 'energized' },
      'P-002': { is_energized: false, status: 'dark' },
      'P-003': { is_energized: false, status: 'dark' },
      'P-004': { is_energized: false, status: 'dark' },
      // Fault 2 on DT-0002
      'P-101': { is_energized: true, status: 'energized' },
      'P-102': { is_energized: false, status: 'dark' }
    };

    const tickets = detectFaults([sampleDT, dt2], { 'DT-0001': knownPoles, 'DT-0002': dt2Poles }, poleStates);

    expect(tickets).toHaveLength(2);
    const dtIds = tickets.map(t => t.dt_id);
    expect(dtIds).toContain('DT-0001');
    expect(dtIds).toContain('DT-0002');
  });

  test('6. Scheduled Outage Suppression: Active scheduled outage on DT-0001 -> 0 Tickets', () => {
    const poleStates = {
      'P-001': { is_energized: false, status: 'dark' },
      'P-002': { is_energized: false, status: 'dark' },
      'P-003': { is_energized: false, status: 'dark' },
      'P-004': { is_energized: false, status: 'dark' }
    };

    const now = new Date('2026-08-01T10:00:00Z');
    const scheduledOutages = [
      {
        id: 'OUT-01',
        scope: 'dt',
        target_id: 'DT-0001',
        start_time: '2026-08-01T09:30:00Z',
        end_time: '2026-08-01T11:00:00Z',
        reason: 'Maintenance'
      }
    ];

    const tickets = detectFaults([sampleDT], { 'DT-0001': knownPoles }, poleStates, scheduledOutages, now);

    expect(tickets).toHaveLength(0);
  });
});
