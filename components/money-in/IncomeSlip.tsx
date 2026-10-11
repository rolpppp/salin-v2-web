import { Slip, SlipFoot, SlipLine, SlipMeta, SlipRule, SlipTitle } from "@/components/slip/Slip";
import { hueVar, pctText, stampDate, type SlipModel } from "@/lib/data/money-in-model";
import { formatPeso } from "@/lib/money";

/** The receipt on the right of Money in (SPEC §2.5). Pure display of a `SlipModel`. */
export function IncomeSlip({ model, allIn, todayIso }: { model: SlipModel; allIn: boolean; todayIso: string }) {
  return (
    <Slip label="Money in slip" stamp={allIn ? "ALL IN" : undefined} stampSub={allIn ? stampDate(todayIso) : undefined}>
      <SlipTitle>{model.title}</SlipTitle>
      <SlipMeta>{model.meta}</SlipMeta>
      <SlipRule />
      {model.lines.map((l) => (
        <SlipLine key={l.bucketId} label={l.name} value={formatPeso(l.amount)} dot={hueVar(l.hue)} percent={l.bp !== undefined ? pctText(l.bp) : undefined} />
      ))}
      {model.lines.length > 0 ? <SlipRule /> : null}
      <SlipLine total label="Total" value={formatPeso(model.total)} />
      {model.why ? <SlipFoot>{model.why}</SlipFoot> : null}
      {model.note ? <SlipFoot>{model.note}</SlipFoot> : null}
    </Slip>
  );
}
