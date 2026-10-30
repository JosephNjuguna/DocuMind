const API = location.protocol.startsWith("http") && !["localhost", "127.0.0.1"].includes(location.hostname)
  ? "https://doctrine-retinal-sympathy.ngrok-free.dev/api"
  : "http://localhost:3000/api";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const money = (n, currency = "KES") => {
  const code = currency && currency.trim() !== "" ? currency.toUpperCase() : "KES";
  return code + " " + Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });
};

const LABEL = {
  queued: "Waiting",
  processing: "Reading…",
  needs_review: "Check needed",
  ready: "Ready to save",
  saved: "Saved",
  failed: "Failed"
};

let current = null;
let chart = null;

async function api(path, opts) {
  const r = await fetch(API + path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

function toast(msg, err) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "on" + (err ? " err" : "");
  setTimeout(() => t.className = "", 3000);
}

function show(v) {
  $$("main > section").forEach(s => s.hidden = s.id !== "view-" + v);
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.view === v));
  location.hash = v;
  v === "dashboard" ? loadDashboard() : v === "risk" ? loadRisk() : loadList();
}

$$(".tab").forEach(t => t.onclick = () => show(t.dataset.view));

// ----- Upload + queue -----
const OK_FILE = /\.(pdf|png|jpe?g|webp|xlsx|csv)$/i;

async function upload(files) {
  if (!files.length) return;
  const ok = [...files].filter(f => OK_FILE.test(f.name));
  if (!ok.length) return toast("Unsupported file. Use PDF, PNG, JPG, Excel (.xlsx) or CSV.", true);

  const fd = new FormData();
  ok.forEach(f => fd.append("files", f));

  try {
    const r = await api("/documents", { method: "POST", body: fd });
    const n = r.ids.length;
    const notes = [
      r.skipped_sheets && `${r.skipped_sheets} extra sheets skipped`,
      r.skipped_rows && `${r.skipped_rows} extra rows skipped`,
      ok.length < files.length && `${files.length - ok.length} unsupported files ignored`
    ].filter(Boolean);

    toast(`Uploaded ${n} document${n === 1 ? "" : "s"}. Reading now…` + (notes.length ? ` (${notes.join(", ")})` : ""));
    loadList();
  } catch (e) {
    toast(e.message, true);
  }
}

$("#file").onchange = e => {
  upload(e.target.files);
  e.target.value = "";
};

const dz = $("#drop");
["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => {
  e.preventDefault();
  dz.classList.add("over");
}));
["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => {
  e.preventDefault();
  dz.classList.remove("over");
}));
dz.addEventListener("drop", e => upload(e.dataTransfer.files));

async function loadList() {
  try {
    const docs = await api("/documents");
    $("#health").className = "pill";
    $("#health").textContent = "Connected · running locally";

    const item = d => `<li><button class="doc ${d.id === current ? "on" : ""}" data-id="${d.id}"><b>${esc(d.original_name)}</b><span class="st ${d.status}">${LABEL[d.status] || d.status}</span>${d.error ? `<small class="muted">${esc(d.error)}</small>` : ""}</button></li>`;

    ["#reviewList"].forEach(s => $(s).innerHTML = docs.length ? docs.map(item).join("") : `<li class="muted">No documents yet. Upload one to begin.</li>`);
    $$(".doc").forEach(b => b.onclick = () => openDoc(+b.dataset.id));
  } catch {
    $("#health").className = "pill bad";
    $("#health").textContent = "Can't reach the API";
  }
}

setInterval(() => {
  if (!$("#view-documents").hidden) loadList();
}, 2500);

// ----- Review -----
function addLine(l = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input data-l="description" aria-label="Item" value="${esc(l.description)}"></td>` +
    ["quantity", "unit_price", "amount"].map(k => `<td><input data-l="${k}" aria-label="${k}" type="number" step="any" value="${l[k] ?? ""}"></td>`).join("") +
    `<td><button type="button" class="x" aria-label="Remove line">×</button></td>`;

  tr.querySelector(".x").onclick = () => tr.remove();
  tr.oninput = e => {
    if (["quantity", "unit_price"].includes(e.target.dataset.l)) {
      const v = k => +tr.querySelector(`[data-l=${k}]`).value;
      tr.querySelector("[data-l=amount]").value = +(v("quantity") * v("unit_price")).toFixed(2);
    }
  };

  $("#lines").appendChild(tr);
  return tr;
}

$("#addLine").onclick = () => addLine();

// Small CSV parser
function parseCSV(t) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          q = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      q = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

const sheetTable = rows => {
  const all = rows.filter(r => r.some(c => c.trim()));
  const shown = all.slice(0, 200);
  return `<div class="sheet"><table>${shown.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></div>` +
    (all.length > 200 ? `<p class="muted">Showing the first 200 of ${all.length} rows.</p>` : "");
};

async function renderPreview(d) {
  const box = $("#preview");
  const url = `${API}/documents/${d.id}/file`;
  const name = d.original_name || "";
  const isCsv = d.mime.includes("csv") || /\.csv$/i.test(name);
  const isXlsx = !isCsv && (d.mime.includes("spreadsheetml") || /\.xlsx$/i.test(name));

  if (d.mime === "application/pdf") {
    box.innerHTML = `<iframe title="Document" src="${url}"></iframe>`;
  } else if (isCsv) {
    box.innerHTML = `<p class="muted">Loading sheet…</p>`;
    try {
      const rows = parseCSV(await (await fetch(url)).text());
      if (current === d.id) box.innerHTML = sheetTable(rows);
    } catch {
      if (current === d.id) box.innerHTML = `<p class="muted">Couldn't load the preview.</p>`;
    }
  } else if (isXlsx) {
    box.innerHTML = `<div class="filecard"><b>${esc(name)}</b><p class="muted">Excel files can't be previewed here.</p><a class="btn sec" href="${url}" download>Download original</a></div>`;
  } else {
    box.innerHTML = `<img alt="Uploaded document" src="${url}">`;
  }
}

async function openDoc(id) {
  current = id;
  if ($("#view-documents").hidden) show("documents");

  const d = await api("/documents/" + id);
  const x = d.extraction;
  const checks = d.checks || {};
  renderPreview(d);

  const isRegister = x && Array.isArray(x.invoices);
  $("#form").hidden = isRegister || !x || d.status === "saved";
  $("#state").hidden = !(!isRegister && (!x || d.status === "saved") || d.status === "failed");
  $("#retry").hidden = d.status !== "failed";

  let regBox = $("#registerView");
  if (!regBox) {
    regBox = document.createElement("div");
    regBox.id = "registerView";
    $("#form").parentNode.insertBefore(regBox, $("#form"));
  }

  if (isRegister) {
    if (d.status === "saved") {
      regBox.innerHTML = `<p class="muted">This register document is already saved.</p>`;
    } else {
      const rowsHtml = x.invoices.map((inv, i) => {
        const rowChecks = checks[i] || checks[String(i)] || {};
        const hasErr = Object.keys(rowChecks).length > 0;
        const errText = hasErr ? Object.entries(rowChecks).map(([k, v]) => `${k}: ${v}`).join(", ") : "";

        return `<tr class="${hasErr ? "warn" : ""}">
          <td>${esc(inv.document_number || `Row ${i + 1}`)}</td>
          <td>${esc(inv.issue_date || "-")}</td>
          <td>${esc(inv.customer_name || "-")}</td>
          <td style="text-align:right">${money(inv.total, inv.currency)}</td>
          <td>${esc(inv.payment_status)}</td>
          <td><small class="muted">${esc(errText)}</small></td>
        </tr>`;
      }).join("");

      regBox.innerHTML = `
        <div class="register-container">
          <h3>Register Preview (${x.invoices.length} invoices)</h3>
          ${Object.keys(checks).length ? `<p class="warn-text">Some rows have warnings/checks needed.</p>` : ""}
          <div class="sheet">
            <table>
              <thead>
                <tr><th>Number</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th><th>Notes</th></tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <button type="button" id="importRegisterBtn" class="btn primary">Import all ${x.invoices.length}</button>
        </div>
      `;

      $("#importRegisterBtn").onclick = async () => {
        try {
          const r = await api(`/documents/${current}/confirm-register`, { method: "POST" });
          toast(`Saved ${r.saved} invoices to ledger`);
          current = null;
          regBox.innerHTML = `<p class="muted">Register successfully imported.</p>`;
          loadList();
        } catch (err) {
          toast(err.message, true);
        }
      };
    }
    regBox.hidden = false;
  } else {
    regBox.hidden = true;
    if (!x || d.status === "saved") {
      $("#state").textContent = d.status === "failed" ? "Reading failed: " + d.error : d.status === "saved" ? "This document is already saved." : "Still being read…";
      return;
    }

    $$("[data-f]").forEach(i => {
      i.value = x[i.dataset.f] ?? (i.dataset.f === "payment_status" ? "pending" : "");
      const m = checks[i.dataset.f];
      i.classList.toggle("warn", !!m);
      i.parentElement.querySelector(".msg").textContent = m || "";
    });

    $("#lines").innerHTML = "";
    (x.line_items || []).forEach(addLine);

    $("#lineMsg").textContent = [
      checks.line_items,
      ...Object.entries(checks).filter(([k]) => k.startsWith("line_")).map(([k, v]) => `Row ${+k.slice(5) + 1}: ${v}`)
    ].filter(Boolean).join(" · ");

    $$("#lines tr").forEach((tr, i) => tr.classList.toggle("warn", !!checks["line_" + i]));
  }

  loadList();
}

function collect() {
  const o = {};
  $$("[data-f]").forEach(i => o[i.dataset.f] = i.value === "" ? null : i.value);
  o.line_items = $$("#lines tr").map(tr => Object.fromEntries([...tr.querySelectorAll("[data-l]")].map(i => [i.dataset.l, i.value])));
  return o;
}

$("#form").onsubmit = async e => {
  e.preventDefault();
  try {
    await api(`/documents/${current}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collect())
    });
    toast("Saved to ledger");
    current = null;
    $("#form").hidden = true;
    $("#preview").innerHTML = `<p class="muted">Pick a document from the queue.</p>`;
    loadList();
  } catch (err) {
    toast(err.message, true);
  }
};

$("#discard").onclick = async () => {
  if (!confirm("Discard this document?")) return;
  await api("/documents/" + current, { method: "DELETE" });
  current = null;
  $("#form").hidden = true;
  loadList();
};

$("#retry").onclick = async () => {
  await api(`/documents/${current}/retry`, { method: "POST" });
  toast("Reading again…");
  loadList();
};

// ----- Dashboard -----
async function loadDashboard() {
  try {
    const d = await api("/dashboard");

    // Compute Total Revenue across ALL months in monthly series
    const totalAllMonths = (d.monthly || []).reduce((acc, m) => acc + (Number(m.total) || 0), 0);
    $("#kTotalRev").textContent = money(totalAllMonths);

    // Current month revenue & other KPIs
    $("#kRev").textContent = money(d.kpis.revenue);
    $("#kDocs").textContent = d.kpis.docs;
    $("#kOut").textContent = money(d.kpis.outstanding);
    $("#kOutN").textContent = d.kpis.outstanding_count + " unpaid invoices";

    // Chart rendering
    if (window.Chart) {
      chart?.destroy();
      const ctx = $("#chart").getContext("2d");

      chart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: d.monthly.map(m => m.label),
          datasets: [{
            data: d.monthly.map(m => m.total),
            borderRadius: 8,
            borderSkipped: false,
            backgroundColor: d.monthly.map((_, i) => i === d.monthly.length - 1 ? "#0F766E" : "#CBD5E1"),
            hoverBackgroundColor: "#0D9488"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: context => money(context.raw)
              }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              beginAtZero: true,
              grid: { color: "#E2E8F0" },
              ticks: { callback: value => money(value) }
            }
          }
        }
      });
    }

    // Alerts
    $("#alerts").innerHTML = d.alerts.length ? d.alerts.map(a => `
      <li class="alert ${a.days_overdue > 0 ? "" : "soon"}">
        <div>
          <b>${esc(a.customer)}</b>
          <div class="muted">${esc(a.number || "Invoice")} · ${money(a.total)} · ${a.days_overdue > 0 ? a.days_overdue + " days overdue" : "due in " + -a.days_overdue + " days"}</div>
        </div>
        <button class="btn sec" data-pay="${a.id}">Mark paid</button>
      </li>
    `).join("") : `<li class="muted">Nothing overdue. All invoices paid.</li>`;

    $$("[data-pay]").forEach(b => b.onclick = async () => {
      await api(`/invoices/${b.dataset.pay}/pay`, { method: "POST" });
      loadDashboard();
    });

    // Customer & Product breakdowns
    const max = Math.max(...d.customers.map(c => c.total), 1);
    $("#customers").innerHTML = d.customers.length ? d.customers.map(c => `
      <li>
        <div class="split"><span>${esc(c.name)}</span><span>${money(c.total)}</span></div>
        <div class="bar"><i style="width:${(c.total / max) * 100}%"></i></div>
      </li>
    `).join("") : `<li class="muted">No customers recorded yet.</li>`;

    $("#products").innerHTML = d.products.length ? d.products.map(p => `
      <li class="split"><span>${esc(p.name)}</span><span class="muted">${p.qty} sold</span></li>
    `).join("") : `<li class="muted">No line items recorded yet.</li>`;

  } catch (e) {
    toast(e.message, true);
  }
}

// ----- Risk Check -----
const SEV = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const SEV_COLOR = { critical: "var(--rose)", high: "var(--orange)", medium: "var(--amber)", low: "var(--brand)" };
const sevOf = s => (SEV[s] ? s : "low");
const isPending = s => s === "queued" || s === "processing";
const RISK_OK = /\.(pdf|docx|txt|eml|png|jpe?g|webp)$/i;

let riskCurrent = null;
let riskCurrentStatus = null;
let riskPending = false;
let riskStream = null; // live connection to the server while the AI is working
let riskStreamId = null;
let riskLive = null;

const when = t => {
  const d = new Date(t);
  return isNaN(d) ? "" : d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
};

// File picking (click or drop)
const rf = $("#riskFile");
const showRiskFile = () => $("#riskFileName").textContent = rf.files[0] ? rf.files[0].name : "PDF, DOCX, TXT, EML or image";
rf.onchange = showRiskFile;

const rd = $("#riskDrop");
["dragenter", "dragover"].forEach(ev => rd.addEventListener(ev, e => { e.preventDefault(); rd.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => rd.addEventListener(ev, e => { e.preventDefault(); rd.classList.remove("over"); }));
rd.addEventListener("drop", e => {
  if (e.dataTransfer.files.length) {
    rf.files = e.dataTransfer.files;
    showRiskFile();
  }
});

// Send to the local AI
$("#riskRun").onclick = async () => {
  const text = $("#riskText").value.trim();
  const file = rf.files[0];
  const checks = $$("#riskChecks input:checked").map(i => i.value);

  if (!text && !file) return toast("Paste some text or choose a file first.", true);
  if (file && !RISK_OK.test(file.name)) return toast("Unsupported file. Use PDF, DOCX, TXT, EML or an image.", true);
  if (!checks.length) return toast("Pick at least one thing to check.", true);

  const fd = new FormData();
  if (file) fd.append("file", file);
  if (text) fd.append("text", text);
  fd.append("checks", checks.join(","));

  const btn = $("#riskRun");
  btn.disabled = true;
  try {
    const r = await api("/checks", { method: "POST", body: fd });
    $("#riskText").value = "";
    rf.value = "";
    showRiskFile();
    toast("Analysing…");
    await openRisk(r.id);
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
};

async function loadRisk() {
  try {
    const items = await api("/checks");
    $("#riskList").innerHTML = items.length ? items.map(i => {
      const pend = isPending(i.status);
      const chip = pend ? `<span class="rk-sev pending">Analysing…</span>`
        : i.status === "failed" ? `<span class="rk-sev critical">Failed</span>`
          : `<span class="rk-sev ${sevOf(i.severity)}">${SEV[sevOf(i.severity)]}</span>`;
      return `<li><button class="rk-item ${String(i.id) === String(riskCurrent) ? "on" : ""}" data-id="${esc(i.id)}">
        <b>${esc(i.name)}</b>
        <div class="rk-row"><span class="rk-small">${esc(i.kind || "Document")} · ${esc(when(i.created_at))}</span>${chip}</div>
      </button></li>`;
    }).join("") : `<li class="rk-empty">No checks yet. Paste some text or upload a file to begin.</li>`;

    $$(".rk-item").forEach(b => b.onclick = () => openRisk(b.dataset.id));
    riskPending = items.some(i => isPending(i.status));
    $("#health").className = "pill";
    $("#health").textContent = "Connected · running locally";
  } catch (e) {
    const offline = e instanceof TypeError; // fetch failed = server really unreachable
    $("#riskList").innerHTML = `<li class="rk-empty">${offline ? "Can't reach the API." : "Risk Check isn't available on the server yet (" + esc(e.message) + ")."}</li>`;
    if (offline) {
      $("#health").className = "pill bad";
      $("#health").textContent = "Can't reach the API";
    }
  }
}

const sevFor = s => (s >= 80 ? "critical" : s >= 60 ? "high" : s >= 30 ? "medium" : "low");

function stopStream() {
  riskStream?.close();
  riskStream = null;
  riskStreamId = null;
  riskLive = null;
}

// Watch the AI work: steps and red flags appear as the model writes them
function startStream(id, name) {
  stopStream();
  riskStreamId = String(id);
  riskLive = { name, stage: "queued", p: null };
  const es = new EventSource(`${API}/checks/${id}/stream`);
  riskStream = es;

  es.addEventListener("stage", e => { if (riskStream === es) { riskLive.stage = JSON.parse(e.data).stage; paintLive(id); } });
  es.addEventListener("partial", e => { if (riskStream === es) { riskLive.p = JSON.parse(e.data); paintLive(id); } });
  es.addEventListener("done", () => { if (riskStream === es) { stopStream(); openRisk(id); } });
  es.addEventListener("failed", () => { if (riskStream === es) { stopStream(); openRisk(id); } });
  es.onerror = () => {
    // Connection dropped: fall back to the 2.5 s polling, which reconnects on its next tick
    if (riskStream !== es) return;
    stopStream();
    $("#riskDetail").innerHTML = `<div class="empty-state"><p>Reconnecting to the AI…</p></div>`;
  };

  paintLive(id);
}

function paintLive(id) {
  if (String(riskCurrent) !== String(id) || !riskLive) return;
  const { name, stage, p } = riskLive;
  const list = a => (Array.isArray(a) ? a : []);
  const steps = list(p?.steps).filter(s => s && s.title);
  const flags = list(p?.flags).filter(f => f && f.title);
  const wait = { queued: "Waiting for the AI to finish another job…", reading: "Reading the document…", analysing: steps.length ? "Thinking…" : "Starting up the AI…" }[stage] || "Working…";
  const ready = p && p.verdict !== undefined && p.score != null;
  const score = Math.round(Number(p?.score) || 0);
  const sev = sevFor(score);

  $("#riskDetail").innerHTML = `
    <div class="rk-live-head"><span class="rk-dot"></span><b>${esc(name)}</b><span class="rk-small">${wait}</span></div>
    ${steps.length ? `<h3 class="rk-h">AI thought process</h3>
      <ol class="rk-steps">${steps.map((s, i) => `<li class="${i === steps.length - 1 && !ready ? "live" : ""}"><b>${esc(s.title)}</b>${esc(s.detail)}</li>`).join("")}</ol>` : ""}
    ${flags.length ? `<h3 class="rk-h" style="margin-top:8px">Red flags found so far</h3>
      ${flags.map(f => `<div class="rk-flag ${sevOf(f.severity)}"><b>${esc(f.title)}</b>${f.quote ? `<q>${esc(f.quote)}</q>` : ""}<p>${esc(f.why)}</p></div>`).join("")}` : ""}
    ${ready ? `<div class="rk-verdict" style="margin-top:20px">${gauge(sev, score)}<div><span class="rk-sev ${sev}">${SEV[sev]} severity</span><h2>${esc(p.verdict)}</h2><p>${esc(p.summary)}</p></div></div>` : ""}`;
}

async function openRisk(id) {
  riskCurrent = id;
  try {
    const d = await api("/checks/" + id);
    riskCurrentStatus = d.status;

    if (isPending(d.status)) {
      if (riskStreamId !== String(id)) startStream(id, d.name);
      else paintLive(id);
    } else {
      stopStream();
      renderRisk(d);
    }
  } catch (e) {
    toast(e.message, true);
  }
  loadRisk();
}

function gauge(sev, score) {
  const len = Math.PI * 80;
  const off = len * (1 - Math.min(Math.max(score, 0), 100) / 100);
  return `<div class="rk-gauge">
    <svg viewBox="0 0 200 110" role="img" aria-label="Risk ${score} out of 100">
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#E2E8F0" stroke-width="16" stroke-linecap="round"/>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="${SEV_COLOR[sev]}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${off}"/>
    </svg>
    <div class="num" style="color:${SEV_COLOR[sev]}">${score}</div>
    <div class="lbl">Risk score / 100</div>
  </div>`;
}

function renderRisk(d) {
  const box = $("#riskDetail");

  if (isPending(d.status)) {
    box.innerHTML = `<div class="empty-state"><p><b>${esc(d.name)}</b></p><p>The local AI is reading this document. This can take a minute…</p></div>`;
    return;
  }
  if (d.status === "failed" || !d.result) {
    box.innerHTML = `<div class="empty-state"><p><b>${esc(d.name)}</b></p><p>Analysis failed: ${esc(d.error || "no result returned")}</p></div>
      <div class="rk-actions"><button class="btn sec" data-act="retry">Re-run check</button><button class="btn sec" data-act="delete">Delete</button></div>`;
    return;
  }

  const r = d.result;
  const sev = sevOf(r.severity);
  const score = Math.round(Number(r.score) || 0);
  const fit = Math.min(Math.max(Math.round(Number(r.business_fit) || 0), 0), 100);
  const list = a => Array.isArray(a) ? a : [];

  box.innerHTML = `
    <div class="rk-verdict">
      ${gauge(sev, score)}
      <div>
        <span class="rk-sev ${sev}">${SEV[sev]} severity</span>
        <h2>${esc(r.verdict)}</h2>
        <div class="rk-tags">${list(r.tags).map(t => `<span class="rk-tag">${esc(t)}</span>`).join("")}</div>
        <p>${esc(r.summary)}</p>
      </div>
    </div>

    <div class="rk-cols">
      <div>
        <h3 class="rk-h">Red flags found</h3>
        ${list(r.flags).length ? list(r.flags).map(f => `<div class="rk-flag ${sevOf(f.severity)}"><b>${esc(f.title)}</b>${f.quote ? `<q>${esc(f.quote)}</q>` : ""}<p>${esc(f.why)}</p></div>`).join("") : `<p class="rk-empty">No red flags found.</p>`}
      </div>
      <div>
        <h3 class="rk-h">Does it do you good?</h3>
        <div class="rk-row"><span style="font-size:13px;font-weight:600">Business fit</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:700">${fit}%</span></div>
        <div class="rk-meter"><i style="width:${fit}%"></i></div>
        <div style="margin-top:10px">
          ${list(r.pros).map(p => `<div class="rk-pro">${esc(p)}</div>`).join("")}
          ${list(r.cons).map(p => `<div class="rk-con">${esc(p)}</div>`).join("")}
        </div>
      </div>
    </div>

    <details class="rk-think" open>
      <summary>AI thought process</summary>
      <ol class="rk-steps">${list(r.steps).map(s => `<li><b>${esc(s.title)}</b>${esc(s.detail)}</li>`).join("")}</ol>
    </details>

    ${list(r.actions).length ? `<h3 class="rk-h">Recommended next steps</h3><ul class="rk-next">${list(r.actions).map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}

    <div class="rk-actions">
      <button class="btn primary" data-act="review"${d.reviewed ? " disabled" : ""}>${d.reviewed ? "Reviewed" : "Mark as reviewed"}</button>
      <button class="btn sec" data-act="retry">Re-run check</button>
      <button class="btn sec" data-act="delete">Delete</button>
    </div>
    <p class="rk-note">AI assessment is guidance, not legal advice. Have important contracts reviewed by a professional.</p>`;
}

$("#riskDetail").onclick = async e => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act || !riskCurrent) return;
  try {
    if (act === "review") {
      await api(`/checks/${riskCurrent}/review`, { method: "POST" });
      toast("Marked as reviewed");
      openRisk(riskCurrent);
    } else if (act === "retry") {
      await api(`/checks/${riskCurrent}/retry`, { method: "POST" });
      toast("Analysing again…");
      openRisk(riskCurrent);
    } else if (act === "delete") {
      if (!confirm("Delete this check?")) return;
      await api("/checks/" + riskCurrent, { method: "DELETE" });
      riskCurrent = null;
      $("#riskDetail").innerHTML = `<div class="empty-state"><p>Run a check or select one from the list.</p></div>`;
      loadRisk();
    }
  } catch (err) {
    toast(err.message, true);
  }
};

// Poll while something is still being analysed
setInterval(() => {
  if ($("#view-risk").hidden) return;
  if (riskPending) loadRisk();
  if (riskCurrent && isPending(riskCurrentStatus) && !riskStream) openRisk(riskCurrent);
}, 2500);

show(["documents", "dashboard", "risk"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "documents");