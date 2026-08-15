// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTicker } from "../time/ticker"
import { Diver } from "./diver"

/** 2026-01-15 03:30:00.000 UTC — a clean instant on a second boundary. */
const T_0330 = Date.UTC(2026, 0, 15, 3, 30, 0)

/**
 * Hand-rolled rAF harness, the same shape `time/`'s own tests use: frames fire
 * only when told, so "the hands moved" is an event this test caused rather
 * than a race it happened to win.
 */
let rafQueue: Map<number, FrameRequestCallback>
let nextRafId: number

/**
 * Advance the fake clock, then run every frame callback queued before it.
 *
 * Wrapped in `act`, and that is load-bearing rather than hygiene: outside an
 * act scope React defers any state update a subscriber schedules, so a face
 * that *did* re-render on every tick would still look like it rendered once.
 * The render-count claim below is only a claim at all because the pending work
 * is flushed here.
 */
function fireFrame(advanceMs: number) {
  act(() => {
    vi.advanceTimersByTime(advanceMs)
    const due = [...rafQueue.values()]
    rafQueue.clear()
    for (const cb of due) cb(0)
  })
}

/** jsdom has no `IntersectionObserver`; this one records what it was given. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed: Element[] = []
  constructor(_cb: (entries: { isIntersecting: boolean }[]) => void) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve() {}
  disconnect() {
    this.observed = []
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T_0330)
  rafQueue = new Map()
  nextRafId = 1
  FakeIntersectionObserver.instances = []
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextRafId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafQueue.delete(id)
  })
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
})

afterEach(() => {
  getTicker().stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** The three hands on the main plate — not the power reserve's, which lives a
 * group deeper inside its `<Subdial>`. */
function handRotations(container: HTMLElement): string[] {
  return [
    ...container.querySelectorAll<SVGGElement>('[data-mp="mainplate"] > g > [data-mp="hand"] > g'),
  ].map((g) => g.style.rotate)
}

/** The bezel group, found by the accessible name `<Subdial label>` gives it. */
function bezel(container: HTMLElement): Element {
  const node = container.querySelector('[aria-label="Elapsed-time bezel"]')
  if (node === null) throw new Error("no bezel subdial")
  return node
}

describe("<Diver>", () => {
  it("moves three hands off one hook while the face renders exactly once", () => {
    // The composition claim (§9.1, §15.2), made about a real component rather
    // than about a hand-assembled fixture: `useWatchSource` lives inside
    // <Diver>, so if this face read a value instead of handing over the
    // sources, the Profiler would see a second commit.
    let commits = 0
    const { container, unmount } = render(
      <Profiler
        id="diver"
        onRender={() => {
          commits += 1
        }}
      >
        <Diver />
      </Profiler>,
    )

    expect(commits).toBe(1)
    // Three hands, one shared engine, a single frame armed.
    expect(rafQueue.size).toBe(1)

    const before = handRotations(container)
    expect(before).toHaveLength(3)
    // On the boundary, so the seconds hand starts at the top. Zone offsets are
    // whole minutes in every real zone, so this holds wherever the suite runs.
    expect(before[2]).toBe("0deg")

    fireFrame(7000)
    const after = handRotations(container)
    for (let i = 0; i < 3; i++) expect(after[i]).not.toBe(before[i])
    // Seven seconds of a sixty-second turn, exactly.
    expect(after[2]).toBe("42deg")

    // Nothing re-rendered: every one of those movements was a ref write.
    expect(commits).toBe(1)

    unmount()
    expect(rafQueue.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("attaches `observe` to the root, so the clock can pause offscreen", () => {
    // §9.11 is opt-in and does nothing unless a consumer wires it up. A face
    // that ships without this looks identical and measures nothing.
    const { container } = render(<Diver />)
    const observer = FakeIntersectionObserver.instances[0]
    if (observer === undefined) throw new Error("no IntersectionObserver was constructed")
    expect(observer.observed).toEqual([container.querySelector('[data-mp="mainplate"]')])
  })

  it("rotates the whole bezel frame when `bezel` moves — §4.6, one number", () => {
    const { container, rerender } = render(<Diver bezel={0} />)
    // The pip is the only `renderItem` mark on the bezel, so it is the only
    // group in there carrying its own transform.
    const pip = () =>
      bezel(container).querySelector('[data-mp="ticks"] > g')?.getAttribute("transform")
    const graduations = () =>
      bezel(container).querySelector('[data-mp="ticks"] > path')?.getAttribute("d")

    // Anchored at inset 15 on a nominal-100 frame: radius 85, straight up.
    expect(pip()).toBe("translate(0 -85) rotate(0)")
    const at0 = graduations()

    rerender(<Diver bezel={15} />)
    // A quarter of the bezel's sixty minutes is a quarter turn: the pip is now
    // at three o'clock and stands a quarter turn round with it.
    expect(pip()).toBe("translate(85 0) rotate(90)")
    // And the graduations moved with it — the whole frame turned, not just the
    // one mark that happens to be drawn by hand.
    expect(graduations()).not.toBe(at0)
  })

  it("draws twelve applied indices, one of them the diver's twelve", () => {
    const { container } = render(<Diver />)
    // The dial's indices: the `renderItem` population on the main plate.
    const groups = [
      ...container.querySelectorAll('[data-mp="mainplate"] > g > [data-mp="ticks"] > g'),
    ]
    expect(groups).toHaveLength(12)
    // Twelve is a two-path triangle; the eleven batons are three paths — two
    // facets and a lume block — which is what `renderItem` buys and costs.
    expect(groups[0]?.querySelectorAll("path")).toHaveLength(2)
    expect(groups[1]?.querySelectorAll("path")).toHaveLength(3)
    expect(groups[0]?.getAttribute("transform")).toBe("translate(0 -77) rotate(0)")
  })

  it("gives the power reserve its own domain and its own sweep", () => {
    const { container } = render(<Diver reserve={0.5} />)
    const hand = container.querySelector<SVGGElement>(
      '[aria-label="Power reserve"] [data-mp="hand"] > g',
    )
    // 0.5 of 0–1 across 116° starting at −58° is dead centre. Neither the
    // face's 0–60 domain nor its full turn reached in here (§4.8).
    expect(hand?.style.rotate).toBe("0deg")
    // And `pivot` slid the artwork's own origin onto that rotation point.
    expect(hand?.firstElementChild?.getAttribute("transform")).toBe(
      "translate(0 0) scale(1) translate(-10 -70)",
    )
  })

  it("is one image with a static name, never a live meter", () => {
    // The hydration ruling, pinned: a watch field read during render returns
    // 10:09:36 on the server and the real time in the browser, so putting one
    // into `aria-valuenow` would mismatch on the root element — the node that
    // also carries the viewBox and every theme custom property. §14.2 already
    // says a frozen accessible value is worse than none.
    const { container, getByRole } = render(<Diver />)
    expect(getByRole("img").getAttribute("aria-label")).toBe("Diver watch face")
    expect(container.querySelector('[role="meter"]')).toBeNull()
    expect(container.querySelector("[aria-valuenow]")).toBeNull()
  })
})
