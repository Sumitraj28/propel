-- KSPDB Database Schema

-- Drop tables if exists for clean resets
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS pole_current_state CASCADE;
DROP TABLE IF EXISTS telemetry_raw CASCADE;
DROP TABLE IF EXISTS scheduled_outages CASCADE;
DROP TABLE IF EXISTS poles CASCADE;
DROP TABLE IF EXISTS transformers CASCADE;
DROP TABLE IF EXISTS feeders CASCADE;
DROP TABLE IF EXISTS substations CASCADE;

-- 1. Substations
CREATE TABLE substations (
  substation_id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  code VARCHAR(32) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL
);

-- 2. Feeders
CREATE TABLE feeders (
  feeder_id VARCHAR(32) PRIMARY KEY,
  substation_id VARCHAR(32) REFERENCES substations(substation_id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  code VARCHAR(32) NOT NULL
);

-- 3. Transformers (DTs)
CREATE TABLE transformers (
  dt_id VARCHAR(32) PRIMARY KEY,
  feeder_id VARCHAR(32) REFERENCES feeders(feeder_id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  capacity_kva INT NOT NULL DEFAULT 100,
  households_served INT NOT NULL DEFAULT 70
);

-- 4. Poles
CREATE TABLE poles (
  pole_id VARCHAR(32) PRIMARY KEY,
  feeder_id VARCHAR(32) REFERENCES feeders(feeder_id) ON DELETE CASCADE,
  dt_id VARCHAR(32) REFERENCES transformers(dt_id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  seq_on_line INT NULL,
  parent_pole_id VARCHAR(32) REFERENCES poles(pole_id) ON DELETE SET NULL,
  inferred_parent_pole_id VARCHAR(32) REFERENCES poles(pole_id) ON DELETE SET NULL,
  pole_type VARCHAR(32) NOT NULL DEFAULT 'tangent',
  ward VARCHAR(64) NOT NULL DEFAULT 'Ward 1',
  pincode VARCHAR(16) NULL,
  device_id VARCHAR(64) NULL UNIQUE,
  topology_type VARCHAR(16) NOT NULL DEFAULT 'known' -- 'known' or 'inferred'
);

CREATE INDEX idx_poles_dt_id ON poles(dt_id);
CREATE INDEX idx_poles_parent_pole_id ON poles(parent_pole_id);
CREATE INDEX idx_poles_inferred_parent ON poles(inferred_parent_pole_id);
CREATE INDEX idx_poles_device_id ON poles(device_id);

-- 5. Telemetry Raw (at-least-once deduplicated on (device_id, seq))
CREATE TABLE telemetry_raw (
  device_id VARCHAR(64) NOT NULL,
  seq BIGINT NOT NULL,
  pole_id VARCHAR(32) NOT NULL,
  event VARCHAR(32) NOT NULL,
  energized BOOLEAN NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  battery_mv INT NULL,
  rssi INT NULL,
  fw VARCHAR(32) NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, seq)
);

CREATE INDEX idx_telemetry_raw_pole ON telemetry_raw(pole_id);

-- 6. Pole Current State (fast lookup for localization engine)
CREATE TABLE pole_current_state (
  pole_id VARCHAR(32) PRIMARY KEY REFERENCES poles(pole_id) ON DELETE CASCADE,
  device_id VARCHAR(64) NULL,
  is_energized BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seq BIGINT NOT NULL DEFAULT 0,
  battery_mv INT NULL,
  rssi INT NULL,
  fw VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'energized' -- 'energized', 'dark', 'offline_sensor'
);

CREATE INDEX idx_pole_state_dt ON pole_current_state(pole_id);

-- 7. Tickets
CREATE TABLE tickets (
  ticket_id VARCHAR(64) PRIMARY KEY,
  fault_type VARCHAR(32) NOT NULL, -- 'span', 'dt', 'feeder'
  status VARCHAR(32) NOT NULL DEFAULT 'detected', -- 'detected', 'acknowledged', 'crew_assigned', 'resolved', 'verified', 'closed'
  asset_id VARCHAR(128) NOT NULL, -- span e.g. "P-001->P-002" or "DT-001" or "FDR-001"
  dt_id VARCHAR(32) NULL REFERENCES transformers(dt_id),
  feeder_id VARCHAR(32) NULL REFERENCES feeders(feeder_id),
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  pincode VARCHAR(16) NOT NULL,
  affected_pole_count INT NOT NULL DEFAULT 0,
  affected_households INT NOT NULL DEFAULT 0,
  confidence_score DOUBLE PRECISION NOT NULL, -- 0.95 for known, 0.60 for inferred
  confidence_level VARCHAR(16) NOT NULL, -- 'HIGH', 'LOW'
  confidence_reason TEXT NOT NULL,
  ai_summary TEXT NULL,
  affected_pole_ids TEXT[] NOT NULL DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ NULL,
  assigned_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_tickets_status ON tickets(status);

-- 8. Scheduled Outages
CREATE TABLE scheduled_outages (
  id VARCHAR(64) PRIMARY KEY,
  scope VARCHAR(16) NOT NULL, -- 'feeder', 'dt'
  target_id VARCHAR(32) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL
);
