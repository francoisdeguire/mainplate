// @vitest-environment jsdom
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Arc } from "./arc"
import { Dial } from "./dial"
import { Mainplate, useFrame } from "./frame"
import { Hand } from "./hand"
import { Numerals } from "./numerals"
import { circleOutline, rectOutline } from "./outline"
import { Place } from "./place"
import { Subdial } from "./subdial"
import { Ticks } from "./ticks"

function Probe({ onFrame }: { onFrame: (v: ReturnType<typeof useFrame>) => void }) {
  onFrame(useFrame())
  return null
}

describe("<Mainplate>", () => {
  it("renders an svg whose viewBox hugs the outline when it clips", () => {
    const { container } = render(<Mainplate />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("viewBox")).toBe("-100 -100 200 200")
  })

  it("derives a non-square viewBox from a non-square outline", () => {
    const { container } = render(<Mainplate outline={rectOutline({ ratio: 0.5 })} padding={0} />)
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("-100 -200 200 400")
  })

  it("is fluid when size is omitted", () => {
    const { container } = render(<Mainplate />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("width")).toBeNull()
    expect(svg?.style.width).toBe("100%")
  })

  it("sets an explicit width and a proportional height when size is given", () => {
    const { container } = render(<Mainplate size={320} />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("width")).toBe("320")
    expect(svg?.getAttribute("height")).toBe("320")
  })

  it("accepts an outline as a name, a descriptor, or a factory object", () => {
    const viewBoxOf = (ui: ReactElement) =>
      render(ui).container.querySelector("svg")?.getAttribute("viewBox")

    // All three spell the same 0.5-ratio rect, so all three must agree.
    const expected = "-100 -200 200 400"
    expect(viewBoxOf(<Mainplate outline={{ kind: "rect", ratio: 0.5 }} padding={0} />)).toBe(
      expected,
    )
    expect(viewBoxOf(<Mainplate outline={rectOutline({ ratio: 0.5 })} padding={0} />)).toBe(
      expected,
    )

    // The bare names take their factory defaults.
    expect(viewBoxOf(<Mainplate outline="rect" padding={0} />)).toBe("-100 -100 200 200")
    expect(viewBoxOf(<Mainplate outline="circle" padding={0} />)).toBe("-100 -100 200 200")
    expect(viewBoxOf(<Mainplate outline={{ kind: "circle" }} padding={0} />)).toBe(
      "-100 -100 200 200",
    )
  })

  it("carries a part attribute and an img role", () => {
    const { container } = render(<Mainplate />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("data-mp")).toBe("mainplate")
    expect(svg?.getAttribute("role")).toBe("img")
  })

  it("uses a static default label that the caller can override", () => {
    const { container: a } = render(<Mainplate />)
    expect(a.querySelector("svg")?.getAttribute("aria-label")).toBe("Instrument face")
    const { container: b } = render(<Mainplate label="Speedometer" />)
    expect(b.querySelector("svg")?.getAttribute("aria-label")).toBe("Speedometer")
  })
})

describe("padding's default follows clip", () => {
  const viewBoxOf = (ui: ReactElement) =>
    render(ui).container.querySelector("svg")?.getAttribute("viewBox")

  it("reserves nothing when clipping, and 10 dial units when clipping is off", () => {
    // Clipped, nothing may be drawn outside the outline, so reserving room out
    // there is dead space: the viewBox hugs the outline instead.
    expect(viewBoxOf(<Mainplate />)).toBe("-100 -100 200 200")
    expect(viewBoxOf(<Mainplate clip={false} />)).toBe("-110 -110 220 220")
  })

  it("lets an explicit padding win in both cases", () => {
    expect(viewBoxOf(<Mainplate padding={20} />)).toBe("-120 -120 240 240")
    expect(viewBoxOf(<Mainplate clip={false} padding={0} />)).toBe("-100 -100 200 200")
  })

  it("carries the conditional default into the rendered height", () => {
    const heightOf = (ui: ReactElement) =>
      render(ui).container.querySelector("svg")?.getAttribute("height")

    // A Tank is 200 x 256.41 dial units. Clipped, size 200 is the whole width,
    // so the height is the full outline; unclipped, both gain 20 units.
    const tank = { kind: "rect", ratio: 0.78 } as const
    expect(heightOf(<Mainplate outline={tank} size={200} />)).toBe("256")
    expect(heightOf(<Mainplate outline={tank} size={200} clip={false} />)).toBe("251")
  })
})

describe("<Mainplate clip>", () => {
  const clipPathOf = (container: HTMLElement) => container.querySelector("clipPath")
  const clippedGroup = (container: HTMLElement) => container.querySelector("g[clip-path]")

  it("clips by default, with the group pointing at the clipPath it emits", () => {
    const { container } = render(
      <Mainplate>
        <circle r={4} />
      </Mainplate>,
    )
    const clipPath = clipPathOf(container)
    const group = clippedGroup(container)
    expect(clipPath).not.toBeNull()
    expect(group?.getAttribute("clip-path")).toBe(`url(#${clipPath?.id})`)
    expect(container.querySelector("circle")?.parentElement).toBe(group)
  })

  it("clips to the outline's own path at inset 0, not to its bbox", () => {
    const { container: round } = render(<Mainplate />)
    expect(clipPathOf(round)?.querySelector("path")?.getAttribute("d")).toBe(circleOutline().path())

    const tank = rectOutline({ ratio: 0.78, radius: 12 })
    const { container: rect } = render(<Mainplate outline={tank} />)
    expect(clipPathOf(rect)?.querySelector("path")?.getAttribute("d")).toBe(tank.path())
  })

  it("emits no clipPath, no defs and no wrapper group when clip is false", () => {
    const { container } = render(
      <Mainplate clip={false} padding={0}>
        <circle r={4} />
      </Mainplate>,
    )
    expect(clipPathOf(container)).toBeNull()
    expect(container.querySelector("defs")).toBeNull()
    expect(container.querySelector("g")).toBeNull()
    expect(container.querySelector("circle")?.parentElement?.tagName).toBe("svg")
  })

  it("gives two faces on one page distinct clipPath ids", () => {
    const { container } = render(
      <>
        <Mainplate />
        <Mainplate outline="rect" />
      </>,
    )
    const ids = [...container.querySelectorAll("clipPath")].map((node) => node.id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    expect(ids.every(Boolean)).toBe(true)

    // Each group must reference its own face's path, not the first one's.
    const refs = [...container.querySelectorAll("g[clip-path]")].map((node) =>
      node.getAttribute("clip-path"),
    )
    expect(refs).toEqual(ids.map((id) => `url(#${id})`))
  })

  it("puts content that overhangs the outline inside the clip, and outside it when off", () => {
    // cy -130 is well past the r=100 outline: visible only if nothing clips it.
    const overhang = <circle data-mp-test="overhang" cx={0} cy={-130} r={8} />

    const { container: on } = render(<Mainplate padding={40}>{overhang}</Mainplate>)
    expect(clippedGroup(on)?.contains(on.querySelector("[data-mp-test]"))).toBe(true)

    const { container: off } = render(
      <Mainplate padding={40} clip={false}>
        {overhang}
      </Mainplate>,
    )
    expect(clippedGroup(off)).toBeNull()
    expect(off.querySelector("[data-mp-test]")?.parentElement?.tagName).toBe("svg")
  })
})

describe("the clip/padding dev warning", () => {
  // Each case takes a padding of its own: the warning is deduplicated by
  // message, so a shared value would let one test silence the next.
  const warnings = () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    return () => spy.mock.calls.map(([first]) => String(first))
  }

  afterEach(() => vi.restoreAllMocks())

  it("stays silent on a bare <Mainplate>, whose defaults no longer contradict", () => {
    const said = warnings()
    render(<Mainplate />)
    render(
      <Mainplate size={200}>
        <circle r={4} />
      </Mainplate>,
    )
    expect(said()).toEqual([])
  })

  it("says padding is unusable when clipping is on", () => {
    const said = warnings()
    render(<Mainplate padding={37} />)
    expect(said()).toHaveLength(1)
    expect(said()[0]).toMatch(/^mainplate: /)
    expect(said()[0]).toContain("37")
    expect(said()[0]).toContain("clip={false}")
  })

  it("stays quiet when clip is off, or when no room is reserved", () => {
    const said = warnings()
    render(<Mainplate padding={38} clip={false} />)
    render(<Mainplate padding={0} />)
    expect(said()).toEqual([])
  })

  it("says it once, not once per render", () => {
    const said = warnings()
    const { rerender } = render(<Mainplate padding={39} />)
    rerender(<Mainplate padding={39} label="again" />)
    rerender(<Mainplate padding={39} label="and again" />)
    expect(said()).toHaveLength(1)
  })
})

describe("useFrame", () => {
  it("exposes the frame and maps values to angles", () => {
    let seen: ReturnType<typeof useFrame> | undefined
    render(
      <Mainplate max={60}>
        <Probe
          onFrame={(v) => {
            seen = v
          }}
        />
      </Mainplate>,
    )
    expect(seen?.frame.max).toBe(60)
    expect(seen?.angleFor(15)).toBeCloseTo(90, 9)
  })

  it("accepts a local scale override without mutating the frame", () => {
    let seen: ReturnType<typeof useFrame> | undefined
    render(
      <Mainplate max={60}>
        <Probe
          onFrame={(v) => {
            seen = v
          }}
        />
      </Mainplate>,
    )
    expect(seen?.angleFor(3, { max: 12 })).toBeCloseTo(90, 9)
    expect(seen?.frame.max).toBe(60)
  })

  it("throws a useful message outside a frame", () => {
    expect(() => render(<Probe onFrame={() => {}} />)).toThrow(/must be used inside <Mainplate>/)
  })
})

describe("data-mp is the library's, not the caller's", () => {
  it("keeps every primitive's static data-mp when a spread tries to override it", () => {
    // TypeScript's data-* excess-property exemption lets `data-mp="evil"`
    // through on every one of these despite being undeclared — the type
    // cannot refuse it, so the second lock after the props spread has to.
    const { container } = render(
      <Mainplate data-mp="evil" max={60}>
        <Dial data-mp="evil" />
        <Ticks data-mp="evil" count={4} />
        <Ticks
          data-mp="evil"
          count={4}
          renderItem={({ point }) => <circle cx={point.x} cy={point.y} r={1} />}
        />
        <Numerals data-mp="evil" count={4} />
        <Numerals
          data-mp="evil"
          count={4}
          renderItem={({ point }) => <circle cx={point.x} cy={point.y} r={1} />}
        />
        <Arc data-mp="evil" r={80} />
        <Hand data-mp="evil" value={30} />
        <Place data-mp="evil" at="3h" />
        <Subdial data-mp="evil" at="9h" inset={50} r={26} />
      </Mainplate>,
    )
    expect(container.querySelector('[data-mp="evil"]')).toBeNull()
    const names = ["mainplate", "dial", "ticks", "numerals", "arc", "hand", "place", "subdial"]
    for (const name of names) {
      expect(container.querySelector(`[data-mp="${name}"]`)).not.toBeNull()
    }
  })
})
