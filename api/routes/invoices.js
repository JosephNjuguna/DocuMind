// POST /api/invoices/:id/pay  -> mark an invoice as paid
const express = require("express");
const { asyncHandler } = require("../middleware/errorHandler");
const invoices = require("../db/models/invoices");

const router = express.Router();

router.post(
  "/:id/pay",
  asyncHandler(async (req, res) => {
    await invoices.markPaid(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
