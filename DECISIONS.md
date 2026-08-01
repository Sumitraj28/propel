# DECISIONS.md — Architectural & Design Decisions Log

This document records key decisions, assumptions, and design choices made during the development of the KSPDB Fault Detection and Localization System.

---

## Log of Decisions (Newest First)

### [2026-08-02] Decision 8: Full-Width Layout Shell & Header Brand Integration
- **Decision**: Removed the left sidebar navigation column to streamline the command center layout into a full-width console. Integrated KSPDB branding and logo into the top header bar alongside real-time status indicators.
- **Rationale**: Maximize screen real estate for the Leaflet operator map and active fault incident cards. Command shortcuts remain accessible directly on each incident ticket card.


### [2026-08-01] Decision 7: Pure Deterministic Functional Core for Localization Engine
- **Decision**: Separate the localization logic into a pure, side-effect-free module `backend/src/engine/localization.js` isolated from HTTP, database, and background queues.
- **Rationale**: Ensures the algorithm is 100% testable with mock data and zero database dependencies. Allows instant unit testing of complex boundary conditions (known topology, inferred topology, single dead sensor, scheduled outage grace periods).

### [2026-08-01] Decision 6: Automated Ticket Resolution Guardrails
- **Decision**: Reject operator requests to set ticket status to `resolved` if any downstream pole under the fault span/asset is still reporting dark.
- **Rationale**: Real-world operators may accidentally mark outages resolved before power is physically restored. Requiring telemetry validation prevents premature closure and returns an HTTP 400 with exact dark pole IDs.

### [2026-08-01] Decision 5: Scheduled Outage Grace Window
- **Decision**: Apply a 30-minute grace window before `start_time` and after `end_time` for scheduled outages.
- **Rationale**: Brief noted that 20-40% of outages run over or start late. Dark telemetry within this window is suppressed to avoid false alarm tickets while preserving real outage detection outside the window.

### [2026-08-01] Decision 4: Geometric Nearest-Neighbor Tree Construction for Missing Topology
- **Decision**: For the ~60% of DTs where `parent_pole_id` and `seq_on_line` are NULL, construct a radial tree rooted at the DT's `(lat, lon)` using distance-sorted nearest-neighbor radial chaining.
- **Rationale**: Poles on a distribution transformer's low-tension line typically expand radially outward from the DT. Sorting by distance and connecting nearest nodes creates a plausible physical tree. Any fault detected on an inferred topology is explicitly marked as `LOW` confidence (60%) with plain-language explanation in the UI.

### [2026-08-01] Decision 3: Telemetry Deduplication & Sequence Number Ordering
- **Decision**: Deduplicate telemetry on `(device_id, seq)` composite key. Ignore clock timestamps `ts` for ordering due to ±90s clock skew across IoT sensors.
- **Rationale**: Device sequence numbers (`seq`) are strictly monotonic per device. When a device reboots, `seq` resets to 0 and `event` = `boot`, resetting sequence tracking for that device.

### [2026-08-01] Decision 2: Heartbeat Timeout & Dying Gasp Handling
- **Decision**: Set heartbeat timeout threshold to 16 minutes 30 seconds (15 min nominal + 45s max jitter + 45s margin).
- **Rationale**: ~8% of fleet (firmware 1.2.x) sends no `power_lost` event on outage. If a device stops heartbeating while previously energized, the heartbeat monitor transitions its state to "possibly dark" after 16.5 minutes.

### [2026-08-01] Decision 1: Monolithic Monorepo Structure with Micro-Batch Ingestion
- **Decision**: Organize into `backend/`, `frontend/`, `docker-compose.yml`, using an in-memory micro-batch queue in Express flushing every 100ms.
- **Rationale**: Achieves >500 msg/s ingestion throughput and absorbs 5,000 msg/10s bursts without database connection starvation or row-by-row writing bottlenecks.

---

## Known Fragile Areas & Technical Debt
1. **In-Memory Batch Queue during Process Crash**: If the backend process crashes suddenly between batch flushes, in-flight un-flushed telemetry payloads in the queue (<100ms window) could be lost. *Mitigation for production: persistent Redis queue.*
2. **2D Haversine vs Real Road Distance for Geometric Trees**: Nearest-neighbor radial chaining uses 2D spatial distance rather than physical road/line routing. On complex terrain, line paths might cross river/railway boundaries.

---

## What We'd Build With 2 More Weeks
1. **PostGIS Spatial Indexing**: Replace in-memory distance calculations with PostGIS `ST_DWithin` and network graph routing (`pgRouting`).
2. **Redis Message Queue (BullMQ)**: Decouple telemetry ingestion completely onto Redis to scale up to 50,000 msg/s.
3. **Historical Outage Heatmaps & Reliability Metrics (SAIDI/SAIFI)**: Track long-term MTTR (Mean Time to Repair) per feeder/DT.
