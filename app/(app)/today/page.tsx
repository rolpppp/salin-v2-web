import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Card, CardTitle } from "@/components/card/Card";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Greeting } from "@/components/today/Greeting";
import { LogSpendingSlot } from "@/components/today/LogSpendingSlot";
import { TimezoneSync } from "@/components/today/TimezoneSync";
import styles from "@/components/today/today.module.css";
import { requireUser, displayFirstName } from "@/lib/auth/session";
import { formatMoney } from "@/lib/data/balances";
import { getProfile, getTodayData, type TodayData } from "@/lib/data/today";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export const metadata: Metadata = { title: "Today" };

const neg = (n: number) => (n < 0 ? ` ${styles.neg}` : "");

export default async function TodayPage() {
  const user = await requireUser("/today");
  const supabase = await createClient();
  const tzCookie = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const timeZone = validTimeZone(tzCookie ? decodeURIComponent(tzCookie) : null);

  let data: TodayData | null = null;
  let firstName: string | null = displayFirstName(null, user);
  if (supabase) {
    try {
      const profile = await getProfile(supabase, user.id);
      firstName = displayFirstName(profile?.firstName, user);
      data = await getTodayData(supabase, {
        nowMs: nowMs(),
        timeZone,
        weekStartsOn: profile?.weekStartsOn ?? 1,
        homeCurrency: profile?.homeCurrency ?? "PHP",
      });
    } catch (err) {
      console.error("[today] could not load", err);
    }
  }

  return (
    <>
      <TimezoneSync serverZone={tzCookie ? timeZone : null} />
      <Greeting firstName={firstName} />
      <LogSpendingSlot />
      {!data ? (
        <EmptyState title="Couldn't load your numbers">Check your connection and reload the page. Nothing was changed.</EmptyState>
      ) : (
        <>
          {data.syncOff ? (
            <p className={styles.banner} role="status" data-testid="sync-off-banner">
              Spending from your phone shows here when sync is on in the Salin app.
            </p>
          ) : null}
          <div className={styles.grid}>
            <AccountsCard accounts={data.accounts} />
            <SpendingCard spending={data.spending} />
          </div>
        </>
      )}
    </>
  );
}

function AccountsCard({ accounts }: { accounts: TodayData["accounts"] }) {
  if (accounts.length === 0) {
    return (
      <EmptyState title="No accounts yet">Accounts you add in the Salin app show here once sync is on.</EmptyState>
    );
  }
  return (
    <Card aria-labelledby="accounts-h" className={styles.card}>
      <CardTitle id="accounts-h">Accounts</CardTitle>
      <ul className={styles.list} data-testid="accounts-list">
        {accounts.map((a) => (
          <li key={a.id} className={styles.row}>
            <span className={styles.name}>{a.name}</span>
            <span className={`${styles.amt}${neg(a.balanceMinor)}`}>{formatMoney(a.balanceMinor, a.currency)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SpendingCard({ spending }: { spending: TodayData["spending"] }) {
  if (spending.length === 0) {
    return (
      <EmptyState title="Spending this week">Nothing logged this week. Log spending on your phone and it shows here.</EmptyState>
    );
  }
  const multi = spending.length > 1;
  return (
    <Card aria-labelledby="spending-h" className={styles.card}>
      <CardTitle id="spending-h">Spending this week</CardTitle>
      {spending.map((s) => (
        <div key={s.currency} className={styles.card} data-testid={`spending-${s.currency}`}>
          {multi ? <p className={styles.cur}>{s.currency}</p> : null}
          <p className={styles.big} data-testid="spending-total">
            {formatMoney(s.totalMinor, s.currency)}
          </p>
          <ul className={styles.list} data-testid="spending-lines">
            {s.lines.map((l) => (
              <li key={l.categoryId ?? "none"} className={styles.row}>
                <span className={styles.name}>{l.name}</span>
                <span className={styles.amt}>{formatMoney(l.totalMinor, s.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
