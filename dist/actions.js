function show(title, body, save, submit) {
  $("#dialogTitle").textContent = title;
  $("#fields").innerHTML = body;
  $("#error").textContent = "";
  $("#actions").innerHTML = save
    ? `<button type="button" data-act="cancel">Cancel</button><button class="primary">${save}</button>`
    : "";
  dialogAction = submit;
  if (!$("#modal").open) $("#modal").showModal();
  drawIcons();
}
function entry(e = null, kind = e?.type || "Fuel") {
  const fuel = kind === "Fuel",
    last = latest();
  const body = `<div class="fields">${select("kind", "Entry type", ["Fuel", "Expense"], kind)}${input("date", "Date", e?.date || Model.day(), "date", `max="${Model.day()}"`)}${input("name", fuel ? "Station name" : "Expense description", e?.name ?? (fuel ? last?.name || "" : ""))}${fuel ? input("odo", `Odometer (${u().d})`, e?.odo ?? "", "number") + input("qty", `Fuel (${u().v})`, e?.qty ?? "", "number") + input("price", `Price / ${u().v} (${vehicle.currency})`, e?.price ?? last?.price ?? "", "number") + select("tank", "Tank status", ["Full", "Partial", "After missed fill"], e?.tank || "Full") : input("cost", `Total (${vehicle.currency})`, e?.cost ?? "", "number")}</div>${fuel ? '<div id="fuelTotal" class="result"></div><small class="helper">After a missed fill, fill the tank fully and select “After missed fill” to restart the measurement.</small>' : ""}`;
  show(e ? "Edit entry" : "Log entry", body, "Save entry", (d) => {
    const rec = {
      id: e?.id || Model.id(),
      type: kind,
      name: d.name.trim(),
      date: d.date,
      cost: fuel ? Math.round(+d.qty * +d.price * 100) / 100 : +d.cost,
    };
    if (!rec.name) throw Error("Enter a name.");
    if (fuel)
      Object.assign(rec, {
        qty: +d.qty,
        price: +d.price,
        odo: +d.odo,
        tank: d.tank,
      });
    modify((_, v) => {
      if (e) {
        let i = v.logs.findIndex((r) => r.id === e.id);
        if (i < 0) throw Error("This entry has changed.");
        v.logs[i] = rec;
      } else v.logs.push(rec);
    });
  });
  if (e)
    $("#actions").insertAdjacentHTML(
      "afterbegin",
      btn("Delete", "remove-" + e.id, "textbtn"),
    );
  $("#form").elements.kind.onchange = (ev) => entry(e, ev.target.value);
  if (fuel) {
    const f = $("#form").elements;
    function calc() {
      $("#fuelTotal").textContent =
        "Fill-up total · " + money(+f.qty.value * +f.price.value);
    }
    f.qty.oninput = f.price.oninput = calc;
    f.name.setAttribute("list", "stations");
    $("#fields").insertAdjacentHTML(
      "beforeend",
      `<datalist id="stations">${[...new Set(Model.ordered(vehicle).map((x) => x.name))].map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>`,
    );
    f.name.onchange = () => {
      let prev = Model.ordered(vehicle)
        .filter(
          (x) => x.name.toLowerCase() === f.name.value.trim().toLowerCase(),
        )
        .at(-1);
      if (prev) {
        f.price.value = prev.price;
        calc();
      }
    };
    calc();
  }
}
function saveFile(name, data, type) {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function csv(all) {
  const list = all ? sortedLogs() : filtered();
  const lines = [
    [
      "Date",
      "Type",
      "Name",
      "Odometer (" + u().d + ")",
      "Volume (" + u().v + ")",
      "Unit price",
      "Cost",
      "Currency",
      "Tank",
    ],
    ...list.map((e) => [
      e.date,
      e.type,
      e.name,
      e.odo,
      e.qty,
      e.price,
      e.cost,
      vehicle.currency,
      e.tank,
    ]),
  ];
  const quote = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  saveFile(
    "motorledger-logbook.csv",
    "\uFEFF" + lines.map((a) => a.map(quote).join(",")).join("\r\n"),
    "text/csv",
  );
}
function act(a) {
  if (a.startsWith("nav-")) {
    location.hash = encodeURIComponent(a.slice(4));
    return;
  }
  if (a.startsWith("pick-")) {
    modify((s) => {
      s.active = a.slice(5);
    });
    $("#modal").close();
    return;
  }
  if (a.startsWith("service-")) {
    modify((_, v) => {
      const s = v.services.find((x) => x.id === a.slice(8));
      s.done = !s.done;
    });
    return;
  }
  if (a.startsWith("edit-"))
    return entry(vehicle.logs.find((e) => e.id === a.slice(5)));
  if (a.startsWith("remove-"))
    return show(
      "Delete entry?",
      `<p>Removing this entry will recalculate the vehicle’s totals and fuel economy.</p>`,
      "Delete entry",
      () =>
        modify((_, v) => {
          v.logs = v.logs.filter((e) => e.id !== a.slice(7));
        }),
    );
  switch (a) {
    case "entry":
      return entry();
    case "cancel":
      return $("#modal").close();
    case "switch":
      return show(
        "Switch vehicle",
        state.vehicles
          .map((v) =>
            btn(
              esc(v.name) + (v.id === vehicle.id ? " · Selected" : ""),
              "pick-" + v.id,
              "choice",
              "car-front",
            ),
          )
          .join("") + btn("Add vehicle", "vehicle", "choice", "plus"),
      );
    case "vehicle":
      return show(
        "Add vehicle",
        `<div class="fields">${input("name", "Vehicle name")}${input("detail", "Year and trim")}${select("fuel", "Fuel", ["Gasoline", "Diesel", "Hybrid", "LPG"], "Gasoline")}${select("system", "Units", ["Kilometers & liters", "Miles & US gallons"], "Kilometers & liters")}${select("currency", "Currency", ["USD", "BDT", "GBP", "EUR", "CAD"], "USD")}${input("base", "Starting odometer", 0, "number")}${input("budget", "Monthly expense budget", 0, "number")}</div>`,
        "Add vehicle",
        (d) =>
          modify((s) => {
            const v = {
              ...d,
              name: d.name.trim(),
              id: Model.id(),
              base: +d.base,
              budget: +d.budget,
              system: d.system.startsWith("Miles") ? "us" : "metric",
              logs: [],
              services: [],
            };
            s.vehicles.push(v);
            s.active = v.id;
          }),
      );
    case "budget":
      return show(
        "Monthly expense budget",
        input(
          "budget",
          `Amount (${vehicle.currency})`,
          vehicle.budget,
          "number",
        ),
        "Save budget",
        (d) =>
          modify((_, v) => {
            v.budget = +d.budget;
          }),
      );
    case "reminder":
      return show(
        "Service reminder",
        `<div class="stack">${input("name", "Service name")}${input("due", `Due at odometer (${u().d})`, "", "number")}</div>`,
        "Add reminder",
        (d) =>
          modify((_, v) =>
            v.services.push({
              id: Model.id(),
              name: d.name.trim(),
              due: +d.due,
              done: false,
            }),
          ),
      );
    case "csv":
    case "allcsv":
      return csv(a === "allcsv");
    case "backup":
      return saveFile(
        "motorledger-" + Model.day() + ".json",
        JSON.stringify(state, null, 2),
        "application/json",
      );
    case "restore":
      return $("#file").click();
  }
}
$("#form").onsubmit = (e) => {
  e.preventDefault();
  if (!dialogAction) return;
  try {
    dialogAction(Object.fromEntries(new FormData(e.target)));
    $("#modal").close();
    toast("Changes saved");
  } catch (err) {
    $("#error").textContent = err.message;
  }
};
$("#close").onclick = () => $("#modal").close();
$("#menu").onclick = () => $("#sidebar").classList.toggle("open");
$("#switch").onclick = () => act("switch");
document.addEventListener("click", (e) => {
  if (
    e.target.closest("nav a") ||
    (!e.target.closest("aside") && !e.target.closest("#menu"))
  )
    $("#sidebar").classList.remove("open");
  const a = e.target.closest("[data-act]");
  if (a)
    try {
      act(a.dataset.act);
    } catch (err) {
      toast(err.message);
    }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    search = e.target.value;
    $("#entries").innerHTML = rows(filtered(), true);
    drawIcons();
  }
  if (e.target.closest("#planner,#detour")) calculate();
});
document.addEventListener("submit", (e) => {
  if (e.target.matches("#planner,#detour")) e.preventDefault();
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "range") {
    range = +e.target.value;
    render();
  }
  if (e.target.id === "filter") {
    filter = e.target.value;
    render();
  }
  if (e.target.id === "file") {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10e6) throw Error();
      const next = JSON.parse(await file.text());
      if (!Model.valid(next)) throw Error();
      show(
        "Restore garage?",
        `<p>This backup contains ${next.vehicles.length} vehicle(s). Restoring replaces the garage on this device.</p>`,
        "Restore backup",
        () => modify((s) => Object.assign(s, next)),
      );
    } catch {
      toast("Invalid Motorledger backup. Your garage was preserved.");
    }
    e.target.value = "";
  }
});
window.addEventListener("storage", (e) => {
  if (e.key === Model.key && e.newValue) {
    try {
      const s = JSON.parse(e.newValue);
      if (Model.valid(s)) {
        state = s;
        $("#modal").close();
        render();
      }
    } catch {}
  }
});
window.addEventListener("hashchange", () => {
  render();
  scrollTo(0, 0);
});
render();
