// =====================================================================
// UPLOAD MIDDLEWARE: saves incoming files to disk (multer)
// =====================================================================
const multer = require("multer");
const path = require("path");
const { UPLOADS, MAX_FILE_SIZE, ALLOWED_MIMES, ALLOWED_EXTS } = require("../config");

module.exports = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_, f, cb) => {
      const unique = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      cb(null, unique + path.extname(f.originalname).toLowerCase());
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_, f, cb) => {
    const ext = path.extname(f.originalname).toLowerCase();
    const isSpreadsheet = ext === ".xlsx" || ext === ".csv";

    // Browsers report CSV/Excel mime types inconsistently, so trust the extension for those
    cb(null, isSpreadsheet ? true : ALLOWED_MIMES.includes(f.mimetype) && ALLOWED_EXTS.includes(ext));
  },
});
