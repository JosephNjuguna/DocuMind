CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY, original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', error TEXT, extraction JSONB, checks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY, document_id INT UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  customer_id INT REFERENCES customers(id), doc_type TEXT NOT NULL, number TEXT, issue_date DATE, due_date DATE,
  subtotal NUMERIC(14,2), vat NUMERIC(14,2), total NUMERIC(14,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending', currency TEXT DEFAULT 'KES', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS line_items (
  id SERIAL PRIMARY KEY, invoice_id INT REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT, quantity NUMERIC(14,3), unit_price NUMERIC(14,2), amount NUMERIC(14,2));
