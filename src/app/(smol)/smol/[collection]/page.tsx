import { notFound } from "next/navigation";
import { SMOL_COLLECTIONS, isSmolCollection } from "@/lib/smol-config";
import { CollectionView } from "@/components/smol/collection-view";

export async function generateMetadata({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  return { title: isSmolCollection(collection) ? SMOL_COLLECTIONS[collection].label : "Not found" };
}

export default async function SmolCollectionPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (!isSmolCollection(collection)) notFound();
  return <CollectionView key={collection} name={collection} />;
}
