import "server-only";
import mongoose from "mongoose";
import { z } from "zod";
import { NotFoundError } from "@/lib/auth";
import { smolDb } from "@/lib/smol-db";
import { SMOL_ANNOUNCEMENT_TYPES, type SmolCollectionName } from "@/lib/smol-config";

// The only SmolBusiness writes. Rules mirror smolBusiness-backend's mongoose models, which these bypass.

const { ObjectId } = mongoose.mongo;
const optional = (schema: z.ZodString) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

export const announcementInput = z.object({
  title: z.string().trim().min(1).max(140),
  content: z.string().trim().min(1).max(4000),
  type: z.enum(SMOL_ANNOUNCEMENT_TYPES),
  releasedAt: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  imageUrl: optional(z.string().trim().url().max(2048)),
  linkUrl: optional(z.string().trim().url().max(2048)),
  linkLabel: optional(z.string().trim().max(40)),
  published: z.boolean(),
});

export async function createAnnouncement(input: z.infer<typeof announcementInput>) {
  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const now = new Date();
  const doc = Object.fromEntries(
    Object.entries({
      ...input,
      // Suffix keeps two same-titled posts from colliding on the unique key.
      key: `${slug || "post"}-${now.getTime().toString(36)}`,
      releasedAt: input.releasedAt ? new Date(`${input.releasedAt}T00:00:00.000+05:30`) : now,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    }).filter(([, v]) => v !== undefined),
  );
  const { insertedId } = await (await smolDb()).collection("announcements").insertOne(doc);
  return { _id: insertedId.toHexString() };
}

export async function setResolved(name: SmolCollectionName, id: string, resolved: boolean) {
  const now = new Date();
  const { matchedCount } = await (await smolDb())
    .collection(name)
    .updateOne({ _id: new ObjectId(id) }, { $set: { resolvedAt: resolved ? now : null, updatedAt: now } });
  if (!matchedCount) throw new NotFoundError("Record not found");
  return { resolved };
}
