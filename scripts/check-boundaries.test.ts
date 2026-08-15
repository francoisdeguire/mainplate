import { describe, expect, it } from "vitest"
import { TIME_IMPORT } from "./check-boundaries"

describe("TIME_IMPORT", () => {
  it.each([
    ["static from, double quotes", 'import { x } from "../time"'],
    ["static from, single quotes", "import { x } from '../time'"],
    ["bare side-effect import", 'import "../time"'],
    ["dynamic import, double quotes", 'import("../time")'],
    ["dynamic import, template literal", "import(`../time`)"],
    ["deep path", 'import { x } from "../time/ticker"'],
  ])("flags %s", (_name, content) => {
    expect(TIME_IMPORT.test(content)).toBe(true)
  })

  it("does not flag a sibling module whose name merely starts with time", () => {
    expect(TIME_IMPORT.test('import { x } from "../timezone"')).toBe(false)
  })

  // Documented, not aspirational: the script scans raw file text and never
  // strips comments, so a comment containing real import syntax is flagged
  // exactly like code would be. This pins that as accepted behaviour rather
  // than letting a future edit change it unnoticed.
  it("also flags a commented-out import, matching the script's current behaviour", () => {
    expect(TIME_IMPORT.test('// see import("../time") elsewhere')).toBe(true)
  })
})
