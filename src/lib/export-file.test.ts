import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { toCsv, zip } from "./export-file";

test("toCsv flattens nested objects and quotes special cells", () => {
  const csv = toCsv([{ a: 1, b: { c: 'x,"y"' } }, { a: 2, tags: ["t"] }]);
  assert.equal(csv, 'a,b.c,tags\r\n1,"x,""y""",\r\n2,,"[""t""]"');
});

test("zip round-trips file contents", () => {
  const buf = zip([{ name: "a.csv", data: "hello" }, { name: "b.csv", data: "world" }]);
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
  assert.equal(buf.readUInt16LE(buf.length - 12), 2);
  const size = buf.readUInt32LE(18);
  assert.equal(inflateRawSync(buf.subarray(30 + 5, 30 + 5 + size)).toString(), "hello");
});
