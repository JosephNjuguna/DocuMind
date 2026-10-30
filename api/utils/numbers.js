// =====================================================================
// NUMBER HELPERS
// =====================================================================

// Clean any value into a number (or null)
const num = v => {
  if (v == null || v === "") return null;

  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));

  return Number.isFinite(n) ? n : null;
};

// "Close enough" comparison: within 0.5% or 1 unit
const close = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005);

module.exports = { num, close };
