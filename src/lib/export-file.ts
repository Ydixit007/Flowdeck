import { crc32, deflateRawSync } from "node:zlib";

type Row = Record<string, unknown>;

/** Nested objects → dot keys (mongoexport style); arrays stay JSON. */
function flatten(value: Row, prefix = "", out: Row = {}): Row {
  for (const [key, v] of Object.entries(value)) {
    const path = prefix + key;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Row, `${path}.`, out);
    else out[path] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

export function toCsv(rows: Row[]): string {
  const flat = rows.map((row) => flatten(row));
  const headers = [...new Set(flat.flatMap(Object.keys))];
  const cell = (v: unknown) => {
    const text = v == null ? "" : String(v);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.map(cell).join(","), ...flat.map((row) => headers.map((h) => cell(row[h])).join(","))].join("\r\n");
}

/** Minimal deflate zip (no zip64: fine below 4 GB / 65k files). */
export function zip(files: { name: string; data: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const raw = Buffer.from(file.data);
    const body = deflateRawSync(raw);
    const name = Buffer.from(file.name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt32LE(crc32(raw), 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    head.copy(central, 6, 4, 30); // version-needed … name length share the local layout
    central.writeUInt32LE(offset, 42);
    locals.push(head, name, body);
    centrals.push(central, name);
    offset += head.length + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
