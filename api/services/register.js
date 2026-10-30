// =====================================================================
// REGISTER IMPORT: spreadsheets that LIST many invoices, one per row
// (e.g. "Invoice Payment Details - Last 6 Months").
// These are already structured, so no AI is needed: we match the column
// headers, build one document with all rows, and run the normal validator.
// =====================================================================
const fs = require("fs");
const path = require("path");
const { UPLOADS, MAX_REGISTER_ROWS } = require("../config");
const documents = require("../db/models/documents");
const { readSheets } = require("./spreadsheet");
const { validate } = require("./validator");
const { num } = require("../utils/numbers");

// Column header names we recognise (lowercase, no symbols) for each field
const ALIASES = {
  document_number: ["invoice id", "invoice no", "invoice number", "inv no", "inv #", "inv number", "document number", "document no", "lpo no", "receipt no", "ref", "reference"],
  issue_date: ["invoice date", "issue date", "date"],
  due_date: ["due date", "payment due"],
  customer_name: ["client name", "client", "customer name", "customer", "bill to", "billed to"],
  subtotal: ["amount", "subtotal", "net amount", "amount before tax"],
  vat_amount: ["tax amount", "vat amount", "vat", "tax"],
  total: ["total amount", "total", "gross amount", "grand total", "invoice total"],
  payment_status: ["payment status", "status"],
  currency: ["currency"],
};

const FIELD_BY_HEADER = {};
for (const [field, names] of Object.entries(ALIASES)) {
  names.forEach(n => (FIELD_BY_HEADER[n] ??= field));
}

// "Amount ($)" -> "amount",  "Tax Rate (%)" -> "tax rate"
const clean = h =>
  String(h ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9# ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Look in the first 10 rows for a header row that looks like an invoice list
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cols = {};

    rows[i].forEach((h, c) => {
      const field = FIELD_BY_HEADER[clean(h)];
      if (field && !(field in cols)) cols[field] = c;
    });

    // Only an "Amount" column (no tax column): treat it as the total
    if (cols.total == null && cols.subtotal != null && cols.vat_amount == null) {
      cols.total = cols.subtotal;
      delete cols.subtotal;
    }

    const looksLikeRegister =
      cols.customer_name != null && cols.total != null && (cols.document_number != null || cols.issue_date != null);

    if (looksLikeRegister) return { index: i, cols, header: rows[i] };
  }

  return null;
}

// 2026-10-11 stays as is. 11/10/2026 becomes 2026-10-11 (day-first). Anything else is left for the validator to flag.
function toISO(s) {
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  const dmy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  return s;
}

// Paid / Settled -> paid.  Pending, Overdue, Unpaid... -> pending.  Blank -> unknown (flagged for review)
function statusOf(s) {
  const t = s.toLowerCase();
  if (!t) return "unknown";
  return /\b(paid|settled)\b/.test(t) && !/unpaid|not paid/.test(t) ? "paid" : "pending";
}

// Turn the sheets into one extraction per invoice row.
// Returns null if any sheet is NOT an invoice list (then the normal AI path is used).
function parseRegister(sheets) {
  const rows = [];

  for (const sheet of sheets) {
    const h = findHeader(sheet.rows);
    if (!h) return null;

    // "$" or "USD" in the amount header -> USD, "KES"/"Ksh" -> KES, otherwise the default is used
    const amountHeader = String(h.header[h.cols.total] ?? "");
    const headerCurrency = /\$|usd/i.test(amountHeader) ? "USD" : /kes|ksh/i.test(amountHeader) ? "KES" : null;

    for (const cells of sheet.rows.slice(h.index + 1)) {
      // Read one field from this row ("-" and "N/A" count as empty)
      const get = f => {
        const v = h.cols[f] == null ? "" : String(cells[h.cols[f]] ?? "").trim();
        return /^(-|n\/a|na|null)?$/i.test(v) ? "" : v;
      };

      const customer = get("customer_name");
      const number = get("document_number");
      if (!customer && !number) continue; // blank or "Total" rows

      const raw = {
        document_type: "invoice",
        document_number: number || null,
        issue_date: toISO(get("issue_date")),
        due_date: toISO(get("due_date")),
        payment_terms: null,
        seller_name: null,
        customer_name: customer || null,
        currency: get("currency") || headerCurrency,
        line_items: [],
        subtotal: num(get("subtotal")),
        vat_amount: num(get("vat_amount")),
        total: num(get("total")),
        payment_status: statusOf(get("payment_status")),
      };

      const { data, checks } = validate(raw);
      delete checks.line_items; // register rows have no item table, that is expected

      rows.push({ extraction: data, checks, label: number || `Row ${rows.length + 1}` });
    }
  }

  if (!rows.length) return null;
  return { rows: rows.slice(0, MAX_REGISTER_ROWS), skipped: Math.max(0, rows.length - MAX_REGISTER_ROWS) };
}

// Import an uploaded file if it is an invoice list. Returns { ids, skipped } or null.
async function importRegister(f) {
  const ext = path.extname(f.originalname).toLowerCase();
  if (ext !== ".xlsx" && ext !== ".csv") return null;

  const parsed = parseRegister(await readSheets(f.path));
  if (!parsed) return null;

  const invoices = parsed.rows.map(r => r.extraction);
  const checks = {};
  parsed.rows.forEach((r, i) => {
    if (Object.keys(r.checks).length > 0) {
      checks[i] = r.checks;
    }
  });

  const id = await documents.createProcessed({
    originalName: f.originalname,
    storedName: f.filename,
    mime: f.mimetype || (ext === ".csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    status: Object.keys(checks).length ? "needs_review" : "ready",
    extraction: { invoices },
    checks,
  });

  return { ids: [id], skipped: parsed.skipped };
}

module.exports = { importRegister, parseRegister };