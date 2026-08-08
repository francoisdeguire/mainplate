import { describe, expect, it, vi } from "vitest"
import { createSource, isSource } from "./source"

describe("createSource", () => {
  it("returns its initial value", () => {
    expect(createSource(7).get()).toBe(7)
  })

  it("returns the new value after set", () => {
    const s = createSource(1)
    s.set(2)
    expect(s.get()).toBe(2)
  })

  it("notifies subscribers on set", () => {
    const s = createSource(0)
    const cb = vi.fn()
    s.subscribe(cb)
    s.set(1)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it("does not notify when the value is unchanged", () => {
    const s = createSource(1)
    const cb = vi.fn()
    s.subscribe(cb)
    s.set(1)
    expect(cb).not.toHaveBeenCalled()
  })

  it("notifies every subscriber", () => {
    const s = createSource(0)
    const a = vi.fn()
    const b = vi.fn()
    s.subscribe(a)
    s.subscribe(b)
    s.set(1)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it("stops notifying after the teardown runs", () => {
    const s = createSource(0)
    const cb = vi.fn()
    const off = s.subscribe(cb)
    off()
    s.set(1)
    expect(cb).not.toHaveBeenCalled()
  })

  it("leaks nothing: the subscriber set is empty after teardown", () => {
    const s = createSource(0)
    const off = s.subscribe(() => {})
    off()
    const cb = vi.fn()
    s.subscribe(cb)
    s.set(1)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it("tolerates a teardown being called twice", () => {
    const s = createSource(0)
    const off = s.subscribe(() => {})
    off()
    expect(() => off()).not.toThrow()
  })

  it("carries an optional domain", () => {
    const s = createSource(0, { min: 0, max: 12 })
    expect(s.domain).toEqual({ min: 0, max: 12 })
  })
})

describe("isSource", () => {
  it("accepts a real source", () => {
    expect(isSource(createSource(0))).toBe(true)
  })
  it("rejects a number", () => {
    expect(isSource(5)).toBe(false)
  })
  it("rejects null and undefined", () => {
    expect(isSource(null)).toBe(false)
    expect(isSource(undefined)).toBe(false)
  })
  it("rejects an object missing subscribe", () => {
    expect(isSource({ get: () => 1 })).toBe(false)
  })
})
