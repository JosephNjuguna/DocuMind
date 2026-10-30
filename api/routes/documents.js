// =====================================================================
// DOCUMENT ROUTES  (mounted at /api/documents)
//   POST   /                     upload one or more files
//   POST   /:id/confirm-register save every invoice in a register document
//   GET    /                     list documents
//   GET    /:id                  get one document
//   GET    /:id/file             download the original file
//   POST   /:id/retry            re-run the AI on a document
//   DELETE /:id                  delete an unsaved document
//   POST   /:id/confirm          save the reviewed data as an invoice
// =====================================================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const { UPLOADS, MAX_FILES } = require("../config");
const upload = require("../middleware/upload");
const { asyncHandler } = require("../middleware/errorHandler");
const documents = require("../db/models/documents");
const invoices = require("../db/models/invoices");
const { splitWorkbook } = require("../services/spreadsheet");
const { importRegister } = require("../services/register");
const { enqueue } = require("../services/queue");
const { num } = require("../utils/numbers");

const router = express.Router();

// ---------- Upload ----------
router.post(
  "/",
  upload.array("files", MAX_FILES),
  asyncHandler(async (req, res) => {
    if (!req.files?.length) {
      return res.status(400).json({ error: "Upload a PDF, PNG, JPG, WEBP, XLSX or CSV file" });
    }

    const out = [];
    let skipped = 0;
    let skippedRows = 0;

    for (const f of req.files) {
      // A spreadsheet that lists many invoices (one per row) is imported directly, no AI needed
      const reg = await importRegister(f);
      if (reg) {
        out.push(...reg.ids);
        skippedRows += reg.skipped;
        continue;
      }

      // Multi-sheet Excel files become one document per sheet
      const split = await splitWorkbook(f);
      skipped += split.skipped;

      for (const doc of split.docs) {
        const id = await documents.create({
          originalName: doc.original_name,
          storedName: doc.stored_name,
          mime: doc.mime,
        });

        enqueue(id);
        out.push(id);
      }
    }

    res.status(201).json({ ids: out, skipped_sheets: skipped, skipped_rows: skippedRows });
  })
);

// ---------- Confirm register import ----------
router.post(
  "/:id/confirm-register",
  asyncHandler(async (req, res) => {
    const doc = await documents.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.status === "saved") return res.status(409).json({ error: "Already saved" });

    const x = doc.extraction || {};
    const invoicesList = x.invoices;
    if (!Array.isArray(invoicesList) || !invoicesList.length) {
      return res.status(400).json({ error: "No invoices found in this register" });
    }

    const ids = await invoices.createRegisterFromDocument(req.params.id, invoicesList);
    res.status(201).json({ saved: ids.length, invoice_ids: ids });
  })
);

// ---------- List ----------
router.get(
  "/",
  asyncHandler(async (_, res) => {
    res.json(await documents.list());
  })
);

// ---------- Get one ----------
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = await documents.findById(req.params.id);
    d ? res.json(d) : res.status(404).json({ error: "Document not found" });
  })
);

// ---------- Download original file ----------
router.get(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const d = await documents.findFile(req.params.id);
    if (!d) return res.status(404).json({ error: "Document not found" });

    res.type(d.mime).sendFile(path.join(UPLOADS, d.stored_name));
  })
);

// ---------- Retry ----------
router.post(
  "/:id/retry",
  asyncHandler(async (req, res) => {
    await documents.markQueued(req.params.id);
    enqueue(+req.params.id);
    res.json({ ok: true });
  })
);

// ---------- Delete ----------
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const d = await documents.deleteUnsaved(req.params.id);
    if (d) fs.rm(path.join(UPLOADS, d.stored_name), () => {});

    res.json({ ok: true });
  })
);

// ---------- Confirm (save reviewed data) ----------
router.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const b = req.body;
    const total = num(b.total);
    const name = (b.customer_name || "").trim();

    if (!name || total == null) {
      return res.status(400).json({ error: "Customer name and total are required" });
    }

    const doc = await documents.findStatus(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.status === "saved") return res.status(409).json({ error: "Already saved" });

    const invoiceId = await invoices.createFromDocument(req.params.id, b, name, total);
    res.status(201).json({ invoice_id: invoiceId });
  })
);

module.exports = router;