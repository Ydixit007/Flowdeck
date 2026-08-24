import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Cached across hot reloads in dev; Next re-evaluates modules per request otherwise.
const globalForMongoose = globalThis as unknown as { _mongoose?: MongooseCache };
const cache: MongooseCache = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!MONGODB_URI) throw new Error("MONGODB_URI is not set");
  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, {
      // One lambda serves one request at a time, so a big pool just costs
      // handshakes. Keep it small and let the instance be reused.
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
      // Skip the extra round trips a fresh topology scan costs on cold start.
      maxIdleTimeMS: 60_000,
      compressors: ["zstd"],
      // Indexes are managed by `npm run seed`, not rebuilt on every cold start.
      autoIndex: false,
      dbName: "FlowDeck",
    });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

/** True when the deployment supports multi-document transactions (replica set / mongos). */
export async function supportsTransactions(): Promise<boolean> {
  const conn = await connectDB();
  const client = conn.connection.db?.client as unknown as
    | { topology?: { description?: { type?: string } } }
    | undefined;
  const type = client?.topology?.description?.type;
  return type === "ReplicaSetWithPrimary" || type === "Sharded" || type === "LoadBalanced";
}
