// GET /api/health
const express = require("express");
const pool = require("../db/pool");
const { OLLAMA_MODEL } = require("../config");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (_, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true, model: OLLAMA_MODEL });
  })
);

module.exports = router;
