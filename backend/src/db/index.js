const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

async function checkTableExists(tableName) {
  const result = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return result.rows.length > 0;
}

const tableCache = {};

async function getTableExists(tableName) {
  if (!(tableName in tableCache)) {
    tableCache[tableName] = await checkTableExists(tableName);
  }
  return tableCache[tableName];
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  getTableExists,
};