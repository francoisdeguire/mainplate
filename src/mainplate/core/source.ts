/**
 * The reactivity seam. Zero imports beyond types, no React, no time.
 * May import: geometry (types only). Must not import: react, time/.
 */
import type { DomainValue } from "./geometry"

/**
 * Anything that can be read now and subscribed to for changes.
 *
 * A primitive given a `Source` subscribes to it directly and mutates the DOM
 * through a ref, so the value can change every frame without React rendering.
 * Nothing here knows about clocks: a websocket, a sensor feed, or a Motion
 * value satisfies this shape in about five lines.
 *
 * `get` and `subscribe` must work detached from their `Source` — consumers
 * pull them off into effect dependencies and call them bare — and each must
 * stay identity-stable across calls, since a fresh function per read would
 * churn those same dependencies for nothing.
 */
export type Source<T> = {
  /** Read the value as of now. */
  get(): T
  /** Register a listener. Returns the teardown. */
  subscribe(cb: () => void): () => void
  /**
   * Optional domain this source's values span, so consumers needn't restate
   * `min`/`max`. Precedence: an explicit prop beats this, which beats the frame.
   */
  domain?: { min: DomainValue; max: DomainValue }
}

/** A `Source` you can also write to. */
export type WritableSource<T> = Source<T> & {
  /** Write a new value, notifying subscribers only if it actually changed. */
  set(next: T): void
}

/**
 * Create a writable source.
 *
 * @example
 * const speed = createSource(0, { min: 0, max: 220 })
 * speed.set(88)
 */
export function createSource<T>(
  initial: T,
  domain?: { min: DomainValue; max: DomainValue },
): WritableSource<T> {
  let value = initial
  const listeners = new Set<() => void>()

  return {
    domain,
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return
      value = next
      for (const cb of listeners) cb()
    },
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}

/**
 * Runtime discriminator for the `number | Source<number>` XOR unions on
 * `value`, `from`, and `to`.
 */
export function isSource(v: unknown): v is Source<unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Source<unknown>).get === "function" &&
    typeof (v as Source<unknown>).subscribe === "function"
  )
}
