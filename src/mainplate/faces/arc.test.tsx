// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { arcPath, resolveOutline, valueToAngle } from "../core"
import { createSource } from "../core/source"
import { Arc } from "./arc"
import { Complication } from "./complication"
import { Gauge } from "./gauge"
import { Mainplate } from "./mainplate"
import { Dial } from "./parts"

afterEach(() => {
  vi.unstubAllGlobals()
})

const CIRCLE = resolveOutline("circle")

/** The path the engine draws for a sweep — the arc part's whole contract. */
function expected(
  from: number,
  to: number,
  inset: number,
  width: number,
  outline = CIRCLE,
): string {
  return arcPath(outline, from, to, undefined, inset, "center", width)
}

function layerOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg")
  if (svg === null) throw new Error("no arc layer rendered")
  return svg
}

function pathsOf(root: ParentNode): SVGPathElement[] {
  return Array.from(root.querySelectorAll("path"))
}

/** Every number in a string, as its decimal-place count. */
function decimals(text: string): number[] {
  return (text.match(/-?\d+\.\d+/g) ?? []).map((n) => (n.split(".")[1] ?? "").length)
}

describe("<Arc> — the static path", () => {
  it("draws exactly what `arcPath` draws, mapped through the domain", () => {
    // 0-100 over a full turn: 25 is a quarter past, so the sweep runs 0° → 90°.
    const { container } = render(
      <Mainplate label="x">
        <Arc from={0} to={25} inset={10} width={3} />
      </Mainplate>,
    )
    const path = pathsOf(container)[0]
    expect(path?.getAttribute("d")).toBe(expected(0, 90, 10, 3))
  })

  it("follows the enclosing scale: min, max, startAngle and sweepAngle", () => {
    // The gauge's own scale: 0-220 over 270° starting at -135°.
    const { container } = render(
      <Mainplate label="x">
        <Arc from={180} to={220} min={0} max={220} startAngle={-135} sweepAngle={270} inset={10} />
      </Mainplate>,
    )
    const scale = { min: 0, max: 220, startAngle: -135, sweepAngle: 270 }
    expect(pathsOf(container)[0]?.getAttribute("d")).toBe(
      expected(valueToAngle(180, scale), valueToAngle(220, scale), 10, 3),
    )
  })

  it("takes its domain from a Source when no prop says otherwise (§8.10)", () => {
    // prop > source.domain > default, the precedence <Hand> resolves by.
    const src = createSource(0, { min: 0, max: 400 })
    const { container } = render(
      <Mainplate label="x">
        <Arc from={0} to={src} startAngle={0} sweepAngle={360} />
      </Mainplate>,
    )
    act(() => {
      src.set(100)
    })
    // 100 of 0-400 over a full turn is 90°, not the default domain's 360°.
    expect(pathsOf(container)[0]?.getAttribute("d")).toBe(expected(0, 90, 10, 3))
  })

  it("wears the tick ink and the stroke width by default", () => {
    const { container } = render(
      <Mainplate label="x">
        <Arc from={0} to={50} width={11} />
      </Mainplate>,
    )
    const path = pathsOf(container)[0]
    expect(path?.getAttribute("fill")).toBe("none")
    expect(path?.getAttribute("stroke")).toBe("var(--mp-tick)")
    expect(path?.getAttribute("stroke-width")).toBe("11")
    expect(path?.getAttribute("stroke-linecap")).toBe("round")
  })

  it("paints nothing under `unstyled`, and keeps the structure", () => {
    const { container } = render(
      <Mainplate label="x" unstyled>
        <Arc from={0} to={50} />
      </Mainplate>,
    )
    const path = pathsOf(container)[0]
    expect(path?.getAttribute("stroke")).toBeNull()
    expect(path?.getAttribute("d")).toBe(expected(0, 180, 10, 3))
  })

  it("spreads className and path attributes", () => {
    const { container } = render(
      <Mainplate label="x">
        <Arc from={0} to={50} className="opacity-50" stroke="red" data-testid="band" />
      </Mainplate>,
    )
    const path = pathsOf(container)[0]
    expect(path?.getAttribute("class")).toBe("opacity-50")
    expect(path?.getAttribute("stroke")).toBe("red")
    expect(path?.getAttribute("data-testid")).toBe("band")
  })
})

describe("<Arc> — one shared svg layer", () => {
  it("two arcs share ONE <svg> node", () => {
    const { container } = render(
      <Mainplate label="x">
        <Arc from={0} to={25} />
        <Arc from={50} to={75} />
      </Mainplate>,
    )
    const svgs = container.querySelectorAll("svg")
    expect(svgs).toHaveLength(1)
    const layer = layerOf(container)
    const paths = pathsOf(container)
    expect(paths).toHaveLength(2)
    for (const path of paths) expect(path.parentNode).toBe(layer)
  })

  it("creates no layer at all for a face with no arcs", () => {
    const { container } = render(
      <Mainplate label="x">
        <Dial />
      </Mainplate>,
    )
    expect(container.querySelectorAll("svg")).toHaveLength(0)
  })

  it("the layer is presentational and covers the dial", () => {
    const { container } = render(
      <Mainplate label="x">
        <Arc from={0} to={25} />
      </Mainplate>,
    )
    const layer = layerOf(container)
    expect(layer.getAttribute("viewBox")).toBe("-110 -110 220 220")
    expect(layer.getAttribute("role")).toBe("presentation")
    expect(layer.getAttribute("aria-hidden")).toBe("true")
    expect(layer.getAttribute("data-mp")).toBe("arcs")
    const style = layer.getAttribute("style") ?? ""
    expect(style).toContain("position: absolute")
    expect(style).toContain("inset: 0px")
    expect(style).toContain("overflow: visible")
  })

  it("keeps the layer where the first arc was written", () => {
    // A shared layer must not reorder the face: the strokes sit exactly where
    // the composition put them, dial under, hand over.
    const { container } = render(
      <Mainplate label="x">
        <Dial />
        <Arc from={0} to={25} />
      </Mainplate>,
    )
    const root = container.firstElementChild
    const kids = Array.from(root?.children ?? [])
    expect(kids.map((el) => el.tagName.toLowerCase())).toEqual(["div", "svg"])
  })
})

describe("<Arc> — inside a nested <Complication size> context", () => {
  it("renders into the NESTED layer, with the nested outline's geometry", () => {
    // A rect root and a circular register: the two outlines draw different
    // paths, so the `d` alone says which context the arc read.
    const { container } = render(
      <Mainplate label="x" shape={{ ratio: 0.7, radius: 30 }}>
        <Arc from={0} to={25} />
        <Complication at="center" size={40}>
          <Arc from={0} to={25} />
          <Arc from={50} to={75} />
        </Complication>
      </Mainplate>,
    )
    const complication = container.querySelector('[data-mp="complication"]')
    if (complication === null) throw new Error("no complication")
    const nestedLayers = complication.querySelectorAll("svg")
    expect(nestedLayers).toHaveLength(1)
    const nested = nestedLayers[0]
    if (nested === undefined) throw new Error("no nested layer")
    // The register's own box, not the parent's: a nominal 220-unit circle.
    expect(nested.getAttribute("viewBox")).toBe("-110 -110 220 220")
    const paths = pathsOf(nested)
    expect(paths).toHaveLength(2)
    expect(paths[0]?.getAttribute("d")).toBe(expected(0, 90, 10, 3))
    // Two layers on the face: the root's and the register's, one each.
    expect(container.querySelectorAll("svg")).toHaveLength(2)
    // And the root's arc is NOT the nested one: a rect outline draws its own
    // path, which the register's circle cannot equal.
    const rootPath = container.querySelector("svg > path")
    expect(rootPath?.getAttribute("d")).not.toBe(expected(0, 90, 10, 3))
  })
})

describe("<Arc> — live endpoints", () => {
  it("rewrites `d` through a ref at zero commits", () => {
    const src = createSource(0, { min: 0, max: 100 })
    const onRender = vi.fn()
    const { container } = render(
      <Profiler id="arc" onRender={onRender}>
        <Mainplate label="x">
          <Arc from={0} to={src} startAngle={0} sweepAngle={360} />
        </Mainplate>
      </Profiler>,
    )
    const path = pathsOf(container)[0]
    if (path === undefined) throw new Error("no arc")
    // A live endpoint renders EMPTY — no reading reaches the render path, so
    // there is nothing for hydration to mismatch — and the mount write puts
    // the arc where the source actually is (0, which is still nothing).
    expect(path.getAttribute("d")).toBe("")
    act(() => {
      src.set(25)
    })
    expect(path.getAttribute("d")).toBe(expected(0, 90, 10, 3))
    act(() => {
      src.set(50)
    })
    expect(path.getAttribute("d")).toBe(expected(0, 180, 10, 3))
    // The whole point: the element moved and React never re-rendered.
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it("takes a live `from` as well as a live `to`", () => {
    const src = createSource(0, { min: 0, max: 100 })
    const { container } = render(
      <Mainplate label="x">
        <Arc from={src} to={50} startAngle={0} sweepAngle={360} />
      </Mainplate>,
    )
    act(() => {
      src.set(25)
    })
    expect(pathsOf(container)[0]?.getAttribute("d")).toBe(expected(90, 180, 10, 3))
  })

  it("quantises what it writes: the ref path is not covered by render rounding", () => {
    // A value chosen to make every coordinate irrational-looking. The write
    // path shares the engine's builder verbatim, so `d` arrives quantised —
    // the rule that bit twice in one week, restated for a second ref writer.
    const src = createSource(0, { min: 0, max: 100 })
    const { container } = render(
      <Mainplate label="x">
        <Arc from={0} to={src} startAngle={0} sweepAngle={360} />
      </Mainplate>,
    )
    act(() => {
      src.set(100 / 3)
    })
    const d = pathsOf(container)[0]?.getAttribute("d") ?? ""
    expect(d).toMatch(/^M /)
    for (const places of decimals(d)) expect(places).toBeLessThanOrEqual(4)
  })

  it("pauses with the face: offscreen releases the subscription", () => {
    const observers: { trigger: (visible: boolean) => void }[] = []
    class FakeIntersectionObserver {
      private cb: (entries: { isIntersecting: boolean }[]) => void
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        this.cb = cb
        observers.push({ trigger: (visible) => this.cb([{ isIntersecting: visible }]) })
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
    let subscriptions = 0
    const inner = createSource(0, { min: 0, max: 100 })
    const counted = {
      get: inner.get,
      domain: inner.domain,
      subscribe(cb: () => void) {
        subscriptions++
        const off = inner.subscribe(cb)
        return () => {
          subscriptions--
          off()
        }
      },
    }
    render(
      <Mainplate label="x">
        <Arc from={0} to={counted} />
      </Mainplate>,
    )
    expect(subscriptions).toBe(1)
    const io = observers[0]
    if (io === undefined) throw new Error("no observer was constructed")
    act(() => {
      io.trigger(false)
    })
    expect(subscriptions).toBe(0)
    act(() => {
      io.trigger(true)
    })
    expect(subscriptions).toBe(1)
  })
})

/**
 * The equivalence gate: `<Gauge>`'s arc layer, refactored onto the public
 * part, draws what the internal `GaugeArcs` drew — same one `<svg>`, same
 * three strokes in the same order, same attributes, same engine paths.
 */
describe("<Gauge> — the arc layer, on the public part", () => {
  const GAUGE_SCALE = { min: 0, max: 220, startAngle: -135, sweepAngle: 270 }

  it("keeps the layer: one svg, presentational, over the dial", () => {
    const { container } = render(<Gauge value={50} />)
    const layer = layerOf(container)
    expect(container.querySelectorAll("svg")).toHaveLength(1)
    expect(layer.getAttribute("viewBox")).toBe("-110 -110 220 220")
    expect(layer.getAttribute("role")).toBe("presentation")
    expect(layer.getAttribute("data-mp")).toBe("arcs")
    expect(layer.getAttribute("style")).toContain("position: absolute")
  })

  it("keeps the layer's place in the face: over the dial, under the marks", () => {
    // The z-order the slots declare, unchanged by the layer being shared —
    // a hoisted layer that jumped to the front would paint over the needle.
    const { container } = render(<Gauge value={72} max={220} />)
    const kids = Array.from(container.firstElementChild?.children ?? []).map((el) =>
      el.getAttribute("data-mp"),
    )
    expect(kids[0]).toBe("dial")
    expect(kids[1]).toBe("arcs")
    expect(kids[2]).toBe("tick")
    expect(kids[kids.length - 1]).toBe("cap")
  })

  it("keeps the track's exact path and paint", () => {
    const { container } = render(<Gauge value={72} max={220} redline={[180, 220]} />)
    const track = container.querySelector('[data-mp="track"]')
    expect(track?.getAttribute("d")).toBe(expected(-135, 135, 10, 3))
    expect(track?.getAttribute("fill")).toBe("none")
    expect(track?.getAttribute("stroke")).toBe("var(--mp-tick)")
    expect(track?.getAttribute("stroke-width")).toBe("3")
    expect(track?.getAttribute("stroke-linecap")).toBe("round")
  })

  it("keeps the redline band's exact path and paint", () => {
    const { container } = render(<Gauge value={72} max={220} redline={[180, 220]} />)
    const redline = container.querySelector('[data-mp="redline"]')
    expect(redline?.getAttribute("d")).toBe(
      expected(valueToAngle(180, GAUGE_SCALE), valueToAngle(220, GAUGE_SCALE), 10, 3),
    )
    expect(redline?.getAttribute("stroke")).toBe("var(--mp-warning)")
    expect(redline?.getAttribute("stroke-width")).toBe("3")
  })

  it("keeps the sweep fill's fixed path, dash scale and glide", () => {
    const { container } = render(<Gauge value={64} indicator="sweep" />)
    const paths = pathsOf(layerOf(container))
    expect(paths.map((p) => p.getAttribute("data-mp"))).toEqual(["track", "sweep"])
    const fill = paths[1]
    // The whole sweep, always — only the dash moves.
    expect(fill?.getAttribute("d")).toBe(expected(-135, 135, 10, 11))
    expect(fill?.getAttribute("pathLength")).toBe("100")
    expect(fill?.getAttribute("stroke-dasharray")).toBe("100")
    expect(fill?.getAttribute("stroke")).toBe("var(--mp-accent)")
    expect(fill?.getAttribute("stroke-width")).toBe("11")
    const style = fill?.getAttribute("style") ?? ""
    expect(style).toContain("stroke-dashoffset: 36")
    expect(style).toContain("transition: stroke-dashoffset 180ms cubic-bezier(0.23, 1, 0.32, 1)")
  })

  it("keeps the order the layer draws in: track, redline, fill", () => {
    const { container } = render(
      <Gauge value={64} indicator="sweep" max={100} redline={[80, 100]} />,
    )
    expect(pathsOf(layerOf(container)).map((p) => p.getAttribute("data-mp"))).toEqual([
      "track",
      "redline",
      "sweep",
    ])
  })

  it("keeps `unstyled` stripping every stroke and nothing else", () => {
    const { container } = render(
      <Gauge value={64} indicator="sweep" redline={[80, 100]} unstyled />,
    )
    for (const path of pathsOf(layerOf(container))) {
      expect(path.getAttribute("stroke")).toBeNull()
      expect(path.getAttribute("d")).toMatch(/^M /)
    }
  })

  it("keeps every number the layer writes quantised, `d` and dash alike", () => {
    const src = createSource(0, { min: 0, max: 3 })
    const { container } = render(<Gauge value={src} indicator="sweep" />)
    act(() => {
      src.set(1)
    })
    for (const path of pathsOf(layerOf(container))) {
      for (const places of decimals(path.getAttribute("d") ?? "")) {
        expect(places).toBeLessThanOrEqual(4)
      }
      for (const places of decimals(path.getAttribute("style") ?? "")) {
        expect(places).toBeLessThanOrEqual(4)
      }
    }
    // 1 of 0-3 filled: the offset is the quantised remainder, not 66.66666…
    expect(
      container.querySelector<SVGPathElement>('[data-mp="sweep"]')?.style.strokeDashoffset,
    ).toBe("66.6667")
  })
})
