// =====================================================================
// FILE READER: turns any uploaded file into something the model can read
//   - spreadsheet -> text
//   - digital PDF -> text
//   - scanned PDF -> images (needs poppler's pdftoppm)
//   - photo       -> image
// =====================================================================
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const run = promisify(require("child_process").execFile);
const sharp = require("sharp");
const pdfParse = require("pdf-parse");
const { UPLOADS } = require("../config");
const { spreadsheetToText } = require("./spreadsheet");

// Resize + convert any image to a base64 JPEG
async function toB64(file) {
  const buffer = await sharp(file)
    .rotate()
    .resize({ width: 1500, height: 1500, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return buffer.toString("base64");
}

// Decide how to feed a file to the model. Returns { text } or { images }.
async function buildInput(file, mime) {
  const ext = path.extname(file).toLowerCase();

  // Spreadsheet: send as text
  if (ext === ".xlsx" || ext === ".csv") {
    const text = await spreadsheetToText(file);
    if (!text.trim()) throw new Error("The spreadsheet is empty");
    return { text };
  }

  // Image: send as picture
  if (mime !== "application/pdf") {
    return { images: [await toB64(file)] };
  }

  // Digital PDF: text is faster and more exact
  const text = (await pdfParse(fs.readFileSync(file))).text.trim();
  if (text.length > 80) return { text };

  // Scanned PDF: convert the first 2 pages to images
  const prefix = file + "-page";
  await run("pdftoppm", ["-jpeg", "-r", "150", "-f", "1", "-l", "2", file, prefix]);

  const pages = fs
    .readdirSync(UPLOADS)
    .filter(f => f.startsWith(path.basename(prefix)))
    .sort();
  const images = [];

  for (const p of pages) {
    const fp = path.join(UPLOADS, p);
    images.push(await toB64(fp));
    fs.unlinkSync(fp);
  }

  return { images };
}

module.exports = { buildInput };
