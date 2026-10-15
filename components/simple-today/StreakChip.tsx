import { Chip } from "@/components/chip/Chip";
import { SproutIcon } from "@/components/icons";
import styles from "./simple-today.module.css";

/** Days in a row with something logged or a no-spend day. Quiet by design: no flames, no scolding when it is zero. */
export function StreakChip({ days, todayDone }: { days: number; todayDone: boolean }) {
  if (days <= 0) return null;
  const label = `${days} ${days === 1 ? "day" : "days"}`;
  return (
    <Chip tone={todayDone ? "plan" : "neutral"} dot={false} className={styles.streak} data-testid="streak-chip" role="img" aria-label={`${label} in a row${todayDone ? "" : ". Nothing yet today"}`}>
      <SproutIcon />
      {label}
    </Chip>
  );
}
