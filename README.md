# ⚡ KSPDB Fault Detection & Localization System

An intelligent, real-time fault detection, boundary localization, and ticket workflow platform built for the **Karnataka State Power Distribution Board (KSPDB)**.

This system ingests binary IoT telemetry (energized/dark) from distribution poles, infers missing line topology for ~60% of transformers, localizes broken distribution spans and transformer/feeder failures using deterministic graph algorithms, and presents real-time incidents to control-room operators.

---

## 🚀 Quick Start (One Command)

Ensure [Docker Desktop](https://www.docker.com/) is installed and running, then execute:

```bash
docker compose up --build
```

That's it! The system will automatically:
1. Start PostgreSQL, Node.js Backend API, and Next.js Operator Console.
2. Initialize database schemas and seed synthetic substations, DTs, and poles.
3. Launch live telemetry monitors and localization workers.

Access the applications at:
- 🖥️ **Operator Console UI**: [http://localhost:3000](http://localhost:3000)
- ⚙️ **Backend Ingest & REST API**: [http://localhost:4000](http://localhost:4000)

---

## 🗺️ Documentation Map

- 📐 [**ARCHITECTURE.md**](ARCHITECTURE.md) — Comprehensive technical architecture, graph algorithms, micro-batch ingestion queue design, relational PostgreSQL tree schema, noise-reduction strategy, API surface table, and AI integration.
- 🚀 [**DEPLOYMENT.md**](DEPLOYMENT.md) — Prerequisites, step-by-step startup guide, environment variables, verification commands, and troubleshooting matrix.
- 📜 [**DECISIONS.md**](DECISIONS.md) — Running log of engineering choices, assumptions, trade-offs, known fragile areas, and future roadmap.
- 🤖 [**AI-WORKFLOW.md**](AI-WORKFLOW.md) — Template documenting AI pair-programming tools and developer workflow notes.

---

## ⚡ Key System Features

1. **Deterministic Graph Localization Engine**:
   - Classifies **Span Faults**, **Transformer (DT) Faults**, and **Feeder Faults**.
   - Groups all downstream blackout poles into a single actionable incident ticket.
2. **Topology Resolution (Handling the 60% Missing Topology Wrinkle)**:
   - For 40% of DTs with known line order: Provides **High Confidence (95%)** precise span localization.
   - For 60% of DTs with missing line order: Geometrically infers radial tree structure from DT coordinates outward, flagging incidents with **Low Confidence (60%)** and visible "Approximate — DT Region" UI warnings.
3. **High-Throughput Batch Telemetry Ingestion**:
   - In-memory micro-batch queue flushing every 100ms.
   - Sustains **>500 msg/s** and absorbs **5,000 msg/10s bursts** with zero data loss.
   - Deduplicates on `(device_id, seq)` sequence numbers, immune to device clock skews up to ±90s.
   - Heartbeat timeout monitor flags silent dying devices (FW 1.2.x).
4. **Noise & False Alarm Suppression**:
   - **Single Dead Sensor Rule**: Ignores dark poles if any downstream pole is energized (physically impossible for line fault).
   - **Scheduled Outage Grace Window**: Applies a 30-minute grace window before start and after end times to suppress maintenance false alarms.
5. **Operator Workflow & Telemetry Verification**:
   - Human operator transitions: `detected` → `acknowledged` → `crew_assigned` → `resolved`.
   - **Resolution Guardrail**: Rejects marking tickets `resolved` if telemetry shows poles are still dark.
   - **Auto-Verification**: Background loop automatically transitions status to `verified` when telemetry confirms power restoration.
6. **Built-in Fault Simulator**:
   - Interactive UI panel + CLI tool to inject span, DT, feeder, or single dead sensor faults and observe real-time localization.
7. **AI Natural Language Operator Summary**:
   - Generates concise 2-sentence dispatcher advisories via Gemini API with instantaneous template fallback if unconfigured.

---

## 🧪 Testing & Verification

Run the unit tests for the localization engine:

```bash
cd backend
npm install
npm test
```

Inject faults via CLI:

```bash
# Inject span fault starting at pole P-000002
node backend/src/simulator/cli.js span P-000002

# Inject transformer fault on DT-0001
node backend/src/simulator/cli.js dt DT-0001

# Inject single dead sensor (verifies 0 tickets created)
node backend/src/simulator/cli.js dead-sensor P-000005
```
