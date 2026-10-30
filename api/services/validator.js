// =====================================================================
// VALIDATOR: checks the AI's answer. This is where trust comes from.
// Returns the cleaned data + a `checks` object of problems to review.
// =====================================================================
const { num, close } = require("../utils/numbers");

function validate(raw) {
  const d = { ...raw };
  const checks = {};

  // Clean numbers
  for (const k of ["subtotal", "vat_amount", "total"]) {
    d[k] = num(d[k]);
  }

  d.line_items = (raw.line_items || []).map(l => ({
    description: l.description || "",
    quantity: num(l.quantity),
    unit_price: num(l.unit_price),
    amount: num(l.amount),
  }));

  // Dates must parse
  for (const k of ["issue_date", "due_date"]) {
    if (d[k] && isNaN(Date.parse(d[k]))) {
      checks[k] = "Not a valid date";
      d[k] = null;
    }
  }

  // Work out due date from "Net 14 days" style terms
  const termsMatch = (d.payment_terms || "").match(/(\d+)\s*days?/i);
  if (!d.due_date && d.issue_date && termsMatch) {
    const dt = new Date(d.issue_date);
    dt.setDate(dt.getDate() + +termsMatch[1]);
    d.due_date = dt.toISOString().slice(0, 10);
  }

  // Required fields
  if (!d.customer_name) checks.customer_name = "Customer not found";
  if (!d.issue_date && !checks.issue_date) checks.issue_date = "Date not found";
  if (d.total == null) checks.total = "Total not found";
  if (!d.line_items.length) checks.line_items = "No line items found";

  // Each line: qty x unit price should equal amount
  d.line_items.forEach((l, i) => {
    if (l.quantity != null && l.unit_price != null && l.amount != null && !close(l.quantity * l.unit_price, l.amount)) {
      checks["line_" + i] = "qty × unit price ≠ amount";
    }
  });

  // Lines should add up to subtotal
  const sum = d.line_items.reduce((s, l) => s + (l.amount || 0), 0);
  if (d.line_items.length && d.subtotal != null && !close(sum, d.subtotal)) {
    checks.subtotal = `Items add up to ${sum}`;
  }

  // Subtotal + VAT should equal total
  if (d.subtotal != null && d.vat_amount != null && d.total != null && !close(d.subtotal + d.vat_amount, d.total)) {
    checks.total = "Subtotal + VAT ≠ total";
  }

  // Payment status: only trust "paid" or "pending"
  if (d.payment_status !== "paid" && d.payment_status !== "pending") {
    checks.payment_status = "Not on document, please confirm";
    d.payment_status = "pending";
  }

  return { data: d, checks };
}

module.exports = { validate };
