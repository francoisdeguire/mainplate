import { describe, expect, it } from "vitest"
import { paletteVars } from "./palette"

/**
 * The palette contract from the spike, now the spec (§12): alpha ramps off the
 * ink — dial 5%, minor tick 32%, major tick 78%, numeral 72% — so one scheme
 * survives light and dark grounds untouched. Derivation is strictly CSS
 * relative color syntax; nothing here may ever read a computed style.
 */
describe("paletteVars", () => {
  it("inks with currentColor by default, so the app's own color themes the face", () => {
    const vars = paletteVars(undefined)
    expect(vars["--mp-ink"]).toBe("currentColor")
    // The ramps derive from the ink itself — this is the dark-ground
    // correctness capability: a dark app's light ink produces light ramps
    // with no prop and no mode switch.
    expect(vars["--mp-dial"]).toBe("oklch(from currentColor l c h / 0.05)")
    expect(vars["--mp-tick"]).toBe("oklch(from currentColor l c h / 0.32)")
    expect(vars["--mp-tick-major"]).toBe("oklch(from currentColor l c h / 0.78)")
    expect(vars["--mp-numeral"]).toBe("oklch(from currentColor l c h / 0.72)")
  })

  it("defaults the accent to the fixed warm red — the Mondaine lollipop", () => {
    expect(paletteVars(undefined)["--mp-accent"]).toBe("oklch(0.62 0.19 27)")
  })

  it("derives the whole palette from one given color, in CSS", () => {
    const vars = paletteVars("oklch(0.45 0.16 264)")
    expect(vars["--mp-ink"]).toBe("oklch(0.45 0.16 264)")
    // Accent is boosted through relative color syntax, never computed in JS.
    expect(vars["--mp-accent"]).toBe("oklch(from oklch(0.45 0.16 264) 0.62 calc(c * 1.2 + 0.06) h)")
    expect(vars["--mp-dial"]).toBe("oklch(from oklch(0.45 0.16 264) l c h / 0.05)")
    expect(vars["--mp-tick"]).toBe("oklch(from oklch(0.45 0.16 264) l c h / 0.32)")
    expect(vars["--mp-tick-major"]).toBe("oklch(from oklch(0.45 0.16 264) l c h / 0.78)")
    expect(vars["--mp-numeral"]).toBe("oklch(from oklch(0.45 0.16 264) l c h / 0.72)")
  })

  it("accepts a CSS variable, so color='var(--primary)' follows theme switches live", () => {
    const vars = paletteVars("var(--primary)")
    expect(vars["--mp-ink"]).toBe("var(--primary)")
    expect(vars["--mp-accent"]).toContain("oklch(from var(--primary)")
    expect(vars["--mp-tick"]).toBe("oklch(from var(--primary) l c h / 0.32)")
  })

  it("emits exactly the six face variables, all --mp- prefixed", () => {
    expect(Object.keys(paletteVars(undefined)).sort()).toEqual([
      "--mp-accent",
      "--mp-dial",
      "--mp-ink",
      "--mp-numeral",
      "--mp-tick",
      "--mp-tick-major",
    ])
  })
})
