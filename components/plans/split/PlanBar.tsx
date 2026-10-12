"use client";

import { useId, useRef, useState } from "react";
import { Chip } from "@/components/chip/Chip";
import { ACTIVE_MARKER, type PlanChipModel } from "./logic";
import styles from "./split.module.css";

export const MAX_PLANS = 10;

type Props = {
  chips: PlanChipModel[];
  /** Key of the plan open in the editor; null while a from-scratch draft is open. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onScratch: () => void;
  onCopy: (key: string) => void;
  busy?: boolean;
};

/** One chip per plan (scrolls sideways inside itself on a phone) and a "+ New plan" menu. */
export function PlanBar({ chips, selectedKey, onSelect, onScratch, onCopy, busy }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const full = chips.length >= MAX_PLANS;
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  return (
    <div className={styles.planBar}>
      <div className={styles.chips} role="group" aria-label="Your plans" data-testid="plan-bar">
        {chips.map((c) => (
          <button key={c.key} type="button" className={styles.planChip} aria-pressed={selectedKey === c.key} data-plan-key={c.key} onClick={() => onSelect(c.key)}>
            <span className={styles.planChipName}>{c.name}</span>
            {c.isActive ? (
              <Chip tone="plan" data-testid="active-plan">
                {ACTIVE_MARKER}
              </Chip>
            ) : null}
          </button>
        ))}
        {selectedKey === null ? (
          <span className={styles.planChip} aria-current="true" data-testid="draft-chip">
            <span className={styles.planChipName}>New plan (not saved)</span>
          </span>
        ) : null}
      </div>

      <div
        className={styles.newMenu}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            close(true);
          }
        }}
        onBlur={(e) => {
          if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className={styles.newBtn}
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          disabled={full || busy}
          aria-describedby={full ? `${menuId}-full` : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          + New plan
        </button>
        {full ? (
          <span id={`${menuId}-full`} className="sr">
            You can have up to {MAX_PLANS} plans. Delete one to add another.
          </span>
        ) : null}
        {open ? (
          <div id={menuId} className={styles.menu} role="group" aria-label="New plan">
            <button
              type="button"
              className={styles.menuItem}
              autoFocus
              onClick={() => {
                close(false);
                onScratch();
              }}
            >
              From scratch
            </button>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  close(false);
                  onCopy(c.key);
                }}
              >
                Copy of {c.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
