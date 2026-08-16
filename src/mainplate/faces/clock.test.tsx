// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { Profiler } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTicker } from "../time/ticker"
import { Clock } from "./clock"
import { Cap, Dial, Hand, Ticks } from "./parts"

/** 2026-01-15 03:30:00.000 UTC — hour 105°, minute 180°, second 0° in UTC. */
const T_0330 = Date.UTC(2026, 0, 15, 3, 30, 0)

/** The marketing pose, as a Date: 10:09:36 UTC. */
const T_POSE = new Date(Date.UTC(2026, 0, 15, 10, 9, 36))

let rafQueue: Map<number, FrameRequestCallback>
let nextRafId: number

/** Advance the fake clock and flush the frames it owes, inside `act()`. */
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
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      const id = nextRafId++
      rafQueue.set(id, cb)
      return id
    }),
  )
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

describe("<Clock> — the zero-props face", () => {
  it("renders the full default face: dial, minute track, three hands, cap", () => {
    const { container, getByRole } = render(<Clock timezone="UTC" />)
    expect(getByRole("img").getAttribute("aria-label")).toBe("Analog clock")
    expect(container.querySelectorAll('[data-mp="dial"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-mp="tick"]')).toHaveLength(60)
    expect(container.querySelectorAll('[data-mp="cap"]')).toHaveLength(1)
    // 03:30:00 UTC read through each field's own domain.
    expect(handsOf(container).map(rotationOf)).toEqual([105, 180, 0])
  })

  it("second='none' renders two hands", () => {
    const { container } = render(<Clock timezone="UTC" second="none" />)
    expect(handsOf(container).map(rotationOf)).toEqual([105, 180])
  })

  it("second='tick' arms the stepping transition on the seconds hand alone", () => {
    const { container } = render(<Clock timezone="UTC" second="tick" />)
    const [hour, minute, second] = handsOf(container)
    if (hour === undefined || minute === undefined || second === undefined) {
      throw new Error("missing hands")
    }
    expect(second.style.transition).toContain("180ms")
    expect(hour.style.transition).toBe("")
    expect(minute.style.transition).toBe("")
  })

  it("lands the mount pose instantly, and only then arms the stepping transition", async () => {
    // Render emits the translate alone, so every hand points at 12 until the
    // binder runs. If that first write were transitioned, the seconds hand
    // would sweep in from 12 o'clock 180ms behind the hour and minute hands,
    // on every mount and every remount. It must land with them instead.
    const states: string[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) states.push(record.oldValue ?? "")
    })
    // Attached in a ref callback, which React runs at commit — before any
    // effect, so the binder's very first write is inside the recording.
    const watch = (node: HTMLDivElement | null) => {
      if (node === null) return
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["style"],
        attributeOldValue: true,
        subtree: true,
      })
    }
    const { container } = render(<Clock timezone="UTC" second="tick" ref={watch} />)
    const second = handsOf(container)[2]
    if (second === undefined) throw new Error("no seconds hand")
    await Promise.resolve()
    observer.takeRecords()

    // The style the element wore at the moment the pose was written: rotated,
    // and not transitioning.
    const posed = states.find((s) => s.includes("rotate("))
    expect(posed).toBeDefined()
    expect(posed).toContain("transition: none")
    // Re-armed afterwards, so every step from here on animates.
    expect(second.style.transition).toContain("180ms")
  })

  it("ticks decides existence: 'quarters' keeps four marks, 'none' keeps none", () => {
    const { container: quarters } = render(<Clock timezone="UTC" ticks="quarters" />)
    expect(quarters.querySelectorAll('[data-mp="tick"]')).toHaveLength(4)
    const { container: bare } = render(<Clock timezone="UTC" ticks="none" />)
    expect(bare.querySelectorAll('[data-mp="tick"]')).toHaveLength(0)
  })

  it("passes color, shape, unstyled, className and HTML attributes to the root", () => {
    const { getByRole } = render(
      <Clock
        timezone="UTC"
        label="Wall clock"
        color="oklch(0.45 0.16 264)"
        className="w-40"
        id="c1"
        data-testid="clock"
        shape={{ ratio: 0.82, radius: 30 }}
      />,
    )
    const root = getByRole("img")
    expect(root.getAttribute("aria-label")).toBe("Wall clock")
    expect(root.className).toBe("w-40")
    expect(root.id).toBe("c1")
    expect(root.getAttribute("data-testid")).toBe("clock")
    expect(root.style.getPropertyValue("--mp-ink")).toBe("oklch(0.45 0.16 264)")
    // A rect shape changes the aspect ratio the root reserves.
    expect(root.style.aspectRatio).not.toBe("220 / 220")
  })

  it("unstyled strips every default paint and keeps the structure", () => {
    const { container } = render(<Clock timezone="UTC" unstyled />)
    for (const part of container.querySelectorAll<HTMLElement>("[data-mp]")) {
      expect(part.style.background).toBe("")
    }
    expect(handsOf(container)).toHaveLength(3)
  })
})

describe("<Clock> — time and timezone", () => {
  it("time freezes the face deterministically and no ticking moves it", () => {
    const { container } = render(<Clock time={T_POSE} timezone="UTC" />)
    // 10:09:36 → hour 10.16 of 12, minute 9.6 of 60, second 36 of 60.
    expect(handsOf(container).map(rotationOf)).toEqual([304.8, 57.6, 216])
    fireFrame(5000)
    expect(handsOf(container).map(rotationOf)).toEqual([304.8, 57.6, 216])
    // Nothing is subscribed to the engine at all: a frozen clock is inert.
    expect(rafQueue.size).toBe(0)
  })

  it("time reads in the given zone, not the environment's", () => {
    const { container } = render(<Clock time={T_POSE} timezone="Asia/Tokyo" />)
    // 10:09:36 UTC is 19:09:36 in Tokyo → hour 7.16 of 12.
    expect(handsOf(container).map(rotationOf)).toEqual([214.8, 57.6, 216])
  })

  it("timezone reaches useWatchSource for a live clock", () => {
    const { container: utc } = render(<Clock timezone="UTC" />)
    const { container: tokyo } = render(<Clock timezone="Asia/Tokyo" />)
    // 03:30 UTC is 12:30 in Tokyo → hour 0.5 of 12.
    expect(rotationOf(handsOf(utc)[0] as Element)).toBe(105)
    expect(rotationOf(handsOf(tokyo)[0] as Element)).toBe(15)
  })

  it("a live clock moves every frame while the tree commits exactly once", () => {
    const onRender = vi.fn()
    const { container } = render(
      <Profiler id="clock" onRender={onRender}>
        <Clock timezone="UTC" />
      </Profiler>,
    )
    expect(onRender).toHaveBeenCalledTimes(1)
    fireFrame(7000)
    expect(rotationOf(handsOf(container)[2] as Element)).toBe(42)
    expect(onRender).toHaveBeenCalledTimes(1)
  })
})

describe("<Clock> — numerals, the reach preset", () => {
  it("numerals='none' lets the hands reach further (spec §12)", () => {
    const { container: withNumerals } = render(<Clock timezone="UTC" />)
    const { container: without } = render(<Clock timezone="UTC" numerals="none" />)
    const a = handsOf(withNumerals)[1]
    const b = handsOf(without)[1]
    if (a === undefined || b === undefined) throw new Error("missing minute hand")
    // minute 68 + tail 12 of the 220 box, against the numeral-free 80 + 12.
    expect(a.style.height).toBe("36.3636cqw")
    expect(b.style.height).toBe("41.8182cqw")
  })
})

describe("<Clock> — slots replace appearance, never the reading", () => {
  it("a Hand child takes over its own slot and leaves the others alone", () => {
    const { container } = render(
      <Clock timezone="UTC">
        <Hand type="second" className="x" />
      </Clock>,
    )
    const hands = handsOf(container)
    expect(hands).toHaveLength(3)
    const [hour, minute, second] = hands
    if (hour === undefined || minute === undefined || second === undefined) {
      throw new Error("missing hands")
    }
    expect(hour.className).toBe("")
    expect(minute.className).toBe("")
    expect(second.className).toBe("x")
    // The slot keeps the wrapper's wiring: the replacement is still the live
    // seconds hand, mapped through the seconds domain.
    expect([hour, minute, second].map(rotationOf)).toEqual([105, 180, 0])
    fireFrame(7000)
    expect(rotationOf(second)).toBe(42)
  })

  it("a slot cannot detach its hand from the clock's own reading", () => {
    // The spec's slot table lists appearance props only. Passing a `value`
    // anyway must lose: a clock whose seconds hand can be re-pointed by a
    // stylistic override is a clock that shows the wrong time. (An explicit
    // `max` is a different case — §8.10 says an explicit prop wins, and the
    // wrapper pins only what it wires.)
    const { container } = render(
      <Clock time={T_POSE} timezone="UTC">
        <Hand type="second" value={0} className="x" />
      </Clock>,
    )
    const second = handsOf(container)[2]
    if (second === undefined) throw new Error("no seconds hand")
    expect(second.className).toBe("x")
    expect(rotationOf(second)).toBe(216)
  })

  it("dial, ticks and cap slots replace one for one", () => {
    const { container } = render(
      <Clock timezone="UTC">
        <Dial className="d" />
        <Ticks variant="quarters" className="t" />
        <Cap className="c" />
      </Clock>,
    )
    expect(container.querySelectorAll('[data-mp="dial"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-mp="cap"]')).toHaveLength(1)
    const ticks = [...container.querySelectorAll<HTMLElement>('[data-mp="tick"]')]
    expect(ticks).toHaveLength(4)
    expect(ticks.every((t) => t.className === "t")).toBe(true)
    const dial = container.querySelector<HTMLElement>('[data-mp="dial"]')
    expect(dial?.className).toBe("d")
  })

  it("children that claim no slot are simply added on top", () => {
    const { container, getByTestId } = render(
      <Clock timezone="UTC">
        <span data-testid="extra" />
      </Clock>,
    )
    expect(container.querySelectorAll('[data-mp="tick"]')).toHaveLength(60)
    expect(handsOf(container)).toHaveLength(3)
    expect(getByTestId("extra")).toBeDefined()
  })
})
