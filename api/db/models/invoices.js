// =====================================================================
// INVOICES MODEL: customers + invoices + line items
// =====================================================================
const pool = require("../pool");
const { num } = require("../../utils/numbers");

const DOC_TYPES = ["invoice", "lpo", "receipt", "quote", "other"];

// Helper to insert a single invoice within an active transaction connection
async function insertInvoice(c, documentId, b) {
  const name = (b.customer_name || "").trim();
  const total = num(b.total);

  if (!name || total == null) {
    throw new Error("Customer name and total are required");
  }

  // Customer (create or reuse)
  const {
    rows: [cu],
  } = await c.query(
    "INSERT INTO customers(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
    [name]
  );

  // Invoice
  const type = DOC_TYPES.includes(b.document_type) ? b.document_type : "invoice";

  const {
    rows: [inv],
  } = await c.query(
    `INSERT INTO invoices(document_id, customer_id, doc_type, number, issue_date, due_date, subtotal, vat, total, payment_status, currency)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      documentId,
      cu.id,
      type,
      b.document_number || null,
      b.issue_date || null,
      b.due_date || null,
      num(b.subtotal),
      num(b.vat_amount),
      total,
      b.payment_status === "paid" ? "paid" : "pending",
      b.currency || "KES",
    ]
  );

  // Line items
  for (const l of b.line_items || []) {
    if (!(l.description || "").trim()) continue;

    await c.query(
      "INSERT INTO line_items(invoice_id, description, quantity, unit_price, amount) VALUES($1,$2,$3,$4,$5)",
      [inv.id, l.description.trim(), num(l.quantity), num(l.unit_price), num(l.amount)]
    );
  }

  return inv.id;
}

// Save a reviewed single document as a real invoice
async function createFromDocument(documentId, b, name, total) {
  const c = await pool.connect();

  try {
    await c.query("BEGIN");
    const invId = await insertInvoice(c, documentId, { ...b, customer_name: name, total });
    await c.query("UPDATE documents SET status='saved' WHERE id=$1", [documentId]);
    await c.query("COMMIT");

    return invId;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

// Save all invoices from a register document in one atomic transaction
async function createRegisterFromDocument(documentId, invoicesList) {
  const c = await pool.connect();

  try {
    await c.query("BEGIN");
    const ids = [];
    
    for (const b of invoicesList) {
      const invId = await insertInvoice(c, documentId, b);
      ids.push(invId);
    }
    
    await c.query("UPDATE documents SET status='saved' WHERE id=$1", [documentId]);
    await c.query("COMMIT");

    return ids;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function markPaid(id) {
  await pool.query("UPDATE invoices SET payment_status='paid' WHERE id=$1", [id]);
}

module.exports = {
  createFromDocument,
  createRegisterFromDocument,
  markPaid
};