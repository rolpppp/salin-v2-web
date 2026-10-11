"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { PersonIcon } from "@/components/icons";
import styles from "./header.module.css";

/** Placeholder: items are wired to account and sign-out in the auth ticket. */
export function AvatarMenu() {
  return (
    <Menu.Root>
      <Menu.Trigger className={styles.avatar} aria-label="Account menu">
        <PersonIcon width={18} height={18} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={styles.menu} align="end" sideOffset={8}>
          {/* TODO(auth ticket): link to account page */}
          <Menu.Item className={styles.menuItem}>Account</Menu.Item>
          {/* TODO(auth ticket): call sign-out server action */}
          <Menu.Item className={styles.menuItem}>Sign out</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
