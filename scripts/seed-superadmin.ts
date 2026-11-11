/** Makes an account superadmin, creating it with a set-password link if it doesn't exist: npm run seed:superadmin -- <email> "<name>" */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import mongoose from "mongoose";

loadEnv({ path: ".env.local", override: true });

import { inviteToken, placeholderAccount } from "../src/lib/reset-token";
import { User } from "../src/models/User";

async function main(): Promise<void> {
  const [email, name] = [process.argv[2]?.trim().toLowerCase(), process.argv[3]?.trim()];
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Usage: npm run seed:superadmin -- <email> "<name>"');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri, { dbName: "FlowDeck" });

  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: { role: "superadmin" }, $inc: { sessionEpoch: 1 } });
    console.log(`${email} is now superadmin. Sign in with the existing password.`);
  } else {
    const { link, fields } = inviteToken();
    await User.create({ name: name || email.split("@")[0], email, role: "superadmin", ...(await placeholderAccount(email)), ...fields });
    console.log(`Created superadmin ${email}. Set the password within 7 days at: <your Flowdeck URL>${link}`);
  }
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  void mongoose.disconnect();
});
