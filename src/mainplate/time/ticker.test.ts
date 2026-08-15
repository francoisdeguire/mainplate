// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createTicker, getTicker } from "./ticker"

/**
 * 400ms past a second boundary, so boundary arithmetic is visible: the next
 * boundary is +600, the one after +1600. Chosen off the boundary deliberately —
 * a base sitting exactly on one would let a "delay = 1000" implementation pass.
 */
const BASE = 1_760_000_000_400

/**
 * Hand-rolled rAF harness rather than sinon's, because the tests need to count
 * arms and cancellations exactly and to fire frames only when told to.
 */
let rafQueue: Map<number, FrameRequestCallback>
let nextRafId: number
let raf: ReturnType<typeof vi.fn>
let caf: ReturnType<typeof vi.fn>

/**
 * Advance the fake clock, then run every frame callback queued *before* the
 * advance — one screen frame. Re-arms land in the queue for the next call.
 */
function fireFrame(advanceMs: number) {
  vi.advanceTimersByTime(advanceMs)
  const due = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of due) cb(0)
}

/** Swap jsdom's read-only visibilityState and fire the event, like a tab switch. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE)
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, "visibilityState")
})

describe("glide cadence", () => {
  it("drives ten subscribers from a single rAF per frame", () => {
    const t = createTicker()
    const cbs = Array.from({ length: 10 }, () => vi.fn())
    for (const cb of cbs) t.subscribe("glide", cb)

    // One arm for the whole engine, not one per subscriber.
    expect(raf).toHaveBeenCalledTimes(1)

    fireFrame(16)
    for (const cb of cbs) expect(cb).toHaveBeenCalledTimes(1)
    // The frame re-armed exactly once: 2 total, not 11 or 20.
    expect(raf).toHaveBeenCalledTimes(2)

    fireFrame(16)
    for (const cb of cbs) expect(cb).toHaveBeenCalledTimes(2)
    expect(raf).toHaveBeenCalledTimes(3)
    t.stop()
  })

  it("recomputes from Date.now(): irregular advances track absolute time", () => {
    const t = createTicker()
    const seen: number[] = []
    t.subscribe("glide", () => seen.push(t.now()))

    // Deliberately irregular: a fixed-step accumulator reports BASE+16/32/48
    // and a summed-delta one can only match by reading the clock. No pair of
    // these sums coincides with 7/107/110.
    fireFrame(7)
    fireFrame(100)
    fireFrame(3)
    expect(seen).toEqual([BASE + 7, BASE + 107, BASE + 110])
    t.stop()
  })
})

describe("tick cadence", () => {
  it("sleeps to the boundary: zero rAF, one timer, wakes exactly on the second", () => {
    const t = createTicker()
    const cb = vi.fn()
    t.subscribe("tick", cb)

    // The engine went to sleep on a timer — it did not arm rAF at all.
    expect(raf).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(599)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1) // BASE + 600 — the boundary
    expect(cb).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(999)
    expect(cb).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1) // the next boundary
    expect(cb).toHaveBeenCalledTimes(2)

    // Two boundaries crossed and still not a single rAF callback between them.
    expect(raf).not.toHaveBeenCalled()
    t.stop()
  })

  it("reports the boundary's absolute time to its subscribers", () => {
    const t = createTicker()
    const seen: number[] = []
    t.subscribe("tick", () => seen.push(t.now()))
    vi.advanceTimersByTime(600)
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual([BASE + 600, BASE + 1600])
    t.stop()
  })
})

describe("shared loop", () => {
  it("serves both cadences from the one rAF loop: no timer, tick fires only across a boundary", () => {
    const t = createTicker()
    const glide = vi.fn()
    const tick = vi.fn()
    t.subscribe("glide", glide)
    t.subscribe("tick", tick)

    // Glide's loop is already paying for every frame, so tick rides it.
    expect(vi.getTimerCount()).toBe(0)
    expect(raf).toHaveBeenCalledTimes(1)

    fireFrame(300) // BASE+700, same second
    fireFrame(200) // BASE+900, same second
    expect(glide).toHaveBeenCalledTimes(2)
    expect(tick).not.toHaveBeenCalled()

    fireFrame(200) // BASE+1100 — crossed the boundary
    expect(glide).toHaveBeenCalledTimes(3)
    expect(tick).toHaveBeenCalledTimes(1)

    fireFrame(200) // BASE+1300, same second again
    expect(tick).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    t.stop()
  })

  it("falls back to sleeping when the last glide subscriber leaves", () => {
    const t = createTicker()
    const tick = vi.fn()
    const offGlide = t.subscribe("glide", vi.fn())
    t.subscribe("tick", tick)
    fireFrame(100) // BASE+500

    offGlide()
    // The rAF loop is gone and a boundary timer replaced it.
    expect(rafQueue.size).toBe(0)
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(500) // BASE+1000 — the boundary
    expect(tick).toHaveBeenCalledTimes(1)
    t.stop()
  })

  it("hands the timer's job to rAF when a glide subscriber joins", () => {
    const t = createTicker()
    const tick = vi.fn()
    t.subscribe("tick", tick)
    expect(vi.getTimerCount()).toBe(1)

    t.subscribe("glide", vi.fn())
    expect(vi.getTimerCount()).toBe(0)
    expect(rafQueue.size).toBe(1)

    fireFrame(700) // BASE+1100 — the boundary the timer was waiting on
    expect(tick).toHaveBeenCalledTimes(1)
    t.stop()
  })
})

describe("visibility", () => {
  it("pauses a glide loop when hidden and resyncs to absolute time on return", () => {
    const t = createTicker()
    const seen: number[] = []
    t.subscribe("glide", () => seen.push(t.now()))
    fireFrame(16)
    expect(seen).toEqual([BASE + 16])

    setVisibility("hidden")
    // The engine parked: the pending frame was cancelled, nothing is scheduled.
    expect(rafQueue.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(60_000) // a minute passes in the background
    expect(seen).toHaveLength(1) // and none of it was replayed

    setVisibility("visible")
    // The first visible value is elapsed real time, not a replay.
    expect(seen).toEqual([BASE + 16, BASE + 60_016])
    // And the loop is running again.
    fireFrame(16)
    expect(seen).toEqual([BASE + 16, BASE + 60_016, BASE + 60_032])
    t.stop()
  })

  it("pauses a sleeping tick loop when hidden and re-arms to the next boundary on return", () => {
    const t = createTicker()
    const seen: number[] = []
    t.subscribe("tick", () => seen.push(t.now()))
    expect(vi.getTimerCount()).toBe(1)

    setVisibility("hidden")
    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(3_600_000) // an hour passes in the background
    expect(seen).toEqual([])

    setVisibility("visible")
    expect(seen).toEqual([BASE + 3_600_000]) // resynced, not replayed
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(600) // still 400ms past the second: boundary in 600
    expect(seen).toEqual([BASE + 3_600_000, BASE + 3_600_600])
    t.stop()
  })

  it("detaches the visibilitychange listener when the last subscriber leaves", () => {
    const add = vi.spyOn(document, "addEventListener")
    const remove = vi.spyOn(document, "removeEventListener")
    const t = createTicker()
    const off = t.subscribe("tick", vi.fn())

    const call = add.mock.calls.find(([type]) => type === "visibilitychange")
    expect(call).toBeDefined()
    const handler = call?.[1]

    off()
    expect(remove).toHaveBeenCalledWith("visibilitychange", handler)
    t.stop()
  })
})

describe("lifecycle", () => {
  it("stops the loop on the last unsubscribe and restarts on a later subscribe", () => {
    const t = createTicker()
    const first = vi.fn()
    const off = t.subscribe("glide", first)
    expect(rafQueue.size).toBe(1)

    off()
    // Truly stopped: the pending frame was cancelled, not abandoned.
    expect(caf).toHaveBeenCalledTimes(1)
    expect(rafQueue.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    const second = vi.fn()
    t.subscribe("glide", second)
    expect(rafQueue.size).toBe(1)
    fireFrame(16)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    t.stop()
  })

  it("survives a double teardown: the loop and the other subscriber keep running", () => {
    const t = createTicker()
    const a = vi.fn()
    const b = vi.fn()
    const offA = t.subscribe("glide", a)
    t.subscribe("glide", b)

    offA()
    offA() // a refcount would hit zero here and kill b's loop

    expect(rafQueue.size).toBe(1)
    fireFrame(16)
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
    t.stop()
  })

  it("stop() cancels everything, forgets subscribers, and leaves the ticker reusable", () => {
    const t = createTicker()
    const old = vi.fn()
    t.subscribe("glide", old)
    t.subscribe("tick", vi.fn())

    t.stop()
    expect(rafQueue.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    t.stop() // idempotent: a second stop changes nothing and the ticker still works

    const fresh = vi.fn()
    t.subscribe("glide", fresh)
    expect(rafQueue.size).toBe(1)
    fireFrame(16)
    expect(fresh).toHaveBeenCalledTimes(1)
    expect(old).not.toHaveBeenCalled() // stop() forgot it
    t.stop()
  })

  it("now() reads the clock fresh while the engine is idle", () => {
    const t = createTicker()
    expect(t.now()).toBe(BASE)
    vi.advanceTimersByTime(123)
    expect(t.now()).toBe(BASE + 123)
  })
})

describe("getTicker", () => {
  it("returns one lazily created instance", () => {
    const t = getTicker()
    expect(getTicker()).toBe(t)
    t.stop()
  })
})
