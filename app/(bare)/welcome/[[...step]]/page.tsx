/**
 * `/welcome` and `/welcome/[step]`. The shell in `../layout.tsx` reads the step from the URL and renders it, so this
 * page has nothing of its own: changing steps swaps only this empty segment and never re-runs the layout's data loads.
 */
export default function WelcomePage() {
  return null;
}
