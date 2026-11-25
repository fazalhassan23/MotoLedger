function csvRows(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      cell = "";
      row = [];
    } else cell += c;
  }
  if (quoted) throw Error("A quoted CSV field is incomplete.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function readFuelio(raw) {
  const groups = Object.create(null);
  let group = null,
    header = null;
  for (const row of csvRows(raw.replace(/^\uFEFF/, ""))) {
    if (row[0].startsWith("## ")) {
      group = row[0].slice(3).trim();
      if (groups[group]) throw Error("Import a single vehicle at a time.");
      groups[group] = { rows: [] };
      header = null;
      continue;
    }
    if (!group) continue;
    if (!header) {
      header = row.map((s) => s.trim().toLowerCase());
      groups[group].header = header;
      continue;
    }
    groups[group].rows.push(
      Object.fromEntries(header.map((h, i) => [h, row[i]?.trim() || ""])),
    );
  }
  const meta = groups.Vehicle?.rows[0],
    log = groups.Log;
  if (!meta || !log?.header)
    throw Error(
      "Choose a single-vehicle Fuelio CSV containing Vehicle and Log sections.",
    );
  const oh = log.header.find((k) => /^odo\b/.test(k)),
    fh = log.header.find((k) => /^fuel\s*\(/.test(k)),
    ph = log.header.find((k) => /^price\b/.test(k));
  const us = /\bmi\b/.test(oh) && /us gal/.test(fh),
    metric = /\bkm\b/.test(oh) && /lit(er|re)|\(l\)/.test(fh);
  if (!us && !metric)
    throw Error(
      "Supported units are miles with US gallons, or kilometers with liters.",
    );
  if (+meta.tankcount > 1 || log.rows.some((r) => +r.tanknumber > 1))
    throw Error("This importer supports single-tank vehicles.");
  if (meta.importcsvdateformat && meta.importcsvdateformat !== "yyyy-MM-dd")
    throw Error("Use the yyyy-MM-dd date format in the source CSV.");
  const issues = [],
    logs = [],
    fuel = [],
    validDate = (s) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      Number.isFinite(Date.parse(s)) &&
      new Date(s).toISOString().startsWith(s);
  for (const [i, r] of log.rows.entries()) {
    let date = (r.data || r.date || "").slice(0, 10),
      qty = Number(r[fh]),
      odo = +r[oh],
      price = +r.volumeprice || +r[ph] / qty,
      cost = r[ph] ? +r[ph] : Math.round(price * qty * 100) / 100;
    if (
      !validDate(date) ||
      !r[oh] ||
      ![qty, odo, price, cost].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 1e10,
      ) ||
      qty <= 0 ||
      price <= 0 ||
      !["1", "0"].includes(r.full) ||
      (r.missed === "1" && r.full === "0")
    ) {
      issues.push(
        `Fuel row ${i + 1} · invalid values or incomplete tank after a missed fill`,
      );
      continue;
    }
    fuel.push({
      id: Model.id(),
      type: "Fuel",
      name: (
        r["station name"] ||
        r["city (optional)"] ||
        "Imported fill-up"
      ).slice(0, 180),
      date,
      qty,
      odo,
      price,
      cost,
      tank:
        r.missed === "1"
          ? "After missed fill"
          : r.full === "0"
            ? "Partial"
            : "Full",
      row: i + 1,
      source: r,
    });
  }
  let last = null;
  for (const e of fuel.sort((a, b) => a.odo - b.odo)) {
    if (last && (e.odo === last.odo || e.date < last.date)) {
      issues.push(`Fuel row ${e.row} · odometer and date conflict (${e.date})`);
      continue;
    }
    last = e;
    delete e.row;
    logs.push(e);
  }
  for (const [i, r] of (groups.Costs?.rows || []).entries()) {
    if (
      !validDate((r.date || "").slice(0, 10)) ||
      !r.cost ||
      !Number.isFinite(+r.cost) ||
      +r.cost < 0 ||
      +r.cost > 1e10 ||
      r.istemplate === "1"
    ) {
      issues.push(
        `Expense row ${i + 1} · invalid cost, date, or reminder template`,
      );
      continue;
    }
    logs.push({
      id: Model.id(),
      type: "Expense",
      date: r.date.slice(0, 10),
      name: (r.costtitle || "Imported expense").slice(0, 180),
      cost: +r.cost,
      source: r,
    });
  }
  if (!logs.length)
    throw Error("No eligible fuel or expense entries were found.");
  return {
    issues,
    v: {
      name: (meta.name || "Imported vehicle").slice(0, 180),
      detail: (meta.description || "Fuelio import").slice(0, 180),
      base: logs.find((e) => e.type === "Fuel")?.odo || 0,
      id: Model.id(),
      budget: 0,
      system: us ? "us" : "metric",
      logs,
      services: [],
      fuelio: groups,
    },
  };
}
async function previewMigration(file) {
  if (!file) return;
  if (file.size > 5e6) throw Error("Choose a CSV smaller than 5 MB.");
  const raw = await file.text(),
    { v, issues } = readFuelio(raw);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  v.sourceHash = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  if (state.vehicles.some((x) => x.sourceHash === v.sourceHash))
    throw Error("This file has already been imported.");
  const count = v.logs.filter((e) => e.type === "Fuel").length;
  show(
    "Preview Fuelio import",
    `<p><b>${esc(v.name)}</b> · ${v.system === "us" ? "Miles and US gallons" : "Kilometers and liters"}</p><p class="helper">${count} fill-ups and ${v.logs.length - count} expense entries will be added to a separate vehicle. Excluded rows · ${issues.length}. Service reminders, location data, and notes are outside this import.</p>${issues.length ? `<details><summary>Review excluded rows</summary><ul>${issues.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></details>` : ""}<div class="fields">${select("currency", "Source currency", ["USD", "BDT", "GBP", "EUR", "CAD"], "USD")}${select("fuel", "Vehicle fuel", ["Gasoline", "Diesel", "Hybrid", "LPG"], "Gasoline")}</div>`,
    "Import vehicle",
    (d) =>
      modify((s) => {
        if (s.vehicles.some((x) => x.sourceHash === v.sourceHash))
          throw Error("Already imported.");
        s.vehicles.push({ ...v, ...d });
        s.active = v.id;
      }),
  );
}
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-act="migrate"]')) $("#fuelioFile").click();
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "fuelioFile") {
    try {
      await previewMigration(e.target.files[0]);
    } catch (err) {
      toast(err.message);
    }
    e.target.value = "";
  }
});
