import { appRequestHref } from "@/lib/app-request";
import styles from "./onboarding.module.css";

/** A quiet line, never a banner: the Android app is shared by request, by email. */
export function AppNote({ name }: { name?: string | null }) {
  return (
    <p className={styles.appNote}>
      Prefer your phone?{" "}
      <a href={appRequestHref({ name })} data-testid="app-note">
        Request the Android app
      </a>{" "}
      by email.
    </p>
  );
}
