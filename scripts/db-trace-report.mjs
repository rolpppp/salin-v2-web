#!/usr/bin/env node
// Reads a server log (a file path, default stdin) produced with SALIN_TRACE_DB=1 and prints, per request, the number
// of Supabase calls and the waterfall depth (longest chain where each call starts after the previous one ended).
//   SALIN_TRACE_DB=1 npm run dev 2>&1 | tee /tmp/trace.log      then      node scripts/db-trace-report.mjs /tmp/trace.log
// A request starts at each `req` line the proxy writes; calls up to the next `req` belong to it. Click one page
// at a time so concurrent requests do not mix.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function depth(calls) {
  const sorted = [...calls].sort((a, b) => a.t0 - b.t0);
  const d = [];
  sorted.forEach((c, i) => {
    let best = 0;
    for (let j = 0; j < i; j++) if (sorted[j].t1 <= c.t0 && d[j] > best) best = d[j];
    d[i] = best + 1;
  });
  return Math.max(0, ...d);
}

export function analyze(text) {
  const reqs = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf("[db-trace] ");
    if (at < 0) continue;
    let ev;
    try {
      ev = JSON.parse(line.slice(at + 11));
    } catch {
      continue;
    }
    if (ev.ev === "req") reqs.push({ path: ev.path, calls: [] });
    else if (ev.ev === "call") {
      if (reqs.length === 0) reqs.push({ path: "(before first request)", calls: [] });
      reqs[reqs.length - 1].calls.push(ev);
    }
  }
  return reqs.map((r) => {
    const t0 = Math.min(...r.calls.map((c) => c.t0));
    const t1 = Math.max(...r.calls.map((c) => c.t1));
    return { path: r.path, calls: r.calls.length, depth: depth(r.calls), wallMs: r.calls.length ? t1 - t0 : 0 };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = readFileSync(process.argv[2] ?? 0, "utf8");
  console.log("path".padEnd(32), "calls".padStart(6), "depth".padStart(6), "wall ms".padStart(8));
  for (const r of analyze(text)) console.log(r.path.padEnd(32), String(r.calls).padStart(6), String(r.depth).padStart(6), String(r.wallMs).padStart(8));
}
