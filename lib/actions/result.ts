/** What every Plans server action returns. Never throw to the client: say what failed. */
export type ActionResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

export const SAVE_FAILED = "Couldn't save. Check your connection and try again.";
export const SIGNED_OUT = "You've been signed out. Sign in again, then retry.";
const GONE = "That item isn't available any more. Reload the page and try again.";

/**
 * Maps a Postgres error from one of the plan/income functions to copy for the person.
 * The functions raise 22023 (invalid input), 55000 and 23505 with messages written for people;
 * 42501 / P0002 mean the row isn't yours or no longer exists. Anything else is "couldn't save".
 */
export function failure(error: { code?: string; message: string }): { ok: false; error: string } {
  switch (error.code) {
    case "22023":
    case "55000":
    case "23505":
      return { ok: false, error: error.message };
    case "42501":
    case "P0002":
      return { ok: false, error: GONE };
    default:
      return { ok: false, error: SAVE_FAILED };
  }
}
