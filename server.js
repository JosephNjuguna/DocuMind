// =====================================================================
// SERVER: entry point. Run with `node server.js`
// =====================================================================

// --- Network settings (copied from app.js) ---------------------------
// Must run BEFORE anything else opens a database connection.
// Prefer IPv4 and stop Node trying IPv6 first, which was producing the
// ENETUNREACH half of the AggregateError on networks without IPv6.
const dns = require("node:dns");
const net = require("node:net");
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

require("dotenv").config(); // load DATABASE_URL etc. before ./api/config

const { PORT, OLLAMA_MODEL } = require("./api/config");
const app = require("./api/app");
const { migrate } = require("./api/db/migrate");
const { resumePending } = require("./api/services/queue");
const { init: initChecks } = require("./api/db/models/checks");
const { resumeChecks } = require("./api/services/checkQueue");

// --- Retry helper (same idea as withRetry in app.js) -----------------
// Neon computes auto-suspend and can take a few seconds to wake up, so
// the first connection attempt may time out even when the DB is fine.
async function withRetry(fn, label, retries = 5, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`${label} attempt ${i}/${retries} failed: ${err.code || err.message}`);
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
}

(async () => {
  await withRetry(migrate, "migrate"); // create tables if needed
  await withRetry(initChecks, "initChecks"); // risk_checks table
  await resumePending(); // pick up unfinished documents
  await resumeChecks(); // pick up unfinished risk checks

  app.listen(PORT, () => {
    console.log(`DocuMind API on http://localhost:${PORT}  (model: ${OLLAMA_MODEL})`);
  });
})().catch(e => {
  // AggregateError has an empty .message, so log the code and inner errors too
  console.error("Startup failed:", e.code || e.message || e);
  if (e.errors) e.errors.forEach(x => console.error(" -", x.code, x.address, x.port));
  process.exit(1);
});