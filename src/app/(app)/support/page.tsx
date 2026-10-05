import { PageHeader } from "@/components/PageHeader";
import { SupportList } from "@/components/SupportList";
import { getSupportArticles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const articles = await getSupportArticles();
  return (
    <>
      <PageHeader title="Support" meta="Common publishing issues and how the team fixes them." />
      <SupportList articles={articles} />
    </>
  );
}
