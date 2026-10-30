// =====================================================================
// CONFIG: environment variables and constants used across the API
// =====================================================================
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  PORT = 3000,
  DATABASE_URL,
  OLLAMA_URL = "http://localhost:11434",
  OLLAMA_MODEL = "qwen3.5-16k:latest",
  FRONTEND_ORIGIN = "*",
  OLLAMA_TIMEOUT_MS = "1200000", // 20 minutes
} = process.env;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing. Copy .env.example to .env and paste your Neon connection string.");
  process.exit(1);
}

// Where uploaded files are stored on disk (api/uploads)
const UPLOADS = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });

// Upload limits
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB per file
const MAX_FILES = 20; // files per upload request

// Max characters of spreadsheet text sent to the model (keeps us inside num_ctx)
const MAX_SHEET_CHARS = 24000;

// Max sheets taken from one workbook (the queue is slow, so don't flood it)
const MAX_SHEETS = 20;

// Max invoice rows imported from one register spreadsheet
const MAX_REGISTER_ROWS = 500;

// Allowed upload types
const ALLOWED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/csv",
  "application/csv",
];
const ALLOWED_EXTS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".xlsx", ".csv"];

module.exports = {
  PORT,
  DATABASE_URL,
  OLLAMA_URL,
  OLLAMA_MODEL,
  OLLAMA_TIMEOUT_MS: Number(OLLAMA_TIMEOUT_MS) || 1200000,
  FRONTEND_ORIGIN,
  UPLOADS,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_SHEET_CHARS,
  MAX_SHEETS,
  MAX_REGISTER_ROWS,
  ALLOWED_MIMES,
  ALLOWED_EXTS,
};
