import { describe, expect, it } from "vitest"
import { circleOutline } from "./outline"

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
