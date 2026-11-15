import { BrandLoader } from "@/components/BrandLoader";
import { ListCardSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

export default function SupportLoading() {
  return (
    <>
      <BrandLoader messages={["Loading support articles…", "Sorting by topic…", "Almost there…"]} />
      <PageHeaderSkeleton />
      <ListCardSkeleton rows={5} />
    </>
  );
}
