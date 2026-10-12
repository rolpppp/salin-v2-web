"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Drawer } from "@/components/drawer/Drawer";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { coverFromBuffer } from "@/lib/actions/covers";
import { hueVar } from "@/lib/data/money-in-model";
import { coverMessage, type CoverInfo, type TodayView as TodayViewModel } from "@/lib/data/today-model";
import { GROW_CLEAR_MS, growAnnouncement, type GrowMode } from "@/lib/motion/grow";
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
export function TodayView({ view, logSlot, grow = null }: { view: TodayViewModel; logSlot: ReactNode; grow?: GrowMode | null }) {
  const announce = useAnnounce();
  const router = useRouter();
  // The grow plays once. `mode` keeps it on after the param is stripped (so a refresh doesn't replay) and clears
  // it when the animations are over. All the motion is CSS keyed on `data-grow` (+ count-ups in Shelf/SafeCard).
  const [mode, setMode] = useState<GrowMode | null>(grow);
  const [seenGrow, setSeenGrow] = useState<GrowMode | null>(grow);
  if (grow !== seenGrow) {
    setSeenGrow(grow);
    if (grow) setMode(grow);
  }
  useEffect(() => {
    if (!grow) return;
    announce(growAnnouncement(grow, { totalMinor: view.shelf?.totalMinor ?? null, passed: view.goals.cards.flatMap((g) => (g.passedToday ? [{ name: g.name, milestone: g.passedToday }] : [])) }));
    router.replace("/today", { scroll: false });
    // Once per arrival with the param; later view updates must not re-announce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grow]);
  useEffect(() => {
    if (!mode) return;
    const t = setTimeout(() => setMode(null), GROW_CLEAR_MS);
    return () => clearTimeout(t);
  }, [mode]);
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
    <div data-grow={mode ?? undefined} style={{ display: "contents" }}>
      <div className={styles.row2}>
        <SafeCard safe={view.safe} flash={flash} grow={mode} />
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
      <Shelf shelf={view.shelf} onOpen={openBucket} grow={mode} />
      <Goals goals={view.goals} grow={mode} />
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
    </div>
  );
}
