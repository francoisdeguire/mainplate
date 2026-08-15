// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Mainplate } from "../core/frame"
import { Hand } from "../core/hand"
import { isSource } from "../core/source"
import * as barrel from "./index"
import { getTicker } from "./ticker"
import { useWatchSource, type WatchSourceOptions, type WatchSources } from "./use-watch-source"

/** 2026-01-15 03:30:00.000 UTC — a clean half-past-three for the domain math. */
const T_0330 = Date.UTC(2026, 0, 15, 3, 30, 0)

/** 03:30:36.400 UTC — 400ms past a boundary, so cadence arithmetic is visible. */
const T_CAD = Date.UTC(2026, 0, 15, 3, 30, 36) + 400

/**
 * 2026-03-08 is the US spring-forward day: New York leaves UTC-5 for UTC-4 at
 * 02:00 local. 06:30Z is 01:30 EST. One real hour later, 07:30Z, is 03:30 EDT
 * — 02:30 never happened on that wall. A manual "-5" offset reads the second
 * instant as 02:30; a manual "-4" reads the first as 02:30. Either constant
 * gets exactly one of the two reads visibly wrong.
 */
const NY_BEFORE = Date.UTC(2026, 2, 8, 6, 30, 0)
const NY_AFTER = Date.UTC(2026, 2, 8, 7, 30, 0)

const FIELDS = ["hour", "hour24", "minute", "second", "ms"] as const

/**
 * Hand-rolled rAF harness, same shape as ticker.test.ts: the tests count arms
 * and cancellations exactly and fire frames only when told to.
 */
let rafQueue: Map<number, FrameRequestCallback>
let nextRafId: number
let raf: ReturnType<typeof vi.fn>
let caf: ReturnType<typeof vi.fn>

/** Advance the fake clock, then run every frame callback queued before the advance. */
function fireFrame(advanceMs: number) {
  vi.advanceTimersByTime(advanceMs)
  const due = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of due) cb(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T_CAD)
  rafQueue = new Map()
  nextRafId = 1
  raf = vi.fn((cb: FrameRequestCallback) => {
    const id = nextRafId++
    rafQueue.set(id, cb)
    return id
  })
  caf = vi.fn((id: number) => {
    rafQueue.delete(id)
  })
  vi.stubGlobal("requestAnimationFrame", raf)
  vi.stubGlobal("cancelAnimationFrame", caf)
})

afterEach(() => {
  getTicker().stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Mount the hook bare, recording every render's return value. */
function mountClock(options?: WatchSourceOptions) {
  const seen: WatchSources[] = []
  function Probe() {
    seen.push(useWatchSource(options))
    return null
  }
  const view = render(<Probe />)
  const clock = seen[0]
  if (clock === undefined) throw new Error("hook never ran")
  return { clock, seen, rerenderProbe: () => view.rerender(<Probe />), unmount: view.unmount }
}

describe("stability (§9.1)", () => {
  it("returns the identical Source objects on every render", () => {
    const { seen, rerenderProbe } = mountClock()
    rerenderProbe()
    rerenderProbe()
    expect(seen).toHaveLength(3)
    expect(seen[2]).toBe(seen[0])
    for (const field of FIELDS) {
      expect(seen[0]?.[field]).toBeDefined()
      expect(seen[2]?.[field]).toBe(seen[0]?.[field])
    }
  })

  it("never re-renders the calling component while its sources tick", () => {
    const { clock, seen } = mountClock()
    const cb = vi.fn()
    const off = clock.second.subscribe(cb)
    fireFrame(16)
    fireFrame(16)
    fireFrame(16)
    expect(cb).toHaveBeenCalledTimes(3)
    // Three notifications reached the subscriber and React never ran again.
    expect(seen).toHaveLength(1)
    off()
  })
})

describe("the barrel", () => {
  it("exposes only the hook — the ticker's cadence pub-sub stays internal", () => {
    expect(Object.keys(barrel)).toEqual(["useWatchSource"])
  })
})

describe("domains (§9.2)", () => {
  it("each source carries its own domain, so a <Hand> never restates max", () => {
    const { clock } = mountClock()
    expect(clock.hour.domain).toEqual({ min: 0, max: 12 })
    expect(clock.hour24.domain).toEqual({ min: 0, max: 24 })
    expect(clock.minute.domain).toEqual({ min: 0, max: 60 })
    expect(clock.second.domain).toEqual({ min: 0, max: 60 })
    expect(clock.ms.domain).toEqual({ min: 0, max: 1000 })
  })

  it("every field satisfies the core Source discriminator", () => {
    const { clock } = mountClock()
    for (const field of FIELDS) expect(isSource(clock[field])).toBe(true)
  })
})

describe("the fields (§9.2)", () => {
  it("hour is fractional — 3:30 is halfway to 4", () => {
    vi.setSystemTime(T_0330)
    const { clock } = mountClock({ timezone: "UTC" })
    expect(clock.hour.get()).toBe(3.5)
    expect(clock.hour24.get()).toBe(3.5)
    expect(clock.minute.get()).toBe(30)
    expect(clock.second.get()).toBe(0)
    expect(clock.ms.get()).toBe(0)
  })

  it("hour wraps at 12 while hour24 keeps counting", () => {
    vi.setSystemTime(T_0330 + 12 * 3_600_000) // 15:30 UTC
    const { clock } = mountClock({ timezone: "UTC" })
    expect(clock.hour.get()).toBe(3.5)
    expect(clock.hour24.get()).toBe(15.5)
  })

  it("glide carries the millisecond fraction into every field", () => {
    vi.setSystemTime(T_CAD) // 03:30:36.400
    const { clock } = mountClock({ timezone: "UTC" })
    expect(clock.ms.get()).toBe(400)
    expect(clock.second.get()).toBeCloseTo(36.4, 10)
    expect(clock.minute.get()).toBeCloseTo(30.6067, 3)
    expect(clock.hour.get()).toBeCloseTo(3.5101, 3)
  })

  it("agrees with the platform's own local decomposition when no timezone is given", () => {
    // Cross-mechanism agreement: Date's getters against the Intl path, in
    // whatever zone this machine runs. The two implementations are
    // independent, so this is not a function equalling itself.
    vi.setSystemTime(T_CAD)
    const { clock } = mountClock()
    const d = new Date(T_CAD)
    const s = d.getSeconds() + d.getMilliseconds() / 1000
    const m = d.getMinutes() + s / 60
    const h = d.getHours() + m / 60
    expect(clock.second.get()).toBeCloseTo(s, 9)
    expect(clock.minute.get()).toBeCloseTo(m, 9)
    expect(clock.hour24.get()).toBeCloseTo(h, 9)
    expect(clock.hour.get()).toBeCloseTo(h % 12, 9)
  })
})

describe("cadence is a source option (§9.3)", () => {
  it("defaults to glide: the first subscriber arms the rAF loop, no timer", () => {
    const { clock } = mountClock()
    // Lazy until someone listens — the hook alone spins nothing.
    expect(raf).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    const off = clock.second.subscribe(vi.fn())
    expect(raf).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    off()
  })

  it("tick: values quantise to whole seconds and the engine genuinely sleeps", () => {
    vi.setSystemTime(T_CAD)
    const { clock } = mountClock({ second: "tick", timezone: "UTC" })
    // Quantised at the source, before anyone subscribes: reads are whole.
    expect(clock.second.get()).toBe(36)

    const cb = vi.fn()
    const off = clock.second.subscribe(cb)
    // A timer, not a rAF loop — quantising at the hand could never do this.
    expect(raf).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(599)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1) // the second boundary
    expect(cb).toHaveBeenCalledTimes(1)
    expect(clock.second.get()).toBe(37)

    vi.advanceTimersByTime(1000)
    expect(cb).toHaveBeenCalledTimes(2)
    expect(clock.second.get()).toBe(38)
    expect(raf).not.toHaveBeenCalled()
    off()
  })

  it("mixes cadences per field: a glide subscriber joins and the tick rides its loop", () => {
    vi.setSystemTime(T_CAD)
    const { clock } = mountClock({ second: "tick", timezone: "UTC" })
    const tick = vi.fn()
    const glide = vi.fn()
    const offTick = clock.second.subscribe(tick)
    expect(vi.getTimerCount()).toBe(1)

    const offGlide = clock.ms.subscribe(glide)
    // The sleeping timer handed its job to the shared rAF loop.
    expect(vi.getTimerCount()).toBe(0)
    expect(rafQueue.size).toBe(1)

    fireFrame(300) // 03:30:36.700 — same second
    expect(glide).toHaveBeenCalledTimes(1)
    expect(tick).not.toHaveBeenCalled()
    fireFrame(400) // 03:30:37.100 — crossed the boundary
    expect(glide).toHaveBeenCalledTimes(2)
    expect(tick).toHaveBeenCalledTimes(1)
    expect(clock.second.get()).toBe(37)
    offTick()
    offGlide()
  })
})

describe("timezone (§9.4)", () => {
  it("crosses the US spring-forward boundary correctly — no constant offset can", () => {
    const { clock } = mountClock({ timezone: "America/New_York" })
    vi.setSystemTime(NY_BEFORE)
    expect(clock.hour.get()).toBe(1.5) // 01:30 EST; a manual -4 says 2.5
    expect(clock.hour24.get()).toBe(1.5)
    vi.setSystemTime(NY_AFTER)
    expect(clock.hour.get()).toBe(3.5) // 03:30 EDT; a manual -5 says 2.5
    expect(clock.hour24.get()).toBe(3.5)
  })

  it("dev-throws on a timezone Intl does not recognise", () => {
    function Probe() {
      useWatchSource({ timezone: "Not/AZone" })
      return null
    }
    expect(() => render(<Probe />)).toThrow(
      /mainplate: useWatchSource received timezone="Not\/AZone"/,
    )
  })
})

describe("teardown", () => {
  it("the last teardown releases the engine; a double teardown steals nothing", () => {
    const { clock } = mountClock()
    const b = vi.fn()
    const c = vi.fn()
    const offA = clock.second.subscribe(vi.fn())
    const offB = clock.second.subscribe(b)
    const offC = clock.minute.subscribe(c)
    // Three listeners across two fields, one engine, one loop.
    expect(raf).toHaveBeenCalledTimes(1)

    offA()
    offA() // an unguarded refcount hits zero here and detaches b's own field
    fireFrame(16)
    expect(b).toHaveBeenCalledTimes(1) // b's feed survived the double teardown
    expect(c).toHaveBeenCalledTimes(1)

    offB()
    fireFrame(16)
    expect(c).toHaveBeenCalledTimes(2) // minute's feed survives second's teardown

    offC()
    // Observed teardown: the pending frame was cancelled, nothing is scheduled.
    expect(caf).toHaveBeenCalled()
    expect(rafQueue.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("the claim (§9.1): a real clock face", () => {
  it("moves all three hands from one hook while the parent renders exactly once", () => {
    vi.setSystemTime(T_0330)
    let renders = 0
    function Clock() {
      renders += 1
      const clock = useWatchSource({ timezone: "UTC" })
      return (
        <Mainplate size={200}>
          <Hand value={clock.hour} length={50} width={6} />
          <Hand value={clock.minute} length={70} width={4} />
          <Hand value={clock.second} length={80} width={1.5} />
        </Mainplate>
      )
    }
    const { container, unmount } = render(<Clock />)
    const rotations = () =>
      [...container.querySelectorAll<SVGGElement>('[data-mp="hand"] > g')].map(
        (g) => g.style.rotate,
      )

    // The domains flowed from the sources — no min/max was restated above.
    // 03:30 UTC: hour 3.5 of 12 → 105°, minute 30 of 60 → 180°, second 0°.
    expect(rotations()).toEqual(["105deg", "180deg", "0deg"])

    // Three hands, one engine, a single rAF arm.
    expect(raf).toHaveBeenCalledTimes(1)

    const before = rotations()
    fireFrame(7000) // seven seconds pass in one long frame
    const after = rotations()
    for (let i = 0; i < 3; i++) {
      expect(after[i]).not.toBe(before[i]) // every hand moved…
    }
    expect(after[2]).toBe("42deg") // …and the seconds hand by exactly 7s
    expect(renders).toBe(1) // while the parent never re-rendered

    unmount()
    // Unmount released everything: nothing scheduled anywhere.
    expect(rafQueue.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
