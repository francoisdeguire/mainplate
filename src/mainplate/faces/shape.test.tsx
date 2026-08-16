// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { circleOutline, frameBox, polar, quantize, rectOutline } from "../core"
import { Complication } from "./complication"
import { anchorPercent, markTransform } from "./geometry"
import { Mainplate } from "./mainplate"
import { Dial, Numerals, Ticks } from "./parts"

/**
 * The shape task's contract: rect faces render with the owner's corrected
 * tick math (spec §3).
 *
 * - Angular ticks are RADIAL SPANS between two parallel insets — each mark
 *   runs along its frame ray from `pointAt(a, i0)` to `pointAt(a, i1)`,
 *   rotation = the angle itself. The uniform ring is not an aesthetic to
 *   eyeball: it is the assertion that every inner endpoint lies ON the
 *   inset-`i1` outline. Deriving the same mark from the edge normal instead
 *   keeps every tick the same length and pulls the oblique endpoints OFF that
 *   outline — the named mutation this file exists to catch — and is invisible
 *   on a circle, where the ray *is* the normal (the negative controls).
 * - Perimeter placement is the chemin-de-fer rhythm: minors divide the
 *   outline's LENGTH evenly, which no angular walk does on a rect.
 *
 * Geometry is asserted through the RENDERED styles, not the geometry module:
 * the contract is about what `<Ticks>` puts on screen. Styles are quantised
 * to 4dp, so reconstructing a point from them carries ≲5e-4 dial units of
 * noise — the 1e-3 tolerances below are that budget, not slack in the math.
 */

const RECT = { ratio: 0.82, radius: 30 }

/** The private track geometry restated (parts.tsx): outer inset 4, minor 5×1.4, major 9×2.4. */
const TICK_INSET = 4
const MINOR_LENGTH = 5
const MINOR_WIDTH = 1.4
const MAJOR_LENGTH = 9
/** Where the rect default pair stands its hour bars (parts.tsx). */
const RECT_MAJOR_INSET = 13

const RAD = 180 / Math.PI

type Mark = {
  centre: { x: number; y: number }
  width: number
  length: number
  rotate: number
}

/** One style-attribute number, by property. Throws so a miss names itself. */
function styleNumber(el: Element, pattern: RegExp): number {
  const style = el.getAttribute("style") ?? ""
  const match = style.match(pattern)
  if (match?.[1] === undefined) throw new Error(`no ${pattern} in ${JSON.stringify(style)}`)
  return Number(match[1])
}

/** A rendered mark, decoded back into dial units against the face box. */
function markOf(el: Element, boxW: number, boxH: number): Mark {
  const left = styleNumber(el, /left:\s*(-?[\d.]+)%/)
  const top = styleNumber(el, /top:\s*(-?[\d.]+)%/)
  // Widths wear the 1px floor as `max(Ncqw, 1px)`; heights are bare cqw.
  const width = styleNumber(el, /width:\s*max\((-?[\d.]+)cqw/)
  const height = styleNumber(el, /height:\s*(-?[\d.]+)cqw/)
  const rotate = styleNumber(el, /rotate\((-?[\d.]+)deg\)/)
  return {
    centre: { x: ((left - 50) / 100) * boxW, y: ((top - 50) / 100) * boxH },
    width: (width / 100) * boxW,
    length: (height / 100) * boxW,
    rotate,
  }
}

/** A mark's endpoint toward the dial centre: its own axis points outward at `rotate`. */
function innerEndpoint(mark: Mark): { x: number; y: number } {
  const dir = polar(mark.rotate, mark.length / 2)
  return { x: mark.centre.x - dir.x, y: mark.centre.y - dir.y }
}

/** How far a point sits from the inset outline, measured along its own ray. */
function offOutline(
  outline: ReturnType<typeof rectOutline>,
  point: { x: number; y: number },
  inset: number,
): number {
  const rayAngle = Math.atan2(point.x, -point.y) * RAD
  const on = outline.pointAt(rayAngle, inset)
  return Math.hypot(point.x - on.x, point.y - on.y)
}

function ticksOf(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

const outline = rectOutline(RECT)
const box = frameBox({ outline, clip: false })
const BOX = { boxW: box.width, boxH: box.height }

const CIRCLE = circleOutline()
const circleBox = frameBox({ clip: false })

/** Flank angles: the four rays that meet the rect's edges square on. */
const isFlank = (angle: number) => angle % 90 === 0

describe("the ring — angular ticks on a rect face are radial spans", () => {
  function renderRing() {
    const { container } = render(
      <Mainplate label="x" shape={RECT}>
        <Ticks count={12} />
      </Mainplate>,
    )
    return ticksOf(container).map((el) => markOf(el, box.width, box.height))
  }

  it("puts every tick's inner endpoint on the inset-i1 outline, on its own ray — the uniform ring", () => {
    // The full radial-span property, not just "somewhere on the ring":
    // mark k's inner endpoint is `pointAt(k·30°, i1)` — on the inset-i1
    // outline AND on the mark's own frame ray. Edge-normal placement also
    // lands endpoints on the inset outline (parallel insets keep their
    // corners), but it slides them OFF the ray at every oblique angle —
    // which is exactly what this assertion turns red on.
    const i1 = TICK_INSET + MINOR_LENGTH
    renderRing().forEach((mark, k) => {
      const onRay = outline.pointAt(k * 30, i1)
      expect(distance(innerEndpoint(mark), onRay)).toBeLessThan(1e-3)
      // And the endpoint sits on the inset outline itself, the ring the eye reads.
      expect(offOutline(outline, innerEndpoint(mark), i1)).toBeLessThan(1e-3)
    })
  })

  it("rotates each span to its own angle — the hands point at the marks", () => {
    const angles = renderRing().map((m) => ((m.rotate % 360) + 360) % 360)
    expect([...angles].sort((a, b) => a - b)).toEqual([...Array(12).keys()].map((i) => i * 30))
  })

  it("stretches oblique ticks strictly longer than flank ticks, by exactly 1/cosθ", () => {
    const marks = renderRing()
    const flanks = marks.filter((m) => isFlank(m.rotate))
    const obliques = marks.filter((m) => !isFlank(m.rotate))
    expect(flanks).toHaveLength(4)
    expect(obliques).toHaveLength(8)
    for (const flank of flanks) expect(flank.length).toBeCloseTo(MINOR_LENGTH, 3)
    for (const oblique of obliques) {
      const ray = polar(oblique.rotate, 1)
      const normal = outline.normalAt(oblique.rotate, TICK_INSET)
      const cos = Math.abs(ray.x * normal.x + ray.y * normal.y)
      expect(oblique.length).toBeGreaterThan(MINOR_LENGTH)
      expect(oblique.length).toBeCloseTo(MINOR_LENGTH / cos, 3)
    }
  })

  it("widens oblique ticks by w/cosθ — the width correction is on for the ring", () => {
    const marks = renderRing()
    for (const mark of marks) {
      const ray = polar(mark.rotate, 1)
      const normal = outline.normalAt(mark.rotate, TICK_INSET)
      const cos = Math.abs(ray.x * normal.x + ray.y * normal.y)
      expect(mark.width).toBeCloseTo(MINOR_WIDTH / cos, 3)
      if (!isFlank(mark.rotate)) expect(mark.width).toBeGreaterThan(MINOR_WIDTH)
    }
  })

  it("coincides with the previous fixed-length ticks on a circle (negative control)", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks count={12} />
      </Mainplate>,
    )
    const els = ticksOf(container)
    expect(els).toHaveLength(12)
    els.forEach((el, i) => {
      // What the pre-span implementation rendered: a fixed-length mark whose
      // CENTRE sits half a length inside the outer inset, facing the edge.
      const fixed = markTransform(
        CIRCLE,
        { angle: i * 30, inset: TICK_INSET + MINOR_LENGTH / 2 },
        {
          orient: "edge",
          width: MINOR_WIDTH,
          length: MINOR_LENGTH,
          boxW: circleBox.width,
          boxH: circleBox.height,
        },
      )
      const mark = markOf(el, circleBox.width, circleBox.height)
      expect(mark.centre.x).toBeCloseTo(
        ((Number.parseFloat(fixed.left) - 50) / 100) * circleBox.width,
        3,
      )
      expect(mark.centre.y).toBeCloseTo(
        ((Number.parseFloat(fixed.top) - 50) / 100) * circleBox.height,
        3,
      )
      expect(mark.length).toBeCloseTo((fixed.heightCqw / 100) * circleBox.width, 3)
      expect(mark.width).toBeCloseTo((fixed.widthCqw / 100) * circleBox.width, 3)
      const wrapped = (((mark.rotate - fixed.rotate) % 360) + 360) % 360
      expect(Math.min(wrapped, 360 - wrapped)).toBeLessThan(1e-3)
    })
  })
})

describe("perimeter placement — the chemin-de-fer rhythm, restored", () => {
  const centreInset = TICK_INSET + MINOR_LENGTH / 2

  function renderPerimeter() {
    const { container } = render(
      <Mainplate label="x" shape={RECT}>
        <Ticks count={60} placement="perimeter" />
      </Mainplate>,
    )
    return ticksOf(container).map((el) => markOf(el, box.width, box.height))
  }

  it("spaces sixty marks with uniform arc-length gaps: max/min gap ratio ≈ 1", () => {
    const centres = renderPerimeter().map((m) => m.centre)
    expect(centres).toHaveLength(60)
    const gaps = centres.map((c, i) => {
      const next = centres[(i + 1) % centres.length]
      if (next === undefined) throw new Error("unreachable")
      return distance(c, next)
    })
    // Chords, not arcs: a gap crossing a corner reads slightly shorter than
    // its arc, which bounds the honest ratio at ~1.014 here. Angular placement
    // on this rect spreads to ~1.66 — the mutation this threshold catches.
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.02)
  })

  it("puts mark k exactly k/60ths of the perimeter along the outline", () => {
    const total = outline.length(centreInset)
    renderPerimeter().forEach((mark, k) => {
      const expected = outline.pointAtLength((k / 60) * total, centreInset)
      expect(distance(mark.centre, expected)).toBeLessThan(1e-3)
    })
  })

  it("keeps every inner endpoint on the deeper inset outline — the ring holds off-angle too", () => {
    const i1 = TICK_INSET + MINOR_LENGTH
    for (const mark of renderPerimeter()) {
      expect(offOutline(outline, innerEndpoint(mark), i1)).toBeLessThan(1e-3)
    }
  })

  it("differs from angular placement on a rect", () => {
    const marks = renderPerimeter()
    // Minute 7: on the rect its angular ray and its perimeter fraction land
    // visibly apart. If these coincide, placement quietly fell back to angular.
    const seventh = marks[7]
    if (seventh === undefined) throw new Error("no seventh mark")
    const angular = outline.pointAt(7 * 6, centreInset)
    expect(distance(seventh.centre, angular)).toBeGreaterThan(1)
  })

  it("coincides with angular placement on a circle (negative control)", () => {
    const render12 = (placement: "angular" | "perimeter") => {
      const { container } = render(
        <Mainplate label="x">
          <Ticks count={12} placement={placement} />
        </Mainplate>,
      )
      return ticksOf(container).map((el) => markOf(el, circleBox.width, circleBox.height))
    }
    const angular = render12("angular")
    const perimeter = render12("perimeter")
    angular.forEach((a, i) => {
      const p = perimeter[i]
      if (p === undefined) throw new Error("missing perimeter mark")
      expect(distance(a.centre, p.centre)).toBeLessThan(1e-3)
      const wrapped = (((a.rotate - p.rotate) % 360) + 360) % 360
      expect(Math.min(wrapped, 360 - wrapped)).toBeLessThan(1e-3)
    })
  })
})

describe("the rect default pair — angular span majors inside a continuous perimeter ring", () => {
  function renderDefault() {
    const { container } = render(
      <Mainplate label="x" shape={RECT}>
        <Ticks />
      </Mainplate>,
    )
    const els = ticksOf(container)
    const majors = els.filter((el) => (el.getAttribute("style") ?? "").includes("--mp-tick-major"))
    const minors = els.filter((el) => !(el.getAttribute("style") ?? "").includes("--mp-tick-major"))
    return {
      majors: majors.map((el) => markOf(el, box.width, box.height)),
      minors: minors.map((el) => markOf(el, box.width, box.height)),
    }
  }

  it("renders 12 angular majors and 60 perimeter minors — the minute ring is unskipped", () => {
    const { majors, minors } = renderDefault()
    expect(majors).toHaveLength(12)
    expect(minors).toHaveLength(60)
  })

  it("stands the majors on the hour rays, spanning inward from their own inset", () => {
    const { majors } = renderDefault()
    const angles = majors.map((m) => ((m.rotate % 360) + 360) % 360)
    expect([...angles].sort((a, b) => a - b)).toEqual([...Array(12).keys()].map((i) => i * 30))
    const i1 = RECT_MAJOR_INSET + MAJOR_LENGTH
    for (const major of majors) {
      expect(offOutline(outline, innerEndpoint(major), i1)).toBeLessThan(1e-3)
    }
  })

  it("distributes the minors by perimeter, so the minute ring is uniform", () => {
    const { minors } = renderDefault()
    const centreInset = TICK_INSET + MINOR_LENGTH / 2
    const total = outline.length(centreInset)
    minors.forEach((mark, k) => {
      const expected = outline.pointAtLength((k / 60) * total, centreInset)
      expect(distance(mark.centre, expected)).toBeLessThan(1e-3)
    })
  })

  it("leaves the circle default pair exactly as it was: 12 majors, 48 skipped minors", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks />
      </Mainplate>,
    )
    const els = ticksOf(container)
    expect(els).toHaveLength(60)
    const majors = els.filter((el) => (el.getAttribute("style") ?? "").includes("--mp-tick-major"))
    expect(majors).toHaveLength(12)
  })
})

describe("the dial — border-radius derives from the shape's corner radius", () => {
  function dialRadius(shape?: "rect" | { ratio?: number; radius?: number }) {
    const { container } = render(
      <Mainplate label="x" shape={shape}>
        <Dial />
      </Mainplate>,
    )
    const dial = container.querySelector('[data-mp="dial"]')
    if (dial === null) throw new Error("no dial")
    const match = (dial.getAttribute("style") ?? "").match(/border-radius:\s*([^;]+);/)
    return match?.[1] ?? ""
  }

  it("converts the rect's corner radius to cqw — no hardcoded constant", () => {
    // 30 dial units of a 220-unit box: 13.6364cqw, quantised like everything else.
    expect(dialRadius(RECT)).toBe(`${quantize((30 / box.width) * 100)}cqw`)
  })

  it("keeps the circle at 50%", () => {
    expect(dialRadius(undefined)).toBe("50%")
  })

  it("gives the square-cornered rect square corners — a 1:1 rect is not a circle", () => {
    expect(dialRadius("rect")).toBe("0cqw")
    expect(dialRadius({ ratio: 1, radius: 12 })).toBe(`${quantize((12 / 220) * 100)}cqw`)
  })
})

describe("numerals on a rect face — the re-judged clearance", () => {
  /** The rect numeral ring (parts.tsx): pushed inward past the hour bars. */
  const RECT_NUMERAL_INSET = 31
  const HOUR_ANGLES = [...Array(12).keys()].map((i) => (i + 1) * 30)

  function numeralCentres(shape?: { ratio?: number; radius?: number }) {
    const { container } = render(
      <Mainplate label="x" shape={shape}>
        <Numerals />
      </Mainplate>,
    )
    const b = shape === undefined ? circleBox : box
    return [...container.querySelectorAll<HTMLElement>('[data-mp="numeral"]')].map((el) => ({
      x: ((styleNumber(el, /left:\s*(-?[\d.]+)%/) - 50) / 100) * b.width,
      y: ((styleNumber(el, /top:\s*(-?[\d.]+)%/) - 50) / 100) * b.height,
    }))
  }

  it("moves the default ring inward to clear the hour bars", () => {
    const centres = numeralCentres(RECT)
    centres.forEach((centre, i) => {
      const angle = HOUR_ANGLES[i]
      if (angle === undefined) throw new Error("missing angle")
      const expected = outline.pointAt(angle, RECT_NUMERAL_INSET)
      expect(distance(centre, expected)).toBeLessThan(1e-3)
    })
  })

  it("keeps every glyph clear of the default majors' inner endpoints", () => {
    // The default pair's bars end on the inset-22 outline. The glyph itself is
    // at most ~16×12 dial units (fontSize 12 in a 26×16 box); no bar endpoint
    // may fall inside that extent at any hour.
    const centres = numeralCentres(RECT)
    centres.forEach((centre, i) => {
      const angle = HOUR_ANGLES[i]
      if (angle === undefined) throw new Error("missing angle")
      const barEnd = outline.pointAt(angle, RECT_MAJOR_INSET + MAJOR_LENGTH)
      const inside = Math.abs(barEnd.x - centre.x) <= 8 && Math.abs(barEnd.y - centre.y) <= 6
      expect(inside, `hour ${i + 1}: bar end inside the glyph box`).toBe(false)
    })
  })

  it("leaves the circle ring where it was (inset 22)", () => {
    const centres = numeralCentres(undefined)
    centres.forEach((centre, i) => {
      const angle = HOUR_ANGLES[i]
      if (angle === undefined) throw new Error("missing angle")
      const expected = CIRCLE.pointAt(angle, 22)
      expect(distance(centre, expected)).toBeLessThan(1e-3)
    })
  })
})

describe("complications position through the outline on a rect face", () => {
  it("anchors at='12h' on the rect's own inset point, not a circle's", () => {
    const { container } = render(
      <Mainplate label="x" shape={RECT}>
        <Complication at="12h" inset={36}>
          <span>c</span>
        </Complication>
      </Mainplate>,
    )
    const el = container.querySelector('[data-mp="complication"]')
    if (el === null) throw new Error("no complication")
    // The rect's 12 o'clock sits ~86 units up (its half-height is ~122); a
    // circle's would sit 64 up — the anchor discriminates the outlines.
    const point = outline.pointAt(0, 36)
    expect(point.y).toBeLessThan(-80)
    const expected = anchorPercent(point, BOX)
    const style = el.getAttribute("style") ?? ""
    expect(style).toContain(`left: ${expected.left}`)
    expect(style).toContain(`top: ${expected.top}`)
  })
})
