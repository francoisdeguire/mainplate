// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { createSource } from "../core/source"
import { bindRotation } from "./bind-rotation"

/** The rotation the element currently wears, parsed back out of its transform. */
function rotationOf(el: HTMLElement): number {
  const match = el.style.transform.match(/rotate\((-?[\d.]+)deg\)/)
  if (match === null || match[1] === undefined) {
    throw new Error(`no rotation in ${JSON.stringify(el.style.transform)}`)
  }
  return Number(match[1])
}

const TRANSLATE = "translate(-50%, -80%)"

describe("bindRotation", () => {
  it("writes the translate and the rotation immediately on bind", () => {
    const el = document.createElement("div")
    bindRotation(el, () => 90, null, { translate: TRANSLATE })
    expect(el.style.transform).toBe("translate(-50%, -80%) rotate(90deg)")
  })

  it("subscribes and rewrites on every notification, through the ref path", () => {
    const el = document.createElement("div")
    const src = createSource(30)
    bindRotation(el, src.get, src.subscribe, { translate: TRANSLATE })
    expect(rotationOf(el)).toBe(30)
    src.set(45)
    expect(rotationOf(el)).toBe(45)
    src.set(-15)
    expect(rotationOf(el)).toBe(-15)
  })

  it("quantises the ref-write path itself — render-path rounding does not cover it", () => {
    const el = document.createElement("div")
    bindRotation(el, () => 100 / 3, null, { translate: TRANSLATE })
    expect(el.style.transform).toBe("translate(-50%, -80%) rotate(33.3333deg)")
  })

  describe("the wrap regression (Plan 3 final-review finding)", () => {
    it("unwraps across the seam: 350 -> 4 writes 364 (the +14 short path), never 4", () => {
      const el = document.createElement("div")
      const src = createSource(350)
      bindRotation(el, src.get, src.subscribe, { translate: TRANSLATE, unwrap: true })
      expect(rotationOf(el)).toBe(350)
      src.set(4)
      // A CSS transition animating 350 -> 4 spins the long way back. The
      // unwrapped write keeps rotating forward instead.
      const written = rotationOf(el)
      expect(written).toBeGreaterThanOrEqual(354)
      expect(written).toBe(364)
    })

    it("oscillation stays local: each delta takes the shortest signed path", () => {
      const el = document.createElement("div")
      const src = createSource(350)
      bindRotation(el, src.get, src.subscribe, { translate: TRANSLATE, unwrap: true })
      const writes: number[] = [rotationOf(el)]
      for (const angle of [4, 350, 4]) {
        src.set(angle)
        writes.push(rotationOf(el))
      }
      // 350→4 is +14; 4→350 is −14 back, not +346 onward. A value that
      // wobbles across the seam must not ratchet the element upward forever.
      expect(writes).toEqual([350, 364, 350, 364])
    })

    it("a decreasing reading takes the short way: 90 → 60 writes 60, never 420", () => {
      const el = document.createElement("div")
      const src = createSource(90)
      bindRotation(el, src.get, src.subscribe, { translate: TRANSLATE, unwrap: true })
      expect(rotationOf(el)).toBe(90)
      src.set(60)
      // Forward-only accumulation would send a −30° change the long way
      // round (+330° → 420) — a gauge easing off would lap its own dial.
      expect(rotationOf(el)).toBe(60)
    })

    it("without unwrap, writes the absolute angle: 350 -> 4 writes 4", () => {
      const el = document.createElement("div")
      const src = createSource(350)
      bindRotation(el, src.get, src.subscribe, { translate: TRANSLATE })
      src.set(4)
      expect(rotationOf(el)).toBe(4)
    })

    it("treats a full-lap delta as float jitter, not a lap", () => {
      const el = document.createElement("div")
      let angle = 90
      const listener: { notify: (() => void) | null } = { notify: null }
      const subscribe = (cb: () => void) => {
        listener.notify = cb
        return () => {
          listener.notify = null
        }
      }
      bindRotation(el, () => angle, subscribe, { translate: TRANSLATE, unwrap: true })
      expect(rotationOf(el)).toBe(90)
      // A hair backwards is a hair backwards — the shortest signed path —
      // never a near-full forward lap. Quantisation writes it as 90.
      angle = 89.99999
      listener.notify?.()
      expect(rotationOf(el)).toBe(90)
      // …and the accumulator carries on normally from there.
      angle = 100
      listener.notify?.()
      expect(rotationOf(el)).toBe(100)
    })

    it("a shared state cell seeds the accumulator across rebinds", () => {
      // The Hand owns one cell for its whole life: pause/resume and
      // controlled-value rebinds construct fresh binders, and without the
      // seed each one would write an absolute angle into an element still
      // wearing (and transitioning from) the accumulated one.
      const el = document.createElement("div")
      const state: { last: number | null } = { last: null }
      const src = createSource(350)
      const unbind = bindRotation(el, src.get, src.subscribe, {
        translate: TRANSLATE,
        unwrap: true,
        state,
      })
      src.set(4) // 364 accumulated
      unbind()
      // A fresh binder over the same cell continues where the last left off.
      bindRotation(el, src.get, src.subscribe, { translate: TRANSLATE, unwrap: true, state })
      expect(rotationOf(el)).toBe(364)
      src.set(10)
      expect(rotationOf(el)).toBe(370)
    })
  })

  it("tears down: after the returned teardown, notifications write nothing", () => {
    const el = document.createElement("div")
    const src = createSource(10)
    const unbind = bindRotation(el, src.get, src.subscribe, { translate: TRANSLATE })
    unbind()
    src.set(99)
    expect(rotationOf(el)).toBe(10)
    // Idempotent, like every teardown in the library.
    expect(() => unbind()).not.toThrow()
  })

  it("is element-agnostic: an SVG group takes the same writes", () => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g")
    const src = createSource(12)
    bindRotation(g, src.get, src.subscribe, { translate: "translate(0, 0)" })
    expect(g.style.transform).toBe("translate(0, 0) rotate(12deg)")
    src.set(24)
    expect(g.style.transform).toBe("translate(0, 0) rotate(24deg)")
  })

  it("subscribes exactly once and returns that subscription's teardown", () => {
    const el = document.createElement("div")
    const off = vi.fn()
    const subscribe = vi.fn(() => off)
    const unbind = bindRotation(el, () => 0, subscribe, { translate: TRANSLATE })
    expect(subscribe).toHaveBeenCalledTimes(1)
    unbind()
    expect(off).toHaveBeenCalledTimes(1)
  })
})
