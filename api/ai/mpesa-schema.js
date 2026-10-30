const N = t => ({ type: [t, "null"] });

const MPESA_SCHEMA = {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        required: [
          "transaction_code",
          "counterparty_name",
          "amount",
          "date",
          "time"
        ],
        properties: {
          transaction_code: N("string"),
          transaction_type: N("string"),
          direction: N("string"),
          amount: N("number"),
          currency: N("string"),
          transaction_cost: N("number"),
          balance_after: N("number"),
          date: N("string"),
          time: N("string"),
          counterparty_name: N("string"),
          counterparty_phone: N("string"),
          paybill_number: N("string"),
          till_number: N("string"),
          account_number: N("string"),
          agent_number: N("string"),
          status: N("string"),
        },
      },
    },
  },
  required: ["transactions"],
};

module.exports = MPESA_SCHEMA;