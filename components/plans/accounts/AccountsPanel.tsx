"use client";

import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Card, CardTitle } from "@/components/card/Card";
import { Chip } from "@/components/chip/Chip";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Field, Input, Select } from "@/components/field/Field";
import { InlineName } from "@/components/plans/rows/InlineName";
import styles from "@/components/plans/rows/plans.module.css";
import { hueStyle, useRun } from "@/components/plans/rows/useRun";
import { addAccountAction, archiveAccountAction, renameAccountAction, restoreAccountAction, retypeAccountAction } from "@/lib/actions/accounts";
import { ACCOUNT_CURRENCIES, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_NAMES, type AccountTypeName, type AccountView, type AccountsData } from "@/lib/data/accounts";
import { formatMoney } from "@/lib/data/balances";

export function AccountsPanel({ data }: { data: AccountsData }) {
  /** A row that archives or restores disappears; keep focus on the section instead of dropping to <body>. */
  const focusHeading = () => document.getElementById("acct-h")?.focus();
  return (
    <Card aria-labelledby="acct-h">
      <div className={styles.head}>
        <CardTitle id="acct-h" tabIndex={-1}>
          Accounts
        </CardTitle>
        <span className={styles.muted}>Where your money actually sits. Buckets and income sources point here.</span>
      </div>
      {data.active.length === 0 ? (
        <EmptyState title="No accounts yet">Add the accounts you keep money in so each bucket knows where it lives. Accounts you add in the Salin app show here once sync is on.</EmptyState>
      ) : (
        <ul className={styles.list} data-testid="accounts-rows">
          {data.active.map((a) => (
            <AccountRow key={`${a.id}:${a.name}:${a.type}`} account={a} onArchived={focusHeading} />
          ))}
        </ul>
      )}
      <AddAccountForm />
      <div className={styles.foot}>
        <p className={styles.muted}>
          To move a bucket to another account, change &ldquo;Kept in&rdquo; under Split plan. Renaming an account keeps every bucket, source and transfer that
          uses it, because they point at the account itself.
        </p>
        {data.archived.length > 0 ? (
          <div className={styles.archived} data-testid="archived-accounts">
            <span>Archived:</span>
            {data.archived.map((a) => (
              <ArchivedItem key={a.id} id={a.id} name={a.name} onRestored={focusHeading} />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function AccountRow({ account: a, onArchived }: { account: AccountView; onArchived: () => void }) {
  const retype = useRun();
  const archive = useRun();
  const [type, setType] = useState<AccountTypeName>(a.type);

  return (
    <li className={`${styles.row} ${styles.acctRow}`}>
      <div className={styles.stack}>
        <InlineName
          label={`Account name for ${a.name}`}
          value={a.name}
          onCommit={(name) => renameAccountAction({ id: a.id, name })}
          saved={(name) => `Renamed to ${name}. Everything that used it still does.`}
        />
        <div className={styles.inline}>
          <Select
            className={styles.mini}
            aria-label={`Type of ${a.name}`}
            value={type}
            disabled={retype.busy}
            onChange={async (e) => {
              const next = e.target.value as AccountTypeName;
              setType(next);
              const r = await retype.run(() => retypeAccountAction({ id: a.id, type: next }), `${a.name} is now a ${ACCOUNT_TYPE_LABELS[next].toLowerCase()} account.`);
              if (!r.ok) setType(a.type);
            }}
          >
            {ACCOUNT_TYPE_NAMES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Chip tone="neutral">{a.currency}</Chip>
        </div>
        <p role="alert" className={styles.err}>
          {retype.error}
        </p>
      </div>
      <div>
        <span className={styles.num} data-testid="holds">
          {formatMoney(a.shouldHoldMinor ?? a.retainedMinor ?? 0, a.currency)}
        </span>
        <small className={styles.small}>{a.caption}</small>
      </div>
      <div className={styles.chips}>
        {a.buckets.map((b) => (
          <span key={b.id} className={styles.hueChip} style={hueStyle(b.hue)}>
            <i aria-hidden="true" />
            {b.name}
          </span>
        ))}
        {a.sources.map((s) => (
          <span key={s.id} className={styles.hueChip} data-in="">
            <i aria-hidden="true" />
            {s.name} lands here
          </span>
        ))}
      </div>
      <div className={styles.act}>
        {a.inUseReason ? (
          <span className={styles.inUse}>
            In use<small className={styles.small}>{a.inUseReason}</small>
          </span>
        ) : (
          <Button
            variant="quiet"
            loading={archive.busy}
            loadingLabel="Archiving"
            aria-label={`Archive ${a.name}`}
            onClick={async () => {
              const r = await archive.run(() => archiveAccountAction({ id: a.id }), `${a.name} archived. Restore it from the Archived list.`);
              if (r.ok) onArchived();
            }}
          >
            Archive
          </Button>
        )}
        <p role="alert" className={styles.err}>
          {archive.error}
        </p>
      </div>
    </li>
  );
}

function ArchivedItem({ id, name, onRestored }: { id: string; name: string; onRestored: () => void }) {
  const restore = useRun();
  return (
    <span className={styles.archivedItem}>
      {name}
      <Button
        variant="quiet"
        loading={restore.busy}
        loadingLabel="Restoring"
        aria-label={`Restore ${name}`}
        onClick={async () => {
          const r = await restore.run(() => restoreAccountAction({ id }), `${name} restored.`);
          if (r.ok) onRestored();
        }}
      >
        Restore
      </Button>
      <span role="alert" className={styles.err}>
        {restore.error}
      </span>
    </span>
  );
}

function AddAccountForm() {
  const add = useRun();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountTypeName>("bank");
  const [currency, setCurrency] = useState<string>("PHP");

  if (!open) {
    return (
      <div className={styles.foot}>
        <div>
          <Button id="add-account-toggle" onClick={() => setOpen(true)}>
            + Add account
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await add.run(() => addAccountAction({ name, type, currency }), `${name.trim()} added. It shows on your phone after the next sync.`);
        if (r.ok) {
          setName("");
          setOpen(false);
          requestAnimationFrame(() => document.getElementById("add-account-toggle")?.focus());
        }
      }}
    >
      <Field label="Name" error={add.error}>
        {(c) => <Input {...c} autoFocus autoComplete="off" placeholder="e.g. BPI Savings" value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Type">
        {(c) => (
          <Select {...c} value={type} onChange={(e) => setType(e.target.value as AccountTypeName)}>
            {ACCOUNT_TYPE_NAMES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Currency">
        {(c) => (
          <Select {...c} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {ACCOUNT_CURRENCIES.map((cur) => (
              <option key={cur}>{cur}</option>
            ))}
          </Select>
        )}
      </Field>
      <div className={styles.formBtns}>
        <Button type="submit" variant="primary" loading={add.busy} loadingLabel="Adding">
          Add account
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setOpen(false);
            add.setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
