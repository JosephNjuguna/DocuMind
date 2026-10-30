// =====================================================================
// CHECK QUEUE: reads each document, asks the AI, saves the verdict.
// One at a time, so a local model is never overloaded.
// =====================================================================
const fs = require("fs");
const { EventEmitter } = require("events");
const path = require("path");
const { UPLOADS } = require("../config");
const checks = require("../db/models/checks");
const { askRisk } = require("./riskAi");
const { buildInput } = require("./fileReader"); // same reader the invoice queue uses

const IMAGE_MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const queue = [];
let running = false;

// ---- Live updates: the stream route listens here to show the AI's work as it happens
const bus = new EventEmitter();
bus.setMaxListeners(50);
const last = new Map(); // latest event per check, so a late viewer catches up instantly

function publish(id, event, data) {
  last.set(id, { event, data });
  bus.emit("c" + id, event, data);
  if (event === "done" || event === "failed") setTimeout(() => last.delete(id), 60000).unref();
}

function subscribe(id, send) {
  const fn = (e, d) => send(e, d);
  bus.on("c" + id, fn);
  const l = last.get(+id);
  if (l) send(l.event, l.data);
  return () => bus.off("c" + id, fn);
}

function enqueueCheck(id) {
  if (!queue.includes(id)) queue.push(id);
  last.delete(id);
  publish(id, "stage", { stage: "queued" });
  run();
}

async function run() {
  if (running) return;
  running = true;
  try {
    while (queue.length) await analyse(queue.shift());
  } finally {
    running = false;
  }
}

async function resumeChecks() {
  for (const id of await checks.pendingIds()) enqueueCheck(id);
}

async function analyse(id) {
  const row = await checks.findForProcessing(id);
  if (!row) return;
  try {
    await checks.setStatus(id, "processing");
    publish(id, "stage", { stage: "reading" });
    const input = await load(row);

    publish(id, "stage", { stage: "analysing" });
    const raw = await askRisk({
      ...input,
      checks: (row.checks || "").split(",").filter(Boolean),
      onPartial: part => publish(id, "partial", part),
    });

    await checks.setDone(id, finalize(raw), raw.kind);
    publish(id, "done", {});
  } catch (e) {
    console.error(`Risk check ${id} failed:`, e.message);
    await checks.setFailed(id, e.message);
    publish(id, "failed", { error: e.message });
  }
}

// ---- Turn the pasted text / uploaded file into something the model can read
async function load(row) {
  const parts = [];
  let images;

  if (row.source_text) parts.push(row.source_text);

  if (row.stored_name) {
    const file = path.join(UPLOADS, row.stored_name);
    const ext = path.extname(row.stored_name).toLowerCase();

    if (ext === ".pdf" || IMAGE_MIME[ext]) {
      // Digital PDF -> text, scanned PDF -> page images, photo -> image (your existing fileReader)
      const r = await buildInput(file, ext === ".pdf" ? "application/pdf" : IMAGE_MIME[ext]);
      if (r.text) parts.push(r.text);
      images = r.images;
    } else if (ext === ".txt") {
      parts.push(await fs.promises.readFile(file, "utf8"));
    } else if (ext === ".eml") {
      parts.push(parseEml(await fs.promises.readFile(file, "utf8")));
    } else if (ext === ".docx") {
      let mammoth;
      try { mammoth = require("mammoth"); } catch { throw new Error("Word files need one more package: run  npm install mammoth"); }
      parts.push((await mammoth.extractRawText({ path: file })).value);
    }
  }

  return { text: parts.join("\n\n---\n\n"), images };
}

// Simple .eml reader: keeps the headers that reveal spoofing, and shows link targets
function parseEml(raw) {
  const [head, ...rest] = raw.replace(/\r\n/g, "\n").split("\n\n");
  const headers = head.replace(/\n[ \t]+/g, " ").split("\n")
    .filter(l => /^(from|reply-to|return-path|to|subject|date|received-spf|authentication-results):/i.test(l)).join("\n");
  const body = rest.join("\n\n")
    .replace(/=\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>/gi, " [link: $1] ")
    .replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim();
  return "EMAIL HEADERS:\n" + headers + "\n\nEMAIL BODY:\n" + body;
}

// ---- Never trust the model's numbers blindly: clamp them and derive severity from the score
const clamp = n => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
const arr = a => (Array.isArray(a) ? a : []);
const SEV = ["low", "medium", "high", "critical"];

function finalize(r) {
  const score = clamp(r.score);
  return {
    score,
    severity: score >= 80 ? "critical" : score >= 60 ? "high" : score >= 30 ? "medium" : "low",
    verdict: String(r.verdict || ""),
    summary: String(r.summary || ""),
    tags: arr(r.tags).slice(0, 5),
    flags: arr(r.flags).map(f => ({ ...f, severity: SEV.includes(f.severity) ? f.severity : "low" })),
    pros: arr(r.pros),
    cons: arr(r.cons),
    business_fit: clamp(r.business_fit),
    steps: arr(r.steps),
    actions: arr(r.actions),
  };
}

module.exports = { enqueueCheck, resumeChecks, subscribe };