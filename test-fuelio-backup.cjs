const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const Model = require("./dist/model.js");
const context = vm.createContext({
  Model, console, TextDecoder, TextEncoder, DataView, Uint8Array, Blob,
  DecompressionStream, crypto: require("node:crypto").webcrypto,
  document: { addEventListener() {} }, render() {},
});
vm.runInContext(fs.readFileSync(__dirname + "/dist/migrate.js", "utf8"), context);
vm.runInContext(fs.readFileSync(__dirname + "/dist/backup.js", "utf8"), context);
vm.runInContext(fs.readFileSync(__dirname + "/dist/zip.js", "utf8"), context);
(async () => {
  const file = process.argv[2];
  assert.ok(file, "Pass the Fuelio ZIP path.");
  const entries = await context.zipEntries(new Uint8Array(fs.readFileSync(file)));
  const counts = [];
  for (const [name, data] of entries) {
    if (!name.endsWith(".csv")) continue;
    const result = context.readFuelio(new TextDecoder().decode(data));
    assert.equal(result.issues.length, 0);
    const v = { ...result.v, currency: "BDT", fuel: "Gasoline" };
    assert.ok(Model.valid({ version: 1, active: v.id, vehicles: [v] }));
    assert.equal(v.logs.length, v.fuelio.Log.rows.length + v.fuelio.Costs.rows.length);
    counts.push({ fuel: v.fuelio.Log.rows.length, expenses: v.fuelio.Costs.rows.length, tripsPreserved: v.fuelio.TripLog.rows.length });
  }
  assert.equal(counts.length, 2);
  const pictures = await context.zipEntries(entries.get("pictures.data"));
  const routes = await context.zipEntries(entries.get("routes.data"));
  assert.equal(pictures.size, 1);
  assert.equal(routes.size, 44);
  console.log(JSON.stringify({ counts, pictures: pictures.size, routeFiles: routes.size }));
})().catch(error => { console.error(error); process.exitCode = 1; });
