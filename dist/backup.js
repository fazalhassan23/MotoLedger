async function retainBackup(file, digest) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("motorledger-original-backups", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("archives");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("archives", "readwrite");
      tx.objectStore("archives").put(file, digest);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function previewFuelioBackup(file) {
  if (!file || file.size > 50000000)
    throw Error("Choose a backup smaller than 50 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  const files = await zipEntries(bytes),
    vehicles = [],
    issues = [];
  for (const [name, content] of files) {
    if (!/^vehicle-\d+-local\.csv$/i.test(name)) continue;
    const result = readFuelio(new TextDecoder().decode(content));
    const v = result.v;
    v.sourceVehicleId = v.fuelio.Vehicle.rows[0].guid;
    if (!v.sourceVehicleId) throw Error("Vehicle identifier is missing.");
    v.sourceHash = digest;
    vehicles.push(v);
    issues.push(...result.issues.map((s) => v.name + " · " + s));
  }
  if (!vehicles.length) throw Error("No Fuelio vehicle CSVs found.");
  const pictures = files.has("pictures.data")
    ? await zipEntries(files.get("pictures.data"))
    : new Map();
  const routes = files.has("routes.data")
    ? await zipEntries(files.get("routes.data"))
    : new Map();
  const tripCount = vehicles.reduce(
    (n, v) => n + (v.fuelio.TripLog?.rows.length || 0),
    0,
  );
  const missingPictures = new Set(
    vehicles
      .flatMap((v) => (v.fuelio.Pictures?.rows || []).map((p) => p.filename))
      .filter((name) => !pictures.has(name)),
  );
  const missingRoutes = vehicles
    .flatMap((v) => v.fuelio.TripLog?.rows || [])
    .filter(
      (t) => t.triplogfile && !routes.has("route-" + t.triplogfile + ".route"),
    ).length;
  show(
    "Fuelio backup preview",
    vehicles
      .map(
        (v) =>
          "<p><b>" +
          esc(v.name) +
          "</b> · " +
          v.logs.length +
          " ledger entries</p>",
      )
      .join("") +
      "<p class='helper'>" +
      tripCount +
      " trip records found. " +
      pictures.size +
      " photos and " +
      routes.size +
      " route files will be retained with the original archive when you confirm import.</p>" +
      "<p class='helper'>" +
      missingPictures.size +
      " referenced photos and " +
      missingRoutes +
      " referenced routes are absent from this backup. Trip records and attachment metadata are retained for the upcoming history viewer.</p>" +
      (issues.length ? "<p>" + issues.map(esc).join("<br>") + "</p>" : "") +
      select(
        "currency",
        "Source currency",
        ["BDT", "USD", "GBP", "EUR", "CAD"],
        "BDT",
      ) +
      "<p class='helper'>This import currently adds fuel and expense history. Full trip, receipt and reminder interfaces are still under development.</p>",
    "Import vehicles",
    async (d) => {
      await retainBackup(file, digest);
      modify((s) => {
        for (const v of vehicles) {
          if (
            s.vehicles.some(
              (old) =>
                old.sourceVehicleId === v.sourceVehicleId ||
                old.sourceHash === digest,
            )
          )
            throw Error("A vehicle from this backup is already imported.");
        }
        for (const v of vehicles)
          s.vehicles.push({ ...v, currency: d.currency, fuel: "Gasoline" });
        s.active = vehicles[0].id;
      });
    },
  );
}
document.addEventListener("change", async (e) => {
  if (e.target.id !== "fuelioBackup") return;
  try {
    await previewFuelioBackup(e.target.files[0]);
  } catch (err) {
    toast(err.message);
  }
  e.target.value = "";
});
const renderBeforeBackup = render;
render = function () {
  renderBeforeBackup();
  if (page === "Data & backups") {
    document
      .querySelector("#content")
      .insertAdjacentHTML(
        "beforeend",
        '<section class="panel block"><h2>Full Fuelio backup</h2><p class="helper">Preview both vehicles and retain the original attachments.</p><label>Choose .fuelio.zip<input id="fuelioBackup" type="file" accept=".zip,application/zip"></label></section>',
      );
  }
};
