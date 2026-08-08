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

    // The unformatted geometry is exactly even: pin it at high precision at
    // the outline itself, where the raw math lives. The anchors `renderItem`
    // receives are deliberately 4dp-quantized — that is the hydration
    // contract — so through the component they can only be even to the same
    // precision the DOM check above already covers.
    const o = circleOutline()
    const raw = Array.from({ length: 60 }, (_, k) => o.pointAt(k * 6, 9))
    expect(gapAt(raw, 5)).toBeCloseTo(gapAt(raw, 0), 9)

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
    expect(gapAt(anchors, 5)).toBeCloseTo(gapAt(anchors, 0), 3)
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

describe("perimeter placement: what a real Tank's railway does", () => {
  // The demo geometry: rect 0.78 with radius 12, track inset 9 — corner
  // radius 3 at the track. Small corners are exactly where radial placement
  // tears: the ray spacing stretches to twice its minimum there.
  const demo = () => rectOutline({ ratio: 0.78, radius: 12 })

  const anchorsOf = (placement: "radial" | "perimeter", outline = demo()) => {
    const pts: { x: number; y: number }[] = []
    render(
      <Mainplate size={260} max={60} outline={outline} padding={14}>
        <Ticks
          count={60}
          inset={9}
          placement={placement}
          renderItem={({ point, index }) => {
            pts.push(point)
            return <circle key={index} r={1} />
          }}
        />
      </Mainplate>,
    )
    return pts
  }

  const gaps = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => {
      const next = pts[(i + 1) % pts.length] ?? p
      return Math.hypot(next.x - p.x, next.y - p.y)
    })

  it("divides the perimeter evenly: straight-run gaps are the arc step", () => {
    const pts = anchorsOf("perimeter")
    const step = demo().length(9) / 60
    // Marks 0–6 sit on the top run, 7–22 on the right run: consecutive marks
    // on a straight are collinear, so their chord IS the arc step. Precision 3
    // is the most the 4dp-quantized anchors can guarantee.
    expect(gapAt(pts, 0)).toBeCloseTo(step, 3)
    expect(gapAt(pts, 10)).toBeCloseTo(step, 3)
  })

  it("closes the corner holes radial placement leaves", () => {
    // Radial: the widest gap straddles each corner at twice the narrowest —
    // the visible hole in the railway. Perimeter: every arc gap is the same
    // step; the corner-straddling chord comes out slightly *shorter* than the
    // straights (the path bends inside it), never longer. The hole is gone.
    const radial = gaps(anchorsOf("radial"))
    const perimeter = gaps(anchorsOf("perimeter"))
    const ratio = (g: number[]) => Math.max(...g) / Math.min(...g)
    expect(ratio(radial)).toBeGreaterThan(1.9)
    expect(ratio(perimeter)).toBeLessThan(1.35)
    expect(Math.max(...perimeter)).toBeLessThanOrEqual(demo().length(9) / 60 + 1e-3)
  })

  it("keeps the cardinal anchors: 15 of 60 still sits at the right-centre", () => {
    // A quarter of the distance around an axis-symmetric outline is exactly
    // the right-centre, so the marks a hand must agree with — 12, 3, 6, 9 —
    // survive the reparameterization. Only the in-between marks drift.
    const pts = anchorsOf("perimeter")
    expect(pts[15]?.x).toBeCloseTo(91, 9)
    expect(pts[15]?.y).toBeCloseTo(0, 9)
  })

  it("trades intermediate angular correspondence away — the documented cost", () => {
    // Value 7 (angle 42): the radial ray lands high on the right edge; the
    // arc walk puts the mark further down. A hand at 42 degrees no longer
    // points at it, which is precisely how a real Tank behaves.
    const radial = anchorsOf("radial")
    const perimeter = anchorsOf("perimeter")
    const r = radial[7] ?? { x: 0, y: 0 }
    const p = perimeter[7] ?? { x: 0, y: 0 }
    expect(p.x).toBeCloseTo(91, 4) // still on the right edge…
    expect(Math.hypot(p.x - r.x, p.y - r.y)).toBeGreaterThan(5) // …but off the ray
  })

  it("orients marks from where they stand, not where their value points", () => {
    // The perimeter mark for value 7 sits on the flat of the right edge, so
    // `edge` must resolve to exactly 90 — the radial-placement mark for the
    // same value would agree here, but a mark carried into a corner would
    // not, and `radial` orientation must follow the ray through the mark's
    // actual position, not the value's 42-degree ray.
    const rotations: Record<string, number | undefined> = {}
    for (const orient of ["edge", "radial"] as const) {
      render(
        <Mainplate size={260} max={60} outline={demo()} padding={14}>
          <Ticks
            ticks={[{ value: 7 }]}
            inset={9}
            placement="perimeter"
            orient={orient}
            renderItem={({ rotation, index }) => {
              rotations[orient] = rotation
              return <circle key={index} r={1} />
            }}
          />
        </Mainplate>,
      )
    }
    expect(rotations.edge).toBe(90)
    expect(rotations.radial).toBeGreaterThan(35)
    expect(rotations.radial).toBeLessThan(41) // the value's own ray is 42
  })

  it("walks marks into the corner arcs by distance, not by ray", () => {
    // A 31-unit corner radius at the track: the top-right arc spans s in
    // [60, 108.7] of a 13.13 step, so the walk must seat exactly four marks
    // on it. The centre-cast ray crosses the same arc for angles 26.7 to
    // 45.9 degrees and seats only three — one more way the two placements
    // are different geometry, pinned where the difference is countable.
    const wide = () => rectOutline({ ratio: 0.78, radius: 40 })
    const corner = (p: { x: number; y: number }) => p.x > 91 - 31 && p.y < -(100 / 0.78 - 9 - 31)
    expect(anchorsOf("perimeter", wide()).filter(corner)).toHaveLength(4)
    expect(anchorsOf("radial", wide()).filter(corner)).toHaveLength(3)
  })

  it("collapses to radial placement on a circle, where distance is angle", () => {
    const face = (placement: "radial" | "perimeter") =>
      render(
        <Mainplate size={260} max={60} outline={circleOutline()}>
          <Ticks count={60} inset={9} placement={placement} length={6} width={0.6} fill="#000" />
        </Mainplate>,
      )
    expect(trackPath(face("perimeter").container)).toBe(trackPath(face("radial").container))
  })
})
