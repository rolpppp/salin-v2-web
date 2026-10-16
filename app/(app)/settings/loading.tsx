import { Card } from "@/components/card/Card";
import { Skeleton } from "@/components/skeleton/Skeleton";

/** Shaped like the final cards. Never a spinner over money. */
export default function SettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Settings">
      <Skeleton width={180} height={32} />
      <Skeleton width={340} height={16} style={{ margin: "10px 0 22px" }} />
      <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton width={200} height={22} />
            <Skeleton height={48} style={{ marginTop: 10 }} />
          </Card>
        ))}
      </div>
    </div>
  );
}
