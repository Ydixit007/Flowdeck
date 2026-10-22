import "server-only";
import { smolDb } from "@/lib/smol-db";
import type { ExportTable, Row } from "@/lib/export-file";
import { toPlain } from "@/server/smol";
import { hog, posthogConfigured } from "@/server/smol-posthog";

// Full raw dump: every Mongo collection as stored (secrets masked) plus raw PostHog events and persons.
// Yielded table by table, page by page, so the route can stream it without holding the dump in memory.

const PAGE = 5_000; // rows per HogQL request; event properties run ~5 KB each

const ISO = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Personal API keys can't OFFSET, so page by (time, id) keyset. Cursor values are validated before interpolation. */
async function* hogPages(table: string, columns: string[], time: string, id: string): AsyncGenerator<Row[]> {
  for (let after = "1"; ; ) {
    const page = await hog(`SELECT ${columns.join(", ")} FROM ${table} WHERE ${after} ORDER BY ${time}, ${id} LIMIT ${PAGE}`);
    yield page.map((row) => (typeof row.properties === "string" ? { ...row, properties: JSON.parse(row.properties) } : row));
    if (page.length < PAGE) return;
    const last = page.at(-1)!;
    const [t, u] = [String(last[time]), String(last[id])];
    if (!ISO.test(t) || !UUID.test(u)) throw new Error(`Unexpected PostHog cursor ${t} / ${u}`);
    after = `(${time}, ${id}) > (toDateTime64('${t.replace("T", " ").slice(0, -1)}', 6, 'UTC'), toUUID('${u}'))`;
  }
}

const EVENT_COLUMNS = ["uuid", "event", "timestamp", "distinct_id", "person_id", "properties"];
const PERSON_COLUMNS = ["id", "created_at", "is_identified", "properties"];

export async function smolExport() {
  const db = await smolDb();
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."))
    .sort();

  async function* tables(): AsyncGenerator<ExportTable> {
    for (const name of names) {
      // ponytail: one collection buffered at a time (CSV needs its full header set); cursor-batch if one outgrows ~100 MB
      const pages = (async function* () {
        yield toPlain(await db.collection(name).find().toArray(), name) as Row[];
      })();
      yield { name, pages };
    }
    if (!posthogConfigured()) return;
    yield { name: "posthog.events", columns: EVENT_COLUMNS, pages: hogPages("events", EVENT_COLUMNS, "timestamp", "uuid") };
    yield { name: "posthog.persons", columns: PERSON_COLUMNS, pages: hogPages("persons", PERSON_COLUMNS, "created_at", "id") };
  }

  return { database: db.databaseName, exportedAt: new Date().toISOString(), tables: tables() };
}
