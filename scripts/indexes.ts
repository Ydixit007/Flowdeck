/**
 * Builds every model's indexes. Runtime uses `autoIndex: false` so cold starts
 * never pay for index checks, which means this must run after a schema change.
 *
 *   npm run indexes
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import mongoose from "mongoose";

loadEnv({ path: ".env.local", override: true });

import { User } from "../src/models/User";
import { Workspace, WorkspaceMember, Invite } from "../src/models/Workspace";
import { Project } from "../src/models/Project";
import { Tag } from "../src/models/Tag";
import { Task, TaskOccurrence } from "../src/models/Task";
import { Comment, Activity, Notification, PushSubscription, Attachment } from "../src/models/Social";

export async function syncAllIndexes(): Promise<void> {
  const models = [
    User, Workspace, WorkspaceMember, Invite, Project, Tag,
    Task, TaskOccurrence, Comment, Activity, Notification, PushSubscription, Attachment,
  ];
  for (const model of models) {
    await model.syncIndexes();
    console.log("  indexed", model.modelName);
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  console.log("Syncing indexes...");
  await syncAllIndexes();
  console.log("Done.");
  await mongoose.disconnect();
}

// Only self-run when invoked directly, not when seed.ts imports syncAllIndexes.
if (process.argv[1]?.endsWith("indexes.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
    void mongoose.disconnect();
  });
}
