/**
 * Dev-only round-trip tracing. OFF unless `SALIN_TRACE_DB=1` is set in the server's environment; when off,
 * `traceFetch` is undefined and the Supabase clients behave exactly as before.
 *
 * When on, every server-side call to Supabase (PostgREST table reads, RPCs, GoTrue) logs one line:
 *   [db-trace] {"ev":"call","where":"rsc","kind":"rpc","name":"bucket_left","t0":..,"t1":..,"status":200}
 * and the proxy logs `{"ev":"req","path":...}` at the start of each request. Pipe the server log through
 * `node scripts/db-trace-report.mjs` to get calls and waterfall depth (longest chain of sequential calls)
 * per request. Waterfall depth, not call count, is what you pay for: each hop is a full round trip.
 */
type Where = "proxy" | "rsc";

function describe(url: string): { kind: "rpc" | "rest" | "auth" | "other"; name: string } {
  const path = new URL(url).pathname;
  if (path.startsWith("/rest/v1/rpc/")) return { kind: "rpc", name: path.slice("/rest/v1/rpc/".length) };
  if (path.startsWith("/rest/v1/")) return { kind: "rest", name: path.slice("/rest/v1/".length) };
  if (path.startsWith("/auth/v1/")) return { kind: "auth", name: path.slice("/auth/v1/".length) };
  return { kind: "other", name: path };
}

export const tracingEnabled = () => process.env.SALIN_TRACE_DB === "1";

export function logRequest(path: string): void {
  if (tracingEnabled()) console.log(`[db-trace] ${JSON.stringify({ ev: "req", path, t: Date.now() })}`);
}

/** A `fetch` that logs each call's start and end, or undefined when tracing is off. */
export function traceFetch(where: Where): typeof fetch | undefined {
  if (!tracingEnabled()) return undefined;
  return async (input, init) => {
    const t0 = Date.now();
    let status = 0;
    try {
      const res = await fetch(input, init);
      status = res.status;
      return res;
    } finally {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const { kind, name } = describe(url);
      console.log(`[db-trace] ${JSON.stringify({ ev: "call", where, kind, name, t0, t1: Date.now(), status })}`);
    }
  };
}
