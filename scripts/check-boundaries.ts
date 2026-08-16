/**
 * Module boundary checks. Three claims, one shape:
 *
 * - `core/` never imports `time/` (§18: a dashboard gauge never pays for a
 *   clock — the engine must stay usable without a scheduler);
 * - `core/` and `time/` never import the layers built on top of them,
 *   `faces/` and `legacy/`, so the engine stays the bottom of the graph;
 * - `legacy/`, the frozen SVG component layer, never imports `time/` or
 *   `faces/` — it is finished, and it builds on `core/` alone.
 *
 * Run via `bun run check:boundaries`; wired into `check` and CI.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Matches `from ".../<name>"` and `from ".../<name>/..."` — barrel and deep,
 * relative or via the `@/mainplate/*` alias — plus the forms without a
 * `from`: a bare side-effect `import ".../<name>"` and a dynamic
 * `import(".../<name>")`, both of which still load the module. The quote class
 * includes the backtick so a template-literal dynamic import — valid syntax
 * Biome's quoteStyle never touches, since it only rewrites string literals —
 * cannot slip past. A sibling whose name merely *starts* with a guarded one
 * ("../timezone") is not matched: the segment has to end at a `/` or the
 * closing quote. Deliberately ESM-import-only: `require()` is unmatched on
 * purpose, not an oversight — this repo has "module": "ESNext",
 * "moduleResolution": "bundler", and zero require() calls, so there is
 * nothing for it to catch; adding a require pattern would just be dead code.
 * Exported for `check-boundaries.test.ts`, which pins these patterns against
 * the known import forms — a committed regression test, not the manual
 * verification that let a bare-import hole survive two plans.
 */
export function importsFrom(...names: string[]): RegExp {
  return new RegExp(
    `(?:from|import)\\s*\\(?\\s*["'\`][^"'\`]*\\/(?:${names.join("|")})(?:\\/[^"'\`]*)?["'\`]`,
  )
}

/** The original rule, kept under its own name: nothing in `core/` imports `time/`. */
export const TIME_IMPORT = importsFrom("time")

/** The layers built on the engine. Neither `core/` nor `time/` may reach up into them. */
export const DOWNSTREAM_IMPORT = importsFrom("faces", "legacy")

/** What the frozen SVG layer may not reach for. `core/` is its whole world. */
export const LEGACY_FORBIDDEN_IMPORT = importsFrom("faces", "time")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

/**
 * A guarded directory that stops existing is a rule silently guarding nothing,
 * so a rename or a bad path must fail the check as loudly as an offending
 * import would.
 */
function guarded(dir: string): string[] {
  if (!existsSync(dir)) {
    console.error(`boundary check cannot read ${dir} — the directory does not exist`)
    process.exit(1)
  }
  return walk(dir)
}

/**
 * The shipped module graph: everything a consumer's bundler can reach.
 *
 * The three layering rules below are claims about that graph, so they are
 * checked against it rather than against the test files beside it. An
 * integration test's job is precisely to import across a boundary — the time
 * layer's `use-watch-source.test.tsx` drives frozen `<Hand>`s from `legacy/`
 * to prove one ticker moves every face — and under these rules such a test
 * has no other layer it could live in, since `legacy/` may not import `time/`
 * either. The `core/` → `time/` rule below deliberately does **not** use this:
 * it has always been checked against every file, tests included, and nothing
 * that was guarded stops being guarded here.
 */
const shipped = (files: string[]) => files.filter((path) => !/\.test\.tsx?$/.test(path))

const core = guarded("src/mainplate/core")
const time = guarded("src/mainplate/time")
const legacy = guarded("src/mainplate/legacy")

const rules: { message: string; ok: string; files: string[]; pattern: RegExp }[] = [
  {
    message: "core/ must not import from time/",
    ok: "boundary ok: core/ has no time/ imports",
    files: core,
    pattern: TIME_IMPORT,
  },
  {
    message: "core/ must not import from faces/ or legacy/ — the engine is the bottom of the graph",
    ok: "boundary ok: core/ has no faces/ or legacy/ imports",
    files: shipped(core),
    pattern: DOWNSTREAM_IMPORT,
  },
  {
    message: "time/ must not import from faces/ or legacy/ — the engine is the bottom of the graph",
    ok: "boundary ok: time/ has no faces/ or legacy/ imports",
    files: shipped(time),
    pattern: DOWNSTREAM_IMPORT,
  },
  {
    message: "legacy/ must not import from time/ or faces/ — the frozen layer builds on core/ only",
    ok: "boundary ok: legacy/ has no time/ or faces/ imports",
    files: shipped(legacy),
    pattern: LEGACY_FORBIDDEN_IMPORT,
  },
]

let failed = false
for (const rule of rules) {
  const offenders = rule.files.filter((path) => rule.pattern.test(readFileSync(path, "utf8")))
  if (offenders.length > 0) {
    failed = true
    console.error(`${rule.message}. Offenders:\n${offenders.join("\n")}`)
  } else {
    console.log(rule.ok)
  }
}

if (failed) process.exit(1)
