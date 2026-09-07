import { Dashboard } from "@/components/dashboard";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <Dashboard initialTicker={t} />;
}
