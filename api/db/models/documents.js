// =====================================================================
// DOCUMENTS MODEL: every query on the `documents` table
// =====================================================================
const pool = require("../pool");

// Insert a new uploaded document, returns its id
async function create({ originalName, storedName, mime }) {
  const {
    rows: [d],
  } = await pool.query("INSERT INTO documents(original_name, stored_name, mime) VALUES($1,$2,$3) RETURNING id", [
    originalName,
    storedName,
    mime,
  ]);

  return d.id;
}

// Insert a document that already has its data (register rows skip the AI), returns its id
async function createProcessed({ originalName, storedName, mime, status, extraction, checks }) {
  const {
    rows: [d],
  } = await pool.query(
    "INSERT INTO documents(original_name, stored_name, mime, status, extraction, checks) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
    [originalName, storedName, mime, status, extraction, checks]
  );

  return d.id;
}

// Documents the validator passed with no problems (for "Save all ready")
async function findReady() {
  const { rows } = await pool.query("SELECT id, extraction FROM documents WHERE status='ready' ORDER BY id");
  return rows;
}

// Latest 200 documents for the list screen
async function list() {
  const { rows } = await pool.query(
    "SELECT id, original_name, status, error, created_at FROM documents ORDER BY id DESC LIMIT 200"
  );
  return rows;
}

// One full document row (or undefined)
async function findById(id) {
  const {
    rows: [d],
  } = await pool.query("SELECT * FROM documents WHERE id=$1", [id]);

  return d;
}

// Just the stored file name + mime type (for downloads)
async function findFile(id) {
  const {
    rows: [d],
  } = await pool.query("SELECT stored_name, mime FROM documents WHERE id=$1", [id]);

  return d;
}

// Just the status (used before confirming)
async function findStatus(id) {
  const {
    rows: [d],
  } = await pool.query("SELECT status FROM documents WHERE id=$1", [id]);

  return d;
}

// Documents waiting to be processed (used on server restart)
async function findPending() {
  const { rows } = await pool.query("SELECT id FROM documents WHERE status IN ('queued','processing') ORDER BY id");
  return rows;
}

// Mark as processing and return the full row
async function markProcessing(id) {
  const {
    rows: [d],
  } = await pool.query("UPDATE documents SET status='processing', error=NULL WHERE id=$1 RETURNING *", [id]);

  return d;
}

// Store the AI result + validation checks
async function saveExtraction(id, status, extraction, checks) {
  await pool.query("UPDATE documents SET status=$2, extraction=$3, checks=$4 WHERE id=$1", [
    id,
    status,
    extraction,
    checks,
  ]);
}

async function markFailed(id, message) {
  await pool.query("UPDATE documents SET status='failed', error=$2 WHERE id=$1", [id, message]);
}

// Put back in the queue (never touches already-saved documents)
async function markQueued(id) {
  await pool.query("UPDATE documents SET status='queued' WHERE id=$1 AND status<>'saved'", [id]);
}

// Delete a document unless it was already saved. Returns { stored_name } if deleted.
async function deleteUnsaved(id) {
  const {
    rows: [d],
  } = await pool.query("DELETE FROM documents WHERE id=$1 AND status<>'saved' RETURNING stored_name", [id]);

  return d;
}

module.exports = {
  create,
  createProcessed,
  findReady,
  list,
  findById,
  findFile,
  findStatus,
  findPending,
  markProcessing,
  saveExtraction,
  markFailed,
  markQueued,
  deleteUnsaved,
};
