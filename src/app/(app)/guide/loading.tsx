import { BrandLoader } from "@/components/BrandLoader";
import { ListCardSkeleton, PageHeaderSkeleton } from "@/components/Skeleton";

export default function GuideLoading() {
  return (
    <>
      <BrandLoader messages={["Loading the guide…", "Opening the sections…", "Almost there…"]} />
      <PageHeaderSkeleton />
      <ListCardSkeleton rows={5} />
    </>
  );
}
