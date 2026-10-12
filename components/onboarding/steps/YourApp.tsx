import { useEffect, useRef } from "react";
import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/button/Button";
import { shortDate } from "@/lib/data/money-in-model";
import { formatPeso } from "@/lib/money";
import { ACCOUNT_TYPE_LABELS } from "@/lib/data/accounts";
import { initAccounts, protectedAccountId, toggleAccount, validateApp } from "@/lib/onboarding/appPath";
import type { PhoneFacts } from "@/lib/onboarding/facts";
import type { ShellStepModule } from "@/lib/onboarding/shell-types";
import type { StepBodyProps } from "@/lib/onboarding/step";
import { realtimeEnabled } from "@/lib/live/refresh-scheduler";
import { createClient } from "@/lib/supabase/browser";
import { useOnboardingEnv } from "../env";
import styles from "./app-steps.module.css";

const POLL_MS = 10_000; // until realtime is connected
const POLL_CONNECTED_MS = 60_000; // safety net once it is
const NUDGE_MS = 1_500;

/**
 * Watches for the phone's first sync: Supabase Realtime on `accounts` / `ledger_entries` for this user (RLS applies),
 * with a 10 s poll as the fallback. A burst of realtime events (a first sync writes hundreds of rows) is collapsed
 * into one re-read. Stays on while the counts are showing so they keep up with a sync that's still arriving.
 */
function usePhoneWatch() {
  const { userId, refreshPhone } = useOnboardingEnv();
  useEffect(() => {
    let nudge: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (nudge !== null) clearTimeout(nudge);
      nudge = setTimeout(() => {
        nudge = null;
        void refreshPhone();
      }, NUDGE_MS);
    };
    const client = realtimeEnabled() ? createClient() : null;
    let connected = false;
    const channel = client
      ?.channel(`onboarding-phone-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "ledger_entries", filter: `user_id=eq.${userId}` }, onChange)
      .subscribe((status) => {
        connected = status === "SUBSCRIBED";
      });
    // Ticks every POLL_MS; once realtime is connected only every sixth tick re-reads.
    let tick = 0;
    const poll = setInterval(() => {
      tick += 1;
      if (!connected || tick % (POLL_CONNECTED_MS / POLL_MS) === 0) void refreshPhone();
    }, POLL_MS);
    return () => {
      clearInterval(poll);
      if (nudge !== null) clearTimeout(nudge);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [userId, refreshPhone]);
}

function Waiting() {
  return (
    <div className={styles.phone}>
      <ol className={styles.how}>
        <li>
          <span aria-hidden="true">1</span>
          <span>
            Open <b>Salin</b> on your phone
          </span>
        </li>
        <li>
          <span aria-hidden="true">2</span>
          <span>
            Go to <b>Settings › Sync</b>
          </span>
        </li>
        <li>
          <span aria-hidden="true">3</span>
          <span>
            Turn on <b>Sync with your account</b> and sign in with the same account you use here
          </span>
        </li>
      </ol>
      <div className={styles.wait} id="ob-wait" role="status" tabIndex={-1}>
        <span className={styles.pulse} aria-hidden="true" />
        <span>Waiting for your phone…</span>
        <small>It usually takes a few seconds after you turn it on.</small>
      </div>
    </div>
  );
}

function Found({ facts, draft, update, errorField }: StepBodyProps & { facts: PhoneFacts }) {
  const keep = protectedAccountId(draft, facts);
  const ticked = new Set(draft.accounts.map((a) => a.id));
  const since = shortDate(facts.sinceIso);
  const stats: Array<[string, string]> = [
    [String(facts.accounts.length), facts.accounts.length === 1 ? "account" : "accounts"],
    [String(facts.categoryCount), facts.categoryCount === 1 ? "category" : "categories"],
    [String(facts.entriesSince), `${facts.entriesSince === 1 ? "entry" : "entries"} since ${since}`],
    [formatPeso(facts.incomeSinceMinor), `came in since ${since}`],
  ];
  return (
    <>
      <div className={styles.stats} role="group" aria-label="What we found on your phone">
        {stats.map(([n, label]) => (
          <div key={label}>
            <b>{n}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <fieldset className={styles.fs}>
        <legend>Accounts in your plan</legend>
        <div className={styles.checks}>
          {facts.accounts.map((a, i) => {
            const isLanding = a.id === keep;
            const isLast = ticked.size <= 1 && ticked.has(a.id);
            return (
              <label key={a.id} className={styles.check}>
                <input
                  type="checkbox"
                  id={`ob-acct-${i}`}
                  checked={ticked.has(a.id)}
                  disabled={isLanding || isLast}
                  aria-invalid={errorField === `ob-acct-${i}` ? true : undefined}
                  onChange={(e) => {
                    const patch = toggleAccount(draft, facts, a.id, e.target.checked);
                    if (patch) update(patch);
                  }}
                />
                <span className={styles.box} aria-hidden="true">
                  <CheckIcon />
                </span>
                <span>
                  <b>{a.name}</b>
                  <small>
                    {ACCOUNT_TYPE_LABELS[a.type]}
                    {a.currency !== "PHP" ? ` · ${a.currency}` : ""}
                    {isLanding ? " · your pay lands here" : ""}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className={styles.note}>Spending you log on your phone keeps showing up here. Nothing on your phone changes until you confirm something on the web.</p>
    </>
  );
}

function YourAppBody(props: StepBodyProps) {
  const { facts, track } = useOnboardingEnv();
  const { announce } = props;
  usePhoneWatch();

  // Analytics and the announcement when the phone's data arrives after a wait.
  const waitedSince = useRef<number | null>(null);
  const found = facts !== null;
  useEffect(() => {
    if (!found && waitedSince.current === null) {
      waitedSince.current = Date.now();
      track({ event: "sync_prompt_shown", props: { seconds_waited: 0 } });
    } else if (found && waitedSince.current !== null) {
      track({ event: "sync_connected", props: { seconds_waited: Math.round((Date.now() - waitedSince.current) / 1000) } });
      waitedSince.current = null;
      announce("Found your Salin data");
    }
  }, [found, track, announce]);

  return facts ? <Found {...props} facts={facts} /> : <Waiting />;
}

function ContinueWithoutApp() {
  const { facts, switchToWeb } = useOnboardingEnv();
  if (facts) return null;
  return (
    <Button variant="quiet" onClick={switchToWeb}>
      Continue without the app
    </Button>
  );
}

/** SPEC §7.4 step 1. */
export const yourAppStep: ShellStepModule = {
  id: "app",
  label: "Your app",
  question: (draft) => (draft.accounts.length > 0 ? "Found your Salin data" : "Turn on sync in the Salin app"),
  reason: (draft) =>
    draft.accounts.length > 0
      ? "Synced from your phone just now. Choose which accounts belong in your plan; you can change this later."
      : "Your phone keeps everything on the device until sync is on. Turn it on once and your accounts, categories and spending show up here, and stay in step both ways.",
  Body: YourAppBody,
  Extra: ContinueWithoutApp,
  validate: () => null,
  validateWithFacts: (draft, _ctx, facts) => validateApp(draft, facts),
  enterWithFacts: (draft, _ctx, facts) => initAccounts(draft, facts),
  primaryDisabled: (_draft, facts) => facts === null,
};
