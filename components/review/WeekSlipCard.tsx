import { Slip, SlipFoot, SlipLine, SlipMeta, SlipRule, SlipTitle } from "@/components/slip/Slip";
import { buildWeekSlip, formatStampDate, formatWeekRange, slipFooter, slipRole, type ReviewData } from "@/lib/data/review-model";
import { formatPeso } from "@/lib/money";
import styles from "./review.module.css";

/** The week slip receipt (SPEC §3, BR §8.3). Every line is a real figure; nothing is estimated. */
export function WeekSlipCard({ data }: { data: ReviewData }) {
  const { slip, sources, carriedInMinor } = buildWeekSlip(data);
  const hasTax = data.buckets.some((b) => slipRole(b) === "tax");
  const closed = data.closed;
  return (
    <Slip label="Week slip" stamp={closed ? "WEEK CLOSED" : undefined} stampSub={closed ? formatStampDate(closed.closedDateIso) : undefined}>
      <SlipTitle>Week slip</SlipTitle>
      <SlipMeta>
        {formatWeekRange(data.weekStart, data.weekEnd)}
        {data.firstName ? ` · ${data.firstName}` : ""}
      </SlipMeta>
      <SlipRule />
      <div data-testid="slip-lines">
        <SlipLine label="Came in" value={formatPeso(slip.cameIn)} />
        {sources.map((s) => (
          <SlipLine key={s.name} label={s.name} value={formatPeso(s.amountMinor)} dim />
        ))}
        {carriedInMinor !== 0 ? <SlipLine label="Carried from earlier weeks" value={formatPeso(carriedInMinor)} dim /> : null}
        <SlipLine label="Spent" value={formatPeso(slip.spent)} />
        <SlipLine label="Put away" value={formatPeso(slip.putAway)} />
        {hasTax ? <SlipLine label="Tax set aside" value={formatPeso(slip.taxSetAside)} /> : null}
        <SlipLine label="Cushions & kept whole" value={formatPeso(slip.cushionsAndKeptWhole)} />
        <SlipLine label="To assign" value={formatPeso(slip.toAssign)} />
        <SlipRule />
        <SlipLine label="Safe to spend" value={formatPeso(slip.safeToSpend)} total />
      </div>
      {slip.reconciles ? null : (
        <p className={styles.slipNote} role="alert" data-testid="slip-mismatch">
          These lines are {formatPeso(Math.abs(slip.difference))} {slip.difference > 0 ? "short of" : "over"} what came in. Something changed in your records. Reload, and check your phone&apos;s sync.
        </p>
      )}
      <SlipFoot data-testid="slip-footer">{slipFooter(data)}</SlipFoot>
    </Slip>
  );
}
