const { query } = require('../db');

class BatchBuffer {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 200;
    this.flushIntervalMs = options.flushIntervalMs || 100;
    this.queue = [];
    this.timer = null;
    this.isFlushing = false;
  }

  start() {
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this.flush();
  }

  enqueue(item) {
    this.queue.push(item);
    if (this.queue.length >= this.batchSize) {
      setImmediate(() => this.flush());
    }
  }

  async flush() {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    const itemsToProcess = this.queue.splice(0, this.batchSize);

    try {
      // 1. Bulk insert raw telemetry ignoring duplicates on (device_id, seq)
      const valueTuples = [];
      const queryParams = [];
      let paramIdx = 1;

      for (const item of itemsToProcess) {
        valueTuples.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        queryParams.push(
          item.device_id,
          item.seq,
          item.pole_id,
          item.event,
          item.energized,
          item.ts,
          item.battery_mv || null,
          item.rssi || null,
          item.fw || null
        );
      }

      const insertSql = `
        INSERT INTO telemetry_raw (device_id, seq, pole_id, event, energized, ts, battery_mv, rssi, fw)
        VALUES ${valueTuples.join(', ')}
        ON CONFLICT (device_id, seq) DO NOTHING;
      `;

      await query(insertSql, queryParams);

      // 2. Update pole_current_state for each unique pole/device (strictly using sequence ordering or genuine boot reset)
      const stateMap = new Map();
      for (const item of itemsToProcess) {
        const existing = stateMap.get(item.pole_id);
        if (!existing) {
          stateMap.set(item.pole_id, item);
        } else {
          const itemTs = new Date(item.ts || Date.now()).getTime();
          const existingTs = new Date(existing.ts || Date.now()).getTime();

          if (item.event === 'boot') {
            if (itemTs >= existingTs) {
              stateMap.set(item.pole_id, item);
            }
          } else if (existing.event === 'boot') {
            if (item.seq >= existing.seq || itemTs >= existingTs) {
              stateMap.set(item.pole_id, item);
            }
          } else if (item.seq >= existing.seq) {
            stateMap.set(item.pole_id, item);
          }
        }
      }

      for (const [poleId, item] of stateMap.entries()) {
        const updateSql = `
          INSERT INTO pole_current_state (pole_id, device_id, is_energized, last_seen, last_seq, battery_mv, rssi, fw, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (pole_id) DO UPDATE
          SET
            device_id = CASE
              WHEN EXCLUDED.last_seq >= pole_current_state.last_seq OR ($10 = 'boot' AND EXCLUDED.last_seen >= pole_current_state.last_seen)
              THEN EXCLUDED.device_id
              ELSE pole_current_state.device_id
            END,
            is_energized = CASE
              WHEN EXCLUDED.last_seq >= pole_current_state.last_seq OR ($10 = 'boot' AND EXCLUDED.last_seen >= pole_current_state.last_seen)
              THEN EXCLUDED.is_energized
              ELSE pole_current_state.is_energized
            END,
            last_seen = CASE
              WHEN EXCLUDED.last_seq >= pole_current_state.last_seq OR ($10 = 'boot' AND EXCLUDED.last_seen >= pole_current_state.last_seen)
              THEN EXCLUDED.last_seen
              ELSE pole_current_state.last_seen
            END,
            last_seq = CASE
              WHEN EXCLUDED.last_seq >= pole_current_state.last_seq OR ($10 = 'boot' AND EXCLUDED.last_seen >= pole_current_state.last_seen)
              THEN EXCLUDED.last_seq
              ELSE pole_current_state.last_seq
            END,
            battery_mv = CASE
              WHEN EXCLUDED.last_seq >= pole_current_state.last_seq OR ($10 = 'boot' AND EXCLUDED.last_seen >= pole_current_state.last_seen)
              THEN EXCLUDED.battery_mv
              ELSE pole_current_state.battery_mv
            END,
            rssi = CASE
              WHEN EXCLUDED.last_seq >= pole_current_state.last_seq OR ($10 = 'boot' AND EXCLUDED.last_seen >= pole_current_state.last_seen)
              THEN EXCLUDED.rssi
              ELSE pole_current_state.rssi
            END,
            fw = CASE
              WHEN EXCLUDED.last_seq >= pole_current_state.last_seq OR ($10 = 'boot' AND EXCLUDED.last_seen >= pole_current_state.last_seen)
              THEN EXCLUDED.fw
              ELSE pole_current_state.fw
            END,
            status = CASE
              WHEN EXCLUDED.last_seq >= pole_current_state.last_seq OR ($10 = 'boot' AND EXCLUDED.last_seen >= pole_current_state.last_seen)
              THEN (CASE WHEN EXCLUDED.is_energized = FALSE THEN 'dark' ELSE 'energized' END)
              ELSE pole_current_state.status
            END;
        `;

        await query(updateSql, [
          poleId,
          item.device_id,
          item.energized,
          item.ts || new Date(),
          item.seq,
          item.battery_mv || null,
          item.rssi || null,
          item.fw || null,
          item.energized ? 'energized' : 'dark',
          item.event || 'telemetry'
        ]);
      }
    } catch (err) {
      console.error('[BATCH_BUFFER] Error processing telemetry batch:', err);
    } finally {
      this.isFlushing = false;
      if (this.queue.length > 0) {
        setImmediate(() => this.flush());
      }
    }
  }
}

const globalBuffer = new BatchBuffer();
globalBuffer.start();

module.exports = globalBuffer;
