"use strict";
const Model = (() => {
  const key = "motorledger.v1";
  const id = () => crypto.randomUUID();
  function day(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  }
  function seed() {
    const v = {
      id: "demo",
      name: "Mazda MX-5 Miata",
      detail: "2026 · Sport · 2.0L",
      fuel: "Gasoline",
      currency: "USD",
      system: "us",
      budget: 180,
      base: 14620,
      logs: [],
      services: [],
    };
    const economy = [
      29.1, 30.6, 29.5, 32.4, 31.7, 33.8, 32.1, 34.5, 33.2, 34.8, 33.5, 35.3,
    ];
    let odo = v.base;
    for (let i = 0; i <= 12; i++) {
      const qty = 8.1 + (i % 4) * 0.36,
        price = 3.49 - (i % 3) * 0.09;
      if (i) odo += Math.round(qty * economy[i - 1]);
      v.logs.push({
        id: id(),
        type: "Fuel",
        date: day(-85 + 7 * i),
        name: ["Shell Riverside", "Costco Fuel", "Chevron Central"][i % 3],
        odo,
        qty,
        price,
        cost: Math.round(qty * price * 100) / 100,
        tank: "Full",
      });
    }
    v.logs.push(
      {
        id: id(),
        type: "Expense",
        date: day(-5),
        name: "Downtown parking",
        cost: 12,
      },
      {
        id: id(),
        type: "Expense",
        date: day(-24),
        name: "Wheel alignment",
        cost: 85,
      },
    );
    v.services = [
      { id: id(), name: "Engine oil change", due: odo + 340, done: false },
      { id: id(), name: "Tire rotation", due: odo + 1250, done: false },
      { id: id(), name: "Air filter inspection", due: odo + 2800, done: false },
    ];
    return { version: 1, active: v.id, vehicles: [v] };
  }
  const ordered = (v) =>
    v.logs.filter((e) => e.type === "Fuel").sort((a, b) => a.odo - b.odo);
  const odometer = (v) =>
    [
      ...v.logs.filter((e) => e.type === "Fuel").map((e) => e.odo),
      ...(v.trips || []).map((t) => t.end),
    ].reduce((max, n) => Math.max(max, n), v.base);
  function intervals(v) {
    let anchor = null,
      volume = 0;
    const out = [];
    for (const e of ordered(v)) {
      if (e.tank === "After missed fill") {
        anchor = e;
        volume = 0;
        continue;
      }
      if (anchor) volume += e.qty;
      if (e.tank === "Partial") continue;
      if (anchor && volume > 0)
        out.push({
          date: e.date,
          distance: e.odo - anchor.odo,
          volume,
          rate: (e.odo - anchor.odo) / volume,
        });
      anchor = e;
      volume = 0;
    }
    return out;
  }
  const average = (arr) =>
    arr.length
      ? arr.reduce((s, e) => s + e.distance, 0) /
        arr.reduce((s, e) => s + e.volume, 0)
      : null;
  const validNumber = (n) => Number.isFinite(n) && n >= 0 && n <= 1e10;
  const str = (s) => typeof s === "string" && s.length > 0 && s.length <= 180;
  const validId = (s) =>
    typeof s === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(s);
  const unique = (arr) =>
    Array.isArray(arr) &&
    arr.every((x) => x && validId(x.id)) &&
    new Set(arr.map((x) => x.id)).size === arr.length;
  const dateOk = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  function valid(s) {
    return (
      !!s &&
      s.version === 1 &&
      unique(s.vehicles) &&
      s.vehicles.some((v) => v.id === s.active) &&
      s.vehicles.every((v) => {
        if (
          !str(v.name) ||
          !str(v.fuel) ||
          typeof v.detail !== "string" ||
          !["USD", "BDT", "GBP", "EUR", "CAD"].includes(v.currency) ||
          !["us", "metric"].includes(v.system) ||
          !validNumber(v.base) ||
          !validNumber(v.budget) ||
          !unique(v.logs) ||
          !unique(v.services)
        )
          return false;
        if (
          !v.logs.every(
            (e) =>
              str(e.name) &&
              dateOk(e.date) &&
              validNumber(e.cost) &&
              (e.type === "Expense" ||
                (e.type === "Fuel" &&
                  validNumber(e.odo) &&
                  e.odo >= v.base &&
                  validNumber(e.qty) &&
                  e.qty > 0 &&
                  validNumber(e.price) &&
                  e.price > 0 &&
                  ["Full", "Partial", "After missed fill"].includes(e.tank))),
          )
        )
          return false;
        if (
          v.trips !== undefined &&
          (!unique(v.trips) ||
            !v.trips.every(
              (t) =>
                str(t.name) &&
                dateOk(t.date) &&
                ["Business", "Personal"].includes(t.purpose) &&
                validNumber(t.start) &&
                validNumber(t.end) &&
                t.end > t.start &&
                validNumber(t.rate),
            ))
        )
          return false;
        const a = ordered(v);
        return (
          a.every(
            (e, i) => !i || (e.odo > a[i - 1].odo && e.date >= a[i - 1].date),
          ) &&
          v.services.every(
            (e) =>
              str(e.name) && validNumber(e.due) && typeof e.done === "boolean",
          )
        );
      })
    );
  }
  return { key, id, day, seed, ordered, odometer, intervals, average, valid };
})();
if (typeof module !== "undefined") module.exports = Model;
