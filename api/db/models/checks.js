// Risk checks table: one row per document the user asked the AI to assess
const pool = require("../pool");

const init = () =>
  pool.query(`
    CREATE TABLE IF NOT EXISTS risk_checks (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      source_text TEXT,
      stored_name TEXT,
      mime TEXT,
      checks TEXT,
      result JSONB,
      severity TEXT,
      score INTEGER,
      error TEXT,
      reviewed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

const create = async ({ name, text, storedName, mime, checks }) =>
  (await pool.query(
    "INSERT INTO risk_checks (name, source_text, stored_name, mime, checks) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [name, text || null, storedName || null, mime || null, checks]
  )).rows[0].id;

const list = async () =>
  (await pool.query("SELECT id, name, kind, status, severity, score, reviewed, created_at FROM risk_checks ORDER BY id DESC")).rows;

const findById = async id =>
  (await pool.query("SELECT id, name, kind, status, severity, score, result, error, reviewed, created_at FROM risk_checks WHERE id = $1", [id])).rows[0];

const findForProcessing = async id =>
  (await pool.query("SELECT id, source_text, stored_name, checks FROM risk_checks WHERE id = $1", [id])).rows[0];

const setStatus = (id, status) => pool.query("UPDATE risk_checks SET status = $2 WHERE id = $1", [id, status]);

const setDone = (id, result, kind) =>
  pool.query(
    "UPDATE risk_checks SET status='done', result=$2, severity=$3, score=$4, kind=COALESCE($5, kind), error=NULL WHERE id=$1",
    [id, JSON.stringify(result), result.severity, result.score, kind || null]
  );

const setFailed = (id, error) => pool.query("UPDATE risk_checks SET status='failed', error=$2 WHERE id=$1", [id, String(error).slice(0, 500)]);

const markQueued = id =>
  pool.query("UPDATE risk_checks SET status='queued', error=NULL, result=NULL, severity=NULL, score=NULL, reviewed=FALSE WHERE id=$1", [id]);

const markReviewed = id => pool.query("UPDATE risk_checks SET reviewed=TRUE WHERE id=$1", [id]);

const remove = async id => (await pool.query("DELETE FROM risk_checks WHERE id=$1 RETURNING stored_name", [id])).rows[0];

// On startup: anything that was mid-analysis goes back in the queue
const pendingIds = async () => {
  await pool.query("UPDATE risk_checks SET status='queued' WHERE status='processing'");
  return (await pool.query("SELECT id FROM risk_checks WHERE status='queued' ORDER BY id")).rows.map(r => r.id);
};

module.exports = { init, create, list, findById, findForProcessing, setStatus, setDone, setFailed, markQueued, markReviewed, remove, pendingIds };
