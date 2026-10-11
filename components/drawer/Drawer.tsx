"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { CloseIcon } from "@/components/icons";
import styles from "./drawer.module.css";

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Short description for assistive tech (optional but recommended). */
  description?: string;
  /** Bucket hue (CSS colour or var()) to draw the 12px dot before the title. */
  hue?: string;
  children: ReactNode;
  /** Element to focus when the sheet opens (default: Radix's first focusable). */
  initialFocus?: () => HTMLElement | null | undefined;
  /** Element to focus when it closes (default: whatever had focus when it opened). */
  returnFocus?: () => HTMLElement | null | undefined;
};

/**
 * Right sheet (bottom sheet under 720px). Radix Dialog supplies the focus trap, Escape,
 * scrim click and aria-modal. On close, focus returns to whatever was focused when it
 * opened (a bucket button, "Log spending"), so it works with or without a Trigger.
 */
export function Drawer({ open, onOpenChange, title, description, hue, children, initialFocus, returnFocus }: DrawerProps) {
  const returnTo = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} />
        <Dialog.Content
          className={styles.drawer}
          onOpenAutoFocus={(e) => {
            returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const first = initialFocus?.();
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }}
          onCloseAutoFocus={(e) => {
            const el = returnFocus?.() ?? returnTo.current;
            if (el && el.isConnected) {
              e.preventDefault();
              el.focus();
            }
            returnTo.current = null;
          }}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className={styles.head}>
            <Dialog.Title className={styles.title}>
              {hue ? <i className={styles.hue} style={{ "--c": hue } as CSSProperties} aria-hidden="true" /> : null}
              {title}
            </Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close">
              <CloseIcon width={18} height={18} />
            </Dialog.Close>
          </div>
          {description ? <Dialog.Description className="sr">{description}</Dialog.Description> : null}
          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Re-export so callers can wrap a trigger and get automatic focus return. */
export const DrawerTrigger = Dialog.Trigger;
