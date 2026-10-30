// =====================================================================
// APP: builds the Express app (middleware + routes). Does NOT start it.
// =====================================================================
const express = require("express");
const cors = require("cors");
const { FRONTEND_ORIGIN } = require("./config");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: "2mb" }));

app.use("/api/health", require("./routes/health"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/invoices", require("./routes/invoices"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/checks", require("./routes/checks"));

// Must be last
app.use(errorHandler);

module.exports = app;
