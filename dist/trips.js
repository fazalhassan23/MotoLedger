function tripJournal() {
  const trips = (vehicle.trips || [])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  return `<section class="panel block"><div class="split"><h2>Trip journal</h2>${btn("Log trip", "add-trip", "", "plus")}</div><p class="helper">Record actual journeys and calculate business mileage at your own reimbursement rate.</p>${trips.length ? `<div class="tablewrap"><table><thead><tr><th>Journey</th><th>Date</th><th>Distance</th><th>Reimbursement</th></tr></thead><tbody>${trips.map((t) => `<tr><td><b>${esc(t.name)}</b><small>${esc(t.purpose)}</small></td><td>${t.date}</td><td>${num(t.end - t.start, 1)} ${u().d}</td><td>${money((t.end - t.start) * t.rate)}</td></tr>`).join("")}</tbody></table></div>${btn("Export trip report", "trip-export", "", "download")}` : empty("No trips recorded for this vehicle.")}</section>`;
}
function addTrip() {
  show(
    "Log a trip",
    `<div class="fields">${input("name", "Journey or route")}${input("date", "Trip date", Model.day(), "date", `max="${Model.day()}"`)}${input("start", `Starting odometer (${u().d})`, "", "number")}${input("end", `Ending odometer (${u().d})`, "", "number")}${select("purpose", "Purpose", ["Personal", "Business"], "Personal")}${input("rate", `Business rate (${vehicle.currency}/${u().d})`, 0, "number")}</div>`,
    "Save trip",
    (d) => {
      if (+d.end <= +d.start)
        throw Error("Ending odometer must exceed the starting reading.");
      modify((_, v) => {
        (v.trips ??= []).push({
          id: Model.id(),
          date: d.date,
          name: d.name.trim(),
          purpose: d.purpose,
          start: +d.start,
          end: +d.end,
          rate: d.purpose === "Business" ? +d.rate : 0,
        });
      });
    },
  );
  const f = $("#form").elements;
  f.rate.disabled = true;
  f.purpose.onchange = () => {
    f.rate.disabled = f.purpose.value !== "Business";
  };
}
document.addEventListener("click", (e) => {
  let a = e.target.closest("[data-act]")?.dataset.act;
  if (a === "add-trip") addTrip();
  if (a === "trip-export") {
    const lines = [
      [
        "Date",
        "Journey",
        "Purpose",
        "Start",
        "End",
        "Distance unit",
        "Rate",
        "Currency",
        "Reimbursement",
      ],
      ...(vehicle.trips || []).map((t) => [
        t.date,
        t.name,
        t.purpose,
        t.start,
        t.end,
        u().d,
        t.rate,
        vehicle.currency,
        ((t.end - t.start) * t.rate).toFixed(2),
      ]),
    ];
    saveFile(
      "motorledger-trips.csv",
      "\uFEFF" +
        lines
          .map((r) =>
            r
              .map(
                (x) =>
                  '"' +
                  String(x)
                    .replace(/^[=+@\-\t\r]/, "'$&")
                    .replaceAll('"', '""') +
                  '"',
              )
              .join(","),
          )
          .join("\r\n"),
      "text/csv",
    );
  }
});
