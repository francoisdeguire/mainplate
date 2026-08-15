// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Arc } from "./arc"
import { Dial } from "./dial"
import { Mainplate, useFrame } from "./frame"
import { Hand } from "./hand"
import { Numerals } from "./numerals"
import { circleOutline, rectOutline } from "./outline"
import { Place } from "./place"
import { createSource, type Source } from "./source"
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

/**
 * The shape §14.2's formatter takes: module scope, stable identity. An inline
 * closure would be a fresh effect dependency per render and churn the live
 * subscription — the same reason `<Hand>` detaches `subscribe` and `get`.
 */
const kmh = (v: number) => `${Math.round(v)} km/h`

/**
 * Mimics the `time/` label helper of §14.1: an hours-with-fraction reading
 * formatted as a clock. Core never learns what the number means — the caller
 * carries the meaning in, as a function.
 */
const asClock = (v: number) => {
  const h = Math.floor(v)
  const m = Math.floor((v - h) * 60)
  return `${h}:${String(m).padStart(2, "0")}`
}

describe("<Mainplate> — the meter role (§14.2)", () => {
  const svgOf = (container: HTMLElement) => {
    const svg = container.querySelector("svg")
    if (svg === null) throw new Error("no <svg> rendered")
    return svg
  }

  it("opts into role=meter and carries all four ARIA values", () => {
    const { container } = render(
      <Mainplate min={0} max={220} value={88} valueText={kmh} label="Speed" />,
    )
    const svg = svgOf(container)
    expect(svg.getAttribute("role")).toBe("meter")
    expect(svg.getAttribute("aria-valuemin")).toBe("0")
    expect(svg.getAttribute("aria-valuemax")).toBe("220")
    expect(svg.getAttribute("aria-valuenow")).toBe("88")
    expect(svg.getAttribute("aria-valuetext")).toBe("88 km/h")
    // A meter still needs an accessible name; the label survives the role.
    expect(svg.getAttribute("aria-label")).toBe("Speed")
  })

  it("stays one image without a value: role img, no meter attributes", () => {
    const svg = svgOf(render(<Mainplate />).container)
    expect(svg.getAttribute("role")).toBe("img")
    for (const attr of ["aria-valuenow", "aria-valuemin", "aria-valuemax", "aria-valuetext"]) {
      expect(svg.getAttribute(attr)).toBeNull()
    }
  })

  it("omits aria-valuetext when the caller supplies no formatter", () => {
    const svg = svgOf(render(<Mainplate min={0} max={220} value={88} />).container)
    expect(svg.getAttribute("aria-valuenow")).toBe("88")
    // Redundant valuetext is worse than none: it would freeze a screen
    // reader's phrasing to whatever the number happened to say.
    expect(svg.getAttribute("aria-valuetext")).toBeNull()
  })

  it("takes its bounds from source.domain when the source declares one", () => {
    // An hour24 clock source spans 0–24 while a watch frame spans 0–60: the
    // meter must report the value's own span, not the dial's printed one.
    const s = createSource(10.16, { min: 0, max: 24 })
    const svg = svgOf(render(<Mainplate min={0} max={60} value={s} />).container)
    expect(svg.getAttribute("aria-valuemin")).toBe("0")
    expect(svg.getAttribute("aria-valuemax")).toBe("24")
    // Rounded to the meter grid for a 24-unit span: a tenth of an hour.
    expect(svg.getAttribute("aria-valuenow")).toBe("10.2")
  })

  it("falls back to the frame's min/max when the source declares no domain", () => {
    const s = createSource(88)
    const svg = svgOf(render(<Mainplate min={0} max={220} value={s} />).container)
    expect(svg.getAttribute("aria-valuemin")).toBe("0")
    expect(svg.getAttribute("aria-valuemax")).toBe("220")
    expect(svg.getAttribute("aria-valuenow")).toBe("88")
  })

  it("keeps aria-valuenow live through set, at zero React renders", () => {
    // §14.2's whole point: an accessible value frozen at first render is a
    // screen reader confidently reporting a stale number. The sequence must
    // become *correct* after each set — and the Profiler must see exactly the
    // mount, since the writes ride the ref path, not a render.
    const s = createSource(88, { min: 0, max: 220 })
    const commits: string[] = []
    const { container } = render(
      <Profiler id="face" onRender={(_, phase) => commits.push(phase)}>
        <Mainplate value={s} valueText={kmh} label="Speed" />
      </Profiler>,
    )
    const svg = svgOf(container)
    expect(svg.getAttribute("aria-valuenow")).toBe("88")
    expect(svg.getAttribute("aria-valuetext")).toBe("88 km/h")
    expect(commits).toEqual(["mount"])

    act(() => s.set(120))
    expect(svg.getAttribute("aria-valuenow")).toBe("120")
    expect(svg.getAttribute("aria-valuetext")).toBe("120 km/h")

    act(() => s.set(140))
    expect(svg.getAttribute("aria-valuenow")).toBe("140")
    expect(svg.getAttribute("aria-valuetext")).toBe("140 km/h")
    expect(commits).toEqual(["mount"])
  })

  it("writes only when the reported text changes — tick cadence from a glide feed", () => {
    // core/ cannot ask a source its cadence (§16), so tick cadence is
    // structural: aria-valuenow is reported on a grid of about a hundred
    // graduations, and a notification that does not move the text writes
    // nothing. A glide source notifying sixty times a second therefore
    // mutates the accessibility tree about once per grid step.
    const s = createSource(10, { min: 0, max: 60 })
    const { container } = render(<Mainplate value={s} />)
    const svg = svgOf(container)
    const spy = vi.spyOn(svg, "setAttribute")

    // Sub-step movement — what a glide frame delivers: same graduation.
    act(() => s.set(10.2))
    act(() => s.set(10.4))
    expect(spy.mock.calls.filter(([name]) => name === "aria-valuenow")).toEqual([])

    // Crossing a graduation writes exactly once, and writes the right text.
    act(() => s.set(11.02))
    expect(spy.mock.calls.filter(([name]) => name === "aria-valuenow")).toEqual([
      ["aria-valuenow", "11"],
    ])
  })

  it("formats aria-valuetext through the caller's helper, live on the ref path", () => {
    // §14.1: a clock's reading is the caller's to phrase — core cannot know
    // 10.16 hours means "10:09". The helper gets the raw value, so its own
    // precision decides how often the text actually changes.
    const s = createSource(10.16, { min: 0, max: 24 })
    const svg = svgOf(render(<Mainplate value={s} valueText={asClock} label="Clock" />).container)
    expect(svg.getAttribute("aria-valuetext")).toBe("10:09")
    act(() => s.set(10.5))
    expect(svg.getAttribute("aria-valuetext")).toBe("10:30")
  })

  it("never announces: no aria-live anywhere, before or after a set (§14.1)", () => {
    // Fresh-when-queried, never spoken unprompted: a clock announcing every
    // minute is spam. One mutation adds aria-live="polite"; this catches it.
    const s = createSource(30, { min: 0, max: 60 })
    const { container } = render(
      <Mainplate value={s} valueText={kmh}>
        <Hand value={s} />
      </Mainplate>,
    )
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(0)
    act(() => s.set(45))
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(0)
  })

  it("serialises the meter's current value on the server, ready to hydrate", () => {
    // No effect runs on the server: the render path alone must carry the
    // accessible value, exactly as it carries a hand's rotation.
    const s = createSource(88, { min: 0, max: 220 })
    const html = renderToStaticMarkup(<Mainplate value={s} valueText={kmh} />)
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-valuenow="88"')
    expect(html).toContain('aria-valuetext="88 km/h"')
  })

  it("subscribes once on mount and runs the teardown on unmount", () => {
    // Observed as the teardown running, not as "set after unmount does not
    // throw" — the vacuous form passes whether or not the cleanup exists.
    const s = createSource(88, { min: 0, max: 220 })
    const calls = { subscribes: 0, teardowns: 0 }
    const spied: Source<number> = {
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
    const { unmount } = render(<Mainplate value={spied} />)
    expect(calls).toEqual({ subscribes: 1, teardowns: 0 })
    unmount()
    expect(calls).toEqual({ subscribes: 1, teardowns: 1 })
  })
})
