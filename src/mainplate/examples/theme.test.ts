import { describe, expect, it } from "vitest"
import { type FaceTheme, oklchGradientStops, themeVars } from "./theme"

/** Parse "#rrggbb" into [r, g, b] on the 0–255 scale. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (m === null || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    throw new Error(`not a hex color: ${hex}`)
  }
  return [Number.parseInt(m[1], 16), Number.parseInt(m[2], 16), Number.parseInt(m[3], 16)]
}

/** Euclidean distance between two colors on the 0–255 sRGB scale. */
function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

describe("themeVars", () => {
  it("maps all eight FaceTheme fields onto --mp-* custom properties", () => {
    const theme: FaceTheme = {
      dial: "oklch(0.2 0.01 265)",
      chapter: "oklch(0.4 0.01 265)",
      index: "oklch(0.8 0.01 265)",
      lume: "oklch(0.88 0.17 155)",
      hour: "oklch(0.9 0.01 95)",
      minute: "oklch(0.9 0.01 95)",
      second: "oklch(0.62 0.23 25)",
      accent: "oklch(0.62 0.23 25)",
    }
    expect(themeVars(theme)).toEqual({
      "--mp-dial": theme.dial,
      "--mp-chapter": theme.chapter,
      "--mp-index": theme.index,
      "--mp-lume": theme.lume,
      "--mp-hour": theme.hour,
      "--mp-minute": theme.minute,
      "--mp-second": theme.second,
      "--mp-accent": theme.accent,
    })
  })
})

describe("oklchGradientStops", () => {
  // sRGB corner colors, so endpoint fidelity is checkable against known hex:
  // #0000ff is oklch(0.452 0.3132 264.05), #ffff00 is oklch(0.968 0.211 109.77).
  // Blue and yellow sit far apart on the hue wheel — the pair where an sRGB
  // ramp famously muddies through grey while the OKLCH path stays chromatic.
  const blue = { l: 0.452, c: 0.3132, h: 264.05 }
  const yellow = { l: 0.968, c: 0.211, h: 109.77 }

  it("emits seven stops by default, offsets even across [0, 1]", () => {
    const stops = oklchGradientStops(blue, yellow)
    expect(stops).toHaveLength(7)
    expect(stops.map((s) => s.offset)).toEqual([0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333, 1])
  })

  it("reproduces the endpoint colors exactly at offsets 0 and 1", () => {
    const stops = oklchGradientStops(blue, yellow)
    const first = stops[0]
    const last = stops[6]
    if (first === undefined || last === undefined) throw new Error("missing endpoint stops")
    // Within one 8-bit step per channel of the sRGB corners the inputs encode.
    const [r0, g0, b0] = hexToRgb(first.color)
    expect(Math.abs(r0 - 0)).toBeLessThanOrEqual(1)
    expect(Math.abs(g0 - 0)).toBeLessThanOrEqual(1)
    expect(Math.abs(b0 - 255)).toBeLessThanOrEqual(1)
    const [r1, g1, b1] = hexToRgb(last.color)
    expect(Math.abs(r1 - 255)).toBeLessThanOrEqual(1)
    expect(Math.abs(g1 - 255)).toBeLessThanOrEqual(1)
    expect(Math.abs(b1 - 0)).toBeLessThanOrEqual(1)
  })

  it("holds the perceptual path: the OKLCH midpoint sits far from the sRGB lerp", () => {
    // The load-bearing assertion. An SVG gradient interpolates the emitted
    // stops in sRGB; if the midpoint stop coincided with the sRGB lerp of the
    // endpoints, emitting seven stops would buy nothing. Between blue and
    // yellow the sRGB lerp lands on grey (#808080) while the OKLCH path passes
    // through a chromatic teal — a numeric gap, not a mere inequality.
    const stops = oklchGradientStops(blue, yellow)
    const first = stops[0]
    const mid = stops[3]
    const last = stops[6]
    if (first === undefined || mid === undefined || last === undefined) {
      throw new Error("missing stops")
    }
    const a = hexToRgb(first.color)
    const b = hexToRgb(last.color)
    const srgbLerp: [number, number, number] = [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
    ]
    const oklchMid = hexToRgb(mid.color)
    // Measured 162.4 at implementation time; 100 leaves headroom for rounding
    // while staying an order of magnitude above what channel noise could reach.
    expect(rgbDistance(oklchMid, srgbLerp)).toBeGreaterThan(100)
  })

  it("interpolates hue along the shorter arc", () => {
    // 350° to 10° crosses 0° (red), not 180° (teal). The long way round would
    // put green and blue above red at the midpoint; the short way keeps red
    // dominant. This is the CSS default the helper must match.
    const stops = oklchGradientStops({ l: 0.6, c: 0.2, h: 350 }, { l: 0.6, c: 0.2, h: 10 }, 3)
    const mid = stops[1]
    if (mid === undefined) throw new Error("missing midpoint stop")
    const [r, g, b] = hexToRgb(mid.color)
    expect(r).toBeGreaterThan(g + 50)
    expect(r).toBeGreaterThan(b + 50)
  })

  it("degrades a stop count below two to the two endpoints", () => {
    // Data error, not programmer error: a count of one cannot describe a
    // gradient, so the helper degrades to the endpoints rather than throwing.
    const stops = oklchGradientStops(blue, yellow, 1)
    expect(stops).toHaveLength(2)
    expect(stops.map((s) => s.offset)).toEqual([0, 1])
  })
})
