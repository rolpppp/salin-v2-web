"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Field, Input, Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { SegmentedControl } from "@/components/segmented-control/SegmentedControl";
import { bpToPercent, hueColor } from "@/components/plans/shared";
import { SAVE_FAILED, type ActionResult } from "@/lib/actions/result";
import type { SettingsData } from "@/lib/data/settings";
import { dayWithWeekday } from "@/lib/money/pace";
import { RHYTHM_OPTIONS, REVIEW_DAY_OPTIONS, WEEK_START_OPTIONS, amountText, cleanName, parseIncomeForm, perDayLine, type Rhythm } from "@/lib/settings/model";
import { parseMoney } from "@/lib/money/parse";
import styles from "./settings.module.css";

export type SettingsActions = {
  saveIncomeRhythm: (input: { amountMinor: number | null; rhythm: string | null; next: string | null }) => Promise<ActionResult>;
  saveProfileBasics: (input: { firstName: string | null; weekStartsOn: number; reviewDay: number; section: "week" | "about" }) => Promise<ActionResult>;
  saveKeepBucket: (input: { bucketId: string }) => Promise<ActionResult>;
  saveViewMode: (input: { mode: "simple" | "full" }) => Promise<ActionResult>;
};

type Basics = { firstName: string | null; weekStartsOn: 0 | 1; reviewDay: number };

/** One card's save state: idle, saving, saved (for a moment) or an error that keeps what was typed. */
function useSave() {
  const announce = useAnnounce();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function run(fn: () => Promise<ActionResult>, doneMessage: string): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    setError(null);
    setSaved(false);
    let r: ActionResult;
    try {
      r = await fn();
    } catch {
      r = { ok: false, error: SAVE_FAILED };
    }
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      announce(r.error);
      return false;
    }
    setSaved(true);
    announce(doneMessage);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2500);
    return true;
  }
  return { saving, saved, error, setError, run };
}

function SaveRow({ dirty, saving, saved, error, label = "Save" }: { dirty: boolean; saving: boolean; saved: boolean; error: string | null; label?: string }) {
  return (
    <>
      <p className={styles.err} role="alert">
        {error}
      </p>
      <div className={styles.foot}>
        <Button type="submit" variant={dirty ? "primary" : "soft"} className={styles.btn44} disabled={!dirty || saving} loading={saving} loadingLabel="Saving">
          {label}
        </Button>
        <span className={styles.saved} role="status">
          {saved ? "Saved" : ""}
        </span>
      </div>
    </>
  );
}

function SettingsCard({ id, title, note, children, onSubmit }: { id: string; title: string; note?: ReactNode; children: ReactNode; onSubmit?: () => void }) {
  return (
    <Card aria-labelledby={`${id}-h`} className={styles.card} data-testid={`settings-${id}`}>
      <div className={styles.head}>
        <h2 id={`${id}-h`} className={styles.h2}>
          {title}
        </h2>
        {note ? <p className={styles.note}>{note}</p> : null}
      </div>
      {onSubmit ? (
        <form
          noValidate
          className={styles.card}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>
      ) : (
        children
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ money coming in

function IncomeCard({ data, todayIso, actions, onSaved }: { data: SettingsData; todayIso: string; actions: SettingsActions; onSaved: () => void }) {
  const initial = { amountText: amountText(data.pay.amountMinor), rhythm: data.pay.rhythm, next: data.pay.nextDate ?? "" };
  const [base, setBase] = useState(initial);
  const [amount, setAmount] = useState(initial.amountText);
  const [rhythm, setRhythm] = useState<Rhythm | null>(initial.rhythm);
  const [next, setNext] = useState(initial.next);
  const save = useSave();
  const dateRef = useRef<HTMLInputElement>(null);
  const dirty = amount.trim() !== base.amountText || rhythm !== base.rhythm || next !== base.next;
  const unset = base.amountText === "" && base.rhythm === null;
  const parsedAmount = amount.trim() === "" ? null : parseMoney(amount);
  const live = perDayLine(parsedAmount && parsedAmount.ok ? parsedAmount.minor : null, rhythm);

  async function submit() {
    const p = parseIncomeForm({ amountText: amount, rhythm, next }, todayIso, data.pay.nextDate);
    if (!p.ok) {
      save.setError(p.error);
      return;
    }
    const ok = await save.run(() => actions.saveIncomeRhythm({ amountMinor: p.value.amountMinor, rhythm: p.value.rhythm, next: p.value.next }), "Money coming in saved.");
    if (ok) {
      setBase({ amountText: p.value.amountMinor === null ? "" : amount.trim(), rhythm: p.value.rhythm, next: p.value.next ?? "" });
      onSaved();
    }
  }

  return (
    <SettingsCard
      id="income"
      title="Money coming in"
      note={unset ? "Not set yet. Add a rough number so Salin can pace your money. Changes apply from now on. Money you already got keeps how it was split." : "Changes apply from now on. Money you already got keeps how it was split."}
      onSubmit={() => void submit()}
    >
      <MoneyInput label="About how much do you usually get?" hint="Each time it comes. A rough number is fine." value={amount} onValueChange={(raw) => setAmount(raw)} />
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>How often?</legend>
        <div className={styles.chips}>
          {RHYTHM_OPTIONS.map((o) => (
            <label key={o.value} className={styles.chip}>
              <input type="radio" name="settings-rhythm" value={o.value} checked={rhythm === o.value} onChange={() => setRhythm(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Next money arrives"
        hint={next ? `${dayWithWeekday(next)}. Your spending money is paced to last until then.` : "No date is fine. We'll pace it by the week until you know."}
      >
        {(control) => (
          <div className={styles.dateRow}>
            <Input {...control} ref={dateRef} type="date" className={styles.date} min={todayIso} value={next} onChange={(e) => setNext(e.target.value)} />
            <label className={styles.unsure}>
              <input
                type="checkbox"
                checked={next === ""}
                onChange={(e) => {
                  if (e.target.checked) setNext("");
                  else dateRef.current?.focus();
                }}
              />
              <span>Not sure</span>
            </label>
          </div>
        )}
      </Field>
      <p className={styles.live} aria-live="polite" data-testid="per-day-line">
        {live}
      </p>
      <SaveRow dirty={dirty} {...save} />
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ your week

function WeekCard({ basics, viewMode, actions, onSaved }: { basics: Basics; viewMode: "simple" | "full"; actions: SettingsActions; onSaved: (b: Basics) => void }) {
  const [ws, setWs] = useState<"0" | "1">(String(basics.weekStartsOn) as "0" | "1");
  const [rd, setRd] = useState(basics.reviewDay);
  const save = useSave();
  const dirty = Number(ws) !== basics.weekStartsOn || rd !== basics.reviewDay;

  async function submit() {
    const next: Basics = { ...basics, weekStartsOn: Number(ws) as 0 | 1, reviewDay: rd };
    const ok = await save.run(() => actions.saveProfileBasics({ ...next, section: "week" }), "Your week saved.");
    if (ok) onSaved(next);
  }

  return (
    <SettingsCard id="week" title="Your week" note="Weeks you already closed stay as they were. The new start applies to this week and the ones after." onSubmit={() => void submit()}>
      <div className={styles.fieldset}>
        <span className={styles.legend} id="settings-ws-label">
          Week starts on
        </span>
        <SegmentedControl label="Week starts on" options={WEEK_START_OPTIONS} value={ws} onValueChange={setWs} />
      </div>
      {viewMode === "full" ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Review day</legend>
          <div className={styles.chips}>
            {REVIEW_DAY_OPTIONS.map((o) => (
              <label key={o.value} className={`${styles.chip} ${styles.chipSm}`}>
                <input type="radio" name="settings-review-day" value={o.value} checked={rd === o.value} onChange={() => setRd(o.value)} aria-label={o.long} />
                <span aria-hidden="true">{o.label}</span>
              </label>
            ))}
          </div>
          <p className={styles.note}>The day Review asks you to look back at the week.</p>
        </fieldset>
      ) : null}
      <SaveRow dirty={dirty} {...save} />
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ your buckets

function BucketsCard({ data, actions }: { data: SettingsData; actions: SettingsActions }) {
  const options = data.buckets.filter((b) => b.groupKey !== "spend");
  const [base, setBase] = useState(data.keepBucketId ?? "");
  const [pick, setPick] = useState(data.keepBucketId ?? "");
  const save = useSave();
  const dirty = pick !== base && pick !== "";

  async function submit() {
    const ok = await save.run(() => actions.saveKeepBucket({ bucketId: pick }), "Kept-aside bucket saved.");
    if (ok) setBase(pick);
  }

  return (
    <SettingsCard id="buckets" title="Your buckets" note={data.activePlanName ? `Shares are from ${data.activePlanName}.` : "No split plan yet. You can start one from Edit buckets and split."} onSubmit={() => void submit()}>
      {options.length > 0 ? (
        <Field label="Kept aside goes to" hint="Money you set aside when you get paid lands in this bucket.">
          {(control) => (
            <Select {...control} value={pick} onChange={(e) => setPick(e.target.value)}>
              {options.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <p className={styles.note}>You have no saving bucket yet. Add one from Edit buckets and split, then pick it here.</p>
      )}
      {data.buckets.length > 0 ? (
        <div>
          <p className={styles.sub} id="settings-bucket-list-h">
            Your buckets
          </p>
          <ul className={styles.list} aria-labelledby="settings-bucket-list-h" data-testid="settings-bucket-list">
            {data.buckets.map((b) => (
              <li key={b.id} className={styles.row}>
                <i className={styles.dot} style={{ background: hueColor(b.hue) }} aria-hidden="true" />
                <span className={styles.rowName}>{b.name}</span>
                {b.sharePercentBp !== null ? <span className={styles.rowShare}>{bpToPercent(b.sharePercentBp)}%</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className={styles.foot}>
        <ButtonLink href="/plans/split" variant="soft" className={styles.btn44}>
          Edit buckets and split
        </ButtonLink>
      </div>
      {options.length > 0 ? <SaveRow dirty={dirty} {...save} /> : null}
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ about you

function AboutCard({ basics, actions, onSaved }: { basics: Basics; actions: SettingsActions; onSaved: (b: Basics) => void }) {
  const [name, setName] = useState(basics.firstName ?? "");
  const save = useSave();
  const dirty = name.trim() !== (basics.firstName ?? "");

  async function submit() {
    const c = cleanName(name);
    if (!c.ok) {
      save.setError(c.error);
      return;
    }
    const next: Basics = { ...basics, firstName: c.value };
    const ok = await save.run(() => actions.saveProfileBasics({ ...next, section: "about" }), "Your name saved.");
    if (ok) {
      setName(c.value ?? "");
      onSaved(next);
    }
  }

  return (
    <SettingsCard id="about" title="About you" onSubmit={() => void submit()}>
      <Field label="First name" hint="What Salin calls you on Today.">
        {(control) => <Input {...control} value={name} maxLength={60} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />}
      </Field>
      <SaveRow dirty={dirty} {...save} />
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ view

function ViewCard({ mode, actions, onChanged }: { mode: "simple" | "full"; actions: SettingsActions; onChanged: (m: "simple" | "full") => void }) {
  const router = useRouter();
  const save = useSave();

  async function change(next: "simple" | "full") {
    if (next === mode || save.saving) return;
    const ok = await save.run(() => actions.saveViewMode({ mode: next }), next === "simple" ? "Simple view on." : "Full view on.");
    if (ok) {
      onChanged(next);
      router.refresh();
    }
  }

  return (
    <SettingsCard id="view" title="View" note="Simple shows what's fine to spend today. Full has every bucket, the plan and Review. Same money either way.">
      <SegmentedControl
        label="View"
        options={[
          { value: "simple", label: "Simple" },
          { value: "full", label: "Full" },
        ]}
        value={mode}
        onValueChange={(m) => void change(m)}
      />
      <p className={styles.err} role="alert">
        {save.error}
      </p>
      <span className={styles.saved} role="status">
        {save.saved ? "Saved" : ""}
      </span>
    </SettingsCard>
  );
}

export function SettingsView({ data, todayIso, actions }: { data: SettingsData; todayIso: string; actions: SettingsActions }) {
  const router = useRouter();
  const [basics, setBasics] = useState<Basics>({ firstName: data.firstName, weekStartsOn: data.weekStartsOn, reviewDay: data.reviewDay });
  const [mode, setMode] = useState(data.viewMode);
  return (
    <div className={styles.stack}>
      <IncomeCard data={data} todayIso={todayIso} actions={actions} onSaved={() => router.refresh()} />
      <WeekCard basics={basics} viewMode={mode} actions={actions} onSaved={setBasics} />
      <BucketsCard data={data} actions={actions} />
      <AboutCard basics={basics} actions={actions} onSaved={setBasics} />
      <ViewCard mode={mode} actions={actions} onChanged={setMode} />
    </div>
  );
}
