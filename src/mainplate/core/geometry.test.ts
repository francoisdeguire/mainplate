import { describe, expect, it } from "vitest"
import {
  angleToValue,
  epsilonFor,
  fmt,
  normalizeAngle,
  polar,
  type Scale,
  valueToAngle,
} from "./geometry"

const closeTo = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe("polar", () => {
  it("puts angle 0 straight up", () => {
    const p = polar(0, 100)
    closeTo(p.x, 0)
    closeTo(p.y, -100)
  })

  it("goes clockwise: 90 is to the right", () => {
    const p = polar(90, 100)
    closeTo(p.x, 100)
    closeTo(p.y, 0)
  })

  it("180 is straight down", () => {
    const p = polar(180, 100)
    closeTo(p.x, 0)
    closeTo(p.y, 100)
  })

  it("270 is to the left", () => {
    const p = polar(270, 100)
    closeTo(p.x, -100)
    closeTo(p.y, 0)
  })

  it("scales with radius", () => {
    const p = polar(90, 42)
    closeTo(p.x, 42)
  })
})

describe("normalizeAngle", () => {
  it("wraps negatives into [0,360)", () => {
    expect(normalizeAngle(-90)).toBe(270)
  })
  it("wraps past a full turn", () => {
    expect(normalizeAngle(450)).toBe(90)
  })
  it("maps exactly 360 to 0", () => {
    expect(normalizeAngle(360)).toBe(0)
  })
  it("leaves in-range angles alone", () => {
    expect(normalizeAngle(37)).toBe(37)
  })
})

describe("valueToAngle", () => {
  const clock: Scale = { min: 0, max: 60, startAngle: 0, sweepAngle: 360 }

  it("maps min to startAngle", () => {
    closeTo(valueToAngle(0, clock), 0)
  })

  it("maps a quarter of the domain to a quarter of the sweep", () => {
    closeTo(valueToAngle(15, clock), 90)
  })

  it("honours a partial sweep and a non-zero start", () => {
    const gauge: Scale = { min: 0, max: 220, startAngle: -135, sweepAngle: 270 }
    closeTo(valueToAngle(0, gauge), -135)
    closeTo(valueToAngle(220, gauge), 135)
    closeTo(valueToAngle(110, gauge), 0)
  })

  it("falls back to startAngle when min === max rather than returning NaN", () => {
    const degenerate: Scale = { min: 5, max: 5, startAngle: 42, sweepAngle: 360 }
    expect(valueToAngle(5, degenerate)).toBe(42)
    expect(Number.isNaN(valueToAngle(9, degenerate))).toBe(false)
  })
})

describe("angleToValue", () => {
  it("round-trips with valueToAngle", () => {
    const s: Scale = { min: 0, max: 220, startAngle: -135, sweepAngle: 270 }
    for (const v of [0, 37.5, 110, 219.99, 220]) {
      closeTo(angleToValue(valueToAngle(v, s), s), v)
    }
  })
})

describe("fmt", () => {
  it("rounds to four decimals so path snapshots are engine-stable", () => {
    expect(fmt(1 / 3)).toBe("0.3333")
  })
  it("drops trailing zeros", () => {
    expect(fmt(2.5)).toBe("2.5")
    expect(fmt(3)).toBe("3")
  })
  it("normalises negative zero", () => {
    expect(fmt(-0)).toBe("0")
    expect(fmt(-1e-12)).toBe("0")
  })
})

describe("epsilonFor", () => {
  it("scales with the domain span", () => {
    expect(epsilonFor({ min: 0, max: 60 })).toBeCloseTo(60e-9, 15)
  })
  it("never returns zero for a degenerate domain", () => {
    expect(epsilonFor({ min: 5, max: 5 })).toBeGreaterThan(0)
  })
})
