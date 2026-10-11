import { Card } from "@/components/card/Card";
import { Skeleton } from "@/components/skeleton/Skeleton";
import styles from "@/components/money-in/money-in.module.css";

/** Shaped like the final blocks. Never a spinner over money. */
export default function MoneyInLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Money in">
      <Skeleton width={300} height={32} />
      <Skeleton width={420} height={16} style={{ margin: "10px 0 22px" }} />
      <div className={styles.two}>
        <div className={styles.steps}>
          <Card>
            <Skeleton width={220} height={22} />
            {[0, 1].map((i) => (
              <Skeleton key={i} height={64} style={{ marginTop: 10 }} />
            ))}
          </Card>
          <Card>
            <Skeleton width={160} height={22} />
            <Skeleton height={48} style={{ marginTop: 10 }} />
          </Card>
        </div>
        <Skeleton height={320} radius={14} />
      </div>
    </div>
  );
}
