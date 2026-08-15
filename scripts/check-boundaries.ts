/**
 * Module boundary checks. Two rules, one claim (§18: a dashboard gauge never
 * pays for a clock): nothing in core/ may import from time/, and neither may
 * the speedometer example — including theme.ts, which it imports, so the
 * whole example's import graph stays core-only.
 * Run via `bun run check:boundaries`; wired into `check` and CI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

// Matches `from ".../time"` and `from ".../time/..."` — barrel and deep,
// relative or via the `@/mainplate/*` alias — plus the forms without a
// `from`: a bare side-effect `import ".../time"` and a dynamic
// `import(".../time")`, both of which still load the module. The quote class
// includes the backtick so a template-literal dynamic import — valid syntax
// Biome's quoteStyle never touches, since it only rewrites string literals —
// cannot slip past. Deliberately ESM-import-only: `require()` is unmatched on
// purpose, not an oversight — this repo has "module": "ESNext",
// "moduleResolution": "bundler", and zero require() calls, so there is
// nothing for it to catch; adding a require pattern would just be dead code.
// Exported for `check-boundaries.test.ts`, which pins this pattern against
// the known import forms — a committed regression test, not the manual
// verification that let a bare-import hole survive two plans.
export const TIME_IMPORT = /(?:from|import)\s*\(?\s*["'`][^"'`]*\/time(?:\/[^"'`]*)?["'`]/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

const rules: { message: string; ok: string; files: string[] }[] = [
  {
    message: "core/ must not import from time/",
    ok: "boundary ok: core/ has no time/ imports",
    files: walk("src/mainplate/core"),
  },
  {
    message:
      "the speedometer example must not import from time/ — §18: a gauge never pays for a clock",
    ok: "boundary ok: the speedometer example has no time/ imports",
    files: ["src/mainplate/examples/speedometer.tsx", "src/mainplate/examples/theme.ts"],
  },
]

let failed = false
for (const rule of rules) {
  // A guarded file that stops existing is a rule silently guarding nothing,
  // so a rename must fail the check as loudly as an offending import.
  const offenders = rule.files.filter((path) => TIME_IMPORT.test(readFileSync(path, "utf8")))
  if (offenders.length > 0) {
    failed = true
    console.error(`${rule.message}. Offenders:\n${offenders.join("\n")}`)
  } else {
    console.log(rule.ok)
  }
}

if (failed) process.exit(1)
