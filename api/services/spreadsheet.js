// =====================================================================
// SPREADSHEET SERVICE: reads Excel (.xlsx) and CSV files
// =====================================================================
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { UPLOADS, MAX_SHEET_CHARS, MAX_SHEETS } = require("../config");

// Turn one Excel cell value into plain text
function cellText(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);

  if (typeof v === "object") {
    if (v.richText) return v.richText.map(t => t.text).join("");
    if ("result" in v) return cellText(v.result); // formula cell: use its computed value
    if (v.text) return cellText(v.text); // hyperlink cell
    if (v.error) return "";
    return String(v);
  }

  return String(v);
}

// True if the sheet has at least one non-empty cell
function sheetHasData(sheet) {
  let found = false;

  sheet.eachRow({ includeEmpty: false }, row => {
    if (Array.from(row.values).slice(1).some(v => cellText(v).trim())) found = true;
  });

  return found;
}

// Read every visible, non-empty sheet as a grid of text cells: [{ name, rows: [[...]] }]
async function readSheets(file) {
  const wb = new ExcelJS.Workbook();

  if (path.extname(file).toLowerCase() === ".csv") {
    await wb.csv.readFile(file);
  } else {
    await wb.xlsx.readFile(file);
  }

  return wb.worksheets
    .filter(s => s.state === "visible" && sheetHasData(s))
    .map(s => {
      const rows = [];
      s.eachRow({ includeEmpty: false }, row => rows.push(Array.from(row.values).slice(1).map(cellText)));
      return { name: s.name, rows };
    });
}

// Read an .xlsx or .csv file and turn every sheet into pipe-separated text
async function spreadsheetToText(file) {
  const wb = new ExcelJS.Workbook();

  if (path.extname(file).toLowerCase() === ".csv") {
    await wb.csv.readFile(file);
  } else {
    await wb.xlsx.readFile(file);
  }

  const parts = [];

  for (const sheet of wb.worksheets) {
    const lines = [];

    sheet.eachRow({ includeEmpty: false }, row => {
      const cells = Array.from(row.values).slice(1).map(cellText);
      if (cells.some(c => c.trim())) lines.push(cells.join(" | "));
    });

    if (lines.length) parts.push(`--- Sheet: ${sheet.name} ---\n${lines.join("\n")}`);
  }

  return parts.join("\n\n").slice(0, MAX_SHEET_CHARS);
}

// Split a multi-sheet workbook into one CSV per sheet,
// so every sheet is extracted as its own document.
// Single-sheet workbooks and non-Excel files are returned untouched.
async function splitWorkbook(f) {
  const single = [{ original_name: f.originalname, stored_name: f.filename, mime: f.mimetype }];

  if (path.extname(f.originalname).toLowerCase() !== ".xlsx") {
    return { docs: single, skipped: 0 };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f.path);

  // Ignore hidden and empty sheets
  const sheets = wb.worksheets.filter(s => s.state === "visible" && sheetHasData(s));
  if (sheets.length <= 1) return { docs: single, skipped: 0 };

  const used = sheets.slice(0, MAX_SHEETS);
  const docs = [];

  for (const [i, s] of used.entries()) {
    const stored = `${path.parse(f.filename).name}-s${i + 1}.csv`;
    await wb.csv.writeFile(path.join(UPLOADS, stored), { sheetName: s.name });
    docs.push({ original_name: `${f.originalname} - ${s.name}`, stored_name: stored, mime: "text/csv" });
  }

  fs.rm(f.path, () => {}); // original workbook no longer needed
  return { docs, skipped: sheets.length - used.length };
}

module.exports = { spreadsheetToText, splitWorkbook, readSheets };
