import { describe, expect, it } from "vitest"
import { type Degrees, type DialUnits, polar } from "../core/geometry"
import { clearanceRadius, estimateInk, type Ink, inkClearance } from "./clearance"

/**
 * Independent check: sample both boundaries densely and take the minimum
 * pairwise distance. Deliberately shares no code with the solver — it samples
 * shapes where the solver reasons about features — so a wrong case split in
 * `separation` cannot agree with it by construction.
 */
function bruteClearance(
  ink: Ink,
  angle: Degrees,
  rotation: Degrees,
  tick: { r: DialUnits; width?: DialUnits },
  r: DialUnits,
): number {
  const u = polar(angle - rotation, 1)
  const v = { x: -u.y, y: u.x }
  const D = tick.r - r
  const tw = (tick.width ?? 0) / 2
  const hw = ink.halfWidth
  const hh = ink.halfHeight
  const rl = ink.cornerLeft ?? 0
  const rr = ink.cornerRight ?? 0

  // Ink boundary: four edges shortened by their corner cuts, four quarter arcs.
  const inkPts: Array<{ x: number; y: number }> = []
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, n: number) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n
      inkPts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  const arc = (c: { x: number; y: number }, rad: number, a0: number, a1: number) => {
    for (let i = 0; i <= 40; i++) {
      const a = a0 + ((a1 - a0) * i) / 40
      inkPts.push({ x: c.x + rad * Math.cos(a), y: c.y + rad * Math.sin(a) })
    }
  }
  seg({ x: -(hw - rl), y: -hh }, { x: hw - rr, y: -hh }, 200)
  seg({ x: -(hw - rl), y: hh }, { x: hw - rr, y: hh }, 200)
  seg({ x: -hw, y: -(hh - rl) }, { x: -hw, y: hh - rl }, 100)
  seg({ x: hw, y: -(hh - rr) }, { x: hw, y: hh - rr }, 100)
  const q = Math.PI / 2
  arc({ x: hw - rr, y: hh - rr }, rr, 0, q)
  arc({ x: -(hw - rl), y: hh - rl }, rl, q, 2 * q)
  arc({ x: -(hw - rl), y: -(hh - rl) }, rl, 2 * q, 3 * q)
  arc({ x: hw - rr, y: -(hh - rr) }, rr, 3 * q, 4 * q)

  // Tick boundary, in (along, lateral) ray coordinates mapped through (u, v):
  // the inner edge plus a long run of both flanks.
  const tickPts: Array<{ x: number; y: number }> = []
  const at = (along: number, lat: number) =>
    tickPts.push({ x: along * u.x + lat * v.x, y: along * u.y + lat * v.y })
  for (let i = 0; i <= 100; i++) at(D, -tw + (2 * tw * i) / 100)
  for (let i = 0; i <= 400; i++) {
    at(D + (40 * i) / 400, tw)
    at(D + (40 * i) / 400, -tw)
  }

  let best = Number.POSITIVE_INFINITY
  for (const a of inkPts) {
    for (const b of tickPts) {
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d < best) best = d
    }
  }
  return best
}

describe("estimateInk", () => {
  it("estimates sit on or just above the measured ink widths", () => {
    // Ink widths in em, measured off canvas rasterisation of the dev server's
    // font stack (SF Pro): the estimate must never come in under the real ink
    // (that direction under-clears), and should stay within 0.16em over it.
    const measured: Record<string, number> = {
      "220": 1.643,
      "100": 1.565,
      "12": 0.917,
      "40": 1.13,
      N: 0.565,
      W: 0.88,
      XII: 0.995,
    }
    for (const [label, inkEm] of Object.entries(measured)) {
      const est = (estimateInk(label, 2).halfWidth * 2) / 2 // fontSize 2 → halfWidth === em width
      expect(est, label).toBeGreaterThanOrEqual(inkEm)
      expect(est, label).toBeLessThanOrEqual(inkEm + 0.16)
    }
  })

  it("narrow and wide glyphs come from the table, not the fallback", () => {
    expect(estimateInk("111", 12).halfWidth).toBeLessThan(estimateInk("444", 12).halfWidth * 0.8)
    expect(estimateInk("W", 12).halfWidth).toBeGreaterThan(estimateInk("N", 12).halfWidth * 1.2)
    expect(estimateInk("I", 12).halfWidth).toBeLessThan(estimateInk("N", 12).halfWidth * 0.5)
  })

  it("height is the flat cap band, not the line box", () => {
    // 0.705em measured across every flat-topped dial string; the line box
    // (~1.18em) and the overshot round ink (0.73em) are both wrong to use.
    expect(estimateInk("10", 11).halfHeight).toBeCloseTo((0.705 * 11) / 2, 10)
    expect(estimateInk("W", 20).halfHeight).toBeCloseTo(0.705 * 10, 10)
  })

  it("corner recession applies per side, only for round-cornered glyphs", () => {
    const g220 = estimateInk("220", 11)
    expect(g220.cornerLeft).toBe(0) // "2" has a flat base — measured 0.013em empty
    expect(g220.cornerRight).toBeCloseTo(0.08 * 11, 10) // "0" measured ≥ 0.114em empty
    const n = estimateInk("N", 11)
    expect(n.cornerLeft).toBe(0)
    expect(n.cornerRight).toBe(0)
    const zero = estimateInk("0", 11)
    expect(zero.cornerLeft).toBeCloseTo(0.88, 10)
    expect(zero.cornerRight).toBeCloseTo(0.88, 10)
  })
})

describe("clearanceRadius", () => {
  const tick = { r: 78, width: 2.2 }

  it("holds the flat cap edge at 12 o'clock exactly", () => {
    const ink = estimateInk("220", 11) // hh = 3.8775
    const r = clearanceRadius({ ink, angle: 0, tick, clearance: 3 })
    expect(r).toBeCloseTo(78 - (3.8775 + 3), 6)
  })

  it("holds the advance edge at 3 o'clock exactly", () => {
    const ink = estimateInk("220", 11) // hw = 9.57
    const r = clearanceRadius({ ink, angle: 90, tick, clearance: 3 })
    expect(r).toBeCloseTo(78 - (9.57 + 3), 6)
  })

  it("reduces to the scalar branch when the text rotates with the ray", () => {
    const ink = estimateInk("VIII", 14)
    for (const angle of [0, 37, 90, 135, 222, 301]) {
      const r = clearanceRadius({ ink, angle, rotation: angle, tick, clearance: 2 })
      expect(r, `angle ${angle}`).toBeCloseTo(78 - (ink.halfHeight + 2), 6)
    }
  })

  it("the owner's case: 0 and 220 read the same clearance at their diagonals", () => {
    for (const [label, angle] of [
      ["0", -135],
      ["220", 135],
    ] as const) {
      const ink = estimateInk(label, 11)
      const r = clearanceRadius({ ink, angle, tick, clearance: 3 })
      expect(inkClearance({ ink, angle, tick, r }), label).toBeCloseTo(3, 6)
      expect(bruteClearance(ink, angle, 0, tick, r), label).toBeCloseTo(3, 1)
    }
  })

  it("quantifies the bug in the ray/box prototype it replaces", () => {
    // The shipped gallery formula held the on-ray gap at 3 by pulling each
    // centre in by min(hw/|ux|, hh/|uy|) from an anchor at 75, using its own
    // metrics (0.6em/char, cap 0.72em, no trim). Reproduce those placements
    // and measure the true shortest distance instead.
    const old = (label: string, angle: number) => {
      const u = polar(angle, 1)
      const chars: Record<string, number> = { "1": 0.45, I: 0.25, W: 0.9, M: 0.9 }
      const em = [...label].reduce((w, ch) => w + (chars[ch] ?? 0.6), 0)
      const hw = (em * 11) / 2
      const hh = (0.72 * 11) / 2
      const t = Math.min(
        Math.abs(u.x) > 1e-9 ? hw / Math.abs(u.x) : Number.POSITIVE_INFINITY,
        Math.abs(u.y) > 1e-9 ? hh / Math.abs(u.y) : Number.POSITIVE_INFINITY,
      )
      return 75 - t
    }
    const zero = inkClearance({ ink: estimateInk("0", 11), angle: -135, tick, r: old("0", -135) })
    const two20 = inkClearance({
      ink: estimateInk("220", 11),
      angle: 135,
      tick,
      r: old("220", 135),
    })
    // "0" came out roughly right; "220" sat less than half as clear. That
    // disparity is the reported bug, pinned here as numbers.
    expect(zero).toBeGreaterThan(2.8)
    expect(two20).toBeLessThan(1.6)
  })

  it("a rail — unbounded width — clears by the support distance", () => {
    // A chapter-ring rail is the tick whose width never ends: every direction
    // ends at the rail's line, so the box corner governs and the pull-in is
    // the support function hw·|ux| + hh·|uy|, not the ray exit.
    const ink: Ink = { halfWidth: 9, halfHeight: 4 }
    const r = clearanceRadius({
      ink,
      angle: 135,
      tick: { r: 80, width: Number.POSITIVE_INFINITY },
      clearance: 2,
    })
    const s = (9 + 4) * Math.abs(Math.sin((135 * Math.PI) / 180))
    expect(r).toBeCloseTo(80 - (s + 2), 6)
  })

  it("asking for more clearance always moves the anchor further in", () => {
    const ink = estimateInk("60", 12)
    let last = Number.POSITIVE_INFINITY
    for (const g of [0, 1, 2, 4, 8]) {
      const r = clearanceRadius({ ink, angle: 120, tick, clearance: g })
      expect(r).toBeLessThan(last)
      last = r
    }
  })

  it("round-trips through inkClearance across angles, widths and labels", () => {
    for (const label of ["0", "220", "W", "1"]) {
      for (const angle of [0, 30, 60, 90, 135, 180, 245, 330]) {
        for (const width of [0, 1.1, 2.2, 4]) {
          for (const clearance of [1, 3, 6]) {
            const ink = estimateInk(label, 11)
            const t = { r: 80, width }
            const r = clearanceRadius({ ink, angle, tick: t, clearance })
            const got = inkClearance({ ink, angle, tick: t, r })
            expect(got, `${label} at ${angle}, width ${width}, g ${clearance}`).toBeCloseTo(
              clearance,
              6,
            )
          }
        }
      }
    }
  })

  it("matches the brute-force distance across a sweep of diagonal cases", () => {
    for (const label of ["220", "0", "W"]) {
      for (const angle of [30, 45, 120, 135, 225, 315]) {
        for (const clearance of [1.5, 3]) {
          const ink = estimateInk(label, 11)
          const r = clearanceRadius({ ink, angle, tick, clearance })
          const brute = bruteClearance(ink, angle, 0, tick, r)
          expect(brute, `${label} at ${angle}, g ${clearance}`).toBeCloseTo(clearance, 1)
        }
      }
    }
  })
})

describe("inkClearance", () => {
  it("reports overlap as strictly negative", () => {
    const ink = estimateInk("220", 11)
    expect(inkClearance({ ink, angle: 0, tick: { r: 78 }, r: 76 })).toBeLessThan(0)
  })

  it("agrees with plain geometry at 6 o'clock", () => {
    const ink = estimateInk("30", 11)
    // Centre at 60, flat cap edge at 60 + hh, tick tip at 78.
    expect(inkClearance({ ink, angle: 180, tick: { r: 78, width: 2 }, r: 60 })).toBeCloseTo(
      78 - 60 - ink.halfHeight,
      6,
    )
  })
})
