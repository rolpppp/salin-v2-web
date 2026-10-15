/**
 * App-icon style marks for the banks and wallets Filipinos use. Approximate brand colours and a short monogram, drawn in our
 * own type: recognisable at a glance, but not the official logos (Salin isn't affiliated with any of them).
 *
 * To use an official logo you have permission for, drop the SVG at `public/brands/<slug>.svg` and set `logo` to that path;
 * the mark then shows the file instead of the monogram.
 */
export interface Brand {
  slug: string;
  mono: string;
  /** Gradient top-left -> bottom-right. */
  from: string;
  to: string;
  ink: string;
  logo: string | null;
}

const B = (slug: string, mono: string, from: string, to: string, ink = "#ffffff"): Brand => ({ slug, mono, from, to, ink, logo: null });

const BRANDS: Record<string, Brand> = {
  gcash: B("gcash", "G", "#3d97ff", "#0057d9"),
  maya: B("maya", "m", "#2b2b2b", "#050505", "#3df59a"),
  bpi: B("bpi", "BPI", "#e2383d", "#a3161c"),
  bdo: B("bdo", "BDO", "#2459c4", "#0a2e7a", "#ffd23f"),
  metrobank: B("metrobank", "MB", "#2c6fd1", "#0c3a80"),
  unionbank: B("unionbank", "U", "#ff9640", "#e2580a"),
  maribank: B("maribank", "M", "#ff8649", "#ee4a10"),
  tonik: B("tonik", "t", "#8c5cff", "#4a19d1"),
  gotyme: B("gotyme", "GT", "#3fdcff", "#0093c4", "#05263a"),
  cimb: B("cimb", "C", "#de2540", "#8c0a20"),
  "pag-ibig mp2": B("pagibig", "MP2", "#3762c4", "#13307a"),
  cash: B("cash", "₱", "#3cb97a", "#17784a"),
};

/** The mark for an account name; unknown names get a neutral tile with their initial. */
export function brandFor(name: string): Brand | null {
  return BRANDS[name.trim().toLowerCase()] ?? null;
}
