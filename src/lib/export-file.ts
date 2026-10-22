import { constants, crc32, deflateRawSync } from "node:zlib";

export type Row = Record<string, unknown>;
/** `columns` fixes the CSV header up front (cells that are objects become JSON); without it rows are flattened. */
export type ExportTable = { name: string; pages: AsyncIterable<Row[]>; columns?: string[] };

/** Nested objects → dot keys (mongoexport style); arrays stay JSON. */
function flatten(value: Row, prefix = "", out: Row = {}): Row {
  for (const [key, v] of Object.entries(value)) {
    const path = prefix + key;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Row, `${path}.`, out);
    else out[path] = v;
  }
  return out;
}

function csvLine(values: unknown[]): string {
  return values
    .map((v) => {
      const text = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}

export function toCsv(rows: Row[]): string {
  const flat = rows.map((row) => flatten(row));
  const headers = [...new Set(flat.flatMap(Object.keys))];
  return [csvLine(headers), ...flat.map((row) => csvLine(headers.map((h) => row[h])))].join("\r\n");
}

export async function* csvChunks(table: ExportTable): AsyncGenerator<string> {
  const { columns } = table;
  if (!columns) {
    const rows: Row[] = [];
    for await (const page of table.pages) rows.push(...page);
    yield toCsv(rows);
    return;
  }
  yield csvLine(columns);
  for await (const page of table.pages) yield page.map((row) => `\r\n${csvLine(columns.map((c) => row[c]))}`).join("");
}

export async function* jsonChunks(meta: Row, tables: AsyncIterable<ExportTable>): AsyncGenerator<string> {
  yield `${JSON.stringify(meta).slice(0, -1)},"tables":{`;
  let sep = "";
  for await (const table of tables) {
    yield `${sep}${JSON.stringify(table.name)}:[`;
    sep = ",";
    let rowSep = "";
    for await (const page of table.pages) {
      if (!page.length) continue;
      yield rowSep + page.map((row) => JSON.stringify(row)).join(",");
      rowSep = ",";
    }
    yield "]";
  }
  yield "}}";
}

/**
 * Streaming deflate zip (no zip64: each file under 4 GB). Each chunk is deflated on its own with a sync flush,
 * so the blocks concatenate into one valid stream; sizes and CRC go in a trailing data descriptor.
 */
export async function* zip(files: AsyncIterable<{ name: string; chunks: AsyncIterable<string> }>): AsyncGenerator<Buffer> {
  const centrals: Buffer[] = [];
  let offset = 0;
  for await (const file of files) {
    const name = Buffer.from(file.name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0808, 6); // UTF-8 names + data descriptor
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(name.length, 26);
    yield Buffer.concat([head, name]);

    let crc = 0;
    let size = 0;
    let packed = 0;
    for await (const chunk of file.chunks) {
      const raw = Buffer.from(chunk);
      crc = crc32(raw, crc);
      size += raw.length;
      const body = deflateRawSync(raw, { finishFlush: constants.Z_SYNC_FLUSH });
      packed += body.length;
      yield body;
    }
    const last = deflateRawSync(Buffer.alloc(0));
    packed += last.length;
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(packed, 8);
    descriptor.writeUInt32LE(size, 12);
    yield Buffer.concat([last, descriptor]);

    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed, 18);
    head.writeUInt32LE(size, 22);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    head.copy(central, 6, 4, 30); // version-needed … name length share the local layout
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += head.length + name.length + packed + descriptor.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  yield Buffer.concat([dir, end]);
}

/** Pull-based, so a slow client throttles the producer instead of piling chunks up in memory. */
export function toStream(chunks: AsyncIterator<string | Uint8Array>): ReadableStream<BufferSource> {
  const encoder = new TextEncoder();
  return new ReadableStream<BufferSource>({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(typeof value === "string" ? encoder.encode(value) : (value as Uint8Array<ArrayBuffer>)); // Node buffers are never shared
    },
    async cancel() {
      await chunks.return?.(undefined);
    },
  });
}
