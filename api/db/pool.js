// =====================================================================
// DATABASE CONNECTION (Neon / Postgres)
// =====================================================================
const { Pool, types } = require("pg");
const { DATABASE_URL } = require("../config");

// Postgres type parsers: numeric -> float, bigint -> int, date -> plain string
types.setTypeParser(1700, parseFloat);
types.setTypeParser(20, parseInt);
types.setTypeParser(1082, v => v);

// Neon puts idle databases to sleep and closes idle connections,
// so keep the pool small and short-lived.
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 20000,
});

pool.on("error", e => {
  console.error("DB connection dropped (a new one is opened automatically):", e.message);
});

module.exports = pool;
