import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { csvChunks, jsonChunks, toCsv, zip, type ExportTable } from "./export-file";

async function* of<T>(...items: T[]) {
  yield* items;
}
const collect = async (chunks: AsyncIterable<string | Buffer>) => {
  const parts: Buffer[] = [];
  for await (const chunk of chunks) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
};

test("toCsv flattens nested objects and quotes special cells", () => {
  const csv = toCsv([{ a: 1, b: { c: 'x,"y"' } }, { a: 2, tags: ["t"] }]);
  assert.equal(csv, 'a,b.c,tags\r\n1,"x,""y""",\r\n2,,"[""t""]"');
});

test("csvChunks with fixed columns keeps objects as JSON", async () => {
  const table: ExportTable = { name: "e", columns: ["id", "properties"], pages: of([{ id: 1, properties: { a: 1 } }], [{ id: 2 }]) };
  assert.equal((await collect(csvChunks(table))).toString(), 'id,properties\r\n1,"{""a"":1}"\r\n2,');
});

test("jsonChunks emits valid JSON across pages and empty tables", async () => {
  const tables = of<ExportTable>({ name: "a", pages: of([{ x: 1 }], [], [{ x: 2 }]) }, { name: "b", pages: of([]) });
  const parsed = JSON.parse((await collect(jsonChunks({ database: "db" }, tables))).toString());
  assert.deepEqual(parsed, { database: "db", tables: { a: [{ x: 1 }, { x: 2 }], b: [] } });
});

test("zip streams multi-chunk files that inflate back", async () => {
  const buf = await collect(zip(of({ name: "a.csv", chunks: of("hel", "lo") }, { name: "b.csv", chunks: of("world") })));
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
  assert.equal(buf.readUInt16LE(buf.length - 12), 2);
  const dir = buf.readUInt32LE(buf.length - 6);
  const packed = buf.readUInt32LE(dir + 20); // first central entry's compressed size
  assert.equal(inflateRawSync(buf.subarray(30 + 5, 30 + 5 + packed)).toString(), "hello");
});
