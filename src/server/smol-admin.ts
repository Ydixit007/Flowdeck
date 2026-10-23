import "server-only";
import { AwsClient } from "aws4fetch";
import mongoose from "mongoose";
import { z } from "zod";
import { NotFoundError } from "@/lib/auth";
import { smolDb } from "@/lib/smol-db";
import { SMOL_ANNOUNCEMENT_TYPES, mediaRefs, type SmolCollectionName } from "@/lib/smol-config";

// The only SmolBusiness writes. Rules mirror smolBusiness-backend's mongoose models, which these bypass.

const { ObjectId } = mongoose.mongo;
const optional = (schema: z.ZodString) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

export const announcementInput = z.object({
  title: z.string().trim().min(1).max(140),
  content: z.string().trim().min(1).max(4000),
  type: z.enum(SMOL_ANNOUNCEMENT_TYPES),
  releasedAt: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  imageUrl: optional(z.string().trim().url().max(2048)),
  // Seller-dashboard path ("/seller/...") or absolute http(s) URL; nothing else, so no javascript: hrefs.
  linkUrl: optional(z.string().trim().max(2048).regex(/^(\/(?!\/)|https?:\/\/)\S*$/, "Use a /path or an http(s) URL")),
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

/** Every collection holding a seller's rows, keyed by `storeId`. The store doc itself goes last. */
const SELLER_COLLECTIONS = [
  "orders",
  "customers",
  "products",
  "reviews",
  "coupons",
  "credittransactions",
  "billingorders",
  "storelayoutrevisions",
  "storepages",
  "sellerthemes",
  "featurerequests",
  "contacts",
] as const;

function r2Client() {
  const { SMOL_R2_ACCOUNT_ID: account, SMOL_R2_ACCESS_KEY_ID: key, SMOL_R2_SECRET_ACCESS_KEY: secret, SMOL_R2_BUCKET: bucket } = process.env;
  if (!account || !key || !secret || !bucket) return null;
  const client = new AwsClient({ accessKeyId: key, secretAccessKey: secret, service: "s3", region: "auto" });
  return (objectKey: string) => client.fetch(`https://${account}.r2.cloudflarestorage.com/${bucket}/${objectKey}`, { method: "DELETE" });
}

async function vercelDomainDelete(name: string) {
  const { SMOL_VERCEL_TOKEN: token, SMOL_VERCEL_PROJECT_ID: project, SMOL_VERCEL_TEAM_ID: team } = process.env;
  const res = await fetch(`https://api.vercel.com/v9/projects/${project}/domains/${name}${team ? `?teamId=${team}` : ""}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Vercel refused to remove ${name} (${res.status})`);
}

/** Runs `fn` over `items`, `size` at a time. */
async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * Permanently deletes a seller: custom domain, every uploaded file, then every row.
 * Files and domain go first and abort on failure, so a retry finds the store still there.
 */
export async function deleteSeller(id: string, confirmDomain: string) {
  const db = await smolDb();
  const _id = new ObjectId(id);
  const store = await db.collection("stores").findOne({ _id });
  if (!store) throw new NotFoundError("Seller not found");
  if (String(store.domain ?? "") !== confirmDomain) throw new Error("Confirmation does not match the store domain");

  const byStore = { storeId: { $in: [_id, id] } };
  const phones = store.phone ? [String(store.phone), `${store.countryCode ?? ""}${store.phone}`, `+${store.countryCode ?? ""}${store.phone}`] : [];
  // Contacts and feature requests can predate the store, tied only to the seller's phone.
  const filters: Record<string, object> = Object.fromEntries(SELLER_COLLECTIONS.map((name) => [name, byStore]));
  if (phones.length) {
    for (const name of ["contacts", "featurerequests"]) filters[name] = { $or: [byStore, { phone: { $in: phones }, storeId: null }] };
  }

  // 1. Collect every file referenced anywhere in the seller's data.
  const refs = mediaRefs(store);
  for (const [name, filter] of Object.entries(filters)) {
    for await (const doc of db.collection(name).find(filter)) mediaRefs(doc, refs);
  }
  // ponytail: assumes uploads aren't shared between sellers; only platform-wide docs are checked for reuse.
  for (const name of ["themes", "announcements"]) {
    for (const key of mediaRefs(await db.collection(name).find().toArray()).keys()) refs.delete(key);
  }
  const files = [...refs.values()];
  const r2Keys = files.flatMap((ref) => ("r2" in ref ? [ref.r2] : []));
  const firebase = files.flatMap((ref) => ("firebase" in ref ? [ref.firebase] : []));

  // 2. Custom domain off the storefront project.
  // Unset SMOL_VERCEL_* / SMOL_R2_* skips that cleanup (reported back) instead of blocking the DB delete.
  const hostname = (store.customDomain as { hostname?: string } | undefined)?.hostname;
  const domainRemoved = !!hostname && !!process.env.SMOL_VERCEL_TOKEN && !!process.env.SMOL_VERCEL_PROJECT_ID;
  if (domainRemoved) {
    await vercelDomainDelete(hostname);
    await vercelDomainDelete(`www.${hostname}`).catch(() => undefined);
  }

  // 3. Files. R2 failures abort the delete; legacy Firebase objects are best-effort (Storage rules may forbid deletes).
  const del = r2Client();
  if (del) {
    await inChunks(r2Keys, 20, async (key) => {
      const res = await del(key);
      if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed for ${key} (${res.status})`);
    });
  }
  const firebaseFailed: string[] = [];
  await inChunks(firebase, 20, async ({ bucket, path }) => {
    const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}`, { method: "DELETE" }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) firebaseFailed.push(path);
  });

  // 4. Rows, store last.
  const deleted: Record<string, number> = {};
  for (const [name, filter] of Object.entries(filters)) deleted[name] = (await db.collection(name).deleteMany(filter)).deletedCount;
  if (phones.length) deleted.otps = (await db.collection("otps").deleteMany({ phoneNumber: { $in: phones } })).deletedCount;
  deleted.stores = (await db.collection("stores").deleteOne({ _id })).deletedCount;

  return {
    deleted,
    r2Files: del ? r2Keys.length : 0,
    r2Skipped: del ? 0 : r2Keys.length,
    firebaseFiles: firebase.length - firebaseFailed.length,
    firebaseFailed,
    customDomain: hostname ?? null,
    customDomainSkipped: !!hostname && !domainRemoved,
  };
}
