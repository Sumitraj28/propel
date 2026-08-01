# DEPLOYMENT.md — KSPDB Fault Detection System Setup & Operations

This guide provides copy-pasteable instructions for deploying, running, verifying, and troubleshooting the KSPDB Fault Detection & Localization system.

---

## 1. Prerequisites & Environment Requirements

| Requirement | Minimum Version | Verified Version |
| :--- | :--- | :--- |
| **Docker Engine** | 20.10+ | 26.0+ |
| **Docker Compose** | 2.20+ | 2.27+ |
| **Node.js** (for local CLI/tests) | 18.0+ | 20.12+ |
| **Git** | 2.30+ | 2.43+ |

---

## 2. One-Command Quickstart (Docker Compose)

Clone the repository and run Docker Compose from the project root:

```bash
# 1. Clone repository
git clone <repo-url>
cd <repo-name>

# 2. Copy environment configuration
cp .env.example .env

# 3. Start all services (Database + Backend API + Frontend Console)
docker compose up --build
```

`docker compose up` will automatically:
1. Spin up PostgreSQL 16 on port `5432`.
2. Wait for PostgreSQL to become healthy.
3. Build and launch the Node.js Express backend on port `4000`.
4. Auto-create database tables (`schema.sql`) and auto-seed synthetic substations, DTs, and poles (`seed.js`).
5. Build and launch the Next.js frontend console on port `3000`.

Open your browser to:
- **Operator Console UI**: [http://localhost:3000](http://localhost:3000)
- **Backend Ingest & REST API**: [http://localhost:4000](http://localhost:4000)

---

## 3. Environment Variables Reference

All system configuration is managed via environment variables documented in `.env.example`:

| Variable | Description | Required? | Default Value |
| :--- | :--- | :--- | :--- |
| `POSTGRES_USER` | PostgreSQL admin username | No | `kspdb_admin` |
| `POSTGRES_PASSWORD` | PostgreSQL admin password | No | `kspdb_secret_pass` |
| `POSTGRES_DB` | PostgreSQL database name | No | `kspdb` |
| `POSTGRES_HOST` | Database hostname | No | `postgres` (or `localhost` for local dev) |
| `POSTGRES_PORT` | Database port | No | `5432` |
| `DATABASE_URL` | PostgreSQL connection string | No | `postgres://kspdb_admin:kspdb_secret_pass@postgres:5432/kspdb` |
| `PORT` | Backend service HTTP port | No | `4000` |
| `GEMINI_API_KEY` | Google Gemini LLM API Key | Optional | `""` (Falls back to template text if absent) |
| `NEXT_PUBLIC_API_URL` | Frontend API URL | No | `http://localhost:4000` |

---

## 4. Verification & Testing

### A. Run Unit Tests (Localization Engine)
Execute the Jest unit test suite for the localization logic:

```bash
cd backend
npm install
npm test
```

Expected output:
```text
PASS test/localization.test.js
  Localization Engine Unit Tests
    ✓ 1. Span Fault (Known Topology): P-001 live, P-002 dark -> Exactly 1 Span Ticket (P-001->P-002), HIGH confidence
    ✓ 2. DT Fault (Known Topology): All poles dark under DT -> 1 DT Fault Ticket, HIGH confidence
    ✓ 3. Single Dead Sensor (NOT a Fault): P-002 dark, BUT downstream P-003 & P-004 are energized -> 0 Tickets
    ✓ 4. Inferred Topology Span Fault (60% case): parent_pole_id = null -> Inferred tree, LOW confidence (0.60)
    ✓ 5. Multiple Simultaneous Independent Faults: 2 separate DTs with broken spans -> 2 distinct tickets
    ✓ 6. Scheduled Outage Suppression: Active scheduled outage on DT-0001 -> 0 Tickets

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

### B. Fault Simulator CLI Verification
You can inject and repair faults directly using the simulator CLI:

```bash
# Inject a Span Fault on pole P-000002
node backend/src/simulator/cli.js span P-000002

# Inject a Transformer (DT) Fault on DT-0001
node backend/src/simulator/cli.js dt DT-0001

# Inject a Single Dead Sensor (assert 0 tickets created)
node backend/src/simulator/cli.js dead-sensor P-000005

# Scan current network state and list open tickets
node backend/src/simulator/cli.js eval

# Re-seed synthetic database
node backend/src/simulator/cli.js seed
```

---

## 5. Troubleshooting Guide

### Port Conflicts (5432, 4000, 3000)
If local ports `5432`, `4000`, or `3000` are already bound by existing local services (e.g. local PostgreSQL server):
1. Stop your local PostgreSQL service: `sudo service postgresql stop` or `brew services stop postgresql`.
2. Or modify port mappings in `docker-compose.yml` (e.g., `"5433:5432"`).

### ARM vs x86 Architecture (Apple Silicon M1/M2/M3)
All container images use base `alpine` Linux (`node:20-alpine` and `postgres:16-alpine`), which natively support both ARM64 and x86_64 architectures without Rosetta emulation issues.

### Memory Limits & Free Hosting Tiers
If deploying on low-memory instances (e.g., 512MB RAM free tier):
1. Node.js backend uses under 60MB RAM.
2. Next.js production build (`npm start`) uses under 90MB RAM.
3. PostgreSQL container uses under 40MB RAM.

### How to Reset to Clean State
To completely erase database volumes and reset to clean seeded state:

```bash
docker compose down -v
docker compose up --build
```
