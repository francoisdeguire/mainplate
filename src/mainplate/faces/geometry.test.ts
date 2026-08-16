import { describe, expect, it } from "vitest"
import { circleOutline, quantize, rectOutline } from "../core"
import { markTransform, spanTransform } from "./geometry"

const RAD = Math.PI / 180

/** The face box of a circle with the usual 10 units of padding. */
const CIRCLE_BOX = { boxW: 220, boxH: 220 }

/** Every numeric field, as its shortest string — the form that reaches the DOM. */
const forms = (t: {
  left: string
  top: string
  widthCqw: number
  heightCqw: number
  rotate: number
}) => [t.left, t.top, String(t.widthCqw), String(t.heightCqw), String(t.rotate)]

describe("markTransform — hand-computable values on a circle", () => {
  const o = circleOutline()

  it("places a mark at angle 90, inset 10 exactly where arithmetic says", () => {
    // The point is (90, 0). The box runs from -110 to 110 on both axes, so the
    // left percentage is 50 + 100 * 90 / 220 = 90.909090..., and cqw units are
    // percentages of the box WIDTH: 2 / 220 * 100 and 8 / 220 * 100.
    const t = markTransform(o, { angle: 90, inset: 10 }, { width: 2, length: 8, ...CIRCLE_BOX })
    expect(t.left).toBe("90.9091%")
    expect(t.top).toBe("50%")
    expect(t.widthCqw).toBe(0.9091)
    expect(t.heightCqw).toBe(3.6364)
    expect(t.rotate).toBe(90)
  })

  it("centres the mark on the point rather than hanging it from a corner", () => {
    // At angle 0 the point is dead top-centre; a top-left placement would put
    // left at 50% too, so the check that discriminates is the y axis.
    const t = markTransform(o, { angle: 0, inset: 0 }, { width: 2, length: 8, ...CIRCLE_BOX })
    expect(t.left).toBe("50%")
    expect(t.top).toBe("4.5455%") // 50 + 100 * -100 / 220
  })

  it("scales BOTH cqw fields by the box width, never the height", () => {
    // 1cqw is one percent of the container's inline size. A height divided by
    // boxH looks right on a circle and squashes every mark on a Tank.
    const t = markTransform(
      circleOutline(),
      { angle: 0, inset: 0 },
      { width: 2, length: 8, boxW: 220, boxH: 440 },
    )
    expect(t.widthCqw).toBe(0.9091)
    expect(t.heightCqw).toBe(3.6364)
  })
})

describe("markTransform — orientation", () => {
  const circle = circleOutline()

  it("gives all four orientations at angle 90 on a circle", () => {
    const at = (orient: "radial" | "edge" | "tangent" | "upright") =>
      markTransform(circle, { angle: 90, inset: 0 }, { orient, width: 2, length: 8, ...CIRCLE_BOX })
        .rotate
    // Rotation turns the element's own top toward the direction: radial and
    // edge both face outward, tangent follows clockwise travel, upright never
    // turns at all.
    expect(at("radial")).toBe(90)
    expect(at("edge")).toBe(90)
    expect(at("tangent")).toBe(180)
    expect(at("upright")).toBe(0)
  })

  it("defaults to edge", () => {
    const tank = rectOutline({ ratio: 0.82, radius: 30 })
    const box = { boxW: 220, boxH: 263.9024 }
    const fallback = markTransform(tank, { angle: 20, inset: 0 }, { width: 2, length: 8, ...box })
    const explicit = markTransform(
      tank,
      { angle: 20, inset: 0 },
      { orient: "edge", width: 2, length: 8, ...box },
    )
    expect(fallback).toEqual(explicit)
  })

  it("separates edge from radial on a rect, where they genuinely differ", () => {
    // §4 of the carry-forward: the two are identical on a circle, which is why
    // confusing them is a silent failure. On the Tank's top flank at 20deg the
    // outward normal is straight up (rotation 0) while the frame ray is 20.
    const tank = rectOutline({ ratio: 0.82, radius: 30 })
    const box = { boxW: 220, boxH: 263.9024 }
    const edge = markTransform(
      tank,
      { angle: 20, inset: 0 },
      { orient: "edge", width: 2, length: 8, ...box },
    )
    const radial = markTransform(
      tank,
      { angle: 20, inset: 0 },
      { orient: "radial", width: 2, length: 8, ...box },
    )
    expect(edge.rotate).toBe(0)
    expect(radial.rotate).toBe(20)
    // Same point, different rotation: orientation must not move the mark.
    expect(edge.left).toBe(radial.left)
    expect(edge.top).toBe(radial.top)
  })
})

describe("markTransform — placement by perimeter distance", () => {
  it("agrees with angular placement where the two coincide on a circle", () => {
    const o = circleOutline()
    const byAngle = markTransform(
      o,
      { angle: 90, inset: 10 },
      { width: 2, length: 8, ...CIRCLE_BOX },
    )
    const byLength = markTransform(
      o,
      { along: o.length(10) / 4, inset: 10 },
      { width: 2, length: 8, ...CIRCLE_BOX },
    )
    expect(byLength).toEqual(byAngle)
  })

  it("orients an along-placed mark off the corner arc, where no ray reaches", () => {
    // A quarter of the way into the first corner arc of a 200x200 box with
    // radius 30: 22.5 degrees around the centre (70, -70). The outward normal
    // there is 22.5, while the frame ray through the same point is ~39.8 —
    // a mark that used the ray would visibly lean.
    const o = rectOutline({ ratio: 1, radius: 30 })
    const s = 70 + (Math.PI * 30) / 8
    const box = { boxW: 220, boxH: 220 }
    const edge = markTransform(o, { along: s, inset: 0 }, { width: 2, length: 8, ...box })
    const radial = markTransform(
      o,
      { along: s, inset: 0 },
      { orient: "radial", width: 2, length: 8, ...box },
    )
    expect(edge.rotate).toBe(22.5)
    const x = 70 + 30 * Math.sin(22.5 * RAD)
    const y = -(70 + 30 * Math.cos(22.5 * RAD))
    expect(radial.rotate).toBeCloseTo((Math.atan2(x, -y) * 180) / Math.PI, 4)
    expect(radial.rotate).not.toBe(edge.rotate)
    expect(edge.left).toBe(`${quantize(50 + (100 * x) / 220)}%`)
    expect(edge.top).toBe(`${quantize(50 + (100 * y) / 220)}%`)
  })
})

describe("markTransform — quantisation", () => {
  it("emits nothing longer than four decimals, in any field", () => {
    const t = markTransform(
      circleOutline(),
      { angle: 37, inset: 13 },
      { orient: "radial", width: 2.3, length: 7.7, ...CIRCLE_BOX },
    )
    for (const value of forms(t)) {
      expect(value).toMatch(/^-?\d+(\.\d{1,4})?%?$/)
    }
  })

  it("quantises the rect's long decimals too", () => {
    const tank = rectOutline({ ratio: 0.82, radius: 30 })
    const t = markTransform(
      tank,
      { angle: 53, inset: 7 },
      { width: 2.3, length: 7.7, boxW: 220, boxH: 263.9024 },
    )
    for (const value of forms(t)) {
      expect(value).toMatch(/^-?\d+(\.\d{1,4})?%?$/)
    }
  })

  it("normalises -0 away, as fmt does for path data", () => {
    // sin(360deg) is a small NEGATIVE float, so the point and the normal here
    // are both a hair below zero. "-0%" and a rotate of -0 serialise
    // differently on the server than in the browser: the hydration bug, again.
    const t = markTransform(
      circleOutline(),
      { angle: 360, inset: 0 },
      { width: 2, length: 8, ...CIRCLE_BOX },
    )
    expect(t.rotate).toBe(0)
    expect(Object.is(t.rotate, -0)).toBe(false)
    expect(t.left).toBe("50%")
    for (const value of forms(t)) {
      expect(value).not.toMatch(/^-0/)
    }
  })

  it("passes an angular rotation through unwrapped, 360 and all", () => {
    // Deliberate, and load-bearing for the rotation binder: a hand crossing
    // from 354deg to 360deg must not be handed a 0, or a CSS transition spins
    // it the whole way backwards. Angular placement reports the angle it was
    // given; only the derived orientations go through atan2.
    const t = markTransform(
      circleOutline(),
      { angle: 360, inset: 0 },
      { orient: "radial", width: 2, length: 8, ...CIRCLE_BOX },
    )
    expect(t.rotate).toBe(360)
    expect(
      markTransform(
        circleOutline(),
        { angle: -30, inset: 0 },
        { orient: "radial", width: 2, length: 8, ...CIRCLE_BOX },
      ).rotate,
    ).toBe(-30)
  })
})

describe("spanTransform — the radial-span tick", () => {
  it("spans two insets on a circle with hand-computable values", () => {
    // pointAt(90, 10) is (90, 0) and pointAt(90, 20) is (80, 0): midpoint
    // (85, 0), length 10, rotation the angle itself.
    const t = spanTransform(circleOutline(), 90, 10, 20, { width: 2, ...CIRCLE_BOX })
    expect(t.left).toBe("88.6364%")
    expect(t.top).toBe("50%")
    expect(t.widthCqw).toBe(0.9091)
    expect(t.heightCqw).toBe(4.5455)
    expect(t.rotate).toBe(90)
  })

  const tank = rectOutline({ ratio: 0.82, radius: 30 })
  const box = { boxW: 220, boxH: 263.9024 }
  const plain = (10 / 220) * 100

  it("is the plain inset difference at a flank angle", () => {
    // Straight up the top flank: the ray is perpendicular to the edge, so the
    // two inset points are exactly (i1 - i0) apart.
    const t = spanTransform(tank, 0, 6, 16, { width: 2, ...box })
    expect(t.heightCqw).toBe(quantize(plain))
    expect(t.rotate).toBe(0)
  })

  it("is strictly longer at an oblique angle, by exactly 1/cos(theta)", () => {
    // 20deg on the Tank still lands on the top flank at both insets, so the
    // obliquity is exact: the span is the inset difference over cos(20).
    const expected = 10 / Math.cos(20 * RAD)
    const p0 = tank.pointAt(20, 6)
    const p1 = tank.pointAt(20, 16)
    // The identity itself, checked at full precision on the engine — the
    // transform below rounds to the library's 4dp before anyone can see it.
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeCloseTo(expected, 6)

    const t = spanTransform(tank, 20, 6, 16, { width: 2, ...box })
    expect(t.heightCqw).toBeGreaterThan(quantize(plain))
    expect(t.heightCqw).toBe(quantize((expected / 220) * 100))
    expect(t.rotate).toBe(20)
  })

  it("puts the span on the midpoint of the two inset points", () => {
    const p0 = tank.pointAt(20, 6)
    const p1 = tank.pointAt(20, 16)
    const t = spanTransform(tank, 20, 6, 16, { width: 2, ...box })
    expect(t.left).toBe(`${quantize(50 + (100 * ((p0.x + p1.x) / 2)) / 220)}%`)
    expect(t.top).toBe(`${quantize(50 + (100 * ((p0.y + p1.y) / 2)) / 263.9024)}%`)
  })

  it("widens an oblique tick by 1/cos(theta) only when asked", () => {
    const straight = spanTransform(tank, 20, 6, 16, { width: 2, ...box })
    const widened = spanTransform(tank, 20, 6, 16, { width: 2, obliquityWidth: true, ...box })
    expect(straight.widthCqw).toBe(quantize((2 / 220) * 100))
    expect(widened.widthCqw).toBe(quantize((2 / Math.cos(20 * RAD) / 220) * 100))
    expect(widened.widthCqw).toBeGreaterThan(straight.widthCqw)
  })

  it("carries the width correction continuously across a flank/arc seam", () => {
    // The obliquity cosine is sampled from normalAt at i0, so the seam that
    // matters is the INSET outline's: insetting moves the flank in but leaves
    // the corner centre fixed, which pushes the flank->arc join from 29.86deg
    // at the edge to 31.12deg at inset 6. Straddling it is the one place the
    // sampling could jump, since the flank contributes a constant normal and
    // the arc a turning one.
    const seam = (Math.atan2(70, 100 / 0.82 - 6) * 180) / Math.PI
    expect(seam).toBeCloseTo(31.1194704, 6)
    const widthAt = (angle: number) =>
      spanTransform(tank, angle, 6, 16, { width: 2, obliquityWidth: true, ...box }).widthCqw

    // Measured, not asserted-and-hoped: the correction peaks AT the seam and
    // falls away on both sides, one quantisation step per thousandth of a
    // degree. Continuous in value; the slope kinks, which is what a tangent
    // join is — the normal's direction matches, its rate of change does not.
    const onFlank = widthAt(seam - 0.001)
    const atSeam = widthAt(seam)
    const onArc = widthAt(seam + 0.001)
    expect(onFlank).toBe(1.0619)
    expect(atSeam).toBe(1.0619)
    expect(onArc).toBe(1.0618)
    expect(Math.abs(onArc - onFlank)).toBeLessThanOrEqual(0.0002)
    // Widening a hundredth of a degree either side moves it by half a
    // thousandth of a cqw — no cliff, on either side.
    expect(Math.abs(widthAt(seam + 0.01) - widthAt(seam - 0.01))).toBeLessThan(0.001)
    // And the correction is genuinely applied on both sides, not skipped.
    for (const w of [onFlank, atSeam, onArc]) {
      expect(w).toBeGreaterThan(quantize((2 / 220) * 100))
    }
  })

  it("leaves the width alone where the ray meets the edge square on", () => {
    const straight = spanTransform(tank, 0, 6, 16, { width: 2, ...box })
    const widened = spanTransform(tank, 0, 6, 16, { width: 2, obliquityWidth: true, ...box })
    expect(widened).toEqual(straight)
  })

  it("leaves the width alone at every angle on a circle, where ray IS normal", () => {
    for (const angle of [0, 37, 90, 173, 271]) {
      const straight = spanTransform(circleOutline(), angle, 6, 16, { width: 2, ...CIRCLE_BOX })
      const widened = spanTransform(circleOutline(), angle, 6, 16, {
        width: 2,
        obliquityWidth: true,
        ...CIRCLE_BOX,
      })
      expect(widened).toEqual(straight)
    }
  })

  it("emits nothing longer than four decimals, in any field", () => {
    const t = spanTransform(tank, 53, 6.5, 17.25, { width: 2.3, obliquityWidth: true, ...box })
    for (const value of forms(t)) {
      expect(value).toMatch(/^-?\d+(\.\d{1,4})?%?$/)
    }
  })
})

describe("degenerate inputs produce numbers, not NaN", () => {
  it("puts a mark in the middle of a collapsed box instead of nowhere", () => {
    // Only reachable through a custom Outline whose bbox collapses; the same
    // answer layer.ts gives, for the same reason — NaN makes an element vanish
    // with nothing in the console.
    const t = markTransform(
      circleOutline(),
      { angle: 90, inset: 0 },
      { width: 2, length: 8, boxW: 0, boxH: 0 },
    )
    expect(t.left).toBe("50%")
    expect(t.top).toBe("50%")
    expect(t.widthCqw).toBe(0)
    expect(t.heightCqw).toBe(0)
  })

  it("survives an outline collapsed to a point", () => {
    const o = rectOutline({ ratio: 0.82, radius: 30 })
    const t = spanTransform(o, 20, 300, 320, { width: 2, obliquityWidth: true, ...CIRCLE_BOX })
    for (const value of [t.widthCqw, t.heightCqw, t.rotate]) {
      expect(Number.isFinite(value)).toBe(true)
    }
    expect(t.left).toBe("50%")
    expect(t.top).toBe("50%")
  })
})
