"use client"

/**
 * `useWatchSource()`: the wall clock served as `Source`s.
 * May import: react, core/errors, core/source, ticker. Must not be imported by core/.
 */
import { useState } from "react"
import { failSoft } from "../core/errors"
import { createSource, type Source } from "../core/source"
import { type Cadence, getTicker, type Ticker } from "./ticker"

/** One wall-clock instant, already decomposed into the target zone. */
type Wall = { h: number; m: number; s: number; ms: number }

/**
 * 10:09:36 — the time every watch advertisement shows. Served by `get()`
 * whenever there is no client clock worth reading (§9.5): a server baking
 * real time into HTML would emit different markup on every request, so the
 * face wears its marketing pose until the client's ticker takes over.
 */
const MARKETING: Wall = { h: 10, m: 9, s: 36, ms: 0 }

const MS_PER_SECOND = 1000

/**
 * Wall-clock decomposition goes through `Intl` and nothing else (§9.4): a
 * manual UTC offset is right until the zone's next DST transition and then
 * wrong by an hour. An unrecognised zone is a programmer error — development
 * throws here, at the hook call; production falls back to the environment's
 * local zone and says so once.
 */
function formatterFor(timezone: string | undefined): Intl.DateTimeFormat {
  const base: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
  }
  try {
    return new Intl.DateTimeFormat("en-US", { ...base, timeZone: timezone })
  } catch {
    failSoft(
      `mainplate: useWatchSource received timezone=${JSON.stringify(timezone)}, which Intl does ` +
        'not recognise — pass an IANA zone such as "America/New_York" or "Asia/Tokyo".',
      "Falling back to the environment's local zone.",
    )
    return new Intl.DateTimeFormat("en-US", base)
  }
}

/**
 * Build the epoch→wall decomposer all five fields share, memoised on the last
 * stamp: the ticker hands every subscriber in a frame the same instant, so a
 * full clock face costs one `formatToParts` per frame, not five.
 */
function createWallClock(timezone: string | undefined): (epochMs: number) => Wall {
  const formatter = formatterFor(timezone)
  let lastEpoch = Number.NaN
  let lastWall = MARKETING
  return (epochMs) => {
    if (epochMs === lastEpoch) return lastWall
    // Zone offsets are whole seconds in every real zone, so the millisecond
    // field never needs Intl — which does not serve sub-second parts anyway.
    const ms = ((epochMs % MS_PER_SECOND) + MS_PER_SECOND) % MS_PER_SECOND
    const wall: Wall = { h: 0, m: 0, s: 0, ms }
    for (const part of formatter.formatToParts(epochMs)) {
      if (part.type === "hour") wall.h = Number(part.value)
      else if (part.type === "minute") wall.m = Number(part.value)
      else if (part.type === "second") wall.s = Number(part.value)
    }
    lastEpoch = epochMs
    lastWall = wall
    return wall
  }
}

type FieldName = keyof WatchSources

/** §9.2: each field's own span, carried on its source so a `<Hand>` never restates `max`. */
const DOMAINS: Record<FieldName, { min: number; max: number }> = {
  hour: { min: 0, max: 12 },
  hour24: { min: 0, max: 24 },
  minute: { min: 0, max: 60 },
  ms: { min: 0, max: 1000 },
  second: { min: 0, max: 60 },
}

/**
 * One instant → one field, fractional all the way up (§9.2): 3:30 is hour
 * 3.5, so an hour hand creeps the way a real one does. Tick cadence truncates
 * the sub-second part — the value a quartz step shows — which is what lets a
 * tick source pair with the ticker's sleeping timer instead of sanding a rAF
 * feed down at the hand (§9.3).
 */
function fieldValue(field: FieldName, wall: Wall, cadence: Cadence): number {
  const s = cadence === "tick" ? wall.s : wall.s + wall.ms / MS_PER_SECOND
  const m = wall.m + s / 60
  const h = wall.h + m / 60
  if (field === "hour") return h % 12
  if (field === "hour24") return h
  if (field === "minute") return m
  if (field === "second") return s
  return cadence === "tick" ? 0 : wall.ms
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
): Source<number> {
  const domain = DOMAINS[field]
  // NaN initial so the first real value can never be swallowed by the dedup.
  const inner = createSource(Number.NaN, domain)
  let active = 0
  let detach: (() => void) | null = null

  const read = () =>
    typeof window === "undefined"
      ? fieldValue(field, MARKETING, cadence)
      : fieldValue(field, wallOf(ticker.now()), cadence)

  return {
    domain,
    get: read,
    subscribe(cb: () => void) {
      if (active === 0) detach = ticker.subscribe(cadence, () => inner.set(read()))
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
        if (active === 0 && detach !== null) {
          detach()
          detach = null
        }
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
}

/** Build the five fields over one shared decomposer and the shared ticker. */
function createSources(options: WatchSourceOptions | undefined): WatchSources {
  const ticker = getTicker()
  const wallOf = createWallClock(options?.timezone)
  return {
    hour: createField(ticker, "hour", options?.hour ?? "glide", wallOf),
    hour24: createField(ticker, "hour24", options?.hour24 ?? "glide", wallOf),
    minute: createField(ticker, "minute", options?.minute ?? "glide", wallOf),
    second: createField(ticker, "second", options?.second ?? "glide", wallOf),
    ms: createField(ticker, "ms", options?.ms ?? "glide", wallOf),
  }
}

/**
 * The wall clock as stable `Source` objects — the reason the seam exists
 * (§9.1). A `<Hand>` given one subscribes and writes the DOM through a ref,
 * so a face updating every frame costs zero renders in the component that
 * called this; the objects are created once and never change identity, so
 * nothing downstream churns either. Nothing runs until something subscribes,
 * and every field on the page shares one engine (§9.7) — twenty live faces
 * cost one rAF loop, not twenty. On the server every field reads 10:09:36
 * (§9.5), so the rendered HTML is deterministic.
 */
export function useWatchSource(options?: WatchSourceOptions): WatchSources {
  const [sources] = useState(() => createSources(options))
  return sources
}
