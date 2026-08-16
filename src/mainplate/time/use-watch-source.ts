"use client"

/**
 * `useWatchSource()`: the wall clock served as `Source`s.
 * May import: react, core/errors, core/source, ticker. Must not be imported by core/.
 */
import { useState } from "react"
import { createSource, type Source } from "../core/source"
import { type Cadence, getTicker, type Ticker } from "./ticker"
import { createWallClock, fieldValue, MARKETING, type Wall } from "./wall-clock"

/** What a paused field must do when its face leaves or re-enters the viewport. */
type FieldHooks = { pause(): void; resume(): void }

/**
 * One face's viewport visibility (§9.11), shared by its five fields. The
 * `IntersectionObserver` is created only when the consumer attaches the
 * `observe` ref — never at module scope, never during render, so a server
 * import stays clean — and where the API does not exist the face is simply
 * always visible, never a crash. Unattached means visible too: pausing is an
 * optimisation a consumer opts into, not a gate they can strand a clock behind.
 */
function createVisibility() {
  let visible = true
  let observer: IntersectionObserver | null = null
  const fields: FieldHooks[] = []

  function set(next: boolean) {
    if (next === visible) return
    visible = next
    for (const f of fields) {
      if (next) f.resume()
      else f.pause()
    }
  }

  function observe(node: Element | null) {
    if (observer !== null) {
      // Torn down, not abandoned: a disconnected observer can never fire
      // again, so a stale entry cannot pause whatever mounts next.
      observer.disconnect()
      observer = null
    }
    if (node === null) {
      // React detached the ref (unmount, or the consumer moved it). Unobserved
      // means visible — a still-subscribed clock must never stay dark behind
      // an element that no longer exists.
      set(true)
      return
    }
    if (typeof IntersectionObserver === "undefined") return
    observer = new IntersectionObserver((entries) => {
      // Entries arrive oldest-first; only the newest reflects where the
      // element is now.
      const last = entries[entries.length - 1]
      if (last !== undefined) set(last.isIntersecting)
    })
    observer.observe(node)
  }

  return {
    isVisible: () => visible,
    register(hooks: FieldHooks) {
      fields.push(hooks)
    },
    observe,
  }
}

type Visibility = ReturnType<typeof createVisibility>

type FieldName = keyof Omit<WatchSources, "observe">

/** §9.2: each field's own span, carried on its source so a `<Hand>` never restates `max`. */
const DOMAINS: Record<FieldName, { min: number; max: number }> = {
  hour: { min: 0, max: 12 },
  hour24: { min: 0, max: 24 },
  minute: { min: 0, max: 60 },
  ms: { min: 0, max: 1000 },
  second: { min: 0, max: 60 },
}

/**
 * One field as a `Source`. `createSource` owns the listener set and the
 * changed-value dedup — the seam's single subscription mechanism — and this
 * wrapper only feeds it: the first listener attaches the field to the ticker
 * at its cadence, the last detaches it. An unread field therefore costs
 * nothing, and an unmounted face releases the engine entirely.
 */
function createField(
  ticker: Ticker,
  field: FieldName,
  cadence: Cadence,
  wallOf: (epochMs: number) => Wall,
  visibility: Visibility,
): Source<number> {
  const domain = DOMAINS[field]
  // NaN initial so the first real value can never be swallowed by the dedup.
  const inner = createSource(Number.NaN, domain)
  let active = 0
  let detach: (() => void) | null = null

  const read = () =>
    typeof document === "undefined"
      ? fieldValue(field, MARKETING, cadence)
      : fieldValue(field, wallOf(ticker.now()), cadence)

  const feed = () => inner.set(read())

  function attach() {
    if (detach === null) detach = ticker.subscribe(cadence, feed)
  }
  function release() {
    if (detach !== null) {
      detach()
      detach = null
    }
  }

  // Offscreen pausing rides the same refcount that already gates the ticker
  // (§9.11): hidden releases this field's engine attachment while the listener
  // count survives, and visible re-feeds one fresh read — computed from
  // absolute time, so the first visible value is elapsed real time rather than
  // a replay of the backlog (§9.9) — before re-attaching.
  visibility.register({
    pause: release,
    resume: () => {
      if (active === 0) return
      feed()
      attach()
    },
  })

  return {
    domain,
    get: read,
    subscribe(cb: () => void) {
      if (active === 0 && visibility.isVisible()) attach()
      active += 1
      const off = inner.subscribe(cb)
      let torn = false
      return () => {
        // Idempotent, like every teardown in the library: a double call must
        // not decrement the count twice and silently kill a sibling's feed.
        if (torn) return
        torn = true
        off()
        active -= 1
        if (active === 0) release()
      }
    },
  }
}

/**
 * Per-field cadence, plus the zone the clock reads. Cadence is a source
 * option rather than a `<Hand>` prop (§9.3) because only the scheduler can
 * turn "once a second" into actually sleeping between boundaries — a hand
 * quantising a rAF feed would leave the loop running at 60fps for nothing.
 * Options are read on the first render; remount (change `key`) to change them.
 */
export type WatchSourceOptions = {
  /** Cadence for `hour`. @default "glide" */
  hour?: Cadence
  /** Cadence for `hour24`. @default "glide" */
  hour24?: Cadence
  /** Cadence for `minute`. @default "glide" */
  minute?: Cadence
  /** Cadence for `second` — `"tick"` is the stepping quartz hand. @default "glide" */
  second?: Cadence
  /** Cadence for `ms` — under `"tick"` it is a constant 0. @default "glide" */
  ms?: Cadence
  /**
   * IANA zone, e.g. `"America/New_York"` — resolved via `Intl`, never a
   * manual offset, because DST breaks offset arithmetic twice a year (§9.4).
   * @default the environment's local zone
   */
  timezone?: string
}

/** The wall clock, one `Source` per field, each carrying its own `domain` (§9.2). */
export type WatchSources = {
  /** 12-hour dial, fractional: 3:30 reads 3.5. Domain 0–12. */
  hour: Source<number>
  /** 24-hour dial, fractional: 15:30 reads 15.5. Domain 0–24. */
  hour24: Source<number>
  /** Minutes with the seconds folded in. Domain 0–60. */
  minute: Source<number>
  /** Seconds — fractional under `"glide"`, whole under `"tick"`. Domain 0–60. */
  second: Source<number>
  /** Milliseconds within the second. Domain 0–1000. */
  ms: Source<number>
  /**
   * Callback ref for offscreen pausing (§9.11): attach it to the face's
   * wrapper — `<div ref={clock.observe}>` — and this clock releases the shared
   * engine while that element is out of the viewport, resyncing to elapsed
   * real time the moment it scrolls back. A ref rather than an option because
   * only the consumer owns a DOM node, and a ref rather than automatic because
   * nothing in `time/` renders one. Optional: an unattached clock is simply
   * always "visible". The observer is created on attach — never at module
   * scope, never on the server — and torn down when React detaches the ref on
   * unmount; where `IntersectionObserver` does not exist, this is a no-op.
   * Attaching to more than one element is last-write-wins: this clock tracks
   * only the most recently attached element's visibility, not the union of
   * every element it was ever handed.
   */
  observe: (node: Element | null) => void
}

/** Build the five fields over one shared decomposer, ticker, and visibility. */
function createSources(options: WatchSourceOptions | undefined): WatchSources {
  const ticker = getTicker()
  const wallOf = createWallClock(options?.timezone, "useWatchSource")
  const visibility = createVisibility()
  return {
    hour: createField(ticker, "hour", options?.hour ?? "glide", wallOf, visibility),
    hour24: createField(ticker, "hour24", options?.hour24 ?? "glide", wallOf, visibility),
    minute: createField(ticker, "minute", options?.minute ?? "glide", wallOf, visibility),
    second: createField(ticker, "second", options?.second ?? "glide", wallOf, visibility),
    ms: createField(ticker, "ms", options?.ms ?? "glide", wallOf, visibility),
    observe: visibility.observe,
  }
}

/**
 * The wall clock as stable `Source` objects — the reason the seam exists
 * (§9.1). A `<Hand>` given one subscribes and writes the DOM through a ref,
 * so a face updating every frame costs zero renders in the component that
 * called this; the objects are created once and never change identity, so
 * nothing downstream churns either. Nothing runs until something subscribes,
 * and every field on the page shares one engine (§9.7) — twenty live faces
 * cost one rAF loop, not twenty; attach `observe` and a face scrolled out of
 * view costs nothing at all (§9.11). Under `prefers-reduced-motion` every
 * glide source degrades to one step per second at the shared ticker — a
 * working clock, never a frozen one (§9.6). On the server every field reads
 * 10:09:36 (§9.5), so the rendered HTML is deterministic.
 */
export function useWatchSource(options?: WatchSourceOptions): WatchSources {
  const [sources] = useState(() => createSources(options))
  return sources
}
