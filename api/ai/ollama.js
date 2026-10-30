// =====================================================================
// OLLAMA CONNECTION: sends a document/image to the local model, returns JSON
// =====================================================================
const { fetch, Agent } = require("undici");
const { OLLAMA_URL, OLLAMA_MODEL, OLLAMA_TIMEOUT_MS } = require("../config");

// Import standard document configuration (used for both docs and M-Pesa receipts)
const STANDARD_SCHEMA = require("./schema");
const { SYSTEM: STANDARD_SYSTEM, PROMPT: STANDARD_PROMPT } = require("./prompts");

// Import M-Pesa prompts
const { MPESA_SYSTEM, MPESA_PROMPT } = require("./mpesa-prompt");

// Node's built-in fetch gives up after 5 minutes of silence, and Ollama sends nothing
// until the whole answer is ready (stream: false). Slow local models need longer,
// so switch that timer off and use our own limit (OLLAMA_TIMEOUT_MS) instead.
const agent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

// `text` for digital PDFs / spreadsheets, `images` for photos and scanned screenshots
async function askOllama({ text, images, isMpesa }) {
  // Automatically default to M-Pesa prompts whenever an image payload is provided
  const useMpesa = isMpesa !== undefined ? isMpesa : (images && Array.isArray(images) && images.length > 0);

  const systemPrompt = useMpesa ? MPESA_SYSTEM : STANDARD_SYSTEM;
  const userPromptText = useMpesa ? MPESA_PROMPT : STANDARD_PROMPT;

  // Enforce STANDARD_SCHEMA so your frontend form receives 'line_items', 'subtotal', and 'total'
  const schemaToUse = STANDARD_SCHEMA;

  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    dispatcher: agent,
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      think: false,
      keep_alive: "30m",
      format: schemaToUse,
      options: {
        temperature: 0,
        presence_penalty: 0,
        num_ctx: 16384,
      },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userPromptText + (text ? "\n\nDOCUMENT TEXT:\n" + text : ""),
          ...(images ? { images } : {}),
        },
      ],
    }),
  });

  if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()}`);

  return JSON.parse((await r.json()).message.content);
}

module.exports = { askOllama };