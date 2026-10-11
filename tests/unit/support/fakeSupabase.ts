/** A tiny chainable stand-in for the Supabase client: records every call, resolves queued results. */
export type Call = { table?: string; rpc?: string; args?: unknown; ops: string[]; payload?: unknown };
type Result = { data: unknown; error: { code?: string; message: string } | null };

export function fakeSupabase(opts: { tables?: Record<string, Result>; rpc?: (name: string, args: unknown) => Result } = {}) {
  const calls: Call[] = [];
  const chain = (call: Call, result: Result) => {
    const proxy: Record<string, unknown> = {};
    for (const op of ["select", "insert", "update", "eq", "is", "in", "order", "limit"]) {
      proxy[op] = (...a: unknown[]) => {
        call.ops.push(op);
        if (op === "insert" || op === "update") call.payload = a[0];
        return proxy;
      };
    }
    proxy.maybeSingle = () => Promise.resolve({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error });
    proxy.then = (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
    return proxy;
  };
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return chain(call, opts.tables?.[table] ?? { data: [], error: null });
    },
    rpc(name: string, args: unknown) {
      const call: Call = { rpc: name, args, ops: [] };
      calls.push(call);
      return Promise.resolve(opts.rpc ? opts.rpc(name, args) : { data: null, error: null });
    },
  };
  return { client, calls };
}
