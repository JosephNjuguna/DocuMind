// =====================================================================
// JOB QUEUE: processes documents one at a time (local models are slow)
// Flow per document: read file -> ask AI -> validate -> save result
// =====================================================================
const path = require("path");
const { UPLOADS } = require("../config");
const documents = require("../db/models/documents");
const { buildInput } = require("./fileReader");
const { validate } = require("./validator");
const { askOllama } = require("../ai/ollama");

const queue = [];
let busy = false;

// Add a document id to the queue and start working
function enqueue(id) {
  queue.push(id);
  pump();
}

// Work through the queue, one document at a time
async function pump() {
  if (busy) return;
  busy = true;

  while (queue.length) {
    await processDoc(queue.shift());
  }

  busy = false;
}

async function processDoc(id) {
  const d = await documents.markProcessing(id);
  if (!d) return;

  try {
    const input = await buildInput(path.join(UPLOADS, d.stored_name), d.mime);
    const raw = await askOllama(input);
    const { data, checks } = validate(raw);
    const status = Object.keys(checks).length ? "needs_review" : "ready";

    await documents.saveExtraction(id, status, data, checks);
  } catch (e) {
    console.error(`Document ${id} failed:`, e);
    await documents.markFailed(id, e.message);
  }
}

// Re-queue anything that was interrupted by a restart
async function resumePending() {
  const rows = await documents.findPending();
  rows.forEach(r => enqueue(r.id));
}

module.exports = { enqueue, resumePending };
