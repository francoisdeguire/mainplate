// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createSource } from "../core/source"
import { Clock } from "./clock"
import { Gauge } from "./gauge"
import { Hand, Ticks } from "./parts"

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The rotation an element wears, parsed out of its written transform. */
function rotationOf(el: Element): number {
  const style = el.getAttribute("style") ?? ""
  const match = style.match(/rotate\((-?[\d.]+)deg\)/)
  if (match === null || match[1] === undefined) {
    throw new Error(`no rotation in ${JSON.stringify(style)}`)
  }
  return Number(match[1])
}

function needleOf(container: HTMLElement): HTMLElement {
  const hand = container.querySelector<HTMLElement>('[data-mp="hand"]')
  if (hand === null) throw new Error("no needle rendered")
  return hand
}

function sweepOf(container: HTMLElement): SVGPathElement {
  const fill = container.querySelector<SVGPathElement>('[data-mp="sweep"]')
  if (fill === null) throw new Error("no sweep fill rendered")
  return fill
}

/** A controllable `prefers-reduced-motion` list, as the ticker's tests build one. */
function stubReducedMotion(matches: boolean) {
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  )
  return mql
}

describe("<Gauge> — the zero-props reading", () => {
  it("renders a needle face: dial, track, needle, cap, readout", () => {
    const { container, getByRole } = render(<Gauge value={50} />)
    const root = getByRole("meter")
    expect(root.getAttribute("aria-label")).toBe("Gauge")
    expect(container.querySelectorAll('[data-mp="dial"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-mp="track"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-mp="cap"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-mp="readout"]')).toHaveLength(1)
    // 50 of 0-100 over the default 270° sweep starting at -135° → dead centre.
    expect(rotationOf(needleOf(container))).toBe(0)
    // The gauge spends the face's one accent on the needle — the clock spends
    // it on the seconds hand — so the pivot cover underneath is ink.
    expect(needleOf(container).style.background).toBe("var(--mp-accent)")
    expect(container.querySelector<HTMLElement>('[data-mp="cap"]')?.style.background).toBe(
      "var(--mp-ink)",
    )
  })

  it("maps the value through min, max and sweep", () => {
    const { container } = render(<Gauge value={72} max={220} sweep={240} />)
    // -120 + (72/220)·240
    expect(rotationOf(needleOf(container))).toBe(-41.4545)
  })

  it("passes color, unstyled, className and HTML attributes to the root", () => {
    const { getByRole, container } = render(
      <Gauge
        value={50}
        label="Speed"
        color="oklch(0.45 0.16 264)"
        className="w-40"
        id="g1"
        data-testid="gauge"
        unstyled
      />,
    )
    const root = getByRole("meter")
    expect(root.getAttribute("aria-label")).toBe("Speed")
    expect(root.className).toBe("w-40")
    expect(root.id).toBe("g1")
    expect(root.getAttribute("data-testid")).toBe("gauge")
    expect(root.style.getPropertyValue("--mp-ink")).toBe("oklch(0.45 0.16 264)")
    for (const part of container.querySelectorAll<HTMLElement>("[data-mp]")) {
      expect(part.style.background).toBe("")
    }
  })
})

describe("<Gauge> — meter semantics", () => {
  it("reports the reading and its bounds", () => {
    const { getByRole } = render(<Gauge value={72.4} min={0} max={220} label="Speed" />)
    const root = getByRole("meter")
    expect(root.getAttribute("aria-valuemin")).toBe("0")
    expect(root.getAttribute("aria-valuemax")).toBe("220")
    expect(root.getAttribute("aria-valuenow")).toBe("72")
  })

  it("clamps aria-valuenow over the top of the range", () => {
    const { getByRole } = render(<Gauge value={150} min={0} max={100} />)
    expect(getByRole("meter").getAttribute("aria-valuenow")).toBe("100")
  })

  it("clamps aria-valuenow under the bottom of the range", () => {
    const { getByRole } = render(<Gauge value={-20} min={0} max={100} />)
    expect(getByRole("meter").getAttribute("aria-valuenow")).toBe("0")
  })

  it("keeps role=meter even when a caller passes their own role", () => {
    // The root spread is how `id`, `data-*` and handlers reach the div, and it
    // must not be a way to demote a reading back to a picture.
    const { getByRole } = render(<Gauge value={50} role="img" label="Speed" />)
    const root = getByRole("meter")
    expect(root.getAttribute("aria-valuenow")).toBe("50")
  })

  it("clamps the live ref path too", () => {
    const src = createSource(50, { min: 0, max: 100 })
    const { getByRole } = render(<Gauge value={src} />)
    act(() => {
      src.set(400)
    })
    expect(getByRole("meter").getAttribute("aria-valuenow")).toBe("100")
  })

  it("takes its bounds from a Source's own domain when no prop says otherwise", () => {
    const src = createSource(110, { min: 0, max: 220 })
    const { getByRole } = render(<Gauge value={src} />)
    const root = getByRole("meter")
    expect(root.getAttribute("aria-valuemin")).toBe("0")
    expect(root.getAttribute("aria-valuemax")).toBe("220")
    expect(rotationOf(needleOf(root as HTMLElement))).toBe(0)
  })

  it("a live Source keeps the reported value fresh at zero commits", () => {
    const src = createSource(50, { min: 0, max: 100 })
    const onRender = vi.fn()
    const { getByRole, container } = render(
      <Profiler id="gauge" onRender={onRender}>
        <Gauge value={src} />
      </Profiler>,
    )
    const root = getByRole("meter")
    expect(root.getAttribute("aria-valuenow")).toBe("50")
    expect(rotationOf(needleOf(container))).toBe(0)
    expect(onRender).toHaveBeenCalledTimes(1)

    act(() => {
      src.set(75)
    })
    expect(root.getAttribute("aria-valuenow")).toBe("75")
    expect(rotationOf(needleOf(container))).toBe(67.5)
    expect(onRender).toHaveBeenCalledTimes(1)
  })
})

describe("<Gauge> — controlled values animate", () => {
  it("arms a transform transition on the needle and glides to a new value", () => {
    const { container, rerender } = render(<Gauge value={20} />)
    const needle = needleOf(container)
    expect(needle.style.transition).toMatch(/transform \d+ms/)
    expect(rotationOf(needle)).toBe(-81)
    rerender(<Gauge value={80} />)
    expect(rotationOf(needle)).toBe(81)
    // The same element, still transitioning — the binder wrote into it rather
    // than React replacing it.
    expect(needleOf(container)).toBe(needle)
  })

  it("falls back to instant under prefers-reduced-motion", () => {
    stubReducedMotion(true)
    const { container } = render(<Gauge value={20} />)
    expect(needleOf(container).style.transition).toBe("")
  })

  it("leaves a live Source to drive its own motion — no transition armed", () => {
    const src = createSource(20, { min: 0, max: 100 })
    const { container } = render(<Gauge value={src} />)
    expect(needleOf(container).style.transition).toBe("")
  })
})

describe("<Gauge> — graduations", () => {
  function ticksOf(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
  }

  it("a needle gauge is graduated: 21 marks over the sweep, majors every fourth", () => {
    // The spike's finding, made structural (spec §12): a needle without marks
    // reads as a toy. Two stacked `<Ticks>` tracks — the same composition a
    // clock's minute+hour layout is — carry it.
    const { container } = render(<Gauge value={50} />)
    const marks = ticksOf(container)
    expect(marks).toHaveLength(21)
    const majors = marks.filter((m) => m.style.background === "var(--mp-tick-major)")
    const minors = marks.filter((m) => m.style.background === "var(--mp-tick)")
    expect(majors).toHaveLength(6)
    expect(minors).toHaveLength(15)
    // Bounded to the gauge's own sweep, endpoints inclusive, nothing in the
    // gap at 6 o'clock.
    const angles = marks.map(rotationOf)
    expect(Math.min(...angles)).toBe(-135)
    expect(Math.max(...angles)).toBe(135)
    // The majors stand on every fourth minor position: 270/5 = 54° apart.
    expect(majors.map(rotationOf)).toEqual([-135, -81, -27, 27, 81, 135])
  })

  it("follows a narrowed sweep", () => {
    const { container } = render(<Gauge value={50} sweep={180} />)
    const angles = ticksOf(container).map(rotationOf)
    expect(angles).toHaveLength(21)
    expect(Math.min(...angles)).toBe(-90)
    expect(Math.max(...angles)).toBe(90)
  })

  it("leaves the sweep indicator bare", () => {
    const { container } = render(<Gauge value={50} indicator="sweep" />)
    expect(ticksOf(container)).toHaveLength(0)
  })

  it("leaves the redline band alone", () => {
    const { container } = render(<Gauge value={50} max={220} redline={[180, 220]} />)
    expect(container.querySelector('[data-mp="redline"]')?.getAttribute("d")).toMatch(/^M /)
    expect(ticksOf(container)).toHaveLength(21)
  })

  it("unstyled strips the graduations' paint, majors included", () => {
    const { container } = render(<Gauge value={50} unstyled />)
    const marks = ticksOf(container)
    expect(marks).toHaveLength(21)
    for (const mark of marks) {
      expect(mark.style.background).toBe("")
      expect(mark.style.borderRadius).toBe("")
    }
  })

  it("a Ticks child replaces both default tracks and keeps the gauge's sweep", () => {
    // The slot rule, on the tick track: the child decides how the marks look
    // and how many there are; the gauge keeps the angular range, exactly as it
    // keeps the needle's domain. A track cannot wander off its own arc.
    const { container } = render(
      <Gauge value={50}>
        <Ticks count={5} className="t" />
      </Gauge>,
    )
    const marks = ticksOf(container)
    expect(marks).toHaveLength(5)
    expect(marks.every((m) => m.className === "t")).toBe(true)
    expect(marks.map(rotationOf)).toEqual([-135, -67.5, 0, 67.5, 135])
  })
})

describe("<Gauge> — the arc layer", () => {
  it("draws one track across the whole sweep", () => {
    const { container } = render(<Gauge value={50} />)
    const track = container.querySelector('[data-mp="track"]')
    expect(track?.getAttribute("d")).toMatch(/^M /)
    expect(container.querySelectorAll("svg")).toHaveLength(1)
  })

  it("draws the redline band only when asked", () => {
    const { container: none } = render(<Gauge value={50} max={220} />)
    expect(none.querySelectorAll('[data-mp="redline"]')).toHaveLength(0)
    const { container } = render(<Gauge value={50} max={220} redline={[180, 220]} />)
    const redline = container.querySelector('[data-mp="redline"]')
    expect(redline?.getAttribute("d")).toMatch(/^M /)
    expect(redline?.getAttribute("stroke")).toBe("var(--mp-warning)")
  })

  it("indicator='sweep' fills the arc instead of pointing a needle", () => {
    const { container } = render(<Gauge value={50} indicator="sweep" />)
    expect(container.querySelectorAll('[data-mp="hand"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-mp="cap"]')).toHaveLength(0)
    const fill = container.querySelector('[data-mp="sweep"]')
    expect(fill?.getAttribute("d")).toMatch(/^M /)
  })

  it("a live Source rewrites the sweep fill through a ref, at zero commits", () => {
    const src = createSource(0, { min: 0, max: 100 })
    const onRender = vi.fn()
    const { container } = render(
      <Profiler id="gauge" onRender={onRender}>
        <Gauge value={src} indicator="sweep" />
      </Profiler>,
    )
    const fill = sweepOf(container)
    // The path is fixed — the full sweep, always — and the reading is the
    // length of it that is dashed in. An empty sweep hides the whole thing.
    expect(fill.getAttribute("d")).toMatch(/^M /)
    expect(fill.style.strokeDashoffset).toBe("100")
    act(() => {
      src.set(50)
    })
    expect(fill.style.strokeDashoffset).toBe("50")
    act(() => {
      src.set(75)
    })
    expect(fill.style.strokeDashoffset).toBe("25")
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it("clamps the fill at both ends of the domain", () => {
    const { container: over } = render(<Gauge value={150} max={100} indicator="sweep" />)
    expect(sweepOf(over).style.strokeDashoffset).toBe("0")
    const { container: under } = render(<Gauge value={-40} max={100} indicator="sweep" />)
    expect(sweepOf(under).style.strokeDashoffset).toBe("100")
  })
})

describe("<Gauge> — the controlled sweep fill glides too", () => {
  it("arms a transition on the dash offset and moves it to the new value", () => {
    const { container, rerender } = render(<Gauge value={20} indicator="sweep" />)
    const fill = sweepOf(container)
    // A `d` change cannot be interpolated by CSS, so the reading rides the
    // dash offset over a fixed path — which can be.
    expect(fill.style.transition).toMatch(/stroke-dashoffset \d+ms/)
    expect(fill.style.strokeDashoffset).toBe("80")
    const before = fill.getAttribute("d")

    rerender(<Gauge value={80} indicator="sweep" />)
    expect(fill.style.strokeDashoffset).toBe("20")
    // The same node, and the same path: nothing about the geometry moved, so
    // there is a transition for the browser to run.
    expect(sweepOf(container)).toBe(fill)
    expect(fill.getAttribute("d")).toBe(before)
  })

  it("falls back to instant under prefers-reduced-motion", () => {
    stubReducedMotion(true)
    const { container } = render(<Gauge value={20} indicator="sweep" />)
    expect(sweepOf(container).style.transition).toBe("")
    expect(sweepOf(container).style.strokeDashoffset).toBe("80")
  })

  it("arms nothing on the live path — a Source drives its own motion", () => {
    const src = createSource(20, { min: 0, max: 100 })
    const { container } = render(<Gauge value={src} indicator="sweep" />)
    // A per-frame ref write must not be fighting a 180ms transition.
    expect(sweepOf(container).style.transition).toBe("")
  })
})

describe("<Gauge> — the readout", () => {
  it("rounds the value by default", () => {
    const { container } = render(<Gauge value={72.4} max={220} />)
    expect(container.querySelector('[data-mp="readout"]')?.textContent).toBe("72")
  })

  it("takes a formatter", () => {
    const { container } = render(<Gauge value={72.4} max={220} format={(v) => `${v} km/h`} />)
    expect(container.querySelector('[data-mp="readout"]')?.textContent).toBe("72.4 km/h")
  })

  it("format={false} hides it", () => {
    const { container } = render(<Gauge value={72.4} format={false} />)
    expect(container.querySelectorAll('[data-mp="readout"]')).toHaveLength(0)
  })

  it("keeps a live readout fresh through the ref, at zero commits", () => {
    const src = createSource(10, { min: 0, max: 100 })
    const onRender = vi.fn()
    const { container } = render(
      <Profiler id="gauge" onRender={onRender}>
        <Gauge value={src} />
      </Profiler>,
    )
    const readout = container.querySelector('[data-mp="readout"]')
    expect(readout?.textContent).toBe("10")
    act(() => {
      src.set(42)
    })
    expect(readout?.textContent).toBe("42")
    expect(onRender).toHaveBeenCalledTimes(1)
  })
})

describe("<Gauge> — slots", () => {
  it("a Hand child replaces the needle's look and keeps its reading", () => {
    const { container } = render(
      <Gauge value={50}>
        <Hand className="needle" variant="line" />
      </Gauge>,
    )
    const hands = container.querySelectorAll<HTMLElement>('[data-mp="hand"]')
    expect(hands).toHaveLength(1)
    const needle = hands[0]
    if (needle === undefined) throw new Error("no needle")
    expect(needle.className).toBe("needle")
    expect(rotationOf(needle)).toBe(0)
  })

  it("a slot cannot detach the needle from the gauge's own reading", () => {
    const { container } = render(
      <Gauge value={50}>
        <Hand value={0} max={10} className="needle" />
      </Gauge>,
    )
    const needle = needleOf(container)
    expect(needle.className).toBe("needle")
    // The wrapper's wiring is re-applied over the child's: 50 of 0-100, not
    // 0 of 0-10 (which would park the needle at the start of the sweep).
    expect(rotationOf(needle)).toBe(0)
    // The needle reaches the graduations: 83.5 units of reach plus the 12-unit
    // tail over the 220 box, pivoting 83.5/95.5 of the way up. 83.5 is exactly
    // where the minor marks' inner ends are (inset 12 + length 4.5 → 100−16.5),
    // so the tip meets the ring without crossing the majors' inner ends at 80.
    expect(needle.style.height).toBe("43.4091cqw")
    expect(needle.style.transformOrigin).toBe("50% 87.4346%")
  })
})

describe("quantisation — every value the two faces write parses to ≤4dp", () => {
  function fractionsIn(text: string): string[] {
    return [...text.matchAll(/\d+\.(\d+)/g)].map((m) => m[1] ?? "")
  }

  it("holds across both faces, styles and path data alike", () => {
    const { container } = render(
      <>
        <Gauge value={100 / 3} min={1 / 7} max={220 / 3} sweep={253} redline={[50, 70]} />
        <Gauge value={100 / 3} min={1 / 7} max={220 / 3} sweep={253} indicator="sweep" />
        <Clock
          time={new Date("2026-01-15T03:30:36.400Z")}
          timezone="UTC"
          shape={{ ratio: 0.82, radius: 30 }}
        />
      </>,
    )
    const nodes = [...container.querySelectorAll("[style], [d]")]
    expect(nodes.length).toBeGreaterThan(70)
    for (const node of nodes) {
      const text = `${node.getAttribute("style") ?? ""} ${node.getAttribute("d") ?? ""}`
      for (const fraction of fractionsIn(text)) {
        expect(fraction.length, `${fraction} in ${text}`).toBeLessThanOrEqual(4)
      }
    }
  })
})
