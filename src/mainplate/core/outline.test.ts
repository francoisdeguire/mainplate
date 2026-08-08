import { describe, expect, it } from "vitest"
import { polar as polarPoint } from "./geometry"
import { circleOutline, rectOutline } from "./outline"

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
