import { describe, expect, it } from "vitest"
import type { Scale } from "./geometry"
import { populate } from "./tick-scale"

const fullCircle: Scale = { min: 0, max: 60, startAngle: 0, sweepAngle: 360 }
const gauge: Scale = { min: 0, max: 220, startAngle: -135, sweepAngle: 270 }

const values = (ticks: { value: number }[]) => ticks.map((t) => t.value)

describe("populate — count on a full circle", () => {
  it("excludes the duplicate endpoint", () => {
    const out = populate({ count: 4 }, fullCircle)
    expect(values(out)).toEqual([0, 15, 30, 45])
  })

  it("produces exactly `count` marks", () => {
    expect(populate({ count: 60 }, fullCircle)).toHaveLength(60)
  })
})

describe("populate — count on a partial sweep", () => {
  it("includes both endpoints", () => {
    const out = populate({ count: 3 }, gauge)
    expect(values(out)).toEqual([0, 110, 220])
  })

  it("spaces by span / (count - 1)", () => {
    expect(values(populate({ count: 5 }, gauge))).toEqual([0, 55, 110, 165, 220])
  })

  it("returns a single mark at min for count 1", () => {
    expect(values(populate({ count: 1 }, gauge))).toEqual([0])
  })
})

describe("populate — explicit ticks", () => {
  it("passes values through in order", () => {
    const out = populate({ ticks: [{ value: 5 }, { value: 1 }] }, fullCircle)
    expect(values(out)).toEqual([5, 1])
  })

  it("preserves passthrough fields", () => {
    const out = populate({ ticks: [{ value: 5, label: "V", major: true }] }, fullCircle)
    expect(out[0]?.label).toBe("V")
    expect(out[0]?.major).toBe(true)
  })

  it("preserves a per-item `at` position override", () => {
    const out = populate({ ticks: [{ value: 5, at: 42 }] }, fullCircle)
    expect(out[0]?.at).toBe(42)
  })
})

describe("populate — tiers", () => {
  it("treats `every` as a domain step, not an index stride", () => {
    const out = populate({ tiers: [{ every: 15 }] }, fullCircle)
    expect(values(out)).toEqual([0, 15, 30, 45])
  })

  it("derives count from the domain, so a gauge needs no restating", () => {
    expect(populate({ tiers: [{ every: 10 }] }, gauge)).toHaveLength(23)
  })

  it("stops short rather than overshooting on a non-divisible step", () => {
    const out = populate({ tiers: [{ every: 7 }] }, fullCircle)
    expect(values(out).at(-1)).toBe(56)
  })

  it("drops the seam mark on a full circle", () => {
    const out = populate({ tiers: [{ every: 60 }] }, fullCircle)
    expect(values(out)).toEqual([0])
  })

  it("keeps the endpoint on a partial sweep", () => {
    const out = populate({ tiers: [{ every: 110 }] }, gauge)
    expect(values(out)).toEqual([0, 110, 220])
  })

  it("numbers index within each tier and tags the tier", () => {
    const out = populate({ tiers: [{ every: 30 }, { every: 20 }] }, fullCircle)
    const tier0 = out.filter((t) => t.tier === 0)
    const tier1 = out.filter((t) => t.tier === 1)
    expect(tier0.map((t) => t.index)).toEqual([0, 1])
    expect(tier1.map((t) => t.index)).toEqual([0, 1, 2])
  })

  it("preserves passthrough fields from the tier spec", () => {
    const out = populate({ tiers: [{ every: 30, length: 8 }] }, fullCircle)
    expect(out.map((t) => t.length)).toEqual([8, 8])
  })

  it("avoids float drift by multiplying rather than accumulating", () => {
    const fine: Scale = { min: 0, max: 1, startAngle: 0, sweepAngle: 360 }
    const out = populate({ tiers: [{ every: 0.1 }] }, fine)
    expect(out[3]?.value).toBeCloseTo(0.3, 12)
    expect(out).toHaveLength(10)
    // Bit-exact, not merely close: accumulating `+= 0.1` agrees with `k * 0.1`
    // to within 1e-16 for every k, so any tolerant assertion passes either way.
    // Only exact equality with the multiplied value can fail on accumulation.
    expect(values(out)).toEqual(Array.from({ length: 10 }, (_, k) => k * 0.1))
  })
})

describe("populate — from/to bounds", () => {
  it("restricts the covered domain", () => {
    const out = populate({ count: 3, from: 30, to: 60 }, fullCircle)
    expect(values(out)).toEqual([30, 45, 60])
  })

  it("bounds a tier population too", () => {
    const out = populate({ tiers: [{ every: 5 }], from: 40, to: 50 }, fullCircle)
    expect(values(out)).toEqual([40, 45, 50])
  })

  it("keeps the seam drop when the bounds still close the circle", () => {
    const out = populate({ tiers: [{ every: 15 }], from: 0, to: 60 }, fullCircle)
    expect(values(out)).toEqual([0, 15, 30, 45])
  })
})

describe("populate — normalized position", () => {
  it("runs t from 0 to 1 across the bounds", () => {
    const out = populate({ count: 3 }, gauge)
    expect(out.map((x) => x.t)).toEqual([0, 0.5, 1])
  })

  it("measures t against the bounds, not the scale", () => {
    const out = populate({ count: 3, from: 30, to: 60 }, fullCircle)
    expect(out.map((x) => x.t)).toEqual([0, 0.5, 1])
  })
})

describe("populate — input exclusivity", () => {
  it("throws when more than one population source is given", () => {
    expect(() => populate({ count: 4, tiers: [{ every: 5 }] }, fullCircle)).toThrow(
      /exactly one of/i,
    )
  })
  it("throws when none is given", () => {
    expect(() => populate({}, fullCircle)).toThrow(/exactly one of/i)
  })
})
