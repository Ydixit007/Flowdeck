/** Builds model indexes (runtime uses autoIndex: false). Run after a schema change: npm run indexes */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import mongoose from "mongoose";

loadEnv({ path: ".env.local", override: true });

import { User } from "../src/models/User";

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri, { dbName: "FlowDeck" });
  await User.syncIndexes();
  console.log("Indexed", User.modelName);
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  void mongoose.disconnect();
});
