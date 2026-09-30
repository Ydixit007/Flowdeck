import "server-only";
import { Resolver } from "node:dns/promises";
import mongoose from "mongoose";

// Separate connection to the SmolBusiness cluster; the default mongoose connection stays on FlowDeck.
const globalForSmol = globalThis as unknown as { _smol?: { key: string; conn: Promise<mongoose.Connection> } };

/** Some local resolvers refuse SRV lookups; expand mongodb+srv:// via public DNS into a plain seed list. */
async function expandSrv(uri: string): Promise<string> {
  const url = new URL(uri);
  const resolver = new Resolver();
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  const [srv, txt] = await Promise.all([
    resolver.resolveSrv(`_mongodb._tcp.${url.hostname}`),
    resolver.resolveTxt(url.hostname).catch(() => [] as string[][]),
  ]);
  const params = new URLSearchParams(txt.map((chunks) => chunks.join("")).join("&"));
  url.searchParams.forEach((value, key) => params.set(key, value));
  if (!params.has("tls") && !params.has("ssl")) params.set("tls", "true");
  const auth = url.username ? `${url.username}:${url.password}@` : "";
  return `mongodb://${auth}${srv.map((r) => `${r.name}:${r.port}`).join(",")}${url.pathname || "/"}?${params}`;
}

async function connect(uri: string, dbName: string): Promise<mongoose.Connection> {
  const open = (target: string) =>
    mongoose
      .createConnection(target, {
        dbName,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
        readPreference: "secondaryPreferred",
        autoIndex: false,
      })
      .asPromise();
  try {
    return await open(uri);
  } catch (error) {
    if (!uri.startsWith("mongodb+srv://") || !String(error).includes("querySrv")) throw error;
    return open(await expandSrv(uri));
  }
}

export async function smolDb(): Promise<mongoose.mongo.Db> {
  const uri = process.env.SMOL_MONGODB_URI;
  if (!uri) throw new Error("SMOL_MONGODB_URI is not set");
  const dbName = process.env.SMOL_DB_NAME || "SmolBusiness_Test";
  // Keyed on config so an edited .env reconnects instead of reusing the old cluster/database.
  const key = `${uri}|${dbName}`;
  if (globalForSmol._smol?.key !== key) {
    void globalForSmol._smol?.conn.then((old) => old.close()).catch(() => undefined);
    const conn = connect(uri, dbName).catch((error: unknown) => {
      if (globalForSmol._smol?.conn === conn) globalForSmol._smol = undefined;
      throw error;
    });
    globalForSmol._smol = { key, conn };
  }
  return (await globalForSmol._smol.conn).db!;
}
