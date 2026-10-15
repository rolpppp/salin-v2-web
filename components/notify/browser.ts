/** Browser notifications while a Salin tab is open (no push server). Everything here is best-effort and never throws. */

export type BrowserSupport = "ok" | "unsupported" | "denied" | "default";

export function browserSupport(): BrowserSupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission === "granted" ? "ok" : Notification.permission === "denied" ? "denied" : "default";
}

export async function ensureWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!("serviceWorker" in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  } catch {
    return null;
  }
}

/** Ask once; resolves to the outcome. */
export async function askPermission(): Promise<BrowserSupport> {
  if (browserSupport() === "unsupported") return "unsupported";
  try {
    const r = await Notification.requestPermission();
    if (r === "granted") await ensureWorker();
    return r === "granted" ? "ok" : r === "denied" ? "denied" : "default";
  } catch {
    return browserSupport();
  }
}

const seenKey = (key: string) => `salin:notified:${key}`;

/** Show once per key across tabs (localStorage), through the service worker when there is one (phones need it). */
export async function showOnce(n: { key: string; title: string; body: string; href: string }): Promise<boolean> {
  try {
    if (browserSupport() !== "ok") return false;
    try {
      if (localStorage.getItem(seenKey(n.key))) return false;
      localStorage.setItem(seenKey(n.key), "1");
    } catch {
      // storage blocked: may show twice across tabs, which is acceptable
    }
    const reg = await ensureWorker();
    const options = { body: n.body, tag: n.key, icon: "/logo.png", badge: "/logo.png", data: { href: n.href } };
    if (reg) {
      await reg.showNotification(n.title, options);
      return true;
    }
    const note = new Notification(n.title, options);
    note.onclick = () => {
      window.focus();
      window.location.href = n.href;
    };
    return true;
  } catch {
    return false;
  }
}
