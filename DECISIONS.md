# DECISIONS.md — Architectural & Design Decisions Log

This document records key decisions, assumptions, and design choices made during the development of the KSPDB Fault Detection and Localization System.

---

## Log of Decisions (Newest First)

### [2026-08-01] Decision 6: Automated Ticket Resolution Guardrails
- **Decision**: Reject operator requests to set ticket status to `resolved` if any downstream pole under the fault span/asset is still reporting dark.
- **Rationale**: Real-world operators may accidentally mark outages resolved before power is physically restored. Requiring telemetry validation prevents premature closure.

### [2026-08-01] Decision 5: Scheduled Outage Grace Window
- **Decision**: Apply a 30-minute grace window before `start_time` and after `end_time` for scheduled outages.
- **Rationale**: Brief noted that 20-40% of outages run over or start late. Dark telemetry within this window is suppressed to avoid false alarm tickets while preserving real outage detection outside the window.

### [2026-08-01] Decision 4: Geometric Nearest-Neighbor Tree Construction for Missing Topology
- **Decision**: For the ~60% of DTs where `parent_pole_id` and `seq_on_line` are NULL, construct a radial tree rooted at the DT's `(lat, lon)` using distance-sorted nearest-neighbor radial chaining.
- **Rationale**: Poles on a distribution transformer's low-tension line typically expand radially outward from the DT. Sorting by distance and connecting nearest nodes creates a plausible physical tree. Any fault detected on an inferred topology is explicitly marked as `LOW` confidence (60%) with plain-language explanation in the UI.

### [2026-08-01] Decision 3: Telemetry Deduplication & Sequence Number Ordering
- **Decision**: Deduplicate telemetry on `(device_id, seq)` composite key. Ignore clock timestamps `ts` for ordering due to ±90s clock skew.
- **Rationale**: Device sequence numbers (`seq`) are strictly monotonic per device. When a device reboots, `seq` resets to 0 and `event` = `boot`, resetting sequence tracking for that device.

### [2026-08-01] Decision 2: Heartbeat Timeout & Dying Gasp Handling
- **Decision**: Set heartbeat timeout threshold to 16 minutes 30 seconds (15 min nominal + 45s max jitter + 45s margin).
- **Rationale**: ~8% of fleet (firmware 1.2.x) sends no `power_lost` event on outage. If a device stops heartbeating while previously energized, the heartbeat monitor transitions its state to "possibly dark" after 16.5 minutes.

### [2026-08-01] Decision 1: Monolithic Monorepo Structure
- **Decision**: Organize the project into a clean monorepo with `backend/`, `frontend/`, `docker-compose.yml`, and root documentation.
- **Rationale**: Simple single-command container orchestration (`docker compose up`) and unified environment configuration.

---

## Known Limitations & Future Improvements (If given 2 more weeks)
1. **Dynamic Topology Re-inference**: Automatically re-compute geometric trees when pole coordinates update.
2. **PostGIS Spatial Extensions**: Use PostGIS `ST_Distance` and network routing instead of in-memory Haversine calculations for topology building.
3. **Persistent Message Queue**: Incorporate Redis / RabbitMQ between ingest endpoint and DB batch writer for scale >50,000 msg/s.
