import { describe, expect, it, vi } from "vitest"
import type { Scale } from "./geometry"
import { EVALUABLE_PROPS, populate, resolveTicks, type TickContext } from "./tick-scale"

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

  it("refuses an `every` small enough to hang the tab", () => {
    // 1e-9 over a 0–60 domain is sixty billion marks: the loop never returns
    // and the tab locks before anything renders. The guard has to fire before
    // the loop starts, not partway through it.
    expect(() => populate({ tiers: [{ every: 1e-9 }] }, fullCircle)).toThrow(
      /mainplate: tier 0 with `every: 1e-9`/,
    )
    expect(() => populate({ tiers: [{ every: 1e-9 }] }, fullCircle)).toThrow(
      // Sixty billion and change: `span + eps` over `every`, eps being 6e-8 here.
      /would generate 60000000060 marks, past the ceiling of 10000/,
    )
  })

  it("names the offending tier by index, not just the first", () => {
    expect(() => populate({ tiers: [{ every: 15 }, { every: 0.0001 }] }, fullCircle)).toThrow(
      /mainplate: tier 1 with `every: 0.0001`/,
    )
  })

  it("allows the densest tier a real dial would ask for", () => {
    // A chronograph's fifths-of-a-second track: 300 marks over 0–60.
    expect(populate({ tiers: [{ every: 0.2 }] }, fullCircle)).toHaveLength(300)
    // And right up to the ceiling itself, which must not be off by one.
    const dense: Scale = { min: 0, max: 9999, startAngle: -135, sweepAngle: 270 }
    expect(populate({ tiers: [{ every: 1 }] }, dense)).toHaveLength(10000)
  })

  it("truncates and logs in production rather than locking the page", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const out = populate({ tiers: [{ every: 0.001 }] }, fullCircle)
      expect(out).toHaveLength(10000)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/would generate 60001 marks/)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Truncating to 10000 marks/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
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

  it("keeps `ticks` and logs once in production when populations are combined", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const out = populate({ count: 4, ticks: [{ value: 5 }] }, fullCircle)
      expect(values(out)).toEqual([5])

      populate({ count: 4, ticks: [{ value: 5 }] }, fullCircle)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/exactly one of/i)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Using `ticks`/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it("populates nothing and logs in production when no population is given", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(populate({}, fullCircle)).toEqual([])
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Received none/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})

describe("resolveTicks — skip, array form", () => {
  it("omits the listed domain values", () => {
    const out = resolveTicks({ count: 4, skip: [15, 45] }, fullCircle)
    expect(values(out)).toEqual([0, 30])
  })

  it("matches within epsilon, where float equality would fail", () => {
    const fine: Scale = { min: 0, max: 1, startAngle: 0, sweepAngle: 360 }
    const out = resolveTicks({ tiers: [{ every: 0.1 }], skip: [0.3] }, fine)
    expect(values(out).some((v) => Math.abs(v - 0.3) < 1e-9)).toBe(false)
    expect(out).toHaveLength(9)
  })
})

describe("resolveTicks — skip, predicate form", () => {
  it("omits by index", () => {
    const out = resolveTicks({ count: 8, skip: ({ index }) => index % 4 === 3 }, fullCircle)
    expect(values(out)).toEqual([0, 7.5, 15, 30, 37.5, 45])
  })

  it("receives the computed angle", () => {
    const seen: number[] = []
    resolveTicks(
      {
        count: 4,
        skip: ({ angle }) => {
          seen.push(angle)
          return false
        },
      },
      fullCircle,
    )
    expect(seen).toEqual([0, 90, 180, 270])
  })

  it("honours a per-item `at` override when computing the angle", () => {
    const seen: number[] = []
    resolveTicks(
      {
        ticks: [{ value: 0, at: 42 }],
        skip: ({ angle }) => {
          seen.push(angle)
          return false
        },
      },
      fullCircle,
    )
    expect(seen).toEqual([42])
  })

  it("keeps within-tier indices, holes included, after a skip", () => {
    const out = resolveTicks({ count: 4, skip: [15] }, fullCircle)
    expect(out.map((t) => t.index)).toEqual([0, 2, 3])
  })
})

describe("resolveTicks — tier merge", () => {
  it("keeps only the later tier at a shared position", () => {
    const out = resolveTicks(
      {
        tiers: [
          { every: 15, length: 4 },
          { every: 30, length: 10 },
        ],
      },
      fullCircle,
    )
    expect(values(out)).toEqual([0, 15, 30, 45])
    expect(out.find((t) => t.value === 0)?.length).toBe(10)
    expect(out.find((t) => t.value === 15)?.length).toBe(4)
  })

  it("merges across coprime steps without double-drawing", () => {
    const out = resolveTicks({ tiers: [{ every: 4 }, { every: 6 }] }, fullCircle)
    const seen = new Set(values(out))
    expect(seen.size).toBe(out.length)
    expect(seen.has(12)).toBe(true)
  })

  it("merges values that differ only by float drift", () => {
    const fine: Scale = { min: 0, max: 1, startAngle: 0, sweepAngle: 360 }
    const out = resolveTicks({ tiers: [{ every: 0.1 }, { every: 0.3 }] }, fine)
    const near = values(out).filter((v) => Math.abs(v - 0.3) < 1e-9)
    expect(near).toHaveLength(1)
  })

  it("returns marks in ascending value order", () => {
    const out = resolveTicks({ tiers: [{ every: 30 }, { every: 20 }] }, fullCircle)
    expect(values(out)).toEqual([0, 20, 30, 40])
  })
})

describe("resolveTicks — skip placement", () => {
  it("per-tier skip lets the tier below show through", () => {
    const out = resolveTicks(
      {
        tiers: [
          { every: 15, length: 4 },
          { every: 30, length: 10, skip: [0] },
        ],
      },
      fullCircle,
    )
    // The major at 0 is gone, so the minor beneath it renders instead.
    expect(out.find((t) => t.value === 0)?.length).toBe(4)
  })

  it("top-level skip clears the position outright", () => {
    const out = resolveTicks(
      {
        tiers: [
          { every: 15, length: 4 },
          { every: 30, length: 10 },
        ],
        skip: [0],
      },
      fullCircle,
    )
    expect(out.find((t) => t.value === 0)).toBeUndefined()
  })

  it("top-level predicate skip sees the merged winner, not the pre-merge tiers", () => {
    const out = resolveTicks(
      { tiers: [{ every: 15 }, { every: 30 }], skip: ({ tier }) => tier === 1 },
      fullCircle,
    )
    // 0 and 30 belong to tier 1 after the merge, so they are cleared outright;
    // ran before the merge, tier 0 would show through and all four would remain.
    expect(values(out)).toEqual([15, 45])
  })

  it("does not leak a per-tier skip onto the resolved ticks", () => {
    const out = resolveTicks({ tiers: [{ every: 30, skip: () => false }] }, fullCircle)
    expect(out[0]).not.toHaveProperty("skip")
  })
})

describe("resolveTicks — prop resolution", () => {
  it("lets a per-item value beat a tier prop", () => {
    const out = resolveTicks({ ticks: [{ value: 0, length: 99 }], length: 4 }, fullCircle)
    expect(out[0]?.length).toBe(99)
  })

  it("lets a tier prop beat a top-level prop", () => {
    const out = resolveTicks({ tiers: [{ every: 30, length: 7 }], length: 4 }, fullCircle)
    expect(out[0]?.length).toBe(7)
  })

  it("falls back to the top-level prop", () => {
    const out = resolveTicks({ count: 2, length: 4 }, fullCircle)
    expect(out[0]?.length).toBe(4)
  })

  it("evaluates a function-valued prop per mark", () => {
    const out = resolveTicks({ count: 3, length: ({ t }: TickContext) => 3 + t * 9 }, gauge)
    expect(out.map((x) => x.length)).toEqual([3, 7.5, 12])
  })

  it("evaluates a function-valued tier prop even with no top-level props", () => {
    const out = resolveTicks(
      { tiers: [{ every: 30, length: ({ t }: TickContext) => 2 + t * 2 }] },
      fullCircle,
    )
    expect(out.map((x) => x.length)).toEqual([2, 3])
  })

  it("never invokes render callbacks or event handlers", () => {
    let called = false
    const arm = () => {
      called = true
    }
    const out = resolveTicks(
      {
        ticks: [{ value: 0, onClick: arm }],
        renderItem: arm,
        onPointerDown: arm,
        children: arm,
      },
      fullCircle,
    )
    expect(called).toBe(false)
    // Component-level callbacks are not per-mark props and are not filled in.
    expect(out[0]).not.toHaveProperty("renderItem")
    // A per-item callback passes through untouched for the renderer to use.
    expect(out[0]?.onClick).toBe(arm)
  })

  it("leaves a callback ref alone — not invoked, not replaced", () => {
    // `ref` matches no callback naming pattern, which is why the resolver must
    // work from an allowlist: an unrecognised function is left alone by
    // default, not invoked by default.
    let called = false
    const ref = () => {
      called = true
    }
    const out = resolveTicks({ ticks: [{ value: 0, ref }], ref }, fullCircle)
    expect(called).toBe(false)
    expect(out[0]?.ref).toBe(ref)
  })

  it("does not copy unrecognised top-level keys onto the marks", () => {
    const out = resolveTicks({ count: 2, className: "dial-ticks" }, fullCircle)
    expect(out[0]).not.toHaveProperty("className")
  })

  it("fills exactly the allowlisted props from the top level", () => {
    const out = resolveTicks(
      { count: 1, length: 6, width: 1, offset: 2, inset: 3, r: 80, fill: "red" },
      fullCircle,
    )
    for (const key of EVALUABLE_PROPS) {
      expect(out[0]?.[key], key).toBeDefined()
    }
  })
})
