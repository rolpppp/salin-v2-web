"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/button/Button";
import { flagText, type LogSpendingData } from "@/lib/data/log-spending-model";
import styles from "./log-spending.module.css";
import { LogSpendingSheet, type LoggedInfo } from "./LogSpendingSheet";

/**
 * "+ Log spending" (SPEC §1, §8): the soft button, the sheet, and the Logged flag.
 * The flag is client state only: it lives as long as this component, so it is gone once the user leaves Today.
 */
export function LogSpendingLauncher({ data }: { data: LogSpendingData }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  const [flag, setFlag] = useState<string | null>(null);
  const button = useRef<HTMLElement | null>(null);

  return (
    <>
      <Button
        variant="soft"
        data-testid="log-spending-button"
        aria-haspopup="dialog"
        onClick={(e) => {
          button.current = e.currentTarget;
          setOpening((n) => n + 1);
          setOpen(true);
        }}
      >
        + Log spending
      </Button>
      <LogSpendingSheet
        key={opening}
        open={open}
        onOpenChange={setOpen}
        data={data}
        launcher={() => button.current}
        onLogged={(info: LoggedInfo) => setFlag(flagText(info))}
      />
      {flag ? (
        <p className={styles.flag} data-testid="logged-flag">
          {flag}
        </p>
      ) : null}
    </>
  );
}
