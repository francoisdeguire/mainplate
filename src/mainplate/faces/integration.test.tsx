// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ComplexFace } from "../../../www/app/lab/complex/complex-face"
import { createSource, type Source } from "../core/source"
import { getTicker } from "../time/ticker"

/**
 * The Task 10 integration test: the complex face — every feature at once, and
 * the HTML-cost data point the plan asks for.
 *
 * The subject is the LAB's own `ComplexFace` (imported across the workspace
 * seam on the Task 8 precedent), not a re-composition of it: the face the
 * browser judges and the face these tests pin must be the same element tree,
 * or the two reports would be about different objects.
 */

/** 03:30:00 UTC — hour 3.5 → 105°, minute 30 → 180°, second 0 → 0°. */
const T_0330 = Date.UTC(2026, 0, 15, 3, 30, 0)

/** 03:30:36.400 UTC — raw (unquantised) angles are long floats. */
const T_CAD = Date.UTC(2026, 0, 15, 3, 30, 36) + 400

/**
 * The measured node count at the time of writing: 139 elements for the whole
 * face (see the ceiling test). The plan's §3 budget note says ~75–90 nodes for
 * a FACE; a chronograph with two registers, a tachymeter and a date window is
 * roughly two faces and a scale, which is where the difference goes. The
 * ceiling below is loose on purpose — the exact number is REPORTED, the
 * ceiling only catches a structural regression (a part sprouting wrappers).
 */
const NODE_CEILING = 170

let rafQueue: Map<number, FrameRequestCallback>
let nextRafId: number
let raf: ReturnType<typeof vi.fn>

/** Frames fire only when told to, and only inside `act()` — the Plan 3 lesson. */
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

/** Same fake as the face tests: fires only when told, dies when disconnected. */
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

function rotationOf(el: Element): number {
  const style = el.getAttribute("style") ?? ""
  const match = style.match(/rotate\((-?[\d.]+)deg\)/)
  if (match === null || match[1] === undefined) {
    throw new Error(`no rotation in ${JSON.stringify(style)}`)
  }
  return Number(match[1])
}

/**
 * The five hands, by role rather than DOM index, so an assertion names the
 * hand it is about. Registers are found through the face's own data marks.
 */
function hands(container: HTMLElement) {
  const one = (selector: string): HTMLElement => {
    const el = container.querySelector<HTMLElement>(selector)
    if (el === null) throw new Error(`missing ${selector}`)
    return el
  }
  const all = [...container.querySelectorAll<HTMLElement>('[data-mp="hand"]')]
  const regSeconds = one('[data-register="seconds"] [data-mp="hand"]')
  const counter = one('[data-register="counter"] [data-mp="hand"]')
  const main = all.filter((el) => el !== regSeconds && el !== counter)
  const [hour, minute, chrono] = main
  if (hour === undefined || minute === undefined || chrono === undefined) {
    throw new Error(`expected three main hands, found ${main.length}`)
  }
  return { hour, minute, chrono, regSeconds, counter, all }
}

/** A source whose subscriptions are countable — how pausing is observed. */
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

/** Fresh writable chronograph counters, the domains the face relies on. */
function counters() {
  return {
    elapsedSeconds: createSource(0, { min: 0, max: 60 }),
    elapsedMinutes: createSource(0, { min: 0, max: 30 }),
  }
}

describe("the complex face — everything at once", () => {
  it("commits once while every live element on it moves", () => {
    const { elapsedSeconds, elapsedMinutes } = counters()
    const onRender = vi.fn()
    const { container } = render(
      <Profiler id="complex" onRender={onRender}>
        <ComplexFace
          elapsedSeconds={elapsedSeconds}
          elapsedMinutes={elapsedMinutes}
          date={15}
          timezone="UTC"
        />
      </Profiler>,
    )

    const h = hands(container)
    expect(h.all).toHaveLength(5)
    // The mount pose: 03:30:00 UTC through each reading's own domain, and the
    // chronograph counters at their zero.
    const pose = () => [h.hour, h.minute, h.chrono, h.regSeconds, h.counter].map(rotationOf)
    expect(pose()).toEqual([105, 180, 0, 0, 0])
    expect(onRender).toHaveBeenCalledTimes(1)

    // Three wall-clock fields, one engine, one rAF arm.
    expect(raf).toHaveBeenCalledTimes(1)

    // The live elapsed fill at zero is arcPath's own "nothing to draw" — the
    // mount write ran, and wrote the empty sweep the value names.
    const fill = container.querySelector('[data-arc="elapsed-fill"]')
    if (fill === null) throw new Error("no elapsed fill arc")
    const dBefore = fill.getAttribute("d") ?? ""
    expect(dBefore).toBe("")

    // Move EVERYTHING: the wall clock by frames, the chronograph by writes.
    fireFrame(1000)
    fireFrame(2000)
    fireFrame(4000)
    act(() => {
      elapsedSeconds.set(45)
      elapsedMinutes.set(15)
    })

    const after = pose()
    expect(after[0]).not.toBe(105) // hour crept
    expect(after[1]).not.toBe(180) // minute crept
    expect(after[3]).toBe(42) // 7s of frames → the register's seconds hand by 42°
    expect(after[2]).toBe(270) // chrono centre hand: 45 of 0–60
    expect(after[4]).toBe(180) // 30-minute counter: 15 of 0–30
    // …and the fill swept out to 45s: a real path now, written by the ref.
    const dAfter = fill.getAttribute("d") ?? ""
    expect(dAfter).not.toBe(dBefore)
    expect(dAfter.startsWith("M")).toBe(true)

    // The claim: five hands and an arc moved and React never committed again.
    expect(onRender).toHaveBeenCalledTimes(1)
  })

  it("the 30-minute counter maps through its OWN 0-30 domain, from the source", () => {
    const { elapsedSeconds, elapsedMinutes } = counters()
    elapsedMinutes.set(15)
    const { container } = render(
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />,
    )
    // 15 through 0–30 is half a turn. Through the parent hands' 0–60 it would
    // be 90° — the exact red the "register inherits the parent domain"
    // mutation produces.
    expect(rotationOf(hands(container).counter)).toBe(180)
  })

  it("the running-seconds register maps through its own 0-60 domain", () => {
    const { elapsedSeconds, elapsedMinutes } = counters()
    const { container } = render(
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />,
    )
    const h = hands(container)
    expect(rotationOf(h.regSeconds)).toBe(0)
    fireFrame(15_000) // 03:30:15 → 90° on a 0–60 register
    expect(rotationOf(h.regSeconds)).toBe(90)
    // …while the counter beside it never moved: distinct registers, distinct
    // domains, distinct readings.
    expect(rotationOf(h.counter)).toBe(0)
  })

  it("renders the tachymeter's labels as 3600/t at the right angles", () => {
    const { elapsedSeconds, elapsedMinutes } = counters()
    const { container } = render(
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />,
    )
    const labels = [...container.querySelectorAll<HTMLElement>("[data-tachy-label]")]
    // The classic set: units-per-hour at t seconds, every quotient whole.
    const ts = [10, 12, 15, 18, 20, 24, 30, 36, 45, 60]
    expect(labels).toHaveLength(ts.length)
    labels.forEach((label, i) => {
      const t = ts[i]
      if (t === undefined) throw new Error("unreachable")
      expect(label.textContent).toBe(String(3600 / t))
      // Wrapped orientation: the label box turns to its own ray (rotation =
      // the angle, t seconds of a 0–60 turn), so the text follows the ring.
      expect(rotationOf(label)).toBe(t * 6)
    })
  })

  it("carves the date window's cut and the counters' rays out of the tracks", () => {
    const { elapsedSeconds, elapsedMinutes } = counters()
    const { container } = render(
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />,
    )
    // The minute track: 60, minus the 12 five-minute holes the hour track
    // stands in, minus minutes 14 and 16 (15 is already a five) for the date.
    const minutes = [...container.querySelectorAll("[data-minute-track]")]
    expect(minutes).toHaveLength(46)
    const angles = minutes.map(rotationOf)
    for (const gone of [84, 90, 96]) expect(angles).not.toContain(gone)
    for (const held of [78, 102]) expect(angles).toContain(held)
    // The hour track skips 3 — the window owns that ray outright.
    const hoursTrack = [...container.querySelectorAll("[data-hour-track]")]
    expect(hoursTrack).toHaveLength(11)
    expect(hoursTrack.map(rotationOf)).not.toContain(90)
    // And the date window sits on it, showing the given date.
    const window = container.querySelector('[data-mp="complication"][data-date]')
    if (window === null) throw new Error("no date complication")
    expect(window.textContent).toBe("15")
  })

  it("pauses the registers offscreen with everything else, and resyncs on return", () => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
    const seconds = countingSource(0, { min: 0, max: 60 })
    const minutes = countingSource(0, { min: 0, max: 30 })
    const { container } = render(
      <ComplexFace
        elapsedSeconds={seconds.source}
        elapsedMinutes={minutes.source}
        date={15}
        timezone="UTC"
      />,
    )
    const h = hands(container)
    // The chronograph's subscriptions: the centre hand plus the elapsed fill
    // on the seconds counter, the register hand alone on the minutes counter.
    expect(seconds.subscriptions()).toBe(2)
    expect(minutes.subscriptions()).toBe(1)
    // The wall clock is attached: one rAF armed for the whole face.
    expect(rafQueue.size).toBe(1)

    const io = FakeIntersectionObserver.instances[0]
    if (io === undefined) throw new Error("no observer was constructed")
    io.trigger(false)

    // Offscreen, the pause reaches THROUGH the nested contexts: the counter
    // hand inside the 6h register releases its source exactly as the root's
    // own parts do, and the wall clock releases the engine itself.
    expect(seconds.subscriptions()).toBe(0)
    expect(minutes.subscriptions()).toBe(0)
    expect(rafQueue.size).toBe(0)
    minutes.set(20)
    expect(rotationOf(h.counter)).toBe(0) // dark: no write happened

    io.trigger(true)
    // Back: resubscribed, and the register resynced to the value as of now.
    expect(minutes.subscriptions()).toBe(1)
    expect(seconds.subscriptions()).toBe(2)
    expect(rotationOf(h.counter)).toBe(240) // 20 of 0–30
  })

  it("renders byte-identically on the server while every reading moves", () => {
    const { elapsedSeconds, elapsedMinutes } = counters()
    const face = (
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />
    )
    const first = renderToString(face)
    elapsedSeconds.set(59)
    elapsedMinutes.set(29)
    vi.advanceTimersByTime(61_000)
    expect(renderToString(face)).toBe(first)

    // No reading reaches the markup: every hand — the three on the face and
    // the two inside registers — is translate-only, and the live fill is empty.
    const handStyles = [...first.matchAll(/style="([^"]*)"[^>]*data-mp="hand"/g)].map(
      (m) => m[1] ?? "",
    )
    expect(handStyles).toHaveLength(5)
    for (const style of handStyles) {
      expect(style).toContain("translate(-50%")
      expect(style).not.toContain("rotate(")
    }
    expect(first).toMatch(/d=""[^>]*data-arc="elapsed-fill"|data-arc="elapsed-fill"[^>]*d=""/)
  })

  it("quantises every inline style value across the whole face to ≤4dp", () => {
    vi.setSystemTime(T_CAD) // 36.4s — raw angles are long floats
    const { elapsedSeconds, elapsedMinutes } = counters()
    elapsedSeconds.set(10 / 3) // repeating decimals through both counters
    elapsedMinutes.set(7.77)
    const { container } = render(
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />,
    )
    fireFrame(16) // once through every live ref path too

    const elements = [...container.querySelectorAll("[style]")]
    expect(elements.length).toBeGreaterThan(100)
    for (const el of elements) {
      const style = el.getAttribute("style") ?? ""
      for (const match of style.matchAll(/\d+\.(\d+)/g)) {
        expect((match[1] ?? "").length, `${match[0]} in ${style}`).toBeLessThanOrEqual(4)
      }
    }
  })

  it("costs a countable number of DOM nodes — the HTML-cost data point", () => {
    const { elapsedSeconds, elapsedMinutes } = counters()
    const { container } = render(
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />,
    )
    const count = container.querySelectorAll("*").length
    // Loose on purpose; the exact count is the report's, not the test's.
    expect(count).toBeGreaterThan(100)
    expect(count).toBeLessThanOrEqual(NODE_CEILING)
  })

  it("floors the deeply nested register hand's width — the sub-pixel fix, SSR-visible", () => {
    const { elapsedSeconds, elapsedMinutes } = counters()
    const { container } = render(
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />,
    )
    const h = hands(container)
    // The line-variant register hand: 1.6 dial units — 0.33px at the lab's
    // w-56 card before the floor. Now it can never fall under a pixel.
    expect(h.regSeconds.style.width).toBe("max(0.7273cqw, 1px)")
    // And the same string is in the server markup — the floor is a
    // deterministic style value, not a measurement.
    const html = renderToString(
      <ComplexFace
        elapsedSeconds={elapsedSeconds}
        elapsedMinutes={elapsedMinutes}
        date={15}
        timezone="UTC"
      />,
    )
    expect(html).toContain("max(0.7273cqw, 1px)")
  })
})
