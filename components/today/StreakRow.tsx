import { NoSpendButton } from "@/components/simple-today/NoSpendButton";
import { StreakChip } from "@/components/simple-today/StreakChip";
import type { SimpleActions } from "@/components/simple-today/types";
import type { StreakResult } from "@/lib/money";
import styles from "./today.module.css";

/** Full view's streak (the same rule as Simple: a day counts with any logged spend or a no-spend mark). */
export function StreakRow({ streak, today, setNoSpend }: { streak: StreakResult; today: string; setNoSpend: SimpleActions["setNoSpend"] }) {
  const spentToday = streak.todayDone && !streak.noSpendToday;
  return (
    <div className={styles.streakRow} data-testid="full-streak" data-tour="streak">
      <StreakChip days={streak.days} todayDone={streak.todayDone} />
      <p className={styles.streakNote}>{spentToday ? "You logged spending today, so today counts." : streak.todayDone ? "Today is counted." : streak.days > 0 ? "Log something or mark a no-spend day to keep it going." : "Log what you spend each day to start a streak."}</p>
      {spentToday ? null : <NoSpendButton key={`${today}-${streak.noSpendToday}`} day={today} on={streak.noSpendToday} setNoSpend={setNoSpend} />}
    </div>
  );
}
