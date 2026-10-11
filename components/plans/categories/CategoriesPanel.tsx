"use client";

import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Card, CardTitle } from "@/components/card/Card";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Input, Select } from "@/components/field/Field";
import { InlineName } from "@/components/plans/rows/InlineName";
import styles from "@/components/plans/rows/plans.module.css";
import { hueStyle, useRun } from "@/components/plans/rows/useRun";
import { addCategoryAction, moveCategoryAction, removeCategoryAction, renameCategoryAction } from "@/lib/actions/categories";
import { formatMoney } from "@/lib/data/balances";
import type { BucketGroup, CategoriesData, CategoryItem } from "@/lib/data/categories";

type Bucket = { id: string; name: string };

export function CategoriesPanel({ data, currency = "PHP" }: { data: CategoriesData; currency?: string }) {
  const focusHeading = () => document.getElementById("cat-h")?.focus();
  return (
    <Card aria-labelledby="cat-h">
      <div className={styles.head}>
        <CardTitle id="cat-h" tabIndex={-1}>
          Categories
        </CardTitle>
        <span className={styles.muted}>Each category lives inside a bucket, so spending lands in the right place.</span>
      </div>
      {data.buckets.length === 0 ? (
        <EmptyState title="No buckets yet">Categories live inside buckets. Set up your split plan first, then add categories here.</EmptyState>
      ) : (
        <>
          <p className={styles.note}>
            <span>
              Moving a category changes where <b>new</b> spending goes. Entries already logged stay in their bucket.
              {data.hasCategories ? "" : " Add your first category under a bucket below, or log spending in the Salin app and its categories show here."}
            </span>
          </p>
          <div className={styles.groups}>
            {data.groups.map((g) => (
              <Group key={g.id ?? "none"} group={g} buckets={data.buckets} month={data.monthLabel} currency={currency} onRemoved={focusHeading} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function Group({ group: g, buckets, month, currency, onRemoved }: { group: BucketGroup; buckets: Bucket[]; month: string; currency: string; onRemoved: () => void }) {
  const headId = `cg-${g.id ?? "none"}`;
  return (
    <section className={styles.group} style={hueStyle(g.hue)} aria-labelledby={headId} data-testid={`cat-group-${g.name}`}>
      <div className={styles.gHead}>
        <h3 id={headId} className={styles.gName}>
          {g.name}
        </h3>
        <span className={styles.muted} data-testid="group-spent">
          {g.monthMinor > 0 ? `${formatMoney(g.monthMinor, currency)} spent in ${month}` : g.categories.length > 0 ? "Nothing spent yet" : "No categories"}
        </span>
      </div>
      <ul className={styles.list}>
        {g.categories.map((c) => (
          <CategoryRow key={`${c.id}:${c.name}:${g.id}`} category={c} bucketId={g.id} buckets={buckets} currency={currency} onRemoved={onRemoved} />
        ))}
      </ul>
      {g.moved.map((m) => (
        <p key={`${m.categoryId}`} className={styles.moved} data-testid="moved-line">
          {formatMoney(m.totalMinor, currency)} from {m.categoryName}
          {m.nowIn ? ` (now in ${m.nowIn})` : ""}, logged before the move
        </p>
      ))}
      {g.id ? <AddCategory bucket={{ id: g.id, name: g.name }} /> : null}
    </section>
  );
}

function CategoryRow({ category: c, bucketId, buckets, currency, onRemoved }: { category: CategoryItem; bucketId: string | null; buckets: Bucket[]; currency: string; onRemoved: () => void }) {
  const move = useRun();
  const remove = useRun();
  const [target, setTarget] = useState(bucketId ?? "");
  const hasEntries = c.inUseReason === "it has entries";

  return (
    <li className={`${styles.row} ${styles.catRow}`}>
      <InlineName
        label={`Category name for ${c.name}`}
        value={c.name}
        onCommit={(name) => renameCategoryAction({ id: c.id, name })}
        saved={(name) => `Renamed to ${name}.`}
      />
      <div>
        {c.monthEntries > 0 ? (
          <>
            <span className={styles.num}>{formatMoney(c.monthMinor, currency)}</span>
            <small className={styles.small}>
              {c.monthEntries} {c.monthEntries === 1 ? "entry" : "entries"}
            </small>
          </>
        ) : (
          <small className={styles.small}>{c.olderIn.length > 0 ? `Older entries in ${c.olderIn.join(", ")}` : "No entries this month"}</small>
        )}
      </div>
      <div className={styles.stack}>
        <Select
          className={styles.mini}
          aria-label={`Move ${c.name} to`}
          value={target}
          disabled={move.busy}
          onChange={async (e) => {
            const next = e.target.value;
            const nextName = buckets.find((b) => b.id === next)?.name ?? "that bucket";
            setTarget(next);
            const r = await move.run(
              () => moveCategoryAction({ id: c.id, bucketId: next }),
              `Moved ${c.name} to ${nextName}. New spending goes there; entries already logged stay where they are.`,
            );
            if (!r.ok) setTarget(bucketId ?? "");
          }}
        >
          {bucketId === null ? (
            <option value="" disabled>
              Choose a bucket
            </option>
          ) : null}
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id === bucketId ? `In ${b.name}` : `Move to ${b.name}`}
            </option>
          ))}
        </Select>
        <p role="alert" className={styles.err}>
          {move.error}
        </p>
      </div>
      <div className={styles.act}>
        {c.inUseReason ? (
          <span className={styles.inUse} title={hasEntries ? "It has entries. Move it instead." : c.inUseReason}>
            {hasEntries ? "Has entries" : "In use"}
            {hasEntries ? null : <small className={styles.small}>{c.inUseReason}</small>}
          </span>
        ) : (
          <Button
            variant="quiet"
            loading={remove.busy}
            loadingLabel="Removing"
            aria-label={`Remove ${c.name}`}
            onClick={async () => {
              const r = await remove.run(() => removeCategoryAction({ id: c.id }), `${c.name} removed.`);
              if (r.ok) onRemoved();
            }}
          >
            Remove
          </Button>
        )}
        <p role="alert" className={styles.err}>
          {remove.error}
        </p>
      </div>
    </li>
  );
}

function AddCategory({ bucket }: { bucket: Bucket }) {
  const add = useRun();
  const [name, setName] = useState("");
  return (
    <form
      className={styles.add}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await add.run(() => addCategoryAction({ name, bucketId: bucket.id }), `${name.trim()} added to ${bucket.name}.`);
        if (r.ok) setName("");
      }}
    >
      <Input aria-label={`New category in ${bucket.name}`} placeholder="New category" autoComplete="off" value={name} aria-invalid={add.error ? true : undefined} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" variant="quiet" loading={add.busy} loadingLabel="Adding" aria-label={`Add category to ${bucket.name}`}>
        Add
      </Button>
      <p role="alert" className={styles.err}>
        {add.error}
      </p>
    </form>
  );
}
