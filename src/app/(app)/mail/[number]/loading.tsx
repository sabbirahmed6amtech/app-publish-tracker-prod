import { BrandLoader } from "@/components/BrandLoader";
import { ListCardSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

export default function MailTicketLoading() {
  return (
    <>
      <BrandLoader messages={["Opening the ticket…", "Loading its emails…", "Almost there…"]} />
      <PageHeaderSkeleton />
      <ListCardSkeleton rows={4} />
    </>
  );
}
