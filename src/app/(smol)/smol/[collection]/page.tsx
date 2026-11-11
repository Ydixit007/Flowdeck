import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SMOL_COLLECTIONS, canReadCollection, isSmolCollection } from "@/lib/smol-config";
import { CollectionView } from "@/components/smol/collection-view";

export async function generateMetadata({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  return { title: isSmolCollection(collection) ? SMOL_COLLECTIONS[collection].label : "Not found" };
}

export default async function SmolCollectionPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  const role = (await getCurrentUser())?.role;
  if (!isSmolCollection(collection) || !role || !canReadCollection(role, collection)) notFound();
  return <CollectionView key={collection} name={collection} />;
}
