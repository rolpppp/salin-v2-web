import { ButtonLink } from "@/components/button/Button";
import { appRequestHref } from "@/lib/app-request";
import styles from "./tour.module.css";

/** Simple and Full, and where the switch lives. Shown at the end of onboarding. */
export function ViewsTile({ index = 0 }: { index?: number }) {
  return (
    <section className={styles.tile} style={{ "--n": index } as React.CSSProperties} aria-labelledby="tour-views-h" data-testid="tour-views">
      <h3 id="tour-views-h">Two ways to look at your money</h3>
      <div className={styles.toggle} aria-hidden="true">
        <span className={styles.thumb} />
        <span>Simple</span>
        <span>Full</span>
      </div>
      <p>
        <b>Simple</b> is one number a day: what&apos;s fine to spend. <b>Full</b> shows every bucket, your plans and the money waiting to be sorted.
      </p>
      <p className={styles.hint}>Switch any time from the account menu at the top right, or the link at the bottom of Today.</p>
    </section>
  );
}

/** Asks for the Android app by email. The APK is shared on request for now. */
export function AppTile({ index = 0, name }: { index?: number; name?: string | null }) {
  return (
    <section className={styles.tile} style={{ "--n": index } as React.CSSProperties} aria-labelledby="tour-app-h" data-testid="tour-app">
      <h3 id="tour-app-h">Salin on your phone</h3>
      <p>The Android app is shared by request for now. Email us and we&apos;ll send you the APK.</p>
      <ButtonLink variant="soft" href={appRequestHref({ name })} data-testid="app-request-cta">
        Request the app
      </ButtonLink>
    </section>
  );
}
