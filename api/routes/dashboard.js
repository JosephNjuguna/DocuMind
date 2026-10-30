// GET /api/dashboard  -> KPIs, charts and overdue alerts
const express = require("express");
const { asyncHandler } = require("../middleware/errorHandler");
const dashboard = require("../db/models/dashboard");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (_, res) => {
    res.json(await dashboard.getDashboard());
  })
);

module.exports = router;
