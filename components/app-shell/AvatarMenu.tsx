"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { PersonIcon } from "@/components/icons";
import { signOutAction } from "@/lib/auth/actions";
import styles from "./header.module.css";

export function AvatarMenu({ email }: { email?: string | null }) {
  return (
    <Menu.Root>
      <Menu.Trigger className={styles.avatar} aria-label="Account menu">
        <PersonIcon width={18} height={18} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={styles.menu} align="end" sideOffset={8}>
          {email ? <div className={styles.menuEmail}>{email}</div> : null}
          {/* TODO(account page): link to account settings */}
          <Menu.Item className={styles.menuItem}>Account</Menu.Item>
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
