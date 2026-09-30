import { SellerView } from "@/components/smol/seller-view";

export const metadata = { title: "Seller" };

export default async function SmolSellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SellerView key={id} id={id} />;
}
