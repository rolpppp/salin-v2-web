import { Card } from "@/components/card/Card";
import { Skeleton } from "@/components/skeleton/Skeleton";

/** Fills the space under the Plans header and tabs (which paint at once from the layout) while a section loads. */
export default function PlansLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Plans">
      <Card>
        <Skeleton width={220} height={22} />
        <Skeleton height={44} radius={12} style={{ marginTop: 14 }} />
        <Skeleton height={44} radius={12} style={{ marginTop: 10 }} />
        <Skeleton height={44} radius={12} style={{ marginTop: 10 }} />
        <Skeleton width="60%" height={44} radius={12} style={{ marginTop: 10 }} />
      </Card>
    </div>
  );
}
