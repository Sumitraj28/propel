const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const poolConfig = config.db.connectionString
  ? { connectionString: config.db.connectionString }
  : {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database
    };

const pool = new Pool(poolConfig);

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('executed query', { text: text.substring(0, 80), duration, rows: res.rowCount });
  return res;
}

async function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('[DB] Schema initialized successfully.');
}

module.exports = {
  pool,
  query,
  initSchema
};
