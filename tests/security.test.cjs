const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { zipEntries } = require("../dist/zip.js");
const Model = require("../dist/model.js");

// Fixed CRC values independently calculated for standard ZIP test payloads.
function archive(name = "a.txt", payload = "abc", checksum = 0x352441c2) {
  const filename = Buffer.from(name);
  const content = Buffer.from(payload);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + filename.length, 12);
  end.writeUInt32LE(30 + filename.length + content.length, 16);
  return new Uint8Array(
    Buffer.concat([local, filename, content, central, filename, end]),
  );
}

test("reads a valid ZIP without mutating its input", async () => {
  const bytes = archive();
  const original = bytes.slice();
  const files = await zipEntries(bytes);
  assert.equal(new TextDecoder().decode(files.get("a.txt")), "abc");
  assert.deepEqual(bytes, original);
});
test("rejects same-length payload corruption", async () => {
  await assert.rejects(zipEntries(archive("a.txt", "abd")), /checksum/);
});
test("rejects path traversal and absolute filenames", async () => {
  for (const name of ["../secret", "/secret", "C:secret", "a\\secret", ""]) {
    await assert.rejects(zipEntries(archive(name)), /filename/);
  }
});
test("rejects truncated archives with a controlled error", async () => {
  for (const size of [0, 1, 21, 50]) {
    await assert.rejects(zipEntries(archive().slice(0, size)), /ZIP/);
  }
});
test("rejects directory offsets outside the archive", async () => {
  const bytes = archive();
  new DataView(bytes.buffer).setUint32(bytes.length - 6, 0xffffffff, true);
  await assert.rejects(zipEntries(bytes), /ZIP/);
});
test("rejects encrypted and inconsistent local headers", async () => {
  const bytes = archive();
  new DataView(bytes.buffer).setUint16(6, 1, true);
  await assert.rejects(zipEntries(bytes), /header/);
});
test("rejects declared expansion above the per-file bound", async () => {
  const bytes = archive();
  new DataView(bytes.buffer).setUint32(38 + 24, 20000001, true);
  await assert.rejects(zipEntries(bytes), /oversized/);
});
function importer() {
  const context = vm.createContext({
    Model,
    console,
    TextDecoder,
    TextEncoder,
    DataView,
    Uint8Array,
    Blob,
    DecompressionStream,
    crypto: require("node:crypto").webcrypto,
    document: { addEventListener() {} },
    render() {},
  });
  for (const file of ["migrate.js", "backup.js", "zip.js"]) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../dist", file), "utf8"),
      context,
    );
  }
  return context;
}
const csv = [
  '"## Vehicle"',
  '"Name","Description","TankCount","ImportCSVDateFormat","guid"',
  '"Test car","Synthetic fixture","1","yyyy-MM-dd","vehicle-test"',
  '"## Log"',
  '"Data","Odo (km)","Fuel (litres)","Full","Price (optional)","VolumePrice","guid"',
  '"2026-01-01 10:15","100","10","1","100","10","fill-one"',
  '"2026-01-02 11:45","200","10","1","110","11","fill-two"',
  '"## Costs"',
  '"CostTitle","Date","Cost","isTemplate"',
  '"Parking","2026-01-02 13:30","5","0"',
].join("\n");
test("timestamp import preserves source values and accepts all valid records", () => {
  const { v, issues } = importer().readFuelio(csv);
  assert.equal(issues.length, 0);
  assert.equal(v.logs.length, 3);
  assert.equal(v.logs[0].source.data, "2026-01-01 10:15");
  assert.ok(
    Model.valid({
      version: 1,
      active: v.id,
      vehicles: [{ ...v, currency: "BDT", fuel: "Gasoline" }],
    }),
  );
});
test("external CSV section names cannot collide with object prototypes", () => {
  const parsed = importer().readFuelio(
    csv + '\n"## __proto__"\n"value"\n"untrusted"',
  );
  assert.equal(parsed.v.fuelio.__proto__.rows[0].value, "untrusted");
  assert.equal(Object.getPrototypeOf(parsed.v.fuelio), null);
});
test("preview keeps private archive in memory until import confirmation", async () => {
  const context = importer();
  let stored = 0,
    prompt = 0;
  context.zipEntries = async () =>
    new Map([["vehicle-1-local.csv", new TextEncoder().encode(csv)]]);
  context.retainBackup = async () => {
    stored++;
  };
  context.show = () => {
    prompt++;
  };
  context.esc = String;
  context.select = () => "";
  await context.previewFuelioBackup(new Blob(["synthetic backup"]));
  assert.equal(prompt, 1);
  assert.equal(stored, 0);
});
test("partial fills are accumulated and missed fills restart the baseline", () => {
  const logs = [
    [100, 10, "Full"],
    [150, 2, "Partial"],
    [200, 3, "Full"],
    [300, 5, "After missed fill"],
    [400, 10, "Full"],
  ].map(([odo, qty, tank]) => ({ type: "Fuel", odo, qty, tank }));
  assert.deepEqual(
    Model.intervals({ logs }).map((item) => item.rate),
    [20, 10],
  );
});
