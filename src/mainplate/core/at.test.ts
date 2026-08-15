import { describe, expect, it, vi } from "vitest"
import { resolveAt } from "./at"
import type { Frame } from "./frame"
import { DIAL_RADIUS } from "./geometry"
import { circleOutline, type Outline, rectOutline } from "./outline"

const frameWith = (outline: Outline = circleOutline()): Frame => ({
  cx: 0,
  cy: 0,
  r: DIAL_RADIUS,
  min: 0,
  max: 1,
  startAngle: 0,
  sweepAngle: 360,
  outline,
})

const circle = frameWith()
const square = frameWith(rectOutline({ ratio: 1 }))

const closeTo = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

describe("resolveAt — the `at` forms", () => {
  it("reads a bare number as degrees", () => {
    const { angle, point } = resolveAt(90, circle)
    expect(angle).toBe(90)
    closeTo(point.x, 100)
    closeTo(point.y, 0)
  })

  it("passes a bare number through untouched, negatives included", () => {
    // `at` is an angular position, not a normalised one: a caller animating
    // through 0 must get back the number they wrote, not its wrapped twin.
    expect(resolveAt(-45, circle).angle).toBe(-45)
    expect(resolveAt(720, circle).angle).toBe(720)
  })

  it("converts every clock position as (n % 12) * 30", () => {
    const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
    const angles = hours.map((h) => resolveAt(`${h}h`, circle).angle)
    expect(angles).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 0])
  })

  it("puts 12h at 0 and 9h at 270", () => {
    expect(resolveAt("12h", circle).angle).toBe(0)
    expect(resolveAt("9h", circle).angle).toBe(270)
  })

  it('resolves at={270} and at="9h" to the same point', () => {
    expect(resolveAt("9h", circle)).toEqual(resolveAt(270, circle))
  })

  it("rejects a clock position outside the twelve at compile time", () => {
    // @ts-expect-error — "13h" is not a ClockPosition
    expect(() => resolveAt("13h", circle)).not.toThrow()
  })
})

describe("resolveAt — the tuple form", () => {
  it("takes a tuple as a literal point in dial units", () => {
    expect(resolveAt([30, -40], circle).point).toEqual({ x: 30, y: -40 })
  })

  it("ignores the anchor entirely", () => {
    const bare = resolveAt([30, -40], square)
    expect(resolveAt([30, -40], square, { r: 5 })).toEqual(bare)
    expect(resolveAt([30, -40], square, { inset: 90 })).toEqual(bare)
  })

  it("still gives a tuple an angle, in the library's convention", () => {
    // Callers need it to orient artwork dropped at a literal point: atan2(x, -y),
    // so 0 is twelve o'clock and clockwise is positive.
    expect(resolveAt([0, -100], circle).angle).toBe(0)
    expect(resolveAt([100, 0], circle).angle).toBe(90)
    expect(resolveAt([0, 100], circle).angle).toBe(180)
    expect(resolveAt([-100, 0], circle).angle).toBe(-90)
    expect(resolveAt([50, -50], circle).angle).toBe(45)
  })

  it("gives the centre an angle of 0 rather than a NaN", () => {
    expect(resolveAt([0, 0], circle)).toEqual({ angle: 0, point: { x: 0, y: 0 } })
  })
})

describe("resolveAt — the anchor", () => {
  it("defaults to the outline edge, not to the frame radius", () => {
    // On a square the two are as far apart as they get: the edge at 45 degrees
    // is the corner, while r = 100 would land well inside it.
    const { point } = resolveAt(45, square)
    closeTo(point.x, 100)
    closeTo(point.y, -100)
  })

  it("follows the outline shape at an inset", () => {
    // On an axis the inset is plain subtraction, and a shrunken circle would
    // agree; at 45 degrees it is the inset *corner*, which only the outline
    // knows about. Both, so the arithmetic and the shape are each pinned.
    const onAxis = resolveAt(90, square, { inset: 10 }).point
    closeTo(onAxis.x, 90)
    closeTo(onAxis.y, 0)

    const onCorner = resolveAt(45, square, { inset: 10 }).point
    closeTo(onCorner.x, 90)
    closeTo(onCorner.y, -90)
  })

  it("anchors r to the centre, ignoring the outline", () => {
    const { point } = resolveAt(45, square, { r: 100 })
    closeTo(point.x, 70.7107)
    closeTo(point.y, -70.7107)
  })

  it("quantises the point it hands back", () => {
    // Angle 37 on a circle is irrational in both coordinates. These numbers
    // reach consumer JSX, and raw trig differs in the last ULP between the
    // server's engine and the browser's — a hydration mismatch either way.
    const { point } = resolveAt(37, circle, { r: 91 })
    expect(point.x).toBe(Number(point.x.toFixed(4)))
    expect(point.y).toBe(Number(point.y.toFixed(4)))
    expect(point.x).not.toBe(Math.round(point.x))
  })

  it("throws when given both r and inset", () => {
    expect(() =>
      // @ts-expect-error — r and inset are exactly-one-of
      resolveAt(0, circle, { r: 90, inset: 6 }),
    ).toThrow(/only one of/i)
  })

  it("keeps r, logs once and does not throw in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      // @ts-expect-error — r and inset are exactly-one-of
      const first = resolveAt(90, square, { r: 40, inset: 10 })
      closeTo(first.point.x, 40)
      closeTo(first.point.y, 0)

      // @ts-expect-error — r and inset are exactly-one-of
      resolveAt(90, square, { r: 40, inset: 10 })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/mainplate: /)
      expect(spy.mock.calls[0]?.[0]).toMatch(/only one of/i)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Ignoring `inset`/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it("logs again for a different misuse — the offending values are in the dedup key", () => {
    // A static key would silence the whole *class* after the first offence,
    // for the life of the page — a second, different mistake deserves its own
    // line, which is why the message interpolates the values it received.
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      // @ts-expect-error — r and inset are exactly-one-of
      resolveAt(0, circle, { r: 50, inset: 5 })
      // @ts-expect-error — r and inset are exactly-one-of
      resolveAt(0, circle, { r: 60, inset: 5 })
      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy.mock.calls[0]?.[0]).not.toBe(spy.mock.calls[1]?.[0])
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
