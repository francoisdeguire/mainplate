// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { Arc } from "./arc"
import { Mainplate } from "./frame"
import { type Point, polar, quantize } from "./geometry"
import { createSource, type Source, type WritableSource } from "./source"

const arc = (c: HTMLElement) => c.querySelector('[data-mp="arc"]')
const dOf = (c: HTMLElement) => arc(c)?.getAttribute("d")

/**
 * Parse a polyline path — `M x y L x y …` — into points. Asserts the shape as
 * it goes, so a path that silently switched to `A` commands fails loudly here
 * rather than yielding NaN coordinates that vacuously pass a tolerance check.
 */
function pointsOf(d: string | null | undefined): Point[] {
  expect(d).toBeTruthy()
  const tokens = (d ?? "").split(" ")
  const points: Point[] = []
  for (let i = 0; i < tokens.length; i += 3) {
    const command = tokens[i]
    expect(command === "M" || command === "L").toBe(true)
    points.push({ x: Number(tokens[i + 1]), y: Number(tokens[i + 2]) })
  }
  return points
}

describe("<Arc> — the frame-anchored circular form (r)", () => {
  it("spans the full sweep as a closed ring when no bounds are given", () => {
    const { container } = render(
      <Mainplate>
        <Arc r={80} />
      </Mainplate>,
    )
    // The two-half-arc form: SVG cannot express a full circle in one arc.
    expect(dOf(container)).toBe("M 0 -80 A 80 80 0 1 1 0 80 A 80 80 0 1 1 0 -80 Z")
  })

  it("draws a redline: an open arc between from and to", () => {
    const { container } = render(
      <Mainplate min={0} max={360}>
        <Arc from={90} to={180} r={50} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 50 0 A 50 50 0 0 1 0 50")
  })

  it("sets the large-arc flag past half a turn", () => {
    const { container } = render(
      <Mainplate min={0} max={360}>
        <Arc from={0} to={270} r={50} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 0 -50 A 50 50 0 1 1 -50 0")
  })

  it("sweeps counterclockwise when to precedes from", () => {
    const { container } = render(
      <Mainplate min={0} max={360}>
        <Arc from={180} to={90} r={50} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 0 50 A 50 50 0 0 0 50 0")
  })

  it("defaults from to the frame's min and to to its max", () => {
    const gauge = render(
      <Mainplate>
        <Arc to={0.25} r={50} />
      </Mainplate>,
    )
    expect(dOf(gauge.container)).toBe("M 0 -50 A 50 50 0 0 1 50 0")

    const tail = render(
      <Mainplate>
        <Arc from={0.5} r={50} />
      </Mainplate>,
    )
    expect(dOf(tail.container)).toBe("M 0 50 A 50 50 0 0 1 0 -50")
  })

  it("renders an empty d when from equals to", () => {
    const { container } = render(
      <Mainplate min={0} max={360}>
        <Arc from={90} to={90} r={50} />
      </Mainplate>,
    )
    // The node must still exist — a Source may drive it off zero later.
    expect(arc(container)).not.toBeNull()
    expect(dOf(container)).toBe("")
  })
})

describe("<Arc> — r is frame-anchored, inset is outline-anchored", () => {
  it("coincides on a circle: inset 9 and r 91 produce the same full ring", () => {
    const byInset = render(
      <Mainplate>
        <Arc inset={9} />
      </Mainplate>,
    )
    const byRadius = render(
      <Mainplate>
        <Arc r={91} />
      </Mainplate>,
    )
    expect(dOf(byInset.container)).toBe("M 0 -91 A 91 91 0 1 1 0 91 A 91 91 0 1 1 0 -91 Z")
    expect(dOf(byInset.container)).toBe(dOf(byRadius.container))
  })

  it("coincides on a circle for a partial sweep: every traced point sits at radius 91", () => {
    const { container } = render(
      <Mainplate min={0} max={360}>
        <Arc from={30} to={120} inset={9} />
      </Mainplate>,
    )
    const points = pointsOf(dOf(container))
    expect(points.length).toBeGreaterThan(8)
    for (const p of points) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 91)).toBeLessThan(1e-3)
    }
    // And it is anchored where the r-form's endpoints are, not merely round.
    const first = points[0]
    const last = points[points.length - 1]
    const p0 = polar(30, 91)
    const p1 = polar(120, 91)
    expect(Math.abs((first?.x ?? Number.NaN) - quantize(p0.x))).toBeLessThan(1e-3)
    expect(Math.abs((first?.y ?? Number.NaN) - quantize(p0.y))).toBeLessThan(1e-3)
    expect(Math.abs((last?.x ?? Number.NaN) - quantize(p1.x))).toBeLessThan(1e-3)
    expect(Math.abs((last?.y ?? Number.NaN) - quantize(p1.y))).toBeLessThan(1e-3)
  })

  it("diverges on a rect: inset 9 is the outline's rail, r 91 is a circle inside it", () => {
    const byInset = render(
      <Mainplate outline="rect">
        <Arc inset={9} />
      </Mainplate>,
    )
    const byRadius = render(
      <Mainplate outline="rect">
        <Arc r={91} />
      </Mainplate>,
    )
    // The rail is the square shrunk by 9 — the outline's own path, exactly.
    expect(dOf(byInset.container)).toBe("M -91 -91 H 91 V 91 H -91 Z")
    // The r-form ignores the outline entirely and stays circular.
    expect(dOf(byRadius.container)).toBe("M 0 -91 A 91 91 0 1 1 0 91 A 91 91 0 1 1 0 -91 Z")
    expect(dOf(byInset.container)).not.toBe(dOf(byRadius.container))
  })

  it("traces the rect through its corner on a partial sweep", () => {
    const { container } = render(
      <Mainplate min={0} max={360} outline="rect">
        <Arc from={0} to={90} inset={9} />
      </Mainplate>,
    )
    const points = pointsOf(dOf(container))
    const first = points[0]
    const last = points[points.length - 1]
    // Anchored by angle: 0 is top-centre, 90 is the right edge's midpoint.
    expect(first).toEqual({ x: 0, y: -91 })
    expect(last).toEqual({ x: 91, y: 0 })
    // Every point lies on the inset square — Chebyshev radius 91 — which no
    // circular arc satisfies: a circle of radius 91 is at Chebyshev 64.3 at 45°.
    for (const p of points) {
      expect(Math.abs(Math.max(Math.abs(p.x), Math.abs(p.y)) - 91)).toBeLessThan(1e-3)
    }
    // And it actually rounds the corner, where the path is far outside r=91.
    expect(points.some((p) => Math.hypot(p.x, p.y) > 100)).toBe(true)
  })
})

describe("<Arc> — align, the only control over stroke placement", () => {
  it("pulls the r-anchored path inward so an inside stroke's outer edge sits on the anchor", () => {
    const { container } = render(
      <Mainplate>
        <Arc r={80} align="inside" strokeWidth={6} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 0 -77 A 77 77 0 1 1 0 77 A 77 77 0 1 1 0 -77 Z")
  })

  it("pushes the r-anchored path outward so an outside stroke's inner edge sits on the anchor", () => {
    const { container } = render(
      <Mainplate>
        <Arc r={80} align="outside" strokeWidth={6} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 0 -83 A 83 83 0 1 1 0 83 A 83 83 0 1 1 0 -83 Z")
  })

  it("deepens an inset anchor for an inside stroke — the sign flips with the anchor", () => {
    // inset 20 on a circle is radius 80; inside means deeper, so radius 77:
    // byte-for-byte what r=80 align="inside" produced.
    const { container } = render(
      <Mainplate>
        <Arc inset={20} align="inside" strokeWidth={6} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 0 -77 A 77 77 0 1 1 0 77 A 77 77 0 1 1 0 -77 Z")
  })

  it("shallows an inset anchor for an outside stroke", () => {
    const { container } = render(
      <Mainplate>
        <Arc inset={20} align="outside" strokeWidth={6} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 0 -83 A 83 83 0 1 1 0 83 A 83 83 0 1 1 0 -83 Z")
  })

  it("defaults to center: the path sits on the anchor, as SVG strokes natively do", () => {
    const { container } = render(
      <Mainplate>
        <Arc r={80} strokeWidth={6} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 0 -80 A 80 80 0 1 1 0 80 A 80 80 0 1 1 0 -80 Z")
  })
})

describe("<Arc> — the anchors are exactly-one-of", () => {
  it("throws in development when both r and inset are given", () => {
    expect(() =>
      render(
        <Mainplate>
          {/* @ts-expect-error — r and inset are exactly-one-of */}
          <Arc r={80} inset={10} />
        </Mainplate>,
      ),
    ).toThrow(/only one of/i)
  })

  it("keeps r, logs once and renders in production when both are given", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const both = render(
        <Mainplate>
          {/* @ts-expect-error — r and inset are exactly-one-of */}
          <Arc r={80} inset={10} />
        </Mainplate>,
      )
      // The survivor is `r`: the full-sweep circular form at radius 80,
      // byte-identical to what `r` alone draws.
      expect(dOf(both.container)).toBe("M 0 -80 A 80 80 0 1 1 0 80 A 80 80 0 1 1 0 -80 Z")

      render(
        <Mainplate>
          {/* @ts-expect-error — r and inset are exactly-one-of */}
          <Arc r={80} inset={10} />
        </Mainplate>,
      )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0]?.[0]).toMatch(/mainplate: <Arc>/)
      expect(spy.mock.calls[0]?.[0]).toMatch(/Ignoring `inset`/)
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})

describe("<Arc> — the DOM contract", () => {
  it("emits a static data-mp and the stroked defaults: currentColor stroke, no fill", () => {
    const { container } = render(
      <Mainplate>
        <Arc r={80} />
      </Mainplate>,
    )
    const node = arc(container)
    expect(node?.getAttribute("data-mp")).toBe("arc")
    expect(node?.getAttribute("stroke")).toBe("currentColor")
    expect(node?.getAttribute("stroke-width")).toBe("1")
    expect(node?.getAttribute("fill")).toBe("none")
  })

  it("lets an explicit stroke replace the default, and spreads SVG props", () => {
    const { container } = render(
      <Mainplate>
        <Arc r={80} stroke="#f00" strokeLinecap="round" className="redline" />
      </Mainplate>,
    )
    const node = arc(container)
    expect(node?.getAttribute("stroke")).toBe("#f00")
    expect(node?.getAttribute("stroke-linecap")).toBe("round")
    expect(node?.getAttribute("class")).toBe("redline")
  })

  it("is hidden from the accessibility tree, and a caller can expose it (§14.1)", () => {
    // The face is one image: a redline or gauge fill is decoration to a
    // screen reader — the value it traces is reported by the root's meter.
    const { container: hidden } = render(
      <Mainplate>
        <Arc r={80} />
      </Mainplate>,
    )
    expect(arc(hidden)?.getAttribute("aria-hidden")).toBe("true")

    const { container: exposed } = render(
      <Mainplate>
        <Arc r={80} aria-hidden={false} />
      </Mainplate>,
    )
    expect(arc(exposed)?.getAttribute("aria-hidden")).toBe("false")
  })

  it("refuses a caller's fill at compile time, and keeps none at runtime", () => {
    const { container } = render(
      <Mainplate>
        {/* @ts-expect-error — <Arc> is stroke-only; a filled surface is a <Dial> */}
        <Arc r={80} fill="red" />
      </Mainplate>,
    )
    expect(arc(container)?.getAttribute("fill")).toBe("none")
  })
})

describe("<Arc> — driven by a Source", () => {
  /**
   * A source whose subscription traffic is observable from outside — the same
   * spy Task 6 used, because the same vacuous test exists to avoid: teardown
   * must be watched *running*, not inferred from an absence of errors.
   */
  function instrument(initial: number) {
    const s = createSource(initial)
    const calls = { subscribes: 0, teardowns: 0 }
    const spied: WritableSource<number> = {
      ...s,
      subscribe: (cb: () => void) => {
        calls.subscribes += 1
        const off = s.subscribe(cb)
        return () => {
          calls.teardowns += 1
          off()
        }
      },
    }
    return { spied, calls }
  }

  it("rewrites the path's d on set() without re-rendering the face", () => {
    const s = createSource(90)
    const renders = { face: 0 }
    function Face() {
      renders.face += 1
      return (
        <Mainplate min={0} max={360}>
          <Arc from={0} to={s} r={50} />
        </Mainplate>
      )
    }
    const { container } = render(<Face />)
    expect(dOf(container)).toBe("M 0 -50 A 50 50 0 0 1 50 0")
    expect(renders.face).toBe(1)

    act(() => s.set(270))
    expect(dOf(container)).toBe("M 0 -50 A 50 50 0 1 1 -50 0")
    act(() => s.set(360))
    // Reaching max closes the gauge into the full ring.
    expect(dOf(container)).toBe("M 0 -50 A 50 50 0 1 1 0 50 A 50 50 0 1 1 0 -50 Z")
    expect(renders.face).toBe(1)
  })

  it("drives both endpoints from two independent sources", () => {
    const from = createSource(90)
    const to = createSource(180)
    const { container } = render(
      <Mainplate min={0} max={360}>
        <Arc from={from} to={to} r={50} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("M 50 0 A 50 50 0 0 1 0 50")

    act(() => from.set(0))
    expect(dOf(container)).toBe("M 0 -50 A 50 50 0 0 1 0 50")
    act(() => to.set(270))
    expect(dOf(container)).toBe("M 0 -50 A 50 50 0 1 1 -50 0")
  })

  it("quantises what the ref path writes, exactly as the render path does", () => {
    // The write bypasses React entirely, so the render path's quantisation
    // does not cover it: raw, a seventh of a turn lands on repeating floats.
    const s = createSource(0)
    const { container } = render(
      <Mainplate min={0} max={7}>
        <Arc from={0} to={s} r={50} />
      </Mainplate>,
    )
    expect(dOf(container)).toBe("")
    act(() => s.set(1))
    const p = polar(360 / 7, 50)
    expect(dOf(container)).toBe(`M 0 -50 A 50 50 0 0 1 ${quantize(p.x)} ${quantize(p.y)}`)
    expect(dOf(container)).not.toMatch(/\d\.\d{5,}/)
  })

  it("keeps tracing the outline on the ref path, not just on the render path", () => {
    const s = createSource(90)
    const { container } = render(
      <Mainplate min={0} max={360} outline="rect">
        <Arc from={0} to={s} inset={9} />
      </Mainplate>,
    )
    act(() => s.set(180))
    const points = pointsOf(dOf(container))
    // The rewritten d still hugs the inset square all the way to 6 o'clock.
    expect(points[points.length - 1]).toEqual({ x: 0, y: 91 })
    for (const p of points) {
      expect(Math.abs(Math.max(Math.abs(p.x), Math.abs(p.y)) - 91)).toBeLessThan(1e-3)
    }
    expect(points.some((p) => Math.hypot(p.x, p.y) > 100)).toBe(true)
  })

  it("subscribes to each source on mount and runs both teardowns on unmount", () => {
    const from = instrument(0)
    const to = instrument(90)
    const { unmount } = render(
      <Mainplate min={0} max={360}>
        <Arc from={from.spied} to={to.spied} r={50} />
      </Mainplate>,
    )
    expect(from.calls).toEqual({ subscribes: 1, teardowns: 0 })
    expect(to.calls).toEqual({ subscribes: 1, teardowns: 0 })
    unmount()
    expect(from.calls).toEqual({ subscribes: 1, teardowns: 1 })
    expect(to.calls).toEqual({ subscribes: 1, teardowns: 1 })
  })

  it("keeps one subscription across parent re-renders", () => {
    const { spied, calls } = instrument(90)
    function Face({ tick }: { tick: number }) {
      return (
        <Mainplate min={0} max={360}>
          <Arc to={spied} r={50} opacity={tick} />
        </Mainplate>
      )
    }
    const { rerender } = render(<Face tick={1} />)
    rerender(<Face tick={0.9} />)
    rerender(<Face tick={0.8} />)
    expect(calls).toEqual({ subscribes: 1, teardowns: 0 })
  })

  it("switches between a number and a Source without leaking a subscription", () => {
    const { spied, calls } = instrument(90)
    function Face({ to }: { to: number | Source<number> }) {
      return (
        <Mainplate min={0} max={360}>
          <Arc from={0} to={to} r={50} />
        </Mainplate>
      )
    }
    const { container, rerender, unmount } = render(<Face to={spied} />)
    expect(calls).toEqual({ subscribes: 1, teardowns: 0 })

    rerender(<Face to={180} />)
    expect(dOf(container)).toBe("M 0 -50 A 50 50 0 0 1 0 50")
    expect(calls).toEqual({ subscribes: 1, teardowns: 1 })

    rerender(<Face to={spied} />)
    expect(calls).toEqual({ subscribes: 2, teardowns: 1 })
    act(() => spied.set(270))
    expect(dOf(container)).toBe("M 0 -50 A 50 50 0 1 1 -50 0")

    unmount()
    expect(calls).toEqual({ subscribes: 2, teardowns: 2 })
  })

  it("serialises the source's current value on the server, quantised", () => {
    // No effect runs on the server, so the render path alone must carry the
    // exact path the client hydrates against.
    const s = createSource(90)
    const html = renderToStaticMarkup(
      <Mainplate min={0} max={360}>
        <Arc from={0} to={s} r={50} />
      </Mainplate>,
    )
    expect(html).toContain('d="M 0 -50 A 50 50 0 0 1 50 0"')
  })
})
