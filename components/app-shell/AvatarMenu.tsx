"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonIcon } from "@/components/icons";
import { appRequestHref } from "@/lib/app-request";
import { signOutAction } from "@/lib/auth/actions";
import styles from "./header.module.css";

type ViewToggle = { mode: "simple" | "full"; set: (input: { mode: "simple" | "full" }) => Promise<{ ok: true } | { ok: false; error: string }> };

export function AvatarMenu({ email, view }: { email?: string | null; view?: ViewToggle }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function flip() {
    if (!view || switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      const r = await view.set({ mode: view.mode === "simple" ? "full" : "simple" });
      if (r.ok) router.refresh();
      else setSwitchError(r.error);
    } catch {
      setSwitchError("Couldn't switch. Try again.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Menu.Root>
      <Menu.Trigger className={styles.avatar} aria-label="Account menu" data-tour="avatar">
        <PersonIcon width={18} height={18} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={styles.menu} align="end" sideOffset={8}>
          {email ? <div className={styles.menuEmail}>{email}</div> : null}
          {/* TODO(account page): link to account settings */}
          <Menu.Item className={styles.menuItem}>Account</Menu.Item>
          {view ? (
            <Menu.Item className={styles.menuItem} onSelect={() => void flip()} disabled={switching} data-testid="view-toggle">
              {view.mode === "simple" ? "Full view" : "Simple view"}
            </Menu.Item>
          ) : null}
          <Menu.Item asChild>
            <a className={styles.menuItem} href={appRequestHref({ accountEmail: email })} data-testid="app-request">
              Get the phone app
            </a>
          </Menu.Item>
          {switchError ? (
            <div className={styles.menuEmail} role="alert">
              {switchError}
            </div>
          ) : null}
          <form action={signOutAction} className={styles.menuForm}>
            {/* Keep the menu mounted on select so the form submits; the action redirects away. */}
            <Menu.Item asChild onSelect={(e) => e.preventDefault()}>
              <button type="submit" className={`${styles.menuItem} ${styles.menuButton}`}>
                Sign out
              </button>
            </Menu.Item>
          </form>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
