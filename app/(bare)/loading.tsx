import { Skeleton } from "@/components/skeleton/Skeleton";

/** Under the bare header (sign-in, setup): a card-shaped placeholder so a navigation paints before the page's data lands. */
export default function BareLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ maxWidth: 560, margin: "0 auto" }}>
      <Skeleton width={260} height={32} />
      <Skeleton width="70%" height={16} style={{ margin: "10px 0 22px" }} />
      <Skeleton height={220} radius={14} />
    </div>
  );
}
