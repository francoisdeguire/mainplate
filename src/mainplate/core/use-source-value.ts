"use client"

/**
 * Read any Source in React.
 * May import: source. Must not import: time/.
 */
import { useSyncExternalStore } from "react"
import type { Source } from "./source"

/**
 * Subscribe to a `Source` and re-render when it changes.
 *
 * Use this when React genuinely needs to see the value — a text readout, a
 * conditional. For a hand or an arc, pass the `Source` to the primitive
 * directly instead: it will mutate the DOM through a ref and never re-render.
 *
 * The server snapshot reads the same `get()`, so a source with a stable
 * server-side value hydrates without a mismatch.
 *
 * `get` and `subscribe` are passed to React detached from the source object —
 * unwrapped, so their identity stays stable across renders and the
 * subscription is not torn down and re-established every time. An
 * implementation therefore must not depend on `this`: return closures, as
 * `createSource` does.
 */
export function useSourceValue<T>(source: Source<T>): T {
  return useSyncExternalStore(source.subscribe, source.get, source.get)
}
