/** The phone app is shared as an APK on request for now: people email us and we send it back. */
export const APP_REQUEST_EMAIL = "proj.salin@gmail.com";
export const APP_REQUEST_SUBJECT = "Salin Android app (APK) request";

/** A mailto link with the subject and a short note filled in. `name` and `accountEmail` are optional hints. */
export function appRequestHref(opts: { name?: string | null; accountEmail?: string | null } = {}): string {
  const lines = ["Hi Salin team,", "", "Please send me the Android app (APK) for Salin.", ""];
  const name = opts.name?.trim();
  if (name) lines.push(`Name: ${name}`);
  if (opts.accountEmail) lines.push(`Salin account: ${opts.accountEmail}`);
  lines.push("", "Thank you!");
  return `mailto:${APP_REQUEST_EMAIL}?subject=${encodeURIComponent(APP_REQUEST_SUBJECT)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
