import "server-only";
import { smolDb } from "@/lib/smol-db";
import { toPlain } from "@/server/smol";
import { hog, posthogConfigured } from "@/server/smol-posthog";

// Full raw dump: every Mongo collection as stored (secrets masked) plus raw PostHog events and persons.

type Row = Record<string, unknown>;
const PAGE = 10_000; // rows per HogQL request; PostHog caps a single SELECT at 50k

const ISO = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Personal API keys can't OFFSET, so page by (time, id) keyset. Cursor values are validated before interpolation. */
async function hogAll(table: string, columns: string, time: string, id: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let after = "1"; ; ) {
    const page = await hog(`SELECT ${columns} FROM ${table} WHERE ${after} ORDER BY ${time}, ${id} LIMIT ${PAGE}`);
    rows.push(...page);
    if (page.length < PAGE) return rows;
    const last = page.at(-1)!;
    const [t, u] = [String(last[time]), String(last[id])];
    if (!ISO.test(t) || !UUID.test(u)) throw new Error(`Unexpected PostHog cursor ${t} / ${u}`);
    after = `(${time}, ${id}) > (toDateTime64('${t.replace("T", " ").slice(0, -1)}', 6, 'UTC'), toUUID('${u}'))`;
  }
}

const parseProps = (rows: Row[]) =>
  rows.map((row) => (typeof row.properties === "string" ? { ...row, properties: JSON.parse(row.properties) } : row));

export async function smolExport() {
  const db = await smolDb();
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."))
    .sort();
  // ponytail: whole dump buffered in memory; stream per collection if the DB outgrows a few hundred MB
  const docs = await Promise.all(names.map(async (name) => toPlain(await db.collection(name).find().toArray(), name)));
  const tables: Record<string, Row[]> = Object.fromEntries(names.map((name, i) => [name, docs[i] as Row[]]));

  if (posthogConfigured()) {
    const [events, persons] = await Promise.all([
      hogAll("events", "uuid, event, timestamp, distinct_id, person_id, properties", "timestamp", "uuid"),
      hogAll("persons", "id, created_at, is_identified, properties", "created_at", "id"),
    ]);
    tables["posthog.events"] = parseProps(events);
    tables["posthog.persons"] = parseProps(persons);
  }
  return { database: db.databaseName, exportedAt: new Date().toISOString(), tables };
}
