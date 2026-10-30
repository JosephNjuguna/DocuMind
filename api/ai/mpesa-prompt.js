const MPESA_SYSTEM =
  "You extract Kenyan M-Pesa transaction screenshots and map them into a standard receipt and line-item document schema. " +
  "A single screenshot may show multiple SMS messages. Extract every transaction found into the line_items array. " +
  "Read the meaning of the text, not its position. Return only JSON matching the schema.";

const MPESA_PROMPT = `Extract every M-Pesa transaction visible in this screenshot and map them into the document schema:

MAPPING RULES:
- document_type: "receipt"
- document_number: use the first 10-character transaction code (e.g., "UJQJYBV0VB").
- issue_date: transaction date as YYYY-MM-DD (e.g., "2026-10-26").
- seller_name: name of the primary business or person paid/involved in the first transaction.
- line_items: Create ONE line item for EVERY SMS message visible in the screenshot:
  - description: "[Transaction Code] - [Action] [Counterparty Name]" (e.g., "UJQJYBV0VB - Paid to EASTLEIGH MATTRESSES LIMITED").
  - quantity: 1
  - unit_price: main transaction amount as a plain number.
  - amount: main transaction amount as a plain number.
- subtotal: sum of all line item amounts.
- total: sum of all line item amounts.
- payment_status: "paid"
- currency: "KES"

RULES:
- Do NOT stop at the first message. Extract ALL visible messages into line_items.
- Numbers as plain numbers (no "Ksh", no commas).`;

module.exports = { MPESA_SYSTEM, MPESA_PROMPT };