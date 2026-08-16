import { describe, expect, it } from "vitest"
import { DOWNSTREAM_IMPORT, LEGACY_FORBIDDEN_IMPORT, TIME_IMPORT } from "./check-boundaries"

/**
 * The adversarial import forms every boundary pattern has to catch. Pinned
 * once and reused by each rule's suite: the hole this test exists to prevent
 * (bare and dynamic imports going unmatched) was in the pattern, not in any
 * one rule, so a new rule with a hand-written half-list is the same bug back.
 */
const forms = (path: string): [string, string][] => [
  ["static from, double quotes", `import { x } from "${path}"`],
  ["static from, single quotes", `import { x } from '${path}'`],
  ["bare side-effect import", `import "${path}"`],
  ["dynamic import, double quotes", `import("${path}")`],
  ["dynamic import, template literal", `import(\`${path}\`)`],
  ["deep path", `import { x } from "${path}/ticker"`],
  ["alias path", `import { x } from "@/mainplate/${path.replace("../", "")}"`],
]

describe("TIME_IMPORT", () => {
  it.each(forms("../time"))("flags %s", (_name, content) => {
    expect(TIME_IMPORT.test(content)).toBe(true)
  })

  it("does not flag a sibling module whose name merely starts with time", () => {
    expect(TIME_IMPORT.test('import { x } from "../timezone"')).toBe(false)
  })

  it("does not flag the layers the other rules own", () => {
    expect(TIME_IMPORT.test('import { x } from "../legacy"')).toBe(false)
    expect(TIME_IMPORT.test('import { x } from "../faces"')).toBe(false)
  })

  // Documented, not aspirational: the script scans raw file text and never
  // strips comments, so a comment containing real import syntax is flagged
  // exactly like code would be. This pins that as accepted behaviour rather
  // than letting a future edit change it unnoticed.
  it("also flags a commented-out import, matching the script's current behaviour", () => {
    expect(TIME_IMPORT.test('// see import("../time") elsewhere')).toBe(true)
  })
})

// core/ and time/ are the bottom of the graph: neither may reach up into the
// layers built on them.
describe("DOWNSTREAM_IMPORT", () => {
  it.each(forms("../legacy"))("flags legacy — %s", (_name, content) => {
    expect(DOWNSTREAM_IMPORT.test(content)).toBe(true)
  })

  it.each(forms("../faces"))("flags faces — %s", (_name, content) => {
    expect(DOWNSTREAM_IMPORT.test(content)).toBe(true)
  })

  it("does not flag siblings whose names merely start with a guarded one", () => {
    expect(DOWNSTREAM_IMPORT.test('import { x } from "../legacy-notes"')).toBe(false)
    expect(DOWNSTREAM_IMPORT.test('import { x } from "../facsimile"')).toBe(false)
  })

  it("does not flag the engine's own modules, which every layer may import", () => {
    expect(DOWNSTREAM_IMPORT.test('import { polar } from "../core/geometry"')).toBe(false)
    expect(DOWNSTREAM_IMPORT.test('import { x } from "../time"')).toBe(false)
  })
})

// legacy/ is frozen and builds on core/ alone.
describe("LEGACY_FORBIDDEN_IMPORT", () => {
  it.each(forms("../time"))("flags time — %s", (_name, content) => {
    expect(LEGACY_FORBIDDEN_IMPORT.test(content)).toBe(true)
  })

  it.each(forms("../faces"))("flags faces — %s", (_name, content) => {
    expect(LEGACY_FORBIDDEN_IMPORT.test(content)).toBe(true)
  })

  it("does not flag core/, the one layer legacy/ is allowed to import", () => {
    expect(LEGACY_FORBIDDEN_IMPORT.test('import { arcPath } from "../core/arc-path"')).toBe(false)
    expect(LEGACY_FORBIDDEN_IMPORT.test('import { x } from "../core"')).toBe(false)
  })

  it("does not flag a legacy sibling importing another legacy module", () => {
    expect(LEGACY_FORBIDDEN_IMPORT.test('import { useFrame } from "./frame"')).toBe(false)
  })
})
