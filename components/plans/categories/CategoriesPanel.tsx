"use client";

import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Card, CardTitle } from "@/components/card/Card";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Input, Select } from "@/components/field/Field";
import { CloseIcon, LockIcon } from "@/components/icons";
import { InlineName } from "@/components/plans/rows/InlineName";
import shared from "@/components/plans/rows/plans.module.css";
import { hueStyle, useRun } from "@/components/plans/rows/useRun";
import { addCategoryAction, moveCategoryAction, removeCategoryAction, renameCategoryAction } from "@/lib/actions/categories";
import { formatMoney } from "@/lib/data/balances";
import type { BucketGroup, CategoriesData, CategoryItem } from "@/lib/data/categories";
import styles from "./categories.module.css";

type Bucket = { id: string; name: string };

/** A bucket earns a full card once it has something to show; the rest wait in one small "No categories yet" strip. */
const hasContent = (g: BucketGroup) => g.categories.length > 0 || g.moved.length > 0 || g.monthMinor > 0;

export function CategoriesPanel({ data, currency = "PHP" }: { data: CategoriesData; currency?: string }) {
  const focusHeading = () => document.getElementById("cat-h")?.focus();
  const full = data.groups.filter(hasContent);
  const empty = data.groups.filter((g) => !hasContent(g) && g.id !== null);
  return (
    <Card aria-labelledby="cat-h">
      <div className={shared.head}>
        <CardTitle id="cat-h" tabIndex={-1}>
          Categories
        </CardTitle>
        <span className={shared.muted}>Each category lives inside a bucket, so spending lands in the right place.</span>
      </div>
      {data.buckets.length === 0 ? (
        <EmptyState title="No buckets yet">Categories live inside buckets. Set up your split plan first, then add categories here.</EmptyState>
      ) : (
        <>
          <MonthGlance groups={data.groups} month={data.monthLabel} currency={currency} />
          {full.length > 0 ? (
            <div className={styles.grid}>
              {full.map((g) => (
                <Group key={g.id ?? "none"} group={g} buckets={data.buckets} month={data.monthLabel} currency={currency} onRemoved={focusHeading} />
              ))}
            </div>
          ) : null}
          {empty.length > 0 ? <EmptyBuckets groups={empty} first={!data.hasCategories} /> : null}
          <p className={styles.foot}>
            Moving a category changes where <b>new</b> spending goes. Entries already logged stay in their bucket.
            {data.hasCategories ? "" : " Add your first category under a bucket, or log spending in the Salin app and its categories show here."}
          </p>
        </>
      )}
    </Card>
  );
}

/** One line for the month: the total, a to-scale bar by bucket, and the three biggest categories. */
function MonthGlance({ groups, month, currency }: { groups: BucketGroup[]; month: string; currency: string }) {
  const spent = groups.filter((g) => g.monthMinor > 0).sort((a, b) => b.monthMinor - a.monthMinor);
  const total = spent.reduce((a, g) => a + g.monthMinor, 0);
  const top = groups
    .flatMap((g) => g.categories)
    .filter((c) => c.monthMinor > 0)
    .sort((a, b) => b.monthMinor - a.monthMinor)
    .slice(0, 3);
  return (
    <section className={styles.glance} aria-labelledby="cat-month-h" data-testid="cat-overview">
      <div className={styles.glanceHead}>
        <h3 id="cat-month-h" className={styles.glanceLabel}>
          Spent in {month}
        </h3>
        <span className={styles.total}>{formatMoney(total, currency)}</span>
      </div>
      {total > 0 ? (
        <>
          {/* flex-grow takes the integer centavos directly, so the bar is to scale with no float maths. */}
          <div className={styles.bar} aria-hidden="true">
            {spent.map((g) => (
              <span key={g.id ?? "none"} style={{ ...hueStyle(g.hue), flexGrow: g.monthMinor }} />
            ))}
          </div>
          <ul className={styles.legend}>
            {spent.map((g) => (
              <li key={g.id ?? "none"} style={hueStyle(g.hue)}>
                <span className={styles.dot} aria-hidden="true" />
                {g.name} <span className={styles.legendAmt}>{formatMoney(g.monthMinor, currency)}</span>
              </li>
            ))}
          </ul>
          {top.length > 0 ? (
            <p className={styles.top}>
              <span className={styles.topLabel}>Biggest</span>
              {top.map((c) => (
                <span key={c.id}>
                  {c.name} <span className={styles.legendAmt}>{formatMoney(c.monthMinor, currency)}</span>
                </span>
              ))}
            </p>
          ) : null}
        </>
      ) : (
        <p className={styles.glanceEmpty}>Nothing logged in {month} yet. When you log spending, this shows where it went.</p>
      )}
    </section>
  );
}

function Group({ group: g, buckets, month, currency, onRemoved }: { group: BucketGroup; buckets: Bucket[]; month: string; currency: string; onRemoved: () => void }) {
  const headId = `cg-${g.id ?? "none"}`;
  return (
    <section className={styles.card} style={hueStyle(g.hue)} aria-labelledby={headId} data-testid={`cat-group-${g.name}`} data-unsorted={g.id === null || undefined}>
      <div className={styles.cardHead}>
        <h3 id={headId} className={styles.cardName}>
          <span className={styles.dot} aria-hidden="true" />
          {g.name}
        </h3>
        <span className={styles.cardSpent} data-testid="group-spent">
          {g.monthMinor > 0 ? `${formatMoney(g.monthMinor, currency)} spent in ${month}` : g.categories.length > 0 ? "Nothing spent yet" : "No categories"}
        </span>
      </div>
      {g.categories.length > 0 ? (
        <ul className={styles.rows}>
          {g.categories.map((c) => (
            <CategoryRow key={`${c.id}:${c.name}:${g.id}`} category={c} bucketId={g.id} buckets={buckets} currency={currency} onRemoved={onRemoved} />
          ))}
        </ul>
      ) : null}
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
    <li className={styles.row}>
      <div className={styles.name}>
        <InlineName
          label={`Category name for ${c.name}`}
          value={c.name}
          onCommit={(name) => renameCategoryAction({ id: c.id, name })}
          saved={(name) => `Renamed to ${name}.`}
        />
      </div>
      <div className={styles.amt}>
        {c.monthEntries > 0 ? (
          <>
            <span className={styles.num}>{formatMoney(c.monthMinor, currency)}</span>
            <small>
              {c.monthEntries} {c.monthEntries === 1 ? "entry" : "entries"}
            </small>
          </>
        ) : (
          <small>{c.olderIn.length > 0 ? `Older entries in ${c.olderIn.join(", ")}` : "No entries this month"}</small>
        )}
      </div>
      <div className={styles.tools}>
        <Select
          className={styles.pick}
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
        {c.inUseReason ? (
          <span className={styles.locked} title={hasEntries ? "Has entries, so it stays. Move it instead." : `In use: ${c.inUseReason}`}>
            <LockIcon />
            <span className="sr">{hasEntries ? "Has entries" : `In use: ${c.inUseReason}`}</span>
          </span>
        ) : (
          <button
            type="button"
            className={styles.remove}
            aria-label={`Remove ${c.name}`}
            title={`Remove ${c.name}`}
            disabled={remove.busy}
            aria-busy={remove.busy || undefined}
            onClick={async () => {
              const r = await remove.run(() => removeCategoryAction({ id: c.id }), `${c.name} removed.`);
              if (r.ok) onRemoved();
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <p role="alert" className={`${shared.err} ${styles.rowErr}`}>
        {move.error ?? remove.error}
      </p>
    </li>
  );
}

/** Buckets with nothing in them yet: one chip each; tapping one opens its add form in place. */
function EmptyBuckets({ groups, first }: { groups: BucketGroup[]; first: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className={styles.empty} aria-labelledby="cat-empty-h">
      <h3 id="cat-empty-h" className={styles.emptyHead}>
        {first ? "Add a category to a bucket" : "No categories yet"}
      </h3>
      <ul className={styles.chips}>
        {groups.map((g) => {
          const bucket = { id: g.id!, name: g.name };
          const isOpen = open === g.id;
          return (
            <li key={g.id} className={styles.chipItem} data-open={isOpen || undefined} style={hueStyle(g.hue)} data-testid={`cat-group-${g.name}`}>
              {isOpen ? (
                <AddForm bucket={bucket} withName onClose={() => setOpen(null)} />
              ) : (
                <button type="button" className={styles.chip} aria-label={`New category in ${g.name}: open`} onClick={() => setOpen(g.id)}>
                  <span className={styles.dot} aria-hidden="true" />
                  {g.name}
                  <span className={styles.plus} aria-hidden="true">
                    +
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Collapsed to one quiet "+ New category" until it's wanted. */
function AddCategory({ bucket }: { bucket: Bucket }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={styles.addBtn} aria-label={`New category in ${bucket.name}: open`} onClick={() => setOpen(true)}>
        + New category
      </button>
    );
  }
  return <AddForm bucket={bucket} onClose={() => setOpen(false)} />;
}

function AddForm({ bucket, withName, onClose }: { bucket: Bucket; withName?: boolean; onClose: () => void }) {
  const add = useRun();
  const [name, setName] = useState("");
  const close = () => {
    add.setError(null);
    onClose();
  };
  return (
    <form
      className={styles.add}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await add.run(() => addCategoryAction({ name, bucketId: bucket.id }), `${name.trim()} added to ${bucket.name}.`);
        if (r.ok) setName("");
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {withName ? (
        <span className={styles.addTo}>
          <span className={styles.dot} aria-hidden="true" />
          {bucket.name}
        </span>
      ) : null}
      <Input autoFocus aria-label={`New category in ${bucket.name}`} placeholder="Name, e.g. Milk tea" autoComplete="off" value={name} aria-invalid={add.error ? true : undefined} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" variant="soft" loading={add.busy} loadingLabel="Adding" aria-label={`Add category to ${bucket.name}`}>
        Add
      </Button>
      <Button variant="quiet" onClick={close}>
        Done
      </Button>
      <p role="alert" className={shared.err}>
        {add.error}
      </p>
    </form>
  );
}
