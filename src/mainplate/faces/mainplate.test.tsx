// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dialPercent, polar } from "../core"
import { createSource, type Source } from "../core/source"
import { getTicker } from "../time/ticker"
import { useWatchSource } from "../time/use-watch-source"
import { Mainplate } from "./mainplate"
import { Cap, Dial, Hand, Numerals, Ticks } from "./parts"

/** 2026-01-15 03:30:00.000 UTC — hour 105°, minute 180°, second 0°. */
const T_0330 = Date.UTC(2026, 0, 15, 3, 30, 0)

/** 03:30:36.400 UTC — the .4 makes raw (unquantised) angles long floats. */
const T_CAD = Date.UTC(2026, 0, 15, 3, 30, 36) + 400

/**
 * Hand-rolled rAF harness, same shape as the time layer's tests: frames fire
 * only when told to, and only inside `act()`.
 */
let rafQueue: Map<number, FrameRequestCallback>
let nextRafId: number
let raf: ReturnType<typeof vi.fn>

/**
 * Advance the fake clock, then run every frame callback queued before the
 * advance — INSIDE `act()`. That wrap is load-bearing, not hygiene: outside an
 * act scope React defers any state update a subscriber schedules, so a
 * component that re-rendered on every tick would still look like it rendered
 * once. Mutation (a) of this task exists to prove this helper discriminates.
 */
function fireFrame(advanceMs: number) {
  act(() => {
    vi.advanceTimersByTime(advanceMs)
    const due = [...rafQueue.values()]
    rafQueue.clear()
    for (const cb of due) cb(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T_0330)
  rafQueue = new Map()
  nextRafId = 1
  raf = vi.fn((cb: FrameRequestCallback) => {
    const id = nextRafId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal("requestAnimationFrame", raf)
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      rafQueue.delete(id)
    }),
  )
})

afterEach(() => {
  getTicker().stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Same fake as the time tests: fires only when told, dies when disconnected. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed: Element[] = []
  disconnected = false
  private cb: (entries: { isIntersecting: boolean }[]) => void
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    this.cb = cb
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((e) => e !== el)
  }
  disconnect() {
    this.disconnected = true
    this.observed = []
  }
  trigger(isIntersecting: boolean) {
    if (this.disconnected) return
    this.cb([{ isIntersecting }])
  }
}

/** The rotation an element wears, parsed out of its written transform. */
function rotationOf(el: Element): number {
  const style = el.getAttribute("style") ?? ""
  const match = style.match(/rotate\((-?[\d.]+)deg\)/)
  if (match === null || match[1] === undefined) {
    throw new Error(`no rotation in ${JSON.stringify(style)}`)
  }
  return Number(match[1])
}

function handsOf(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-mp="hand"]')]
}

function numeralsOf(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-mp="numeral"]')]
}

/**
 * A source whose subscriptions are countable — how the observe tests see a
 * hand release its engine while the face is offscreen.
 */
function countingSource(initial: number, domain: { min: number; max: number }) {
  const inner = createSource(initial, domain)
  let active = 0
  const source: Source<number> = {
    domain,
    get: inner.get,
    subscribe: (cb) => {
      active += 1
      const off = inner.subscribe(cb)
      return () => {
        active -= 1
        off()
      }
    },
  }
  return { source, set: inner.set, subscriptions: () => active }
}

describe("<Mainplate> — the context root", () => {
  it("is an HTML div with role img and the given label", () => {
    const { getByRole } = render(<Mainplate label="Analog clock" />)
    const root = getByRole("img")
    expect(root.tagName).toBe("DIV")
    expect(root.getAttribute("aria-label")).toBe("Analog clock")
  })

  it("carries the palette as CSS variables ramping off the inherited ink", () => {
    const { getByRole } = render(<Mainplate label="x" />)
    const style = getByRole("img").style
    // currentColor is the whole dark-ground story: a dark app's light ink
    // produces light ramps with no prop — capability tested here, in jsdom,
    // never showcased in a demo.
    expect(style.getPropertyValue("--mp-ink")).toBe("currentColor")
    expect(style.getPropertyValue("--mp-accent")).toBe("oklch(0.62 0.19 27)")
    expect(style.getPropertyValue("--mp-dial")).toBe("oklch(from currentColor l c h / 0.05)")
    expect(style.getPropertyValue("--mp-tick-major")).toBe("oklch(from currentColor l c h / 0.78)")
  })

  it("derives the palette from the color prop, in CSS", () => {
    const { getByRole } = render(<Mainplate label="x" color="oklch(0.45 0.16 264)" />)
    const style = getByRole("img").style
    expect(style.getPropertyValue("--mp-ink")).toBe("oklch(0.45 0.16 264)")
    expect(style.getPropertyValue("--mp-accent")).toContain("oklch(from oklch(0.45 0.16 264)")
  })

  it("spreads standard HTML attributes and merges className and style", () => {
    const { getByRole } = render(
      <Mainplate
        label="x"
        className="w-40"
        id="face-1"
        data-testid="f"
        style={{ margin: "4px" }}
      />,
    )
    const root = getByRole("img")
    expect(root.className).toBe("w-40")
    expect(root.id).toBe("face-1")
    expect(root.getAttribute("data-testid")).toBe("f")
    expect(root.style.margin).toBe("4px")
    // The consumer's style merges over the defaults without erasing them.
    expect(root.style.getPropertyValue("--mp-ink")).toBe("currentColor")
  })

  it("throws the branded error when a part renders outside it", () => {
    expect(() => render(<Hand value={10} />)).toThrow(/mainplate:/)
  })
})

describe("re-pinning frameBox/dialPercent from faces' side (Task 1 carry)", () => {
  it("puts a known dial point at the hand-computed percentage of the face box", () => {
    // The 12 o'clock major tick: angle 0, centred at inset 8.5 → dial point
    // (0, -91.5). Box = circle bbox 200 grown by the unclipped padding 10 a
    // side → 220. top = 50 + 100·(−91.5)/220 = 8.4091%.
    const { container } = render(
      <Mainplate label="x">
        <Ticks />
      </Mainplate>,
    )
    const first = container.querySelector<HTMLElement>('[data-mp="tick"]')
    if (first === null) throw new Error("no tick rendered")
    expect(first.style.left).toBe("50%")
    expect(first.style.top).toBe("8.4091%")
  })

  it("agrees with the engine's own dialPercent for the same point", () => {
    // Two independent code paths — layer.ts and faces/geometry.ts — must map
    // the same dial point to the same percentages, under the same padding
    // default the face uses (clip: false → 10).
    const { container } = render(
      <Mainplate label="x">
        <Ticks />
      </Mainplate>,
    )
    const first = container.querySelector<HTMLElement>('[data-mp="tick"]')
    if (first === null) throw new Error("no tick rendered")
    const expected = dialPercent(polar(0, 91.5), { clip: false })
    expect(first.style.left).toBe(expected.left)
    expect(first.style.top).toBe(expected.top)
  })
})

describe("<Ticks> — the default track pair", () => {
  it("renders 60 marks by default: 12 majors on the hour angles, 48 minors", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks />
      </Mainplate>,
    )
    const marks = container.querySelectorAll('[data-mp="tick"]')
    expect(marks).toHaveLength(60)
  })

  it("keeps only 12/3/6/9 under variant='quarters'", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks variant="quarters" />
      </Mainplate>,
    )
    const marks = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
    expect(marks).toHaveLength(4)
    // Edge orientation comes back through atan2, so 270 reads as the visually
    // identical -90; compare wrapped.
    expect(marks.map((m) => ((rotationOf(m) % 360) + 360) % 360)).toEqual([0, 90, 180, 270])
  })

  it("paints majors and minors from the palette ramp", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks />
      </Mainplate>,
    )
    const marks = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
    const majors = marks.filter((m) => m.style.background === "var(--mp-tick-major)")
    const minors = marks.filter((m) => m.style.background === "var(--mp-tick)")
    expect(majors).toHaveLength(12)
    expect(minors).toHaveLength(48)
  })
})

describe("<Ticks> — composable tracks", () => {
  /** Every mark's rotation, wrapped into [0, 360) — `atan2` reports 270 as −90. */
  function anglesOf(container: ParentNode, selector = '[data-mp="tick"]'): number[] {
    return [...container.querySelectorAll<HTMLElement>(selector)].map(
      (m) => ((rotationOf(m) % 360) + 360) % 360,
    )
  }

  it("expresses the classic minute+hour layout as two stacked tracks", () => {
    // The tiers replacement, in the form the spec calls for: a 60-mark minute
    // track with a hole every fifth minute, and a 12-mark hour track standing
    // in those holes. Two elements, no merge rule, no later-tier-wins.
    const { container } = render(
      <Mainplate label="x">
        <Ticks count={60} skip={(v) => v % 5 === 0} className="minor" />
        <Ticks count={12} length={9} width={2.4} className="major" />
      </Mainplate>,
    )
    const minors = anglesOf(container, ".minor")
    const majors = anglesOf(container, ".major")
    // The hole count, exactly: sixty minus the twelve the skip carved.
    expect(minors).toHaveLength(48)
    expect(majors).toHaveLength(12)
    expect(container.querySelectorAll('[data-mp="tick"]')).toHaveLength(60)

    // And the holes are at the skipped values, not merely twelve of them: every
    // surviving minor is a multiple of 6° that is not a multiple of 30°.
    const expected = [...Array(60).keys()].filter((i) => i % 5 !== 0).map((i) => i * 6)
    expect(minors).toEqual(expected)
    expect(majors).toEqual([...Array(12).keys()].map((i) => i * 30))
    // No minor hides under a major — the whole point of carving the holes.
    expect(minors.filter((a) => majors.includes(a))).toEqual([])
  })

  it("skip also takes a list of domain values", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks count={12} skip={[0, 6]} />
      </Mainplate>,
    )
    const angles = anglesOf(container)
    expect(angles).toHaveLength(10)
    expect(angles).not.toContain(0)
    expect(angles).not.toContain(180)
  })

  it("every steps by domain units across from/to, dropping the mark that closes the ring", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks every={15} from={0} to={60} />
      </Mainplate>,
    )
    // 0, 15, 30, 45 — and not the 60 that would land on top of the 0.
    expect(anglesOf(container)).toEqual([0, 90, 180, 270])
  })

  it("count populates evenly across a bounded sweep, endpoints inclusive", () => {
    // The gauge's own track: 21 graduations over 270°, the first at the sweep's
    // start and the last at its end. An open arc has two distinct endpoints, so
    // both are drawn — a full ring's would coincide and one is dropped.
    const { container } = render(
      <Mainplate label="x">
        <Ticks count={21} startAngle={-135} sweepAngle={270} />
      </Mainplate>,
    )
    const marks = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
    expect(marks).toHaveLength(21)
    const angles = marks.map(rotationOf)
    expect(angles[0]).toBe(-135)
    expect(angles[20]).toBe(135)
    expect(angles[1]).toBe(-121.5) // 270/20 = 13.5° a step
    // Nothing outside the sweep: the bottom gap stays empty.
    for (const a of angles) expect(Math.abs(a)).toBeLessThanOrEqual(135)
  })

  it("every honours a bounded sweep too, keeping the closing mark", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks every={10} from={0} to={100} startAngle={-135} sweepAngle={270} />
      </Mainplate>,
    )
    const angles = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')].map(rotationOf)
    expect(angles).toHaveLength(11)
    expect(angles[0]).toBe(-135)
    expect(angles[10]).toBe(135)
  })

  it("render replaces each mark's content and keeps its geometry", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks count={4} render={(value, mark) => <span>{`${value}@${mark.angle}`}</span>} />
      </Mainplate>,
    )
    const marks = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
    expect(marks.map((m) => m.textContent)).toEqual(["0@0", "1@90", "2@180", "3@270"])
    // Position and rotation stay the part's — the Numerals contract, verbatim.
    expect(marks.map(rotationOf).map((a) => ((a % 360) + 360) % 360)).toEqual([0, 90, 180, 270])
    expect(marks[0]?.style.left).toBe("50%")
    // The default bar is gone: a custom mark is the mark, not a decoration on
    // top of one.
    expect(marks[0]?.style.background).toBe("")
  })

  it("an explicit track paints from the minor ramp, and unstyled strips it", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks count={4} />
      </Mainplate>,
    )
    const mark = container.querySelector<HTMLElement>('[data-mp="tick"]')
    expect(mark?.style.background).toBe("var(--mp-tick)")
    expect(mark?.style.borderRadius).toBe("999px")

    const { container: bare } = render(
      <Mainplate label="x" unstyled>
        <Ticks count={4} />
      </Mainplate>,
    )
    const plain = bare.querySelector<HTMLElement>('[data-mp="tick"]')
    expect(plain?.style.background).toBe("")
    expect(plain?.style.borderRadius).toBe("")
  })

  it("every without a domain to step across says so", () => {
    expect(() =>
      render(
        <Mainplate label="x">
          <Ticks every={5} />
        </Mainplate>,
      ),
    ).toThrow(/mainplate:/)
  })

  it("values places exactly the marks it lists, at their own angles", () => {
    // The non-uniform scale: a tachymeter, a log axis, a face that marks the
    // three readings that matter. `count` and `every` cannot say this, and
    // populating the whole domain to skip all but four of it is a workaround.
    const { container } = render(
      <Mainplate label="x">
        <Ticks values={[0, 10, 25, 45]} to={60} />
      </Mainplate>,
    )
    expect(anglesOf(container)).toEqual([0, 60, 150, 270])
  })

  it("values maps through a bounded sweep like every other population", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks values={[0, 50, 100, 150, 220]} to={220} startAngle={-135} sweepAngle={270} />
      </Mainplate>,
    )
    const angles = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')].map(rotationOf)
    expect(angles).toEqual([-135, -73.6364, -12.2727, 49.0909, 135])
  })

  it("values with no `to` spans the list: the largest lands at the sweep's end", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks values={[0, 25, 50]} startAngle={-90} sweepAngle={180} />
      </Mainplate>,
    )
    const angles = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')].map(rotationOf)
    expect(angles).toEqual([-90, 0, 90])
  })

  it("skip and render compose with values", () => {
    const { container } = render(
      <Mainplate label="x">
        <Ticks values={[0, 10, 25, 45]} to={60} skip={[10]} render={(v) => <span>{v}</span>} />
      </Mainplate>,
    )
    const marks = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
    expect(marks.map((m) => m.textContent)).toEqual(["0", "25", "45"])
    expect(marks.map(rotationOf).map((a) => ((a % 360) + 360) % 360)).toEqual([0, 150, 270])
  })

  it("values and count together say so rather than picking one quietly", () => {
    expect(() =>
      render(
        <Mainplate label="x">
          <Ticks values={[0, 1]} count={4} />
        </Mainplate>,
      ),
    ).toThrow(/mainplate:/)
  })

  it("the default variant is those same two tracks, placed by angle", () => {
    // The strengthening this task's placement change earns: on a shaped face,
    // angular placement puts the minute at value 5 exactly under the hour mark
    // at value 5, and perimeter placement does not. `radial` reports the
    // placement angle verbatim, so the marks can be read straight off.
    const { container } = render(
      <Mainplate label="x" shape={{ ratio: 0.82, radius: 30 }}>
        <Ticks orient="radial" />
      </Mainplate>,
    )
    const angles = anglesOf(container)
    expect(angles).toHaveLength(60)
    expect([...angles].sort((a, b) => a - b)).toEqual([...Array(60).keys()].map((i) => i * 6))
  })
})

describe("<Numerals> — the numeral track, with orientation", () => {
  /**
   * Rotation wrapped into [0, 360). `radial` reports its placement angle
   * verbatim, but `tangential` is derived from the outward normal through
   * `atan2`, so 270° legitimately comes back as the visually identical −90.
   */
  function turnOf(el: Element): number {
    return ((rotationOf(el) % 360) + 360) % 360
  }

  it("renders twelve numerals on the hour angles, the 12 at the top", () => {
    const { container } = render(
      <Mainplate label="x">
        <Numerals />
      </Mainplate>,
    )
    const marks = numeralsOf(container)
    expect(marks).toHaveLength(12)
    expect(marks.map((m) => m.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ])
    // Angular placement, the same query the hour majors use: the 12 sits on
    // the 0° ray and the 3 on the 90° ray, both at the numeral track's radius
    // (100 − inset 22 = 78).
    const twelve = marks[11]
    const three = marks[2]
    if (twelve === undefined || three === undefined) throw new Error("missing numerals")
    expect({ left: twelve.style.left, top: twelve.style.top }).toEqual(
      dialPercent(polar(0, 78), { clip: false }),
    )
    expect({ left: three.style.left, top: three.style.top }).toEqual(
      dialPercent(polar(90, 78), { clip: false }),
    )
  })

  it("is upright by default: no numeral ever turns", () => {
    const { container } = render(
      <Mainplate label="x">
        <Numerals />
      </Mainplate>,
    )
    expect(numeralsOf(container).map(rotationOf)).toEqual(Array(12).fill(0))
  })

  it("orient='radial' turns each numeral to its own angle", () => {
    const { container } = render(
      <Mainplate label="x">
        <Numerals orient="radial" />
      </Mainplate>,
    )
    // 1 → 30°, … 11 → 330°, 12 → 0°: the numeral's own axis lies along the ray
    // it sits on, which is the classic wrapped-around-the-dial look.
    expect(numeralsOf(container).map(rotationOf)).toEqual([
      30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 0,
    ])
  })

  it("orient='tangential' turns each numeral a quarter turn past its angle", () => {
    const { container } = render(
      <Mainplate label="x">
        <Numerals orient="tangential" />
      </Mainplate>,
    )
    // The shared `tangent` vocabulary: edge + 90, i.e. the numeral's own axis
    // follows the tangent in the direction of travel (clockwise). On a circle
    // that is exactly angle + 90.
    expect(numeralsOf(container).map(turnOf)).toEqual([
      120, 150, 180, 210, 240, 270, 300, 330, 0, 30, 60, 90,
    ])
  })

  it("roman uses IIII, the watchmaker's four", () => {
    const { container } = render(
      <Mainplate label="x">
        <Numerals variant="roman" />
      </Mainplate>,
    )
    const labels = numeralsOf(container).map((m) => m.textContent)
    expect(labels[3]).toBe("IIII")
    expect(labels).not.toContain("IV")
    expect(labels).toEqual([
      "I",
      "II",
      "III",
      "IIII",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
      "XII",
    ])
  })

  it("quarters keeps 12/3/6/9 only", () => {
    const { container } = render(
      <Mainplate label="x">
        <Numerals variant="quarters" />
      </Mainplate>,
    )
    const marks = numeralsOf(container)
    expect(marks.map((m) => m.textContent)).toEqual(["3", "6", "9", "12"])
    expect(marks.map((m) => m.style.top)).toEqual(
      [90, 180, 270, 0].map((a) => dialPercent(polar(a, 78), { clip: false }).top),
    )
  })

  it("render replaces each numeral's content and keeps the engine's placement", () => {
    const { container: plain } = render(
      <Mainplate label="x">
        <Numerals variant="roman" />
      </Mainplate>,
    )
    const { container } = render(
      <Mainplate label="x">
        <Numerals variant="roman" render={(value, { label }) => <b>{`${label}·${value}`}</b>} />
      </Mainplate>,
    )
    const marks = numeralsOf(container)
    expect(marks.map((m) => m.textContent)).toEqual([
      "I·1",
      "II·2",
      "III·3",
      "IIII·4",
      "V·5",
      "VI·6",
      "VII·7",
      "VIII·8",
      "IX·9",
      "X·10",
      "XI·11",
      "XII·12",
    ])
    expect(marks.every((m) => m.querySelector("b") !== null)).toBe(true)
    // Position and rotation stay the engine's — `render` owns the content and
    // nothing else, exactly as `<Ticks render>` will.
    expect(marks.map((m) => m.style.top)).toEqual(
      numeralsOf(plain).map((m: HTMLElement) => m.style.top),
    )
  })

  it("inset moves the whole track, keeping the angles", () => {
    const { container } = render(
      <Mainplate label="x">
        <Numerals inset={34} />
      </Mainplate>,
    )
    const twelve = numeralsOf(container)[11]
    if (twelve === undefined) throw new Error("no 12")
    expect(twelve.style.top).toBe(dialPercent(polar(0, 66), { clip: false }).top)
  })

  it("unstyled strips the paint and keeps the placement", () => {
    const { container } = render(
      <Mainplate label="x" unstyled>
        <Numerals orient="radial" />
      </Mainplate>,
    )
    const marks = numeralsOf(container)
    expect(marks).toHaveLength(12)
    for (const mark of marks) {
      expect(mark.style.color).toBe("")
      expect(mark.style.fontSize).toBe("")
      expect(mark.style.fontWeight).toBe("")
    }
    // Structure survives: the track is still placed and still turned.
    const three = marks[2]
    if (three === undefined) throw new Error("no 3")
    expect(three.style.left).toBe(dialPercent(polar(90, 78), { clip: false }).left)
    expect(rotationOf(three)).toBe(90)
  })

  it("takes a className and spreads HTML attributes onto every numeral", () => {
    const { container } = render(
      <Mainplate label="x">
        <Numerals className="n" data-track="hours" />
      </Mainplate>,
    )
    const marks = numeralsOf(container)
    expect(marks.every((m) => m.className === "n")).toBe(true)
    expect(marks.every((m) => m.getAttribute("data-track") === "hours")).toBe(true)
  })
})

describe("<Hand> — mapping and presets", () => {
  it("maps a static value through the default 0-60 domain: 15 → 90°", () => {
    const { container } = render(
      <Mainplate label="x">
        <Hand value={15} />
      </Mainplate>,
    )
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    // Pivot: length 68 of total 80 → the translate the binder preserves.
    expect(hand.style.transform).toBe("translate(-50%, -85%) rotate(90deg)")
  })

  it("type presets set the domain: an hour hand maps 3 of 12 → 90°", () => {
    const { container } = render(
      <Mainplate label="x">
        <Hand value={3} type="hour" />
      </Mainplate>,
    )
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    expect(rotationOf(hand)).toBe(90)
  })

  it("honours source.domain, and an explicit prop beats it (§8.10)", () => {
    const src = createSource(25, { min: 0, max: 100 })
    const { container } = render(
      <Mainplate label="x">
        <Hand value={src} />
        <Hand value={src} max={50} />
      </Mainplate>,
    )
    const [fromDomain, fromProp] = handsOf(container)
    if (fromDomain === undefined || fromProp === undefined) throw new Error("missing hands")
    expect(rotationOf(fromDomain)).toBe(90) // 25 of 0-100
    expect(rotationOf(fromProp)).toBe(180) // 25 of 0-50
  })

  it("maps through startAngle and sweepAngle", () => {
    const { container } = render(
      <Mainplate label="x">
        <Hand value={50} min={0} max={100} startAngle={-135} sweepAngle={270} />
      </Mainplate>,
    )
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    expect(rotationOf(hand)).toBe(0)
  })

  it("live writes go through the ref with zero renders", () => {
    const src = createSource(0, { min: 0, max: 60 })
    let renders = 0
    function Face() {
      renders += 1
      return (
        <Mainplate label="x">
          <Hand value={src} />
        </Mainplate>
      )
    }
    const { container } = render(<Face />)
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    expect(rotationOf(hand)).toBe(0)
    src.set(30)
    expect(rotationOf(hand)).toBe(180)
    expect(renders).toBe(1)
  })

  it("the second type wears the accent — the one red element on the face", () => {
    const { container } = render(
      <Mainplate label="x">
        <Hand value={0} type="second" />
      </Mainplate>,
    )
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    expect(hand.style.background).toBe("var(--mp-accent)")
  })

  it("variants: bar is rounded, taper is clipped instead", () => {
    const { container } = render(
      <Mainplate label="x">
        <Hand value={0} variant="bar" />
        <Hand value={0} variant="taper" />
      </Mainplate>,
    )
    const [bar, taper] = handsOf(container)
    if (bar === undefined || taper === undefined) throw new Error("missing hands")
    expect(bar.style.borderRadius).not.toBe("")
    expect(taper.style.borderRadius).toBe("")
  })

  it("children replace the shape: the rotating box keeps pivot, children keep looks", () => {
    const { container, getByTestId } = render(
      <Mainplate label="x">
        <Hand value={15}>
          <div data-testid="art" />
        </Hand>
      </Mainplate>,
    )
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    expect(hand.contains(getByTestId("art"))).toBe(true)
    expect(hand.style.background).toBe("")
    expect(rotationOf(hand)).toBe(90)
  })

  describe("tick mode", () => {
    it("arms the 180ms strong ease-out transition", () => {
      const { container } = render(
        <Mainplate label="x">
          <Hand value={0} type="second" tick />
          <Hand value={0} type="second" />
        </Mainplate>,
      )
      const [ticking, sweeping] = handsOf(container)
      if (ticking === undefined || sweeping === undefined) throw new Error("missing hands")
      expect(ticking.style.transition).toContain("180ms")
      expect(sweeping.style.transition).toBe("")
    })

    it("unwraps across the top of the minute: 59s → 0s rotates forward to 360°", () => {
      const src = createSource(59, { min: 0, max: 60 })
      const { container } = render(
        <Mainplate label="x">
          <Hand value={src} type="second" tick />
        </Mainplate>,
      )
      const hand = handsOf(container)[0]
      if (hand === undefined) throw new Error("no hand")
      expect(rotationOf(hand)).toBe(354)
      src.set(0)
      // The transition is live, so an absolute 0 would spin backwards
      // through 354°. The unwrapped write keeps going forward.
      expect(rotationOf(hand)).toBe(360)
    })

    it("unwraps CONTROLLED values too: a re-rendered 59 → 0 steps +6°, no backspin", () => {
      // The Task 4 case: <Clock time={...}> hands are controlled numbers.
      // A value change rebuilds the binder, and without a persistent
      // accumulator the fresh binder writes the absolute 0 — which the armed
      // transition animates 354 → 0 the long way back.
      function Face({ s }: { s: number }) {
        return (
          <Mainplate label="x">
            <Hand value={s} type="second" tick />
          </Mainplate>
        )
      }
      const { container, rerender } = render(<Face s={59} />)
      const hand = handsOf(container)[0]
      if (hand === undefined) throw new Error("no hand")
      expect(rotationOf(hand)).toBe(354)
      rerender(<Face s={0} />)
      expect(rotationOf(hand)).toBe(360)
    })
  })
})

describe("multiple hands — one face, a domain each", () => {
  /**
   * The stress this task exists for: a hand's domain is per-instance state, not
   * a face-wide setting. Every test here renders TWO OR MORE hands and asserts
   * they disagree — because the defect being guarded against (a domain resolved
   * once and shared, whether module-scoped or cached on the context) makes the
   * FIRST hand look perfect and every hand after it silently wrong.
   */
  it("two hands map the same reading through their own max", () => {
    const { container } = render(
      <Mainplate label="x">
        <Hand value={15} max={30} />
        <Hand value={15} max={60} />
        <Hand value={15} min={10} max={40} />
      </Mainplate>,
    )
    const [half, full, offset] = handsOf(container)
    if (half === undefined || full === undefined || offset === undefined) {
      throw new Error("missing hands")
    }
    expect(rotationOf(half)).toBe(180) // 15 of 0-30
    expect(rotationOf(full)).toBe(90) // 15 of 0-60
    expect(rotationOf(offset)).toBe(60) // 5 of a 30-wide domain starting at 10
  })

  it("§8.10 per hand: one hand's prop override never reaches its sibling", () => {
    const src = createSource(25, { min: 0, max: 100 })
    const { container } = render(
      <Mainplate label="x">
        {/* The override comes FIRST on purpose: a shared domain would be seeded
            by this hand and inherited by every hand below it. */}
        <Hand value={src} max={50} />
        <Hand value={src} />
        <Hand value={src} min={-100} />
        <Hand value={src} type="hour" />
      </Mainplate>,
    )
    const [prop, domain, halfPropped, typed] = handsOf(container)
    if (
      prop === undefined ||
      domain === undefined ||
      halfPropped === undefined ||
      typed === undefined
    ) {
      throw new Error("missing hands")
    }
    expect(rotationOf(prop)).toBe(180) // prop max 50 beats the source's 100
    expect(rotationOf(domain)).toBe(90) // …and the sibling still reads 0-100
    expect(rotationOf(halfPropped)).toBe(225) // prop min, source max: 125 of 200
    // The type preset is the weakest of the three: an hour hand handed a source
    // that declares 0-100 maps through the source, not through 12.
    expect(rotationOf(typed)).toBe(90)
  })

  it("startAngle and sweepAngle are per hand too", () => {
    const src = createSource(50, { min: 0, max: 100 })
    const { container } = render(
      <Mainplate label="x">
        <Hand value={src} startAngle={-135} sweepAngle={270} />
        <Hand value={src} />
        <Hand value={src} startAngle={90} />
      </Mainplate>,
    )
    expect(handsOf(container).map(rotationOf)).toEqual([0, 180, 270])
  })

  it("type presets do not bleed between hands", () => {
    const { container } = render(
      <Mainplate label="x">
        <Hand value={3} type="hour" />
        <Hand value={3} type="minute" />
        <Hand value={3} type="second" />
        <Hand value={3} />
      </Mainplate>,
    )
    // 3 of 12 is a quarter turn; 3 of 60 is 18°, three times over.
    expect(handsOf(container).map(rotationOf)).toEqual([90, 18, 18, 18])
  })

  it("two hour hands, two zones: each maps its own source's domain", () => {
    // The GMT case in miniature — the 24-hour hand is an hour hand whose source
    // declares 0-24, and it must not drag the 12-hour hand beside it onto the
    // same scale (nor be dragged onto the preset's 12).
    const local = createSource(3, { min: 0, max: 12 })
    const home = createSource(3, { min: 0, max: 24 })
    const { container } = render(
      <Mainplate label="x">
        <Hand value={local} type="hour" />
        <Hand value={home} type="hour" variant="line" long />
      </Mainplate>,
    )
    const [twelve, twentyFour] = handsOf(container)
    if (twelve === undefined || twentyFour === undefined) throw new Error("missing hands")
    expect(rotationOf(twelve)).toBe(90)
    expect(rotationOf(twentyFour)).toBe(45)
    // …and they are still two independent live hands afterwards.
    local.set(6)
    expect(rotationOf(twelve)).toBe(180)
    expect(rotationOf(twentyFour)).toBe(45)
  })

  it("four live hands from three engines move while the tree commits exactly once", () => {
    const onRender = vi.fn()
    const elapsed = createSource(0, { min: 0, max: 100 })
    function Face() {
      const utc = useWatchSource({ timezone: "UTC" })
      const tokyo = useWatchSource({ timezone: "Asia/Tokyo" })
      return (
        <Mainplate label="Dual time">
          <Dial />
          <Ticks />
          <Hand value={utc.hour} type="hour" />
          <Hand value={tokyo.hour} type="hour" variant="line" long />
          <Hand value={utc.minute} type="minute" />
          <Hand value={utc.second} type="second" />
          <Hand value={elapsed} startAngle={-135} sweepAngle={270} />
          <Cap />
        </Mainplate>
      )
    }
    const { container, unmount } = render(
      <Profiler id="dual" onRender={onRender}>
        <Face />
      </Profiler>,
    )
    const rotations = () => handsOf(container).map(rotationOf)

    // 03:30:00 UTC is 12:30 in Tokyo: the two hour hands sit 90° apart, each
    // through its own zone, and nothing on the face restates a domain.
    expect(rotations()).toEqual([105, 15, 180, 0, -135])
    expect(onRender).toHaveBeenCalledTimes(1)
    // Two zones, one engine: the ticker is a module singleton and both
    // `useWatchSource`s ride it, so five live hands arm a single rAF.
    expect(raf).toHaveBeenCalledTimes(1)

    fireFrame(1000)
    fireFrame(2000)
    fireFrame(4000)
    const after = rotations()
    expect(after[3]).toBe(42) // 7s on the seconds hand
    // Both hour hands advanced by the same real time from different origins —
    // still 90° apart, still not the same number.
    const utcHour = after[0]
    const tokyoHour = after[1]
    if (utcHour === undefined || tokyoHour === undefined) throw new Error("missing hour hands")
    expect(utcHour).toBeGreaterThan(105)
    expect(tokyoHour).toBeGreaterThan(15)
    expect(utcHour - tokyoHour).toBeCloseTo(90, 10)

    // The non-clock source moves on its own schedule, through its own 270°
    // sweep, and commits nothing either.
    elapsed.set(50)
    const gauge = handsOf(container)[4]
    if (gauge === undefined) throw new Error("no gauge hand")
    expect(rotationOf(gauge)).toBe(0)
    expect(onRender).toHaveBeenCalledTimes(1)

    unmount()
    expect(rafQueue.size).toBe(0)
  })
})

describe("multiple hands — offscreen pausing with N of them", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  })

  it("pauses and resumes every hand, each keeping its own accumulator", () => {
    const a = countingSource(0, { min: 0, max: 60 })
    const b = countingSource(0, { min: 0, max: 60 })
    const c = countingSource(0, { min: 0, max: 100 })
    const { container } = render(
      <Mainplate label="x">
        <Hand value={a.source} type="second" tick />
        <Hand value={b.source} type="second" tick />
        <Hand value={c.source} />
      </Mainplate>,
    )
    const [handA, handB, handC] = handsOf(container)
    if (handA === undefined || handB === undefined || handC === undefined) {
      throw new Error("missing hands")
    }
    const subscriptions = () => [a.subscriptions(), b.subscriptions(), c.subscriptions()]
    expect(subscriptions()).toEqual([1, 1, 1])

    // Three laps on A, one on B — deliberately different accumulator depths.
    for (let lap = 0; lap < 3; lap++) for (const v of [15, 30, 45, 0]) a.set(v)
    for (const v of [15, 30, 45, 0]) b.set(v)
    expect([rotationOf(handA), rotationOf(handB)]).toEqual([1080, 360])

    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")
    io.trigger(false)
    // ALL of them released — one registry, N registrations.
    expect(subscriptions()).toEqual([0, 0, 0])
    a.set(30)
    c.set(50)
    expect(rotationOf(handA)).toBe(1080)
    expect(rotationOf(handC)).toBe(0)

    io.trigger(true)
    expect(subscriptions()).toEqual([1, 1, 1])
    // Each resumed from ITS OWN parked pose: A resyncs to 30 the short way from
    // 1080 (+180), B never moved and stays on its single lap, C is a plain hand
    // writing the absolute angle. One shared accumulator collapses all three.
    expect([rotationOf(handA), rotationOf(handB), rotationOf(handC)]).toEqual([1260, 360, 180])
  })

  it("releases both zones' engines offscreen and resyncs both on return", () => {
    function Face() {
      const utc = useWatchSource({ timezone: "UTC" })
      const tokyo = useWatchSource({ timezone: "Asia/Tokyo" })
      return (
        <Mainplate label="Dual time">
          <Hand value={utc.hour} type="hour" />
          <Hand value={tokyo.hour} type="hour" />
          <Hand value={utc.second} type="second" />
        </Mainplate>
      )
    }
    const { container } = render(<Face />)
    expect(rafQueue.size).toBe(1)
    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")

    io.trigger(false)
    // Every hand's unsubscribe rode its own zone's refcount down; nothing is
    // scheduled for either engine.
    expect(rafQueue.size).toBe(0)
    fireFrame(60_000)
    expect(handsOf(container).map(rotationOf)).toEqual([105, 15, 0])

    io.trigger(true)
    expect(rafQueue.size).toBe(1)
    // Resync is elapsed real time, per zone, per hand: a minute passed while
    // the face was dark and both hour hands know it.
    expect(handsOf(container).map(rotationOf)).toEqual([105.5, 15.5, 0])
  })
})

describe("unstyled — full structure, zero default paint", () => {
  it("renders every part unpainted; geometry stays", () => {
    const src = createSource(15, { min: 0, max: 60 })
    const { container } = render(
      <Mainplate label="x" unstyled>
        <Dial />
        <Ticks />
        <Hand value={src} />
        <Cap />
      </Mainplate>,
    )
    for (const part of container.querySelectorAll<HTMLElement>("[data-mp]")) {
      expect(part.style.background).toBe("")
    }
    // borderRadius is paint too: a design system squaring its marks must not
    // fight a leftover 999px.
    for (const selector of ['[data-mp="dial"]', '[data-mp="tick"]', '[data-mp="hand"]']) {
      const part = container.querySelector<HTMLElement>(selector)
      if (part === null) throw new Error(`missing ${selector}`)
      expect(part.style.borderRadius).toBe("")
    }
    // Structure survives: the hand still rotates.
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    expect(rotationOf(hand)).toBe(90)
  })
})

describe("render-once — the composition proof, re-anchored on faces/", () => {
  /**
   * A deliberately inert child. Mutation (a) of this task adds
   * `useSourceValue(second)` here, and the Profiler below must catch the
   * per-frame commits that causes — which it can only do because `fireFrame`
   * flushes inside `act()`.
   */
  function Probe({ second }: { second: Source<number> }) {
    return <output data-probe>{String(second.domain?.max ?? "")}</output>
  }

  it("three live hands move every frame while the tree commits exactly once", () => {
    const onRender = vi.fn()
    function Face() {
      const clock = useWatchSource({ timezone: "UTC" })
      return (
        <Mainplate label="Live">
          <Dial />
          <Ticks />
          <Hand value={clock.hour} type="hour" />
          <Hand value={clock.minute} type="minute" />
          <Hand value={clock.second} type="second" />
          <Probe second={clock.second} />
          <Cap />
        </Mainplate>
      )
    }
    const { container, unmount } = render(
      <Profiler id="face" onRender={onRender}>
        <Face />
      </Profiler>,
    )

    // 03:30:00 UTC through each source's own domain — nothing restated.
    const rotations = () => handsOf(container).map(rotationOf)
    expect(rotations()).toEqual([105, 180, 0])
    expect(onRender).toHaveBeenCalledTimes(1)

    // Three hands, one engine, a single rAF arm.
    expect(raf).toHaveBeenCalledTimes(1)

    fireFrame(1000)
    fireFrame(2000)
    fireFrame(4000)
    const after = rotations()
    expect(after[2]).toBe(42) // 7s → the seconds hand by exactly 42°
    expect(after[0]).not.toBe(105)
    expect(after[1]).not.toBe(180)

    // The claim: every hand moved and React never committed again.
    expect(onRender).toHaveBeenCalledTimes(1)
    unmount()
    expect(rafQueue.size).toBe(0)
  })
})

describe("observe auto-attach — offscreen pausing without wiring", () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  })

  it("constructs no observer for a face with only static hands", () => {
    render(
      <Mainplate label="x">
        <Hand value={10} />
      </Mainplate>,
    )
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
  })

  it("observes its own root once any hand is live", () => {
    const { source } = countingSource(0, { min: 0, max: 60 })
    const { getByRole } = render(
      <Mainplate label="x">
        <Hand value={source} />
      </Mainplate>,
    )
    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")
    expect(io.observed).toEqual([getByRole("img")])
  })

  it("releases the hand's subscription offscreen and resyncs on return", () => {
    const { source, set, subscriptions } = countingSource(0, { min: 0, max: 60 })
    const { container } = render(
      <Mainplate label="x">
        <Hand value={source} />
      </Mainplate>,
    )
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    expect(subscriptions()).toBe(1)

    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")
    io.trigger(false)
    // Offscreen: the subscription is gone, and writes stop.
    expect(subscriptions()).toBe(0)
    set(30)
    expect(rotationOf(hand)).toBe(0)

    io.trigger(true)
    // Back: resubscribed, and one fresh write resynced the hand — the
    // current value, not a replay.
    expect(subscriptions()).toBe(1)
    expect(rotationOf(hand)).toBe(180)
  })

  it("releases the shared ticker itself when the live source is the wall clock", () => {
    function Face() {
      const clock = useWatchSource({ timezone: "UTC" })
      return (
        <Mainplate label="Live">
          <Hand value={clock.second} type="second" />
        </Mainplate>
      )
    }
    render(<Face />)
    expect(rafQueue.size).toBe(1)
    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")
    io.trigger(false)
    // The unsubscribe rode useWatchSource's refcount all the way down: the
    // engine is released, nothing is scheduled anywhere.
    expect(rafQueue.size).toBe(0)
    io.trigger(true)
    expect(rafQueue.size).toBe(1)
  })

  it("resumes where the hand paused — never a backspin through the laps", () => {
    // A ticking hand accumulates: values 15→30→45→0 are +90° each. Twelve
    // steps park the accumulator at 1080°. If resume rebound from scratch,
    // the first write would be the absolute 0° — and the armed 180ms
    // transition would animate 1080 → 0, three full laps backwards at speed.
    const { source, set } = countingSource(0, { min: 0, max: 60 })
    const { container } = render(
      <Mainplate label="x">
        <Hand value={source} type="second" tick />
      </Mainplate>,
    )
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    for (let lap = 0; lap < 3; lap++) {
      for (const v of [15, 30, 45, 0]) set(v)
    }
    const parked = rotationOf(hand)
    expect(parked).toBe(1080)

    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")
    io.trigger(false)
    io.trigger(true)
    const resumed = rotationOf(hand)
    expect(Math.abs(resumed - parked)).toBeLessThanOrEqual(180)
    expect(resumed).toBe(1080) // same value, same pose, zero movement
  })

  it("unmounting while offscreen leaks neither observer nor subscription", () => {
    const { source, subscriptions } = countingSource(0, { min: 0, max: 60 })
    const { unmount } = render(
      <Mainplate label="x">
        <Hand value={source} />
      </Mainplate>,
    )
    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")
    io.trigger(false)
    expect(subscriptions()).toBe(0) // paused: already released
    unmount()
    // Nothing to double-release, nothing left behind: the observer is dead
    // and the subscription count never went negative or dangling.
    expect(subscriptions()).toBe(0)
    expect(io.disconnected).toBe(true)
    // A stale trigger on the dead observer resurrects nothing.
    io.trigger(true)
    expect(subscriptions()).toBe(0)
  })

  it("unmount tears the observer down and the subscription with it", () => {
    const { source, subscriptions } = countingSource(0, { min: 0, max: 60 })
    const { unmount } = render(
      <Mainplate label="x">
        <Hand value={source} />
      </Mainplate>,
    )
    expect(subscriptions()).toBe(1)
    unmount()
    expect(subscriptions()).toBe(0)
    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")
    expect(io.disconnected).toBe(true)
  })

  it("missing IntersectionObserver: the face is simply always live", () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    const { source, set } = countingSource(0, { min: 0, max: 60 })
    const { container } = render(
      <Mainplate label="x">
        <Hand value={source} />
      </Mainplate>,
    )
    const hand = handsOf(container)[0]
    if (hand === undefined) throw new Error("no hand")
    set(30)
    expect(rotationOf(hand)).toBe(180)
  })
})

describe("quantisation — every inline style value parses to ≤4dp", () => {
  /** Every decimal fraction that appears anywhere in an element's style. */
  function fractionsOf(el: Element): string[] {
    const style = el.getAttribute("style") ?? ""
    return [...style.matchAll(/\d+\.(\d+)/g)].map((m) => m[1] ?? "")
  }

  it("holds across a full face on the awkward rect shape, render and ref paths", () => {
    vi.setSystemTime(T_CAD) // 03:30:36.400 — raw angles are long floats
    function Face() {
      const clock = useWatchSource({ timezone: "UTC" })
      // A half-hour zone on a 24-hour domain: every angle it produces is a
      // repeating decimal, arriving through `source.domain` rather than a prop.
      const kolkata = useWatchSource({ timezone: "Asia/Kolkata" })
      return (
        <Mainplate label="Live" shape={{ ratio: 0.82, radius: 30 }}>
          <Dial />
          <Ticks />
          {/* Stacked tracks on bounded, deliberately ugly sweeps: 200° over
              seven marks is 33.333…° a step, and a 0–30 domain read across it
              repeats too. Both reach the style through `markTransform`. */}
          <Ticks count={7} startAngle={-100} sweepAngle={200} inset={30} orient="radial" />
          <Ticks every={7} from={0} to={30} startAngle={-100} sweepAngle={200} inset={36} />
          {/* Both derived orientations, on the shape whose normals are not the
              ray: `tangential` reaches the style through `atan2`, which is
              exactly where an unquantised float would get in. */}
          <Numerals variant="roman" orient="tangential" />
          <Numerals variant="quarters" orient="radial" inset={40} />
          <Hand value={clock.hour} type="hour" />
          <Hand value={clock.minute} type="minute" />
          <Hand value={clock.second} type="second" />
          <Hand value={10 / 3} />
          {/* Two more domains on the same face: a 24-hour hand and a 270°
              sweep over a 7-wide domain — neither angle is a round number. */}
          <Hand value={kolkata.hour24} type="hour" variant="line" long />
          <Hand value={10 / 3} min={0} max={7} startAngle={-135} sweepAngle={270} />
          <Cap />
        </Mainplate>
      )
    }
    const { container } = render(<Face />)
    const second = handsOf(container)[2]
    if (second === undefined) throw new Error("no second hand")
    // The mount write went through the ref path already: 36.4s is a raw
    // 218.39999999999998° and must have been written as the quantised 218.4.
    expect(rotationOf(second)).toBe(218.4)
    fireFrame(16) // and once more through the live ref path
    expect(rotationOf(second)).toBe(218.496) // 36.416s, quantised

    const elements = [...container.querySelectorAll("[style]")]
    expect(elements.length).toBeGreaterThan(60)
    for (const el of elements) {
      for (const fraction of fractionsOf(el)) {
        expect(
          fraction.length,
          `${fraction} in ${el.getAttribute("style") ?? ""}`,
        ).toBeLessThanOrEqual(4)
      }
    }
  })
})
