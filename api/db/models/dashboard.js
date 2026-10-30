// =====================================================================
// DASHBOARD MODEL: all the numbers shown on the dashboard
// =====================================================================
const pool = require("../pool");

// Only invoices and receipts count as revenue
const REV = "i.doc_type IN ('invoice','receipt')";

const q = async sql => (await pool.query(sql)).rows;

async function getDashboard() {
  // Top cards: revenue this month, document count, unpaid invoices
  const [kpis] = await q(`
    SELECT
      COALESCE(SUM(total) FILTER (
        WHERE doc_type IN ('invoice','receipt')
        AND date_trunc('month', issue_date) = date_trunc('month', CURRENT_DATE)
      ), 0) AS revenue,
      COUNT(*) AS docs,
      COALESCE(SUM(total) FILTER (WHERE doc_type='invoice' AND payment_status<>'paid'), 0) AS outstanding,
      COUNT(*) FILTER (WHERE doc_type='invoice' AND payment_status<>'paid') AS outstanding_count
    FROM invoices
  `);

  // Revenue for the last 6 months
  const monthly = await q(`
    SELECT to_char(m, 'Mon') AS label, COALESCE(SUM(i.total), 0) AS total
    FROM generate_series(
      date_trunc('month', CURRENT_DATE) - interval '5 months',
      date_trunc('month', CURRENT_DATE),
      interval '1 month'
    ) m
    LEFT JOIN invoices i ON date_trunc('month', i.issue_date) = m AND ${REV}
    GROUP BY m
    ORDER BY m
  `);

  // Top 5 customers
  const customers = await q(`
    SELECT c.name, SUM(i.total) AS total
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE ${REV}
    GROUP BY c.name
    ORDER BY total DESC
    LIMIT 5
  `);

  // Top 5 products by quantity
  const products = await q(`
    SELECT lower(trim(l.description)) AS name, SUM(l.quantity) AS qty
    FROM line_items l
    JOIN invoices i ON i.id = l.invoice_id
    WHERE ${REV}
    GROUP BY 1
    ORDER BY qty DESC NULLS LAST
    LIMIT 5
  `);

  // Unpaid invoices that are overdue or due within 3 days
  const alerts = await q(`
    SELECT i.id, c.name AS customer, i.number, i.total, (CURRENT_DATE - i.due_date) AS days_overdue
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.doc_type = 'invoice'
      AND i.payment_status <> 'paid'
      AND i.due_date IS NOT NULL
      AND i.due_date <= CURRENT_DATE + 3
    ORDER BY i.due_date
    LIMIT 10
  `);

  return { kpis, monthly, customers, products, alerts };
}

module.exports = { getDashboard };
