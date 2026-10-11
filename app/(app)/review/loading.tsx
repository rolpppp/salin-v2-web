import { Card } from "@/components/card/Card";
import { Skeleton } from "@/components/skeleton/Skeleton";
import styles from "@/components/review/review.module.css";

/** Shaped like the final blocks. Never a spinner over money. */
export default function ReviewLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Review">
      <Skeleton width={280} height={32} />
      <Skeleton width={380} height={16} style={{ margin: "10px 0 22px" }} />
      <div className={styles.review}>
        <Skeleton height={420} radius={14} />
        <div className={styles.cards}>
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton width={200} height={22} />
              <Skeleton height={48} style={{ marginTop: 10 }} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
