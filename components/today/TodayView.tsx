"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Drawer } from "@/components/drawer/Drawer";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { coverFromBuffer } from "@/lib/actions/covers";
import { hueVar } from "@/lib/data/money-in-model";
import { coverMessage, type CoverInfo, type TodayView as TodayViewModel } from "@/lib/data/today-model";
import { BucketDrawerBody } from "./BucketDrawerBody";
import { Goals } from "./Goals";
import { NextStepCard } from "./NextStepCard";
import { SafeCard, type Flash } from "./SafeCard";
import { Shelf } from "./Shelf";
import styles from "./today.module.css";

type CoverError = { scope: "card" | "drawer"; text: string };

/**
 * Today below the greeting: [Safe to spend | Next step], the shelf, goals, and the bucket drawer.
 * The cover flag, the drawer and the cover action's busy/error state live here because the Next step card,
 * the drawer and the Safe to spend card all take part in one cover. Nothing here is persisted: leaving Today
 * clears the flag (SPEC §1).
 */
export function TodayView({ view, logSlot }: { view: TodayViewModel; logSlot: ReactNode }) {
  const announce = useAnnounce();
  // `openId` stays set while the drawer slides out, so its content doesn't blank mid-animation.
  const [openId, setOpenId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [coverError, setCoverError] = useState<CoverError | null>(null);
  const [busy, startTransition] = useTransition();

  function openBucket(id: string, el: HTMLElement | null) {
    // Safari doesn't focus a button on click, so focus it ourselves; the Drawer returns focus to it on close.
    el?.focus();
    setCoverError(null);
    setOpenId(id);
    setIsOpen(true);
  }

  function cover(info: CoverInfo | null, scope: CoverError["scope"]) {
    if (!info || busy) return;
    setCoverError(null);
    startTransition(async () => {
      const r = await coverFromBuffer({ toBucketId: info.toBucketId });
      if (!r.ok) {
        // Never a success state for a failed write: say what failed, at the control.
        setCoverError({ scope, text: r.error });
        announce(r.error);
        return;
      }
      const msg = coverMessage(info, r);
      setFlash(msg);
      announce(msg.text);
      if (scope === "drawer") setIsOpen(false);
      else requestAnimationFrame(() => document.getElementById("next-card")?.focus());
    });
  }

  const open = openId ? (view.drawers[openId] ?? null) : null;
  const seeLiving = () => {
    if (view.livingBucketId) {
      setCoverError(null);
      setOpenId(view.livingBucketId);
      setIsOpen(true);
    }
  };

  return (
    <>
      <div className={styles.row2}>
        <SafeCard safe={view.safe} flash={flash} />
        <NextStepCard
          next={view.next}
          week={view.week}
          onCover={() => cover(view.next.cover, "card")}
          coverBusy={busy}
          coverError={coverError?.scope === "card" ? coverError.text : null}
          onSeeWhatHappened={seeLiving}
          logSlot={logSlot}
        />
      </div>
      <Shelf shelf={view.shelf} onOpen={openBucket} />
      <Goals goals={view.goals} />
      <Drawer
        open={isOpen && open !== null}
        onOpenChange={setIsOpen}
        title={open?.name ?? ""}
        description={open ? `${open.name} bucket: what is left and what went in and out this month.` : undefined}
        hue={open ? hueVar(open.hue) : undefined}
      >
        {open ? (
          <BucketDrawerBody view={open} onCover={() => cover(open.cover, "drawer")} coverBusy={busy} coverError={coverError?.scope === "drawer" ? coverError.text : null} />
        ) : null}
      </Drawer>
    </>
  );
}
