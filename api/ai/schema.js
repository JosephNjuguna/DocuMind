// =====================================================================
// AI SCHEMA: the exact JSON shape the model must return
// =====================================================================

// Helper: a type that can also be null
const N = t => ({ type: [t, "null"] });

const SCHEMA = {
  type: "object",
  properties: {
    document_type: {
      type: "string",
      enum: ["invoice", "lpo", "receipt", "quote", "other"],
    },
    document_number: N("string"),
    issue_date: N("string"),
    due_date: N("string"),
    payment_terms: N("string"),
    seller_name: N("string"),
    customer_name: N("string"),
    currency: N("string"),
    line_items: {
      type: "array",
      items: {
        type: "object",
        required: ["description", "quantity", "unit_price", "amount"],
        properties: {
          description: { type: "string" },
          quantity: N("number"),
          unit_price: N("number"),
          amount: N("number"),
        },
      },
    },
    subtotal: N("number"),
    vat_amount: N("number"),
    total: N("number"),
    payment_status: {
      type: "string",
      enum: ["paid", "pending", "unknown"],
    },
  },
};

// Every property is required (use null when the value is missing)
SCHEMA.required = Object.keys(SCHEMA.properties);

module.exports = SCHEMA;
