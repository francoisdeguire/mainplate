import { describe, expect, it, vi } from "vitest"
import { polar as polarPoint } from "./geometry"
import { circleOutline, rectOutline, resolveOutline } from "./outline"

const closeTo = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe("circleOutline", () => {
  const o = circleOutline()

  it("sits at the nominal radius at angle 0", () => {
    const p = o.pointAt(0)
    closeTo(p.x, 0)
    closeTo(p.y, -100)
  })

  it("follows the clockwise convention", () => {
    const p = o.pointAt(90)
    closeTo(p.x, 100)
    closeTo(p.y, 0)
  })

  it("insetting reduces the radius", () => {
    const p = o.pointAt(90, 8)
    closeTo(p.x, 92)
    closeTo(p.y, 0)
  })

  it("clamps an inset larger than the radius to the centre", () => {
    const p = o.pointAt(90, 150)
    closeTo(p.x, 0)
    closeTo(p.y, 0)
  })

  it("has an inward normal that is the negated radial unit vector", () => {
    const n = o.normalAt(90)
    closeTo(n.x, -1)
    closeTo(n.y, 0)
  })

  it("has an inset-independent normal", () => {
    const a = o.normalAt(37)
    const b = o.normalAt(37, 20)
    closeTo(a.x, b.x)
    closeTo(a.y, b.y)
  })

  it("has a square bbox centred on the origin", () => {
    expect(o.bbox()).toEqual({ x: -100, y: -100, width: 200, height: 200 })
  })

  it("shrinks its bbox with inset", () => {
    expect(o.bbox(10)).toEqual({ x: -90, y: -90, width: 180, height: 180 })
  })

  it("emits a stable path string", () => {
    expect(o.path()).toMatchInlineSnapshot(
      `"M 0 -100 A 100 100 0 1 1 0 100 A 100 100 0 1 1 0 -100 Z"`,
    )
  })

  it("emits a stable inset path string", () => {
    expect(o.path(8)).toMatchInlineSnapshot(`"M 0 -92 A 92 92 0 1 1 0 92 A 92 92 0 1 1 0 -92 Z"`)
  })
})

describe("rectOutline — sharp corners", () => {
  const o = rectOutline({ ratio: 1 })

  it("hits the top edge at angle 0", () => {
    const p = o.pointAt(0)
    closeTo(p.x, 0)
    closeTo(p.y, -100)
  })

  it("hits the right edge at angle 90", () => {
    const p = o.pointAt(90)
    closeTo(p.x, 100)
    closeTo(p.y, 0)
  })

  it("reaches the corner at 45 degrees — further than a circle would", () => {
    const p = o.pointAt(45)
    closeTo(p.x, 100)
    closeTo(p.y, -100)
  })

  it("has an axis-aligned inward normal on an edge", () => {
    const n = o.normalAt(90)
    closeTo(n.x, -1)
    closeTo(n.y, 0)
  })

  it("points the top-edge normal downward", () => {
    const n = o.normalAt(0)
    closeTo(n.x, 0)
    closeTo(n.y, 1)
  })
})

describe("rectOutline — flank normals on a non-square rect", () => {
  // hw !== hh here, so a normal classified against the wrong half-extent
  // comes out rotated 90 degrees. Every square-rect normal test is blind
  // to that mistake.
  const tank = rectOutline({ ratio: 0.78 })

  it("points down from the top flank", () => {
    const n = tank.normalAt(0)
    closeTo(n.x, 0)
    closeTo(n.y, 1)
  })

  it("points left from the right flank", () => {
    const n = tank.normalAt(90)
    closeTo(n.x, -1)
    closeTo(n.y, 0)
  })

  it("points up from the bottom flank", () => {
    const n = tank.normalAt(180)
    closeTo(n.x, 0)
    closeTo(n.y, -1)
  })

  it("points right from the left flank", () => {
    const n = tank.normalAt(270)
    closeTo(n.x, 1)
    closeTo(n.y, 0)
  })
})

describe("rectOutline — aspect ratio", () => {
  it("keeps the minor axis at 100 when taller than wide", () => {
    const tank = rectOutline({ ratio: 0.78 })
    closeTo(tank.pointAt(90).x, 100)
    closeTo(tank.pointAt(0).y, -100 / 0.78)
  })

  it("keeps the minor axis at 100 when wider than tall", () => {
    const wide = rectOutline({ ratio: 2 })
    closeTo(wide.pointAt(0).y, -100)
    closeTo(wide.pointAt(90).x, 200)
  })

  it("reports a bbox matching the aspect ratio", () => {
    const b = rectOutline({ ratio: 0.5 }).bbox()
    expect(b.width).toBeCloseTo(200, 9)
    expect(b.height).toBeCloseTo(400, 9)
  })
})

describe("rectOutline — degenerate options", () => {
  it("throws on a ratio of zero rather than emitting an infinite viewBox", () => {
    // The symptom this replaces: bbox().height === Infinity, so <Mainplate>
    // rendered viewBox="-110 -Infinity 220 Infinity" and the face vanished.
    expect(() => rectOutline({ ratio: 0 })).toThrow(/mainplate: invalid rectOutline\(\) options/)
    expect(() => rectOutline({ ratio: 0 })).toThrow(/`ratio` must be finite and greater than 0/)
    expect(() => rectOutline({ ratio: 0 })).toThrow(/received 0/)
  })

  it("throws on a negative or non-finite ratio", () => {
    // ratio: -1 gave a zero-height bbox and (0, 0) normals.
    expect(() => rectOutline({ ratio: -1 })).toThrow(/received -1/)
    expect(() => rectOutline({ ratio: Number.NaN })).toThrow(/received NaN/)
    expect(() => rectOutline({ ratio: Number.POSITIVE_INFINITY })).toThrow(/received Infinity/)
  })

  it("throws on a negative or non-finite radius", () => {
    expect(() => rectOutline({ radius: -4 })).toThrow(
      /`radius` must be finite and not negative, received -4/,
    )
    expect(() => rectOutline({ radius: Number.NaN })).toThrow(/`radius` must be finite/)
  })

  it("names both problems at once when both are bad", () => {
    expect(() => rectOutline({ ratio: 0, radius: -1 })).toThrow(/`ratio`.*;.*`radius`/s)
  })

  it("reaches the guard through a descriptor passed to resolveOutline", () => {
    expect(() => resolveOutline({ kind: "rect", ratio: 0 })).toThrow(
      /mainplate: invalid rectOutline\(\) options/,
    )
  })

  it("accepts the legitimate edges the guard must not reject", () => {
    expect(() => rectOutline()).not.toThrow()
    expect(() => rectOutline({ radius: 0 })).not.toThrow()
    expect(() => rectOutline({ ratio: 1e-6 })).not.toThrow()
    expect(() => rectOutline({ ratio: 1000, radius: 500 })).not.toThrow()
  })

  it("logs and falls back to a unit square in production instead of throwing", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const out = rectOutline({ ratio: 0, radius: -1 })
      // A square with square corners: the same shape as rectOutline() bare.
      expect(out.bbox()).toEqual({ x: -100, y: -100, width: 200, height: 200 })
      expect(out.path()).toBe(rectOutline().path())
      expect(Number.isFinite(out.bbox().height)).toBe(true)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/mainplate: invalid rectOutline\(\) options/)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Falling back to a square with square corners/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})

describe("rectOutline — rounded corners", () => {
  const o = rectOutline({ ratio: 1, radius: 20 })

  it("is unaffected on the edges", () => {
    closeTo(o.pointAt(0).y, -100)
    closeTo(o.pointAt(90).x, 100)
  })

  it("pulls the 45-degree point inside the sharp corner", () => {
    const p = o.pointAt(45)
    const sharp = rectOutline({ ratio: 1 }).pointAt(45)
    expect(Math.hypot(p.x, p.y)).toBeLessThan(Math.hypot(sharp.x, sharp.y))
  })

  it("puts the 45-degree point exactly on the corner arc", () => {
    const p = o.pointAt(45)
    // Corner circle centre for a 100x100 box with r=20.
    closeTo(Math.hypot(p.x - 80, p.y + 80), 20)
  })

  it("has a corner normal pointing at the corner centre", () => {
    const n = o.normalAt(45)
    closeTo(n.x, -Math.SQRT1_2)
    closeTo(n.y, Math.SQRT1_2)
  })

  it("returns a unit normal at every angle", () => {
    for (let a = 0; a < 360; a += 7) {
      closeTo(Math.hypot(o.normalAt(a).x, o.normalAt(a).y), 1)
    }
  })

  it("lands on the corner arc of a non-square rect", () => {
    // Tank at 0.78 with radius 12: hw = 100, hh = 128.2051282051282. The
    // top-right arc spans atan2(hw - 12, hh) ~ 34.47deg to atan2(hw, hh - 12)
    // ~ 40.71deg, so 37.5deg is on the arc. The centre is (88, -116.2051...),
    // and hw !== hh means the radius clamp is exercised against both extents.
    const tank = rectOutline({ ratio: 0.78, radius: 12 })
    const p = tank.pointAt(37.5)
    closeTo(Math.hypot(p.x - 88, p.y + 116.2051282051282), 12)
  })
})

describe("rectOutline — radius clamped by a half-extent", () => {
  it("clamps the radius to the half-width on a tall obround", () => {
    // hw = 100, hh = 200, so rr = min(300, 100, 200) = 100: the shape is an
    // obround whose top cap is a semicircle of radius 100 centred at (0, -100).
    // A 20deg ray hits that cap at (100 sin40, -100(1 + cos40)) — the circle
    // passes through the origin, so the chord along the ray is 2*100*cos(20).
    const tall = rectOutline({ ratio: 0.5, radius: 300 })
    const p = tall.pointAt(20)
    closeTo(p.x, 64.27876096865393)
    closeTo(p.y, -176.6044443118978)
    closeTo(Math.hypot(p.x, p.y + 100), 100)
  })

  it("clamps the radius to the half-height on a wide obround", () => {
    // hw = 200, hh = 100, so rr = min(150, 200, 100) = 100: the right cap is a
    // semicircle of radius 100 centred at (100, 0). A 70deg ray hits it at
    // (100(1 - cos140), -100 sin140) by the same chord-through-origin identity.
    const wide = rectOutline({ ratio: 2, radius: 150 })
    const p = wide.pointAt(70)
    closeTo(p.x, 176.6044443118978)
    closeTo(p.y, -64.27876096865394)
    closeTo(Math.hypot(p.x - 100, p.y), 100)
  })
})

describe("rectOutline — inset", () => {
  const o = rectOutline({ ratio: 0.78, radius: 12 })

  it("moves an edge point inward by exactly the inset", () => {
    closeTo(o.pointAt(90, 9).x, o.pointAt(90).x - 9)
  })

  it("shrinks the corner radius but keeps the corner centre fixed", () => {
    // Use a square here: on a tall Tank, 45 degrees lands on the vertical edge,
    // not the corner arc.
    const square = rectOutline({ ratio: 1, radius: 12 })
    const inner = square.pointAt(45, 5)
    // Inset moves each edge in by 5 and the radius down by 5, so the centre
    // (100-12, 100-12) does not move; only the arc radius does, 12 -> 7.
    closeTo(Math.hypot(inner.x - 88, inner.y + 88), 7)
  })

  it("clamps a corner radius that would go negative", () => {
    expect(() => o.pointAt(45, 200)).not.toThrow()
    const p = o.pointAt(45, 200)
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.y)).toBe(true)
  })

  it("degenerates the normal to the zero vector when fully collapsed", () => {
    // At inset 200 both half-extents clamp to 0 and the outline is a single
    // point at the origin. An inward direction is undefined there; normalAt
    // returns the zero vector rather than a fabricated unit normal. Pinned so
    // a change in this behaviour is a deliberate decision, not an accident.
    const n = o.normalAt(45, 200)
    closeTo(n.x, 0)
    closeTo(n.y, 0)
  })
})

describe("the thesis: r and inset diverge on a rect, coincide on a circle", () => {
  it("coincide on a circle", () => {
    const c = circleOutline()
    const viaInset = c.pointAt(37, 8)
    const viaRadius = polarPoint(37, 92)
    closeTo(viaInset.x, viaRadius.x)
    closeTo(viaInset.y, viaRadius.y)
  })

  it("diverge on a rect at every non-axis angle", () => {
    const rect = rectOutline({ ratio: 0.78, radius: 12 })
    const viaInset = rect.pointAt(45, 8)
    const viaRadius = polarPoint(45, 92)
    expect(Math.hypot(viaInset.x - viaRadius.x, viaInset.y - viaRadius.y)).toBeGreaterThan(1)
  })
})

describe("rectOutline — path", () => {
  it("emits a stable rounded-rect path", () => {
    expect(rectOutline({ ratio: 1, radius: 20 }).path()).toMatchInlineSnapshot(
      `"M -80 -100 H 80 A 20 20 0 0 1 100 -80 V 80 A 20 20 0 0 1 80 100 H -80 A 20 20 0 0 1 -100 80 V -80 A 20 20 0 0 1 -80 -100 Z"`,
    )
  })

  it("emits a stable sharp-rect path", () => {
    expect(rectOutline({ ratio: 1 }).path()).toMatchInlineSnapshot(
      `"M -100 -100 H 100 V 100 H -100 Z"`,
    )
  })

  it("emits a stable inset rounded-rect path", () => {
    expect(rectOutline({ ratio: 1, radius: 20 }).path(10)).toMatchInlineSnapshot(
      `"M -80 -90 H 80 A 10 10 0 0 1 90 -80 V 80 A 10 10 0 0 1 80 90 H -80 A 10 10 0 0 1 -90 80 V -80 A 10 10 0 0 1 -80 -90 Z"`,
    )
  })
})

describe("resolveOutline", () => {
  it("defaults to a circle when given nothing", () => {
    expect(resolveOutline().bbox()).toEqual(circleOutline().bbox())
  })

  it("accepts the string names", () => {
    expect(resolveOutline("circle").bbox()).toEqual(circleOutline().bbox())
    expect(resolveOutline("rect").bbox()).toEqual(rectOutline().bbox())
  })

  it("accepts the kind descriptors without params", () => {
    expect(resolveOutline({ kind: "circle" }).bbox()).toEqual(circleOutline().bbox())
    expect(resolveOutline({ kind: "rect" }).path()).toBe(rectOutline().path())
  })

  it("passes ratio and radius through to the factory", () => {
    const viaSpec = resolveOutline({ kind: "rect", ratio: 0.78, radius: 12 })
    const viaFactory = rectOutline({ ratio: 0.78, radius: 12 })
    expect(viaSpec.bbox()).toEqual(viaFactory.bbox())
    expect(viaSpec.path()).toBe(viaFactory.path())
    expect(viaSpec.path(8)).toBe(viaFactory.path(8))
    expect(viaSpec.pointAt(37)).toEqual(viaFactory.pointAt(37))
    expect(viaSpec.normalAt(37)).toEqual(viaFactory.normalAt(37))
  })

  it("returns an existing Outline unchanged", () => {
    const custom = rectOutline({ ratio: 2 })
    expect(resolveOutline(custom)).toBe(custom)
  })

  it("accepts a hand-rolled object that satisfies the Outline shape", () => {
    const stub = circleOutline()
    expect(resolveOutline({ ...stub })).not.toBe(stub)
    expect(resolveOutline({ ...stub }).bbox()).toEqual(stub.bbox())
  })

  it("throws a mainplate-branded, actionable error on garbage", () => {
    // @ts-expect-error — exercising the runtime guard a JS consumer can trip.
    expect(() => resolveOutline("circel")).toThrow(/mainplate: unrecognised outline/)
    // @ts-expect-error — a malformed descriptor.
    expect(() => resolveOutline({ kind: "hexagon" })).toThrow(/descriptor such as/)
    // @ts-expect-error — the error must point at the server-component route.
    expect(() => resolveOutline({ ratio: 0.78 })).toThrow(/Server Component/)
  })

  it("rejects a partial object rather than letting it fail later as a TypeError", () => {
    // <Mainplate> calls bbox() first, so a pointAt-only object used to pass the
    // structural check and then blow up as a bare TypeError deep inside render.
    let caught: unknown
    try {
      // @ts-expect-error — a JS consumer can hand over a half-built outline.
      resolveOutline({ pointAt: () => ({ x: 0, y: 0 }) })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(TypeError)
    expect((caught as Error).message).toMatch(/mainplate: unrecognised outline/)
    expect((caught as Error).message).toMatch(/object with keys \[pointAt\]/)
  })

  it("requires all seven methods, not just the first", () => {
    const full = circleOutline()
    for (const missing of [
      "pointAt",
      "normalAt",
      "bbox",
      "path",
      "length",
      "pointAtLength",
      "outwardNormalAtLength",
    ] as const) {
      const partial: Record<string, unknown> = { ...full }
      delete partial[missing]
      // @ts-expect-error — exercising the runtime guard.
      expect(() => resolveOutline(partial)).toThrow(/mainplate: unrecognised outline/)
    }
    expect(resolveOutline({ ...full }).bbox()).toEqual(full.bbox())
  })

  it("logs and falls back to a circle in production instead of throwing", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      // @ts-expect-error — malformed descriptor from a JS consumer.
      const out = resolveOutline({ kind: "rekt" })
      expect(out.bbox()).toEqual(circleOutline().bbox())
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/mainplate: unrecognised outline/)
      expect(spy.mock.calls[0]?.[0]).toMatch(/"kind":"rekt"/)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Falling back to the default circle/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})

describe("arc length — length and pointAtLength", () => {
  it("measures a circle's circumference, insets included", () => {
    const o = circleOutline()
    closeTo(o.length(), 2 * Math.PI * 100)
    closeTo(o.length(10), 2 * Math.PI * 90)
  })

  it("walks a circle clockwise from the top anchor", () => {
    const o = circleOutline()
    const p = o.pointAtLength(o.length() / 4)
    closeTo(p.x, 100)
    closeTo(p.y, 0)
  })

  it("wraps past a full lap and accepts negative distances", () => {
    const o = circleOutline()
    const L = o.length()
    const wrapped = o.pointAtLength(L + 12)
    const direct = o.pointAtLength(12)
    closeTo(wrapped.x, direct.x)
    closeTo(wrapped.y, direct.y)
    const back = o.pointAtLength(-L / 4)
    closeTo(back.x, -100)
    closeTo(back.y, 0)
  })

  it("returns the centre for a fully collapsed circle instead of NaN", () => {
    const p = circleOutline().pointAtLength(10, 150)
    closeTo(p.x, 0)
    closeTo(p.y, 0)
  })

  it("measures a rounded rect as straight runs plus quarter arcs", () => {
    // Eight half-runs of 70 plus four quarter arcs that sum to one full circle.
    const o = rectOutline({ ratio: 1, radius: 30 })
    closeTo(o.length(), 8 * 70 + 2 * Math.PI * 30)
  })

  it("shrinks a rect's perimeter with inset on the same terms as dims", () => {
    // Inset 9 on the Tank: hw 91, hh 100/0.78 - 9, corner radius 3.
    const hh = 100 / 0.78 - 9
    const o = rectOutline({ ratio: 0.78, radius: 12 })
    closeTo(o.length(9), 4 * (91 - 3) + 4 * (hh - 3) + 2 * Math.PI * 3)
  })

  it("keeps the quarter-perimeter on the cardinal anchors of a symmetric rect", () => {
    // This is why perimeter placement still puts III at 3 o'clock on a Tank:
    // by symmetry, a quarter of the distance is exactly the right-centre.
    const tank = rectOutline({ ratio: 0.78, radius: 12 })
    const L = tank.length(9)
    const quarter = tank.pointAtLength(L / 4, 9)
    closeTo(quarter.x, 91)
    closeTo(quarter.y, 0)
    const half = tank.pointAtLength(L / 2, 9)
    closeTo(half.x, 0)
    closeTo(half.y, 100 / 0.78 - 9)
  })

  it("lands inside a corner arc, where a radial ray never puts a mark", () => {
    const o = rectOutline({ ratio: 1, radius: 30 })
    // Half the top run, then half the first corner arc: 45 degrees around the
    // corner centre at (70, -70).
    const s = 70 + (Math.PI * 30) / 4
    const p = o.pointAtLength(s)
    closeTo(p.x, 70 + 30 * Math.SQRT1_2)
    closeTo(p.y, -(70 + 30 * Math.SQRT1_2))
  })

  it("walks a sharp-cornered rect with zero-length arcs skipped", () => {
    const o = rectOutline({ ratio: 1 })
    // Quarter perimeter of an 800-long square boundary: the right-centre.
    const p = o.pointAtLength(200)
    closeTo(p.x, 100)
    closeTo(p.y, 0)
  })
})

describe("outwardNormalAtLength", () => {
  it("is the radial direction at that arc position on a circle", () => {
    const o = circleOutline()
    const L = o.length()
    for (const fraction of [0, 0.125, 0.25, 0.4, 0.5, 0.75, 0.9]) {
      const n = o.outwardNormalAtLength(fraction * L)
      const radial = polarPoint(fraction * 360, 1)
      closeTo(n.x, radial.x)
      closeTo(n.y, radial.y)
    }
  })

  it("is the axis normal on a rect flank", () => {
    const o = rectOutline({ ratio: 1, radius: 30 })
    // 35 units along the 70-unit top run: the top flank, normal straight up.
    const top = o.outwardNormalAtLength(35)
    closeTo(top.x, 0)
    closeTo(top.y, -1)
    // A quarter of the way round a symmetric rect is the right-centre.
    const right = o.outwardNormalAtLength(o.length() / 4)
    closeTo(right.x, 1)
    closeTo(right.y, 0)
    const bottom = o.outwardNormalAtLength(o.length() / 2)
    closeTo(bottom.x, 0)
    closeTo(bottom.y, 1)
    const left = o.outwardNormalAtLength((o.length() * 3) / 4)
    closeTo(left.x, -1)
    closeTo(left.y, 0)
  })

  it("points away from the corner centre inside a corner arc", () => {
    const o = rectOutline({ ratio: 1, radius: 30 })
    // The same position as the corner-arc pointAtLength test: half the top run
    // then half the first quarter arc, 45 degrees around the centre (70, -70).
    const s = 70 + (Math.PI * 30) / 4
    const n = o.outwardNormalAtLength(s)
    closeTo(n.x, Math.SQRT1_2)
    closeTo(n.y, -Math.SQRT1_2)
    // And it agrees with the point the same distance returns: the unit vector
    // from the corner centre to that point, not a re-derivation of its own.
    const p = o.pointAtLength(s)
    closeTo(n.x, (p.x - 70) / 30)
    closeTo(n.y, (p.y + 70) / 30)
  })

  it("points OUTWARD everywhere, on both shapes and both insets", () => {
    // The spike derived this normal by epsilon-sampling the tangent and got the
    // sign inverted, which rendered every mark upside down. The dot product
    // against the point's own radius vector is what pins the direction: the
    // centre is the origin, so an outward normal always has a positive dot.
    for (const o of [circleOutline(), rectOutline({ ratio: 0.82, radius: 30 })]) {
      for (const inset of [0, 12]) {
        const L = o.length(inset)
        for (let k = 0; k < 37; k++) {
          const s = (k / 37) * L
          const n = o.outwardNormalAtLength(s, inset)
          const p = o.pointAtLength(s, inset)
          expect(n.x * p.x + n.y * p.y).toBeGreaterThan(0)
        }
      }
    }
  })

  it("is a unit vector everywhere, on both shapes and both insets", () => {
    for (const o of [circleOutline(), rectOutline({ ratio: 0.82, radius: 30 })]) {
      for (const inset of [0, 12]) {
        const L = o.length(inset)
        for (let k = 0; k < 37; k++) {
          const n = o.outwardNormalAtLength((k / 37) * L, inset)
          closeTo(Math.hypot(n.x, n.y), 1)
        }
      }
    }
  })

  it("agrees with normalAt, which points the other way", () => {
    // The two normals are the same line with opposite signs: normalAt is
    // inward by contract, outwardNormalAtLength outward. Sampling by distance and
    // asking the angular query about the same point is what proves it.
    const o = rectOutline({ ratio: 0.82, radius: 30 })
    const L = o.length()
    for (let k = 0; k < 23; k++) {
      const s = (k / 23) * L
      const p = o.pointAtLength(s)
      const angle = (Math.atan2(p.x, -p.y) * 180) / Math.PI
      const n = o.outwardNormalAtLength(s)
      const inward = o.normalAt(angle)
      expect(n.x).toBeCloseTo(-inward.x, 6)
      expect(n.y).toBeCloseTo(-inward.y, 6)
    }
  })

  it("wraps past a full lap and accepts negative distances", () => {
    const o = rectOutline({ ratio: 1, radius: 30 })
    const L = o.length()
    const wrapped = o.outwardNormalAtLength(L + 35)
    closeTo(wrapped.x, 0)
    closeTo(wrapped.y, -1)
    const back = o.outwardNormalAtLength(-L / 4)
    closeTo(back.x, -1)
    closeTo(back.y, 0)
  })

  it("degenerates to the zero vector when fully collapsed, on both shapes", () => {
    // Same contract as normalAt at inset 200: no direction exists at a point,
    // and a fabricated unit vector would be a lie a caller cannot detect.
    const c = circleOutline().outwardNormalAtLength(10, 150)
    closeTo(c.x, 0)
    closeTo(c.y, 0)
    const r = rectOutline({ ratio: 1, radius: 12 }).outwardNormalAtLength(10, 200)
    closeTo(r.x, 0)
    closeTo(r.y, 0)
  })
})
