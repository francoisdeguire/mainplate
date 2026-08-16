// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createSource } from "../core/source"
import { Clock } from "./clock"
import { Gauge } from "./gauge"
import { Hand } from "./parts"

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
    const fill = container.querySelector('[data-mp="sweep"]')
    if (fill === null) throw new Error("no sweep fill")
    // An empty sweep draws nothing at all; the first write arrives on mount.
    expect(fill.getAttribute("d")).toBe("")
    act(() => {
      src.set(50)
    })
    const drawn = fill.getAttribute("d") ?? ""
    expect(drawn).toMatch(/^M /)
    expect(onRender).toHaveBeenCalledTimes(1)
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
    expect(needle.style.height).toBe("41.8182cqw")
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
