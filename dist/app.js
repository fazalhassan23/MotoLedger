"use strict";
const $ = (s) => document.querySelector(s),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const icon = (n) => `<i data-lucide="${n}"></i>`,
  drawIcons = () => lucide.createIcons(),
  btn = (s, action, cls = "", i = "") =>
    `<button type="button" class="${cls}" data-act="${action}">${i ? icon(i) : ""}${s}</button>`;
const pages = {
  Overview: "layout-dashboard",
  Logbook: "book-open",
  Maintenance: "wrench",
  Garage: "car-front",
  "Trip planner": "route",
  "Station prices": "map-pin",
  "Data & backups": "database",
};
let state,
  loadFailed = false;
try {
  const raw = localStorage.getItem(Model.key);
  state = raw ? JSON.parse(raw) : Model.seed();
  if (!Model.valid(state)) throw Error();
  localStorage.setItem(Model.key, JSON.stringify(state));
} catch {
  loadFailed = true;
  state = Model.seed();
}
let vehicle,
  page = "Overview",
  range = 90,
  filter = "All",
  search = "",
  dialogAction,
  toastTimer;
function toast(msg) {
  $("#toast").textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").textContent = ""), 4000);
}
function modify(fn) {
  if (loadFailed)
    throw Error(
      "Browser storage is unavailable or unreadable. Open a fresh browser profile or restore access before saving.",
    );
  const disk = JSON.parse(localStorage.getItem(Model.key));
  if (!Model.valid(disk)) throw Error("Stored garage could not be read.");
  let draft = structuredClone(disk);
  fn(
    draft,
    draft.vehicles.find((v) => v.id === vehicle.id),
  );
  if (!Model.valid(draft))
    throw Error(
      "Check the odometer and date order. Each fill-up needs a distinct reading at or above the starting odometer.",
    );
  localStorage.setItem(Model.key, JSON.stringify(draft));
  state = draft;
  render();
}
const u = () =>
  vehicle.system === "us"
    ? { d: "mi", v: "US gal", e: "MPG" }
    : { d: "km", v: "L", e: "km/L" };
const num = (x, dec = 0) =>
  Number(x).toLocaleString(undefined, {
    maximumFractionDigits: dec,
    minimumFractionDigits: dec,
  });
const money = (n, digits = 2) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: vehicle.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
const date = (s) =>
  new Date(s + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const latest = () => Model.ordered(vehicle).at(-1),
  monthLogs = () =>
    vehicle.logs.filter((e) => e.date.startsWith(Model.day().slice(0, 7))),
  total = (arr) => arr.reduce((s, e) => s + e.cost, 0);
const tiles = (i, c) => `<span class="tile ${c}">${icon(i)}</span>`,
  empty = (t) => `<p class="empty">${t}</p>`;
function heading(t, sub, act = "") {
  return `<div class="heading"><div><h1>${t}</h1><p class="sub">${sub}</p></div>${act}</div>`;
}
function metric(t, val, note, i, c) {
  return `<div class="metric"><div class="khead">${t}${tiles(i, c)}</div><div class="value">${val}</div><small>${note}</small></div>`;
}
function serviceList(full = false) {
  let arr = [...vehicle.services]
    .filter((s) => full || !s.done)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.due - b.due);
  if (!full) arr = arr.slice(0, 3);
  return arr.length
    ? arr
        .map((s) => {
          let left = s.due - Model.odometer(vehicle);
          return `<div class="record">${tiles("wrench", s.done ? "green" : "")}<div><strong>${esc(s.name)}</strong><small>${num(s.due)} ${u().d}</small></div><span class="tag ${!s.done && left <= 500 ? "soon" : ""}">${s.done ? "Completed" : left < 0 ? `${num(-left)} ${u().d} overdue` : left === 0 ? "Due now" : `In ${num(left)} ${u().d}`}</span>${full ? btn(s.done ? "Reopen" : "Complete", "service-" + s.id) : ""}</div>`;
        })
        .join("")
    : empty("No upcoming services. Add a reminder in Maintenance.");
}
function rows(arr, full = false) {
  if (!arr.length) return empty("No matching entries.");
  return `<div class="tablewrap"><table><thead><tr><th>Entry</th><th>Date</th><th>Odometer</th><th>Amount</th>${full ? "<th></th>" : ""}</tr></thead><tbody>${arr.map((e) => `<tr><td><div class="row">${tiles(e.type === "Fuel" ? "fuel" : "receipt", e.type === "Fuel" ? "orange" : "blue")}<div><b>${esc(e.name)}</b><small>${e.type === "Fuel" ? `${num(e.qty, 2)} ${u().v} · ${esc(e.tank)}` : "Expense"}</small></div></div></td><td>${date(e.date)}, ${e.date.slice(0, 4)}</td><td>${e.type === "Fuel" ? num(e.odo) + " " + u().d : "—"}</td><td><b>${money(e.cost)}</b></td>${full ? `<td>${btn("Edit", "edit-" + e.id)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}
const sortedLogs = () =>
  [...vehicle.logs].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.odo || 0) - (a.odo || 0),
  );
function chartCard() {
  let arr = Model.intervals(vehicle).filter(
    (e) => e.date >= Model.day(-range + 1),
  );
  let chart = empty("Log two full tanks to see measured fuel economy.");
  if (arr.length) {
    let low = Math.max(0, Math.floor(Math.min(...arr.map((e) => e.rate))) - 1),
      high = Math.ceil(Math.max(...arr.map((e) => e.rate))) + 1;
    const x = (i) => 44 + (arr.length === 1 ? 0.5 : i / (arr.length - 1)) * 452,
      y = (r) => 112 - ((r - low) / (high - low)) * 94;
    const path = arr
      .map((e, i) => (i ? "L" : "M") + x(i) + "," + y(e.rate))
      .join(" ");
    const grid = [0, 1, 2, 3]
      .map((i) => {
        let val = low + ((high - low) * i) / 3;
        return `<text x="1" y="${y(val) + 4}">${num(val, 1)}</text><path d="M40 ${y(val)} H498" stroke="#dbe2d9" stroke-dasharray="3 4"/>`;
      })
      .join("");
    chart = `<svg class="chart" viewBox="0 0 515 140" role="img" aria-label="Fuel economy by full-tank interval"><defs><linearGradient id="wash" x2="0" y2="1"><stop stop-color="#f0783d" stop-opacity=".24"/><stop offset="1" stop-color="#f0783d" stop-opacity=".01"/></linearGradient></defs>${grid}<path d="${path} L${x(arr.length - 1)} 112 L${x(0)} 112 Z" fill="url(#wash)"/><path d="${path}" fill="none" stroke="#e76b2e" stroke-width="3" stroke-linejoin="round"/>${arr.map((e, i) => `<circle cx="${x(i)}" cy="${y(e.rate)}" r="3.5" fill="white" stroke="#e76b2e" stroke-width="2"><title>${e.date} · ${num(e.rate, 1)} ${u().e}</title></circle>`).join("")}${arr.map((e, i) => (i === 0 || i === arr.length - 1 || (arr.length > 5 && i === Math.floor(arr.length / 2)) ? `<text x="${x(i)}" y="135" text-anchor="middle">${date(e.date)}</text>` : "")).join("")}</svg>`;
  }
  return `<section class="panel"><div class="split"><h2>Fuel economy</h2><select aria-label="Chart period" id="range" class="chartselect">${[30, 90, 365].map((n) => `<option ${n === range ? "selected" : ""} value="${n}">${n} days</option>`).join("")}</select></div><div class="legend"><span class="dot"></span>Measured ${u().e} per full tank</div>${chart}</section>`;
}
function overview() {
  const av = Model.average(Model.intervals(vehicle)),
    mo = monthLogs(),
    distance = Model.odometer(vehicle) - vehicle.base;
  return (
    heading(
      "Garage overview",
      "Fuel, expenses, and service at a glance.",
      btn("Log entry", "entry", "primary", "plus"),
    ) +
    `<section class="hero"><div class="copy"><div class="eyebrow">${icon("car-front")} ACTIVE VEHICLE</div><h2>${esc(vehicle.name)}</h2><p>${esc(vehicle.detail)}</p><div class="chips"><span class="chip">${esc(vehicle.fuel)}</span>${vehicle.id === "demo" ? '<span class="chip">Sample vehicle</span>' : ""}</div></div>${vehicle.id === "demo" ? '<img src="roadster.png" alt="Red Mazda MX-5 Miata">' : ""}</section><div class="metrics">${metric("Odometer", num(Model.odometer(vehicle)) + ` <span class="unit">${u().d}</span>`, `${num(distance)} ${u().d} recorded`, "gauge", "blue")}${metric("Fuel economy", (av ? num(av, 1) : "—") + ` <span class="unit">${u().e}</span>`, "Full-tank average", "activity", "green")}${metric("Fuel spend", money(total(mo.filter((e) => e.type === "Fuel"))), "This calendar month", "fuel", "orange")}${metric("Total expenses", money(total(mo)), "Including fuel this month", "wallet", "purple")}</div><div class="twocol">${chartCard()}<section class="panel"><div class="split sectionhead"><h2>Upcoming service</h2>${btn("View all", "nav-Maintenance", "textbtn")}</div>${serviceList()}</section></div><section class="panel"><div class="split sectionhead"><h2>Recent activity</h2>${btn("Open logbook", "nav-Logbook", "textbtn")}</div>${rows(sortedLogs().slice(0, 4))}</section>`
  );
}
function filtered() {
  return sortedLogs().filter(
    (e) =>
      (filter === "All" || e.type === filter) &&
      e.name.toLowerCase().includes(search.toLowerCase()),
  );
}
function logbook() {
  return (
    heading(
      "Logbook",
      "Your fill-ups and vehicle expenses.",
      btn("Log entry", "entry", "primary", "plus"),
    ) +
    `<section class="panel"><div class="controls"><input id="search" aria-label="Search entries" placeholder="Search entries" value="${esc(search)}"><select id="filter" aria-label="Entry type">${["All", "Fuel", "Expense"].map((t) => `<option ${filter === t ? "selected" : ""}>${t}</option>`).join("")}</select>${btn("Export CSV", "csv", "", "download")}</div><div id="entries">${rows(filtered(), true)}</div></section>`
  );
}
function garage() {
  const spent = total(monthLogs());
  return (
    heading(
      "Garage",
      "Manage vehicles and monthly spending.",
      btn("Add vehicle", "vehicle", "primary", "plus"),
    ) +
    `<div class="twocol"><section class="panel"><h2>Your vehicles</h2>${state.vehicles.map((v) => `<div class="record">${tiles("car-front", "blue")}<div><strong>${esc(v.name)}</strong><small>${esc(v.detail)}</small></div>${v.id === vehicle.id ? '<span class="tag">Selected</span>' : btn("Select", "pick-" + v.id)}</div>`).join("")}</section><section class="panel"><div class="split"><h2>Monthly budget</h2>${btn("Edit", "budget", "textbtn")}</div><p class="sub">${esc(vehicle.name)}</p><div class="value">${money(spent)} <span class="unit">of ${money(vehicle.budget)}</span></div><div class="bar"><span style="width:${Math.min(100, (spent / Math.max(1, vehicle.budget)) * 100)}%"></span></div><small>${money(Math.abs(spent - vehicle.budget))} ${spent > vehicle.budget ? "over budget" : "remaining"} this month</small></section></div>`
  );
}
function input(name, label, value = "", type = "text", extra = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type === "number" ? 'step="any" min="0"' : 'maxlength="180"'} required ${extra}></label>`;
}
function select(name, label, options, current) {
  return `<label>${label}<select name="${name}">${options.map((o) => `<option ${o === current ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
}
function planner() {
  let av = Model.average(Model.intervals(vehicle));
  return (
    heading(
      "Trip planner",
      "Estimate fuel, tolls, and each traveler’s share.",
    ) +
    `<section class="panel block"><h2>Plan a journey</h2><p class="helper">Enter total driving distance, including the return journey if applicable. Adjust the estimate to match your route.</p><form id="planner" class="fields">${input("distance", `Total distance (${u().d})`, 100, "number")}${input("economy", `Expected economy (${u().e})`, av ? numPlain(av) : "", "number")}${input("price", `Price per ${u().v} (${vehicle.currency})`, latest()?.price ?? "", "number")}${input("tolls", `Tolls and parking (${vehicle.currency})`, 0, "number")}${input("people", "Travelers", 1, "number")}</form><div id="estimate" class="result" aria-live="polite"></div></section>`
  );
}
const numPlain = (n) => Number(n.toFixed(2));
function stations() {
  const map = new Map();
  for (const e of Model.ordered(vehicle)) map.set(e.name.toLowerCase(), e);
  let arr = [...map.values()].sort((a, b) => a.price - b.price);
  return (
    heading(
      "Station prices",
      "Compare your last recorded price at each station.",
    ) +
    `<div class="twocol"><section class="panel"><h2>Recorded prices</h2>${arr.map((e) => `<div class="record">${tiles("map-pin", "orange")}<div><strong>${esc(e.name)}</strong><small>${e.date}</small></div><b>${money(e.price, 3)} / ${u().v}</b></div>`).join("") || empty("Add a fill-up to record a station price.")}</section><section class="panel"><h2>Is the detour worth it?</h2><p class="helper">Compare pump savings with fuel used for the extra round trip.</p><form class="fields" id="detour">${input("near", `Usual price / ${u().v}`, latest()?.price ?? "", "number")}${input("away", `Other price / ${u().v}`, arr[0]?.price ?? "", "number")}${input("qty", `Buying (${u().v})`, 10, "number")}${input("distance", `Extra ${u().d}`, 5, "number")}${input("economy", `Economy (${u().e})`, numPlain(Model.average(Model.intervals(vehicle)) || 0) || "", "number")}</form><div id="estimate" aria-live="polite" class="result"></div></section></div>`
  );
}
function calculate() {
  const f = $("#planner") || $("#detour");
  if (!f) return;
  const n = Object.fromEntries(
    [...new FormData(f)].map(([k, v]) => [k, v === "" ? NaN : Number(v)]),
  );
  let msg = "Enter valid values to calculate an estimate.";
  if (
    Object.values(n).every((x) => Number.isFinite(x) && x >= 0) &&
    n.economy > 0
  ) {
    if (
      f.id === "planner" &&
      Number.isInteger(n.people) &&
      n.people > 0 &&
      n.price > 0
    ) {
      const vol = n.distance / n.economy,
        price = vol * n.price + n.tolls;
      msg = `<strong>${money(price)}</strong> estimated total <small>${num(vol, 2)} ${u().v} of fuel · ${money(price / n.people)} per traveler</small>`;
    } else if (f.id === "detour" && n.near > 0 && n.away > 0 && n.qty > 0) {
      let net = (n.near - n.away) * n.qty - (n.distance / n.economy) * n.near;
      msg = `<strong>${money(Math.abs(net))}</strong> ${net >= 0 ? "net savings" : "extra cost"}<small>Detour fuel valued at the usual station’s price.</small>`;
    }
  }
  $("#estimate").innerHTML = msg;
}
function data() {
  return (
    heading("Data & backups", "Keep a portable copy of your garage.") +
    `<div class="twocol"><section class="panel"><h2>Full garage backup</h2><p class="helper">Includes vehicles, fill-ups, expenses, service reminders, and budgets. Restore a Motorledger JSON file on another device.</p><div class="controls">${btn("Download backup", "backup", "", "download")}${btn("Restore backup", "restore", "", "upload")}</div><input id="file" type="file" hidden accept="application/json,.json"></section><section class="panel"><h2>Vehicle report</h2><p class="helper">Download the selected vehicle’s ledger as a spreadsheet-ready CSV with dates, odometers, volume, prices, and costs.</p>${btn("Export all entries", "allcsv", "", "file-down")}</section></div><section class="panel block"><h2>Import from Fuelio</h2><p class="helper">Import fill-ups and expenses from a single-vehicle CSV. Preview entries and excluded rows before saving.</p>${btn("Choose Fuelio CSV", "migrate", "", "file-input")}<input type="file" id="fuelioFile" hidden accept=".csv,text/csv"></section>`
  );
}
function render() {
  vehicle = state.vehicles.find((v) => v.id === state.active);
  let hash;
  try {
    hash = decodeURIComponent(location.hash.slice(1));
  } catch {}
  page = Object.hasOwn(pages, hash) ? hash : "Overview";
  $("#crumb").textContent = page;
  $("#current").textContent = vehicle.name;
  $("#navigation").innerHTML = Object.entries(pages)
    .map(
      ([p, i], n) =>
        (n === 4 ? '<div class="navlabel tools">TOOLS</div>' : "") +
        `<a href="#${encodeURIComponent(p)}" ${page === p ? 'class="active" aria-current="page"' : ""}>${icon(i)}${esc(p)}</a>`,
    )
    .join("");
  const views = {
    Overview: overview,
    Garage: garage,
    Logbook: logbook,
    Maintenance: () =>
      heading(
        "Maintenance",
        "Track service by odometer and mark work complete.",
        btn("Add reminder", "reminder", "primary", "plus"),
      ) + `<section class="panel">${serviceList(true)}</section>`,
    "Trip planner": () => planner() + tripJournal(),
    "Station prices": stations,
    "Data & backups": data,
  };
  $("#content").innerHTML =
    (loadFailed
      ? '<p role="alert">Storage unavailable. Showing a temporary sample garage.</p>'
      : "") + views[page]();
  drawIcons();
  calculate();
}
