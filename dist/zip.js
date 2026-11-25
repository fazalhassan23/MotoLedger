"use strict";

const ZIP_LIMITS = Object.freeze({
  files: 10000,
  fileBytes: 20000000,
  expandedBytes: 100000000,
  archiveBytes: 50000000,
  commentBytes: 65535,
});

function zipChecksum(bytes) {
  // ZIP CRC-32 detects corruption. It is not an authenticity or encryption check.
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

async function zipEntries(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 22 ||
    bytes.length > ZIP_LIMITS.archiveBytes
  ) {
    throw Error("Invalid or oversized ZIP archive.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const requireRange = (offset, length, limit = bytes.length) => {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      length < 0 ||
      offset + length > limit
    ) {
      throw Error("Truncated ZIP archive.");
    }
  };
  const firstPossibleEnd = Math.max(
    0,
    bytes.length - 22 - ZIP_LIMITS.commentBytes,
  );
  let end = bytes.length - 22;
  while (end >= firstPossibleEnd) {
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === bytes.length
    )
      break;
    end--;
  }
  if (end < firstPossibleEnd) throw Error("Invalid ZIP directory.");
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 8, true) !== count ||
    count > ZIP_LIMITS.files ||
    directoryOffset + directorySize !== end
  ) {
    throw Error("Unsupported ZIP directory layout.");
  }
  requireRange(directoryOffset, directorySize, end);
  let offset = directoryOffset;
  let total = 0;
  const entries = new Map();
  const occupiedRanges = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let index = 0; index < count; index++) {
    requireRange(offset, 46, end);
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw Error("Invalid ZIP entry.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const checksum = view.getUint32(offset + 16, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    requireRange(offset + 46, nameLength + extraLength + commentLength, end);
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    total += size;
    if (
      (flags & ~0x0808) !== 0 ||
      ![0, 8].includes(method) ||
      view.getUint16(offset + 34, true) !== 0 ||
      size > ZIP_LIMITS.fileBytes ||
      total > ZIP_LIMITS.expandedBytes
    ) {
      throw Error("Unsupported or oversized ZIP entry.");
    }
    if (
      !name ||
      name === "." ||
      name.includes("..") ||
      /[\\/\x00-\x1f:]/.test(name) ||
      entries.has(name)
    )
      throw Error("Unexpected or duplicate ZIP filename.");
    requireRange(local, 30, directoryOffset);
    if (
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      throw Error("Invalid ZIP header.");
    const localNameLength = view.getUint16(local + 26, true);
    const localExtraLength = view.getUint16(local + 28, true);
    requireRange(
      local + 30,
      localNameLength + localExtraLength,
      directoryOffset,
    );
    if (
      decoder.decode(
        bytes.subarray(local + 30, local + 30 + localNameLength),
      ) !== name
    ) {
      throw Error("ZIP filenames disagree.");
    }
    const start = local + 30 + localNameLength + localExtraLength;
    requireRange(start, compressed, directoryOffset);
    occupiedRanges.push([local, start + compressed]);
    let content = bytes.slice(start, start + compressed);
    if (method === 8) {
      const reader = new Blob([content])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))
        .getReader();
      const chunks = [];
      let received = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          received += part.value.length;
          if (received > size) {
            await reader.cancel();
            throw Error("ZIP size mismatch.");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      content = new Uint8Array(await new Blob(chunks).arrayBuffer());
    }
    if (content.length !== size || zipChecksum(content) !== checksum) {
      throw Error("ZIP data is damaged or its checksum does not match.");
    }
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end) throw Error("ZIP directory size does not match.");
  occupiedRanges.sort((left, right) => left[0] - right[0]);
  if (
    occupiedRanges.some(
      (range, index) => index > 0 && range[0] < occupiedRanges[index - 1][1],
    )
  ) {
    throw Error("ZIP entries overlap.");
  }
  return entries;
}

if (typeof module !== "undefined")
  module.exports = { zipEntries, zipChecksum, ZIP_LIMITS };
