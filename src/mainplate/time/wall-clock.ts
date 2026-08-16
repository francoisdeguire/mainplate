/**
 * Epoch milliseconds → the fields a face shows, in a chosen zone.
 * May import: core/errors, ticker (types only). Must not be imported by core/.
 *
 * Extracted from `useWatchSource` because it has a second consumer:
 * `<Clock time={date}>` freezes a face at an instant, and a frozen face must
 * land on exactly the pose the live one passes through. Two decompositions
 * would drift the first time either the zone handling or the fractional
 * folding changed — and "3:30 is hour 3.5" is precisely the kind of rule that
 * gets re-derived slightly differently. One function, two consumers.
 */
import { failSoft } from "../core/errors"
import type { Cadence } from "./ticker"

/** One wall-clock instant, already decomposed into the target zone. */
export type Wall = { h: number; m: number; s: number; ms: number }

/** The fields a wall clock serves — the `WatchSources` names, minus `observe`. */
export type WallField = "hour" | "hour24" | "minute" | "second" | "ms"

/**
 * 10:09:36 — the time every watch advertisement shows. Served whenever there
 * is no client clock worth reading (§9.5): a server baking real time into HTML
 * would emit different markup on every request, so the face wears its
 * marketing pose until the client's ticker takes over.
 */
export const MARKETING: Wall = { h: 10, m: 9, s: 36, ms: 0 }

const MS_PER_SECOND = 1000

/**
 * Wall-clock decomposition goes through `Intl` and nothing else (§9.4): a
 * manual UTC offset is right until the zone's next DST transition and then
 * wrong by an hour. An unrecognised zone is a programmer error — development
 * throws at the call, production falls back to the environment's local zone
 * and says so once.
 */
function formatterFor(timezone: string | undefined, owner: string): Intl.DateTimeFormat {
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
      `mainplate: ${owner} received timezone=${JSON.stringify(timezone)}, which Intl does ` +
        'not recognise — pass an IANA zone such as "America/New_York" or "Asia/Tokyo".',
      "Falling back to the environment's local zone.",
    )
    return new Intl.DateTimeFormat("en-US", base)
  }
}

/**
 * Build the epoch→wall decomposer every field shares, memoised on the last
 * stamp: the ticker hands every subscriber in a frame the same instant, so a
 * full clock face costs one `formatToParts` per frame, not five.
 */
export function createWallClock(
  timezone: string | undefined,
  owner: string,
): (epochMs: number) => Wall {
  const formatter = formatterFor(timezone, owner)
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

/**
 * One instant → one field, fractional all the way up (§9.2): 3:30 is hour
 * 3.5, so an hour hand creeps the way a real one does. Tick cadence truncates
 * the sub-second part — the value a quartz step shows — which is what lets a
 * tick source pair with the ticker's sleeping timer instead of sanding a rAF
 * feed down at the hand (§9.3).
 */
export function fieldValue(field: WallField, wall: Wall, cadence: Cadence): number {
  const s = cadence === "tick" ? wall.s : wall.s + wall.ms / MS_PER_SECOND
  const m = wall.m + s / 60
  const h = wall.h + m / 60
  if (field === "hour") return h % 12
  if (field === "hour24") return h
  if (field === "minute") return m
  if (field === "second") return s
  return cadence === "tick" ? 0 : wall.ms
}
