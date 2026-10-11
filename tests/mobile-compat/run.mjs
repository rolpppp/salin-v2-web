// Regenerates fixtures, then runs the Dart compat tests against the real mobile models.
// Mobile package location: ../../../salin-v2 relative to the repo root (pubspec default), or SALIN_MOBILE_PATH.
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dartDir = join(here, "dart");
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: "inherit", ...opts });

const hasFlutter = spawnSync("flutter", ["--version"], { stdio: "ignore" }).status === 0;
if (!hasFlutter) {
  console.log("mobile-compat: SKIPPED (flutter not found on PATH). Install Flutter to run this optional check.");
  process.exit(0);
}

const mobile = resolve(process.env.SALIN_MOBILE_PATH ?? join(here, "../../../salin-v2"));
if (!existsSync(join(mobile, "pubspec.yaml"))) {
  console.log(`mobile-compat: SKIPPED (mobile repo not found at ${mobile}; set SALIN_MOBILE_PATH).`);
  process.exit(0);
}

const overrides = join(dartDir, "pubspec_overrides.yaml");
if (process.env.SALIN_MOBILE_PATH) writeFileSync(overrides, `dependency_overrides:\n  salin:\n    path: ${mobile}\n`);
else rmSync(overrides, { force: true });

let r = run("npx", ["tsx", join(here, "generate-fixtures.ts")]);
if (r.status !== 0) process.exit(r.status ?? 1);
r = run("flutter", ["pub", "get"], { cwd: dartDir });
if (r.status !== 0) process.exit(r.status ?? 1);
r = run("flutter", ["test"], { cwd: dartDir });
process.exit(r.status ?? 1);
