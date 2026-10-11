import { Card } from "@/components/card/Card";
import { Skeleton } from "@/components/skeleton/Skeleton";
import styles from "@/components/today/today.module.css";

/** Shaped like the final blocks: greeting, [Safe to spend | Next step + week], the shelf, three goals. Never a spinner over money. */
export default function TodayLoading() {
  return (
    <div aria-busy="true" aria-label="Loading Today">
      <div className={styles.hello}>
        <div>
          <Skeleton width={280} height={32} />
          <Skeleton width={200} height={16} style={{ marginTop: 10 }} />
        </div>
        <div className={styles.acts}>
          <Skeleton width={130} height={40} radius={12} />
          <Skeleton width={120} height={40} radius={12} />
        </div>
      </div>
      <div className={styles.row2}>
        <Card className={styles.card}>
          <Skeleton width={110} height={16} />
          <Skeleton width={200} height={52} />
          <Skeleton width="80%" height={14} />
          <Skeleton height={26} />
        </Card>
        <Card className={styles.card}>
          <Skeleton width={90} height={14} />
          <Skeleton width="70%" height={28} />
          <Skeleton width="55%" height={16} />
          <Skeleton width={170} height={44} radius={12} />
          <Skeleton height={96} radius={14} />
        </Card>
      </div>
      <Card className={styles.shelfCard}>
        <Skeleton width={150} height={22} />
        <div className={styles.shelf} style={{ marginTop: 16 }}>
          {[2, 3, 3].map((n, g) => (
            <div key={g} className={styles.group}>
              <Skeleton width={110} height={14} style={{ marginBottom: 10 }} />
              <div className={styles.gCols} style={{ ["--gc" as string]: n }}>
                {Array.from({ length: n }, (_, i) => (
                  <div key={i} style={{ padding: "0 6px" }}>
                    <Skeleton width="70%" height={14} />
                    <Skeleton width="85%" height={20} style={{ marginTop: 6 }} />
                    <Skeleton height={Math.round(60 + ((g * 3 + i) % 4) * 40)} radius="0 0 12px 12px" style={{ marginTop: 24 }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className={styles.goals}>
        {[0, 1, 2].map((i) => (
          <Card key={i} className={styles.goal}>
            <Skeleton width="60%" height={18} />
            <Skeleton height={12} radius={6} />
            <Skeleton width="75%" height={14} />
          </Card>
        ))}
      </div>
    </div>
  );
}
