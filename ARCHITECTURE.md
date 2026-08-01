# System Architecture — KSPDB Fault Detection & Localization

This document details the system design, ingestion pipeline, database schema, localization engine graph algorithms, noise-reduction strategy, API contracts, operator UI rationale, and AI summary integration for the Karnataka State Power Distribution Board (KSPDB) fault detection platform.

---

## 1. System High-Level Architecture & Data Flow

```mermaid
graph TD
    subgraph IoT Fleet & Simulator
        IoT[Pole IoT Devices] -->|JSON Payload| IngestAPI[POST /telemetry]
        Sim[Fault Simulator CLI / UI] -->|Inject Fault / Restore| IngestAPI
    end

    subgraph Backend Ingestion & Processing Core
        IngestAPI --> Buffer[In-Memory Micro-Batch Queue (100ms flush)]
        Buffer -->|Bulk Upsert ON CONFLICT (device_id, seq)| DB[(PostgreSQL Database)]
        HMon[Heartbeat Timeout Monitor (30s check)] -->|Mark Silent > 16.5m as Dark| DB
        DB --> LocEngine[Localization Engine (Pure Graph Algorithm)]
        LocEngine -->|Create / Deduplicate Tickets| DB
        Verifier[Telemetry Verification Loop (10s poll)] -->|Auto-Verify Power Restored| DB
    end

    subgraph Operator Console UI & AI
        UI[Next.js + Leaflet Console] -->|REST Poll 5s| DB
        DB -->|Ticket Metadata| AIService[Gemini LLM Service]
        AIService -->|Natural Language Summary / Fallback| UI
    end
```

---

## 2. Ingestion Design & High-Throughput Strategy

### Payload Contract
```json
{
  "device_id": "KSPDB-SD07-D0112-4431",
  "pole_id": "P-024431",
  "event": "power_lost",
  "energized": false,
  "ts": "2026-07-29T02:14:07.412Z",
  "seq": 88213,
  "battery_mv": 3480,
  "rssi": -91,
  "fw": "1.4.2"
}
```

### Ingestion Requirements & Mechanisms
1. **Throughput & Burst Absorption**: Sustains **≥500 msg/s** and absorbs **5,000 msg/10s bursts** without data loss.
   - *Implementation*: HTTP `POST /telemetry` enqueues incoming payloads into an in-memory queue (`BatchBuffer`) and returns an immediate `202 Accepted` response (< 5ms latency).
   - *Batching*: A background timer flushes the queue every **100ms** or whenever queue size reaches **200 items**, executing bulk `INSERT INTO telemetry_raw ... ON CONFLICT (device_id, seq) DO NOTHING`.
2. **Deduplication & Clock Skew Handling**:
   - Devices deliver messages at-least-once. Deduplication relies strictly on `(device_id, seq)`.
   - Device clocks experience ±90s skew; therefore, `ts` is logged for audit but ordering and state transitions depend on sequence number `seq`. Sequence number resets (`seq = 0` or `event = 'boot'`) re-arm device tracking.
3. **Dying Gasp vs Silent Outage (Firmware 1.2.x)**:
   - ~70% of devices (FW ≥1.3) transmit a `power_lost` event before dying.
   - ~8% of devices (FW 1.2.x) send nothing on power loss.
   - The system handles both: `power_lost` triggers immediate graph evaluation, while the `HeartbeatMonitor` background loop flags any device silent for `> 16.5 minutes` (15m nominal + 45s jitter + 45s margin) as dark.

---

## 3. Database Schema & Relational Tree Modeling

The network is modeled relationally in PostgreSQL with foreign keys representing the physical distribution tree:

```
substations (1) -> (N) feeders (1) -> (N) transformers (1) -> (N) poles
```

### Core Schema (`schema.sql`)
- **`poles`**:
  - `pole_id` (PK, e.g., `P-024431`)
  - `feeder_id` (FK -> `feeders`)
  - `dt_id` (FK -> `transformers`)
  - `parent_pole_id` (Self-referencing FK -> `poles.pole_id`) — NULL for 60% of DTs
  - `seq_on_line` (INT) — NULL for 60% of DTs
  - `topology_type` (`'known'` | `'inferred'`)
- **`pole_current_state`**:
  - `pole_id` (PK), `is_energized` (BOOL), `last_seen` (TIMESTAMPTZ), `last_seq` (BIGINT), `status` (`'energized'` | `'dark'` | `'offline_sensor'`).
- **`tickets`**:
  - `ticket_id` (PK), `fault_type` (`'span'` | `'dt'` | `'feeder'`), `status` (`'detected'` | `'acknowledged'` | `'crew_assigned'` | `'resolved'` | `'verified'` | `'closed'`), `asset_id`, `confidence_score`, `confidence_level` (`'HIGH'` | `'LOW'`), `confidence_reason`, `ai_summary`, `affected_pole_ids` (ARRAY).

---

## 4. Localization Engine Algorithm

The localization engine is implemented as a pure deterministic function `detectFaults(dtList, polesByDT, poleStates, scheduledOutages)` in `backend/src/engine/localization.js`.

### A. Missing Topology Resolution (The 60% Wrinkle)
For the 60% of Distribution Transformers (DTs) lacking recorded line order (`parent_pole_id = NULL`):
1. The engine extracts all poles under the DT and calculates Euclidean / Haversine distance from the DT coordinate `(dt.lat, dt.lon)`.
2. Poles are sorted by distance from the DT. The nearest pole is designated as root `P_root`.
3. For each subsequent pole `P_i`, the engine connects `P_i` to its nearest neighbor among upstream poles closer to the DT.
4. This constructs an **inferred radial tree**. Any fault localized on an inferred tree is tagged as **`LOW` confidence (0.60)** with the explicit reason: `"Topology inferred geometrically from DT coordinates outward."`

For the 40% of DTs with known topology (`parent_pole_id` present), faults are localized with **`HIGH` confidence (0.95)** with precise span designation.

### B. Fault Boundary Classification Algorithm
```
1. Filter Active Scheduled Outages (+30 min grace window on start/end).
2. Check Single Dead Sensor:
   If pole P is dark, BUT any downstream pole in P's subtree is energized:
   --> Flag P as Single Dead Sensor (SUPPRESS TICKET).
3. Check Feeder Fault:
   If all poles across all DTs under Feeder are dark (and >1 DT exists):
   --> Issue 1 Feeder Fault ticket.
4. Check DT Fault:
   If all poles under DT are dark with no live poles beneath it:
   --> Issue 1 DT Fault ticket.
5. Check Span Fault(s):
   Traverse tree from root down. Find boundary edges (P_live -> P_dark) where entire subtree of P_dark is dark.
   --> Issue 1 Span Fault ticket for span P_live -> P_dark. Group all downstream dark poles under this single ticket.
```

---

## 5. Noise Handling & False Positive Strategy

1. **Single Dead Sensor Detection**: Physical line outages strictly cause downstream blackout. If a pole reports dark while its child pole reports live, the failure is a sensor/modem fault. No ticket is generated.
2. **Offline Fleet Distinction**: ~4% of sensors are offline due to vandalism or cellular dead zones. Unpowered or non-reporting sensors without downstream dark evidence are ignored.
3. **Scheduled Outage Grace Period**: Shutdowns routinely overrun by 20-40 mins. Applying a 30-minute grace window suppresses false alarms during maintenance overruns while ensuring unscheduled faults outside the window trigger alerts.

---

## 6. API Surface Table

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/telemetry` | Accepts IoT telemetry payload (high-throughput batching) |
| `GET` | `/api/network` | Returns substations, feeders, DTs, poles & current states for map |
| `GET` | `/api/tickets` | Returns all detected and historical fault tickets |
| `POST` | `/api/tickets/:id/status` | Updates ticket workflow status (verifies telemetry if setting `resolved`) |
| `GET` | `/scheduled-outages` | Mock scheduled outages feed |
| `POST` | `/api/simulator/inject` | Simulator endpoint to inject Span, DT, Feeder, or Sensor faults |
| `POST` | `/api/simulator/outage` | Simulator endpoint to inject scheduled maintenance outages |
| `POST` | `/api/simulator/repair` | Simulator endpoint to restore power & send restoration telemetry |
| `POST` | `/api/simulator/seed` | Re-seeds database with synthetic network registry data |

---

## 7. Operator Console UI Design Rationale

- **Target Audience**: 2am control room operators. Prioritizes clarity, high contrast dark theme, and immediate visual distinction.
- **Leaflet Map**: Displays spatial layout of substations, DTs, poles, and distribution spans.
- **Confidence Visualization**:
  - `HIGH` Confidence (Known Topology): Red badge, solid red span line, 95% score.
  - `LOW` Confidence (Inferred Topology): Orange badge, dashed orange span line, 60% score with clear "Approximate — DT Region" label.
- **Simulator Panel**: Embedded directly in the UI for effortless evaluation and fault injection.

---

## 8. AI / LLM Feature Integration

- **Purpose**: Generates natural language operator advisories from structured ticket data (e.g. *"Span between P-001 and P-002 likely failed — 45 households affected in Ward 12 (PIN 560001). Access via MG Road. High confidence."*).
- **Graceful Fallback**: If `GEMINI_API_KEY` is not provided or the LLM call times out (3s limit), the system instantaneously falls back to template-generated text. Ticket creation is **never** blocked by AI API availability.
