// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Mainplate } from "./frame"
import { circleOutline, rectOutline } from "./outline"
import { Ticks } from "./ticks"

const tank = () => rectOutline({ ratio: 0.78, radius: 10 })

const trackPath = (container: HTMLElement) =>
  container.querySelector('[data-mp="ticks"] path')?.getAttribute("d") ?? ""

const markStarts = (container: HTMLElement) =>
  [...trackPath(container).matchAll(/M (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }))

const gapAt = (pts: { x: number; y: number }[], i: number) =>
  Math.hypot((pts[i + 1]?.x ?? 0) - (pts[i]?.x ?? 0), (pts[i + 1]?.y ?? 0) - (pts[i]?.y ?? 0))

describe("the thesis: a chemin de fer on a rounded rectangle", () => {
  it("renders sixty marks as one merged path", () => {
    const { container } = render(
      <Mainplate size={260} max={60} outline={tank()} padding={14}>
        <Ticks count={60} inset={9} length={6} width={0.6} orient="edge" fill="#1b1b1b" />
      </Mainplate>,
    )
    const d = trackPath(container)
    expect(d.match(/M /g)).toHaveLength(60)
  })

  it("spaces marks unevenly along the perimeter — by design, not by accident", () => {
    const { container } = render(
      <Mainplate size={260} max={60} outline={tank()} padding={14}>
        <Ticks count={60} inset={9} length={6} width={0.6} orient="edge" fill="#1b1b1b" />
      </Mainplate>,
    )
    const pts = markStarts(container)
    // Equal angular steps projected onto a flat edge produce arc lengths that
    // GROW as the ray swings away from the perpendicular foot. Marks 0-1 sit at
    // the top centre; marks 5-6 are further along the same flat edge.
    expect(gapAt(pts, 5)).toBeGreaterThan(gapAt(pts, 0) * 1.2)
  })

  it("spaces marks evenly on a circle, where the two anchors agree", () => {
    const { container } = render(
      <Mainplate size={260} max={60} outline={circleOutline()}>
        <Ticks count={60} inset={9} length={6} width={0.6} orient="edge" fill="#1b1b1b" />
      </Mainplate>,
    )
    // Path coordinates are formatted at 4 decimal places, so gaps read back
    // from the DOM carry up to ~2e-4 of quantization noise. Precision 3 is the
    // most the rendered string can guarantee — still five orders of magnitude
    // tighter than the rect's deliberate unevenness.
    const pts = markStarts(container)
    expect(gapAt(pts, 5)).toBeCloseTo(gapAt(pts, 0), 3)

    // The unformatted geometry is exactly even: pin it at high precision via
    // the raw anchor points, before any formatting.
    const anchors: { x: number; y: number }[] = []
    render(
      <Mainplate size={260} max={60} outline={circleOutline()}>
        <Ticks
          count={60}
          inset={9}
          renderItem={({ point, index }) => {
            anchors.push(point)
            return <circle key={index} r={1} />
          }}
        />
      </Mainplate>,
    )
    expect(gapAt(anchors, 5)).toBeCloseTo(gapAt(anchors, 0), 9)
  })

  it("keeps angular correspondence: the mark at 15 is straight right", () => {
    const seen: { x: number; y: number }[] = []
    render(
      <Mainplate size={260} max={60} outline={tank()} padding={14}>
        <Ticks
          ticks={[{ value: 15 }]}
          inset={9}
          renderItem={({ point, index }) => {
            seen.push(point)
            return <circle key={index} r={1} />
          }}
        />
      </Mainplate>,
    )
    // Value 15 of 60 is 90 degrees. On a Tank that lands on the vertical edge,
    // at the same height as the centre — exactly where a hand would point.
    expect(seen[0]?.y).toBeCloseTo(0, 9)
    expect(seen[0]?.x).toBeCloseTo(91, 9)
  })

  it("orients marks to the edge, not to the centre", () => {
    const rect = render(
      <Mainplate size={260} max={60} outline={tank()} padding={14}>
        <Ticks ticks={[{ value: 7 }]} inset={9} length={6} width={0.6} orient="edge" fill="#000" />
      </Mainplate>,
    )
    const radial = render(
      <Mainplate size={260} max={60} outline={tank()} padding={14}>
        <Ticks
          ticks={[{ value: 7 }]}
          inset={9}
          length={6}
          width={0.6}
          orient="radial"
          fill="#000"
        />
      </Mainplate>,
    )
    // Same position, different rotation: the two axes are independent.
    expect(trackPath(rect.container)).not.toBe(trackPath(radial.container))
  })

  it("collapses to the same result on a circle, where the two agree", () => {
    const edge = render(
      <Mainplate size={260} max={60} outline={circleOutline()}>
        <Ticks ticks={[{ value: 7 }]} inset={9} length={6} width={0.6} orient="edge" fill="#000" />
      </Mainplate>,
    )
    const radial = render(
      <Mainplate size={260} max={60} outline={circleOutline()}>
        <Ticks
          ticks={[{ value: 7 }]}
          inset={9}
          length={6}
          width={0.6}
          orient="radial"
          fill="#000"
        />
      </Mainplate>,
    )
    expect(trackPath(edge.container)).toBe(trackPath(radial.container))
  })

  it("pins the full track geometry", () => {
    const { container } = render(
      <Mainplate size={260} max={60} outline={tank()} padding={14}>
        <Ticks count={12} inset={9} length={6} width={0.6} orient="edge" fill="#1b1b1b" />
      </Mainplate>,
    )
    expect(trackPath(container)).toMatchSnapshot()
  })
})
