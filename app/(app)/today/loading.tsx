import { Card } from "@/components/card/Card";
import { Skeleton } from "@/components/skeleton/Skeleton";
import styles from "@/components/today/today.module.css";

/** Shaped like the final blocks. Never a spinner over money. */
export default function TodayLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Today">
      <div className={styles.hello}>
        <Skeleton width={280} height={32} />
        <Skeleton width={160} height={16} style={{ marginTop: 10 }} />
      </div>
      <div className={styles.grid}>
        {[0, 1].map((i) => (
          <Card key={i} className={styles.card}>
            <Skeleton width={120} height={20} />
            {[0, 1, 2].map((r) => (
              <Skeleton key={r} height={22} />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
