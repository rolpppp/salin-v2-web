"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/button/Button";
import { Drawer } from "@/components/drawer/Drawer";
import { Field, Input, Select } from "@/components/field/Field";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { MoneyInput } from "@/components/money-input/MoneyInput";
import { cn } from "@/lib/cn";
import { formatPeso, formatPesoWhole, moneyErrorMessage, parseMoney } from "@/lib/money";
import { floorDiv } from "@/lib/money/core";
import { SPLIT_MESSAGES, movesOf, paceAfter, splitReceive } from "./receive-split";
import styles from "./simple-today.module.css";
import type { SimpleActions, SimpleTodayModel } from "./types";

export type SavedMove = { from: string; fromName: string; to: string; toName: string; amountMinor: number };

const KEEP_KEY = "salin.simple.keep";
const SAVE_FAILED = "Couldn't save. Check your connection and try again. Nothing was changed.";

/** Integer centavos as what a person would type: 50000 -> "500", 50050 -> "500.50". */
export function minorToInput(minor: number): string {
  const pesos = floorDiv(minor, 100);
  const cents = minor - pesos * 100;
  return cents === 0 ? String(pesos) : `${pesos}.${String(cents).padStart(2, "0")}`;
}

function readKeep(): string {
  try {
    const raw = window.localStorage.getItem(KEEP_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? minorToInput(n) : "";
  } catch {
    return "";
  }
}
function writeKeep(minor: number) {
  try {
    if (minor > 0) window.localStorage.setItem(KEEP_KEY, String(minor));
    else window.localStorage.removeItem(KEEP_KEY);
  } catch {
    // Remembering is a convenience only.
  }
}

/** Empty means 0; otherwise a normal money parse that allows 0. */
function parseOptional(raw: string): { ok: true; minor: number } | { ok: false } {
  if (raw.trim() === "") return { ok: true, minor: 0 };
  const r = parseMoney(raw, { requirePositive: false });
  return r.ok ? { ok: true, minor: r.minor } : { ok: false };
}

export type ReceiveMoneyProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: SimpleTodayModel;
  actions: Pick<SimpleActions, "receiveMoney">;
  launcher: () => HTMLElement | null;
  onSaved: (moves: SavedMove[]) => void;
};

/**
 * "I got money": one sheet, one screen, one Save. Amount first. The received-in row holds the remainder, so the
 * rows always add up; the live line shows what the new money does to the daily amount before anything is saved.
 * The parent gives it a new `key` on every opening so each one starts clean.
 */
export function ReceiveMoney({ open, onOpenChange, model, actions, launcher, onSaved }: ReceiveMoneyProps) {
  const announce = useAnnounce();
  const r = model.receive;
  const todayIso = model.week.find((d) => d.state === "today")?.day ?? model.week[0]?.day ?? "";
  const name = (id: string) => r.accounts.find((a) => a.id === id)?.name ?? "";

  const [amount, setAmount] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(r.sources.some((s) => s.id === r.lastSourceId) ? r.lastSourceId : null);
  const [on, setOn] = useState(todayIso);
  const [receivedInId, setReceivedInId] = useState(r.accounts.some((a) => a.id === r.defaultReceivedInId) ? (r.defaultReceivedInId ?? "") : (r.accounts[0]?.id ?? ""));
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState(() => (typeof window === "undefined" ? "" : readKeep()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const others = r.accounts.filter((a) => a.id !== receivedInId);
  const amountParsed = parseMoney(amount);
  const amountMinor = amountParsed.ok ? amountParsed.minor : null;
  const keepParsed = parseOptional(keep);
  const movedParsed = others.map((a) => ({ accountId: a.id, p: parseOptional(moved[a.id] ?? "") }));
  const invalidRow = !keepParsed.ok || movedParsed.some((m) => !m.p.ok);
  const split = splitReceive({
    amountMinor,
    keepMinor: keepParsed.ok ? keepParsed.minor : 0,
    receivedInId,
    moved: movedParsed.map((m) => ({ accountId: m.accountId, minor: m.p.ok ? m.p.minor : 0 })),
    spendingBucketId: r.spendingBucketId,
    keepBucketId: r.keepBucketId,
  });
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(on) && on <= todayIso;

  const noAccounts = r.accounts.length === 0;
  const reason = noAccounts
    ? null
    : invalidRow
      ? "Use numbers like 500 or 500.50 for the amounts."
      : !dateOk
        ? "Pick today or an earlier day."
        : !split.ok
          ? SPLIT_MESSAGES[split.problem]
          : null;
  const canSave = !noAccounts && reason === null && split.ok && !busy;

  const spend = split.ok ? split.spendMinor : null;
  const pace = spend === null ? null : paceAfter(model.spendableLeftMinor, spend, model.daysUntil);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || !split.ok || amountMinor === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await actions.receiveMoney({ amountMinor, receivedInId, sourceId, on, lines: split.lines });
      if (!res.ok) {
        setError(res.error);
        announce(res.error);
        return;
      }
      writeKeep(keepParsed.ok ? keepParsed.minor : 0);
      announce(`Saved. ${formatPeso(split.spendMinor)} added to your spending money.`);
      onSaved(movesOf(split.lines, receivedInId).map((m) => ({ from: receivedInId, fromName: name(receivedInId), to: m.to, toName: name(m.to), amountMinor: m.amountMinor })));
      onOpenChange(false);
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  function allIn(id: string) {
    setReceivedInId(id);
    setMoved({});
    setError(null);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="I got money"
      description="Type what you received, say where it went, and see what it does to your daily amount."
      initialFocus={() => formRef.current?.querySelector<HTMLElement>('[data-field="amount"] input')}
      returnFocus={launcher}
    >
      {noAccounts ? (
        <div className={styles.form} data-testid="receive-empty">
          <p className={styles.muted}>Add an account first, so Salin knows where your money is.</p>
          <Link href="/plans/accounts" className={styles.linkBtn}>
            Go to Accounts
          </Link>
        </div>
      ) : (
        <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-label="I got money" data-testid="receive-form">
          <div data-field="amount" className={styles.amount}>
            <MoneyInput
              label="How much did you get?"
              size="lg"
              name="amount"
              value={amount}
              parse={(raw) => {
                const p = parseMoney(raw);
                return p.ok ? p : { ok: false, error: moneyErrorMessage("received", p.error) };
              }}
              onValueChange={(raw) => {
                setAmount(raw);
                setError(null);
              }}
            />
          </div>

          <div className={styles.group} role="group" aria-labelledby="rm-source">
            <span className={styles.groupLabel} id="rm-source">
              From
            </span>
            <div className={styles.chips}>
              {r.sources.map((s) => (
                <button key={s.id} type="button" className={styles.chipBtn} aria-pressed={sourceId === s.id} onClick={() => setSourceId(s.id)}>
                  {s.name}
                </button>
              ))}
              <button type="button" className={styles.chipBtn} aria-pressed={sourceId === null} onClick={() => setSourceId(null)}>
                Other
              </button>
            </div>
          </div>

          <Field label="Date">
            {(c) => <Input {...c} type="date" name="on" value={on} max={todayIso} onChange={(e) => setOn(e.target.value)} />}
          </Field>

          <div className={styles.group}>
            <span className={styles.groupLabel}>Where did it go?</span>
            <div className={styles.where} data-testid="where-it-goes">
              <div className={styles.recvRow} data-testid="received-in-row">
                <Field label="Received in">
                  {(c) => (
                    <Select {...c} name="receivedIn" value={receivedInId} onChange={(e) => allIn(e.target.value)} data-testid="received-in">
                      {r.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className={styles.recvAmt} aria-live="polite">
                  <b data-testid="received-in-amount" data-minor={split.ok ? split.remainderMinor : undefined}>
                    {split.ok ? formatPeso(split.remainderMinor) : "—"}
                  </b>
                  <small>stays here</small>
                </div>
              </div>
              {others.map((a) => (
                <MoneyInput
                  key={a.id}
                  label={`Move to ${a.name}`}
                  name={`move-${a.id}`}
                  value={moved[a.id] ?? ""}
                  placeholder="0"
                  onValueChange={(raw) => {
                    setMoved((m) => ({ ...m, [a.id]: raw }));
                    setError(null);
                  }}
                />
              ))}
              {others.length > 0 ? (
                <div className={styles.chips}>
                  {r.accounts.map((a) => (
                    <button key={a.id} type="button" className={styles.chipBtn} onClick={() => allIn(a.id)} data-testid={`all-in-${a.id}`}>
                      All in {a.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <MoneyInput
            label={
              <>
                Keep some aside <em className={styles.optional}>optional</em>
              </>
            }
            name="keep"
            value={keep}
            placeholder="0"
            hint="Stays in the account it landed in, out of your spending money."
            onValueChange={(raw) => {
              setKeep(raw);
              setError(null);
            }}
          />

          <p className={cn(styles.live, !split.ok && styles.idle)} data-testid="receive-live" role="status">
            {split.ok && pace !== null ? (
              <>
                <b>{formatPeso(split.spendMinor)}</b> is yours to spend. Lasts until {model.until.label}: about <b>{formatPesoWhole(pace)}</b> a day.
              </>
            ) : (
              "Type an amount to see how far it goes."
            )}
          </p>

          <div className={styles.save}>
            <p className={cn(styles.reason, reason && amountMinor !== null && styles.bad)} data-testid="save-reason" aria-live="polite">
              {reason}
            </p>
            <p className={styles.err} role="alert" data-testid="receive-error">
              {error}
            </p>
            <Button type="submit" variant="primary" disabled={!canSave && !busy} loading={busy} loadingLabel="Saving" data-testid="receive-save">
              Save
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
