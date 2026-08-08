/**
 * Module boundary check: nothing in core/ may import from time/.
 * Run via `bun run check:boundaries`; wired into `check` and CI.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const CORE = "src/mainplate/core"
const offenders: string[] = []

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.tsx?$/.test(entry) && /from\s+["'].*\/time\//.test(readFileSync(path, "utf8"))) {
      offenders.push(path)
    }
  }
}

walk(CORE)

if (offenders.length > 0) {
  console.error(`core/ must not import from time/. Offenders:\n${offenders.join("\n")}`)
  process.exit(1)
}
console.log("boundary ok: core/ has no time/ imports")
