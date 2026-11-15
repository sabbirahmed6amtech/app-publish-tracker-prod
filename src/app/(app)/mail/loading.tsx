import { BrandLoader } from "@/components/BrandLoader";
import { ListCardSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

export default function MailLoading() {
  return (
    <>
      <BrandLoader messages={["Loading store mail…", "Gathering tickets…", "Almost there…"]} />
      <PageHeaderSkeleton />
      <ListCardSkeleton rows={6} />
    </>
  );
}
