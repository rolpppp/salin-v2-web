"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import styles from "./today.module.css";

const MESSAGE = "Password updated. Use it next time you sign in, here and in the Salin app.";

/**
 * One-time confirmation after a password reset (`/today?notice=password-updated`). Keeps showing after the param is
 * stripped from the URL (so a refresh doesn't repeat it); gone on the next navigation.
 */
export function PasswordUpdatedNotice() {
  const announce = useAnnounce();
  const router = useRouter();
  const arrived = useSearchParams().get("notice") === "password-updated";
  const [shown, setShown] = useState(false);
  if (arrived && !shown) setShown(true);
  useEffect(() => {
    if (!arrived) return;
    announce(MESSAGE);
    router.replace("/today", { scroll: false });
    // Once per arrival with the param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived]);
  if (!shown) return null;
  return (
    <p className={styles.banner} data-testid="password-updated">
      {MESSAGE}
    </p>
  );
}
