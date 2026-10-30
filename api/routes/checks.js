// =====================================================================
// RISK CHECK ROUTES  (mounted at /api/checks)
//   POST   /             paste text and/or upload one file
//   GET    /             list checks
//   GET    /:id          one check with the AI result
//   GET    /:id/stream   live progress (Server-Sent Events)
//   POST   /:id/retry    run the AI again
//   POST   /:id/review   mark as reviewed
//   DELETE /:id          delete
// =====================================================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { UPLOADS, MAX_FILE_SIZE } = require("../config");
const { asyncHandler } = require("../middleware/errorHandler");
const checks = require("../db/models/checks");
const { enqueueCheck, subscribe } = require("../services/checkQueue");

const router = express.Router();

const OK_FILE = /\.(pdf|docx|txt|eml|png|jpe?g|webp)$/i;
const KINDS = ["scam", "phishing", "business_fit", "hidden_costs", "legal"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_, f, cb) => (OK_FILE.test(f.originalname) ? cb(null, true) : cb(new Error("Unsupported file. Use PDF, DOCX, TXT, EML or an image."))),
});

router.param("id", (req, res, next, id) => (/^\d+$/.test(id) ? next() : res.status(404).json({ error: "Check not found" })));

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const text = (req.body.text || "").trim();
    const f = req.file;
    if (!text && !f) return res.status(400).json({ error: "Paste some text or upload a file" });

    let storedName = null;
    if (f) {
      await fs.promises.mkdir(UPLOADS, { recursive: true });
      storedName = `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(f.originalname).toLowerCase()}`;
      await fs.promises.writeFile(path.join(UPLOADS, storedName), f.buffer);
    }

    const wanted = (req.body.checks || "").split(",").filter(c => KINDS.includes(c));
    const name = f ? f.originalname : (text.split("\n").find(l => l.trim()) || "Pasted text").trim().slice(0, 70);

    const id = await checks.create({ name, text, storedName, mime: f?.mimetype, checks: wanted.join(",") });
    enqueueCheck(id);
    res.status(201).json({ id });
  })
);

router.get("/", asyncHandler(async (_, res) => res.json(await checks.list())));

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const c = await checks.findById(req.params.id);
    c ? res.json(c) : res.status(404).json({ error: "Check not found" });
  })
);

// Live progress: sends "stage", "partial" (what the AI has written so far), then "done" or "failed"
router.get(
  "/:id/stream",
  asyncHandler(async (req, res) => {
    const c = await checks.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Check not found" });

    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    if (c.status === "done" || c.status === "failed") {
      send(c.status, { error: c.error });
      return res.end();
    }

    send("stage", { stage: c.status === "processing" ? "analysing" : "queued" });
    const off = subscribe(c.id, send);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);

    req.on("close", () => {
      clearInterval(ping);
      off();
    });
  })
);

router.post(
  "/:id/retry",
  asyncHandler(async (req, res) => {
    await checks.markQueued(req.params.id);
    enqueueCheck(+req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  "/:id/review",
  asyncHandler(async (req, res) => {
    await checks.markReviewed(req.params.id);
    res.json({ ok: true });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const c = await checks.remove(req.params.id);
    if (c?.stored_name) fs.rm(path.join(UPLOADS, c.stored_name), () => {});
    res.json({ ok: true });
  })
);

module.exports = router;